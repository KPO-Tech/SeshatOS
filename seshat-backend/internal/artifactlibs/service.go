package artifactlibs

import (
	"context"
	"errors"
	"fmt"
	"io"
	"mime"
	"net/http"
	"os"
	"path"
	"strings"
	"sync"
	"time"

	"golang.org/x/sync/singleflight"
)

// ScopeTTL is how long a previewed page may have its missing libraries downloaded: the life of a preview.
const ScopeTTL = 30 * time.Minute

// ErrNotFound means the file is neither shipped nor cached and may not, or could not, be downloaded.
var ErrNotFound = errors.New("library file not available")

// Service answers library requests. Its zero value is not usable: build it with New.
type Service struct {
	bundle *Bundle
	cache  *Cache
	client *http.Client
	now    func() time.Time

	mu     sync.Mutex
	scopes map[string]time.Time
	group  singleflight.Group
}

// New serves from bundle, then cache (nil disables downloading entirely).
func New(bundle *Bundle, cache *Cache) *Service {
	if bundle == nil {
		bundle = &Bundle{}
	}
	return &Service{
		bundle: bundle,
		cache:  cache,
		client: &http.Client{
			Timeout: 30 * time.Second,
			CheckRedirect: func(req *http.Request, via []*http.Request) error {
				if len(via) >= 5 || !knownHost(req.URL.Hostname()) || req.URL.Scheme != "https" {
					return errors.New("redirect outside the library CDNs")
				}
				return nil
			},
		},
		now:    time.Now,
		scopes: map[string]time.Time{},
	}
}

// AllowPage records the libraries of a page the app asked to preview, so that their missing exact versions may be downloaded. It is called
// only from the authenticated preview creation: an address typed by anyone else on this machine never makes the backend download anything.
func (s *Service) AllowPage(html string) {
	matches := cdnURL.FindAllStringSubmatch(html, -1)
	if len(matches) == 0 {
		return
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	now := s.now()
	for scope, until := range s.scopes {
		if now.After(until) {
			delete(s.scopes, scope)
		}
	}
	for _, match := range matches {
		parsed, ok := parseSpec(match[1] + match[2])
		if !ok {
			continue
		}
		if scope := fetchScope(parsed); scope != "" {
			s.scopes[scope] = now.Add(ScopeTTL)
		}
	}
}

func (s *Service) mayFetch(sp spec) bool {
	key := sp.host + "/" + sp.rest
	s.mu.Lock()
	defer s.mu.Unlock()
	now := s.now()
	for scope, until := range s.scopes {
		if now.Before(until) && strings.HasPrefix(key, scope) {
			return true
		}
	}
	return false
}

// Served is a library file ready to send.
type Served struct {
	Body        []byte
	ContentType string
	// Source says where it came from: "bundle", "cache" or "download".
	Source string
}

// Serve answers "<host>/<path>[?query]" as written after the library route; base is that route as the page sees it, used to point the
// file's own CDN addresses back here.
func (s *Service) Serve(ctx context.Context, hostAndRest, base string) (Served, error) {
	sp, ok := parseSpec(hostAndRest)
	if !ok {
		return Served{}, ErrNotFound
	}
	served, err := s.resolve(ctx, sp)
	if err != nil {
		return Served{}, err
	}
	served.Body = rewriteServed(served.Body, sp.host, served.ContentType, base)
	return served, nil
}

// resolve tries, in order: the shipped file of that exact version (or of the same major for an address without an exact version), the
// cache, a download when the page allowed it, and last the shipped file of the same major, so that a page keeps working offline after an
// update of the app changed the shipped versions.
func (s *Service) resolve(ctx context.Context, sp spec) (Served, error) {
	if file, ok := s.bundle.lookup(sp, false); ok {
		return readShipped(file)
	}
	url := "https://" + sp.host + "/" + sp.rest
	if s.cache != nil {
		if body, contentType, ok := s.cache.Get(url); ok {
			return Served{Body: body, ContentType: contentType, Source: "cache"}, nil
		}
		if s.mayFetch(sp) {
			value, err, _ := s.group.Do(url, func() (any, error) { return s.download(ctx, url) })
			if err == nil {
				served := value.(Served)
				_ = s.cache.Put(url, served.Body, served.ContentType)
				return served, nil
			}
		}
	}
	if file, ok := s.bundle.lookup(sp, true); ok {
		return readShipped(file)
	}
	return Served{}, ErrNotFound
}

func readShipped(file string) (Served, error) {
	body, err := os.ReadFile(file)
	if err != nil {
		return Served{}, ErrNotFound
	}
	return Served{Body: body, ContentType: contentTypeFor(file, ""), Source: "bundle"}, nil
}

func (s *Service) download(ctx context.Context, url string) (Served, error) {
	req, err := http.NewRequestWithContext(context.WithoutCancel(ctx), http.MethodGet, url, nil)
	if err != nil {
		return Served{}, err
	}
	resp, err := s.client.Do(req)
	if err != nil {
		return Served{}, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return Served{}, fmt.Errorf("%s: HTTP %d", url, resp.StatusCode)
	}
	body, err := io.ReadAll(io.LimitReader(resp.Body, MaxFileBytes+1))
	if err != nil {
		return Served{}, err
	}
	if len(body) > MaxFileBytes {
		return Served{}, fmt.Errorf("%s: larger than %d MB", url, MaxFileBytes>>20)
	}
	contentType := contentTypeFor(resp.Request.URL.Path, resp.Header.Get("Content-Type"))
	if contentType == "" {
		return Served{}, fmt.Errorf("%s: not a library file", url)
	}
	return Served{Body: body, ContentType: contentType, Source: "download"}, nil
}

// allowedTypes are the kinds of file a library is made of; anything else (an HTML page, an executable) is refused.
var allowedTypes = []string{"text/javascript", "application/javascript", "text/css", "application/json", "application/wasm", "font/", "image/", "application/font-woff", "application/x-font"}

// contentTypeFor names a file by its extension first, then by what the CDN said; "" means it is not a library file.
func contentTypeFor(name, upstream string) string {
	ext := strings.ToLower(path.Ext(strings.ReplaceAll(name, "\\", "/")))
	switch ext {
	case ".js", ".mjs", ".cjs":
		return "text/javascript; charset=utf-8"
	case ".css":
		return "text/css; charset=utf-8"
	case ".json", ".map":
		return "application/json"
	case ".wasm":
		return "application/wasm"
	// Named here because the system's MIME table does not always know them (Windows has no woff2).
	case ".woff2":
		return "font/woff2"
	case ".woff":
		return "font/woff"
	case ".ttf":
		return "font/ttf"
	case ".otf":
		return "font/otf"
	}
	candidate := upstream
	if byExt := mime.TypeByExtension(ext); byExt != "" && ext != "" {
		candidate = byExt
	}
	media, _, _ := mime.ParseMediaType(candidate)
	for _, allowed := range allowedTypes {
		if strings.HasPrefix(media, allowed) {
			if media == "text/javascript" || media == "application/javascript" {
				return "text/javascript; charset=utf-8"
			}
			// No SVG: opened by itself it is a document that can run script on the backend's origin.
			if strings.HasPrefix(media, "image/") && media != "image/png" && media != "image/gif" && media != "image/jpeg" && media != "image/webp" {
				return ""
			}
			return candidate
		}
	}
	return ""
}
