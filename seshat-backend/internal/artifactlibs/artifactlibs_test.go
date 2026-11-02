package artifactlibs

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

const base = "http://127.0.0.1:9/api/v1/artifacts/lib"

func TestRewriteCDNURLs(t *testing.T) {
	in := `<script src="https://cdn.jsdelivr.net/npm/chart.js@4.5.1/dist/chart.umd.min.js"></script>
<script src="//unpkg.com/react@18/umd/react.production.min.js"></script>
<script src="https://cdn.tailwindcss.com"></script>
<script type="importmap">{"imports":{"three":"https://esm.sh/three@0.180.0"}}</script>
<link href='https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css'>
<img src="https://example.com/a.png">`
	out := RewriteCDNURLs(in, base)
	for _, want := range []string{
		base + "/cdn.jsdelivr.net/npm/chart.js@4.5.1/dist/chart.umd.min.js",
		base + "/unpkg.com/react@18/umd/react.production.min.js",
		`"` + base + `/cdn.tailwindcss.com/"`,
		`"three":"` + base + `/esm.sh/three@0.180.0"`,
		base + "/cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css",
		"https://example.com/a.png",
	} {
		if !strings.Contains(out, want) {
			t.Errorf("rewritten page lacks %q:\n%s", want, out)
		}
	}
}

func TestRewriteServedRootRelativeImports(t *testing.T) {
	js := `import "/react@18.3.1/es2022/react.mjs";export * from "/react@18.3.1/es2022/react.mjs";import x from './local.js'`
	out := string(rewriteServed([]byte(js), "esm.sh", "text/javascript", base))
	if !strings.Contains(out, `import "`+base+`/esm.sh/react@18.3.1/es2022/react.mjs"`) || !strings.Contains(out, `from "`+base+`/esm.sh/react@18.3.1`) {
		t.Fatalf("root-relative imports not rewritten: %s", out)
	}
	if !strings.Contains(out, `from './local.js'`) {
		t.Fatalf("relative import changed: %s", out)
	}
	if got := string(rewriteServed([]byte(js), "unpkg.com", "text/javascript", base)); got != js {
		t.Fatalf("unpkg file changed: %s", got)
	}
}

func TestParseSpec(t *testing.T) {
	cases := []struct {
		in                  string
		ok, npm             bool
		name, version, file string
	}{
		{"cdn.jsdelivr.net/npm/chart.js@4.5.1/dist/chart.umd.min.js", true, true, "chart.js", "4.5.1", "dist/chart.umd.min.js"},
		{"unpkg.com/@babel/standalone@7.28.4/babel.min.js", true, true, "@babel/standalone", "7.28.4", "babel.min.js"},
		{"unpkg.com/react@18/umd/react.production.min.js", true, true, "react", "18", "umd/react.production.min.js"},
		{"cdn.jsdelivr.net/npm/d3", true, true, "d3", "", ""},
		{"cdn.tailwindcss.com/", true, false, "", "", ""},
		{"example.com/x.js", false, false, "", "", ""},
		{"unpkg.com/react@18/../../etc/passwd", false, false, "", "", ""},
	}
	for _, c := range cases {
		got, ok := parseSpec(c.in)
		if ok != c.ok || got.npm != c.npm || got.name != c.name || got.version != c.version || got.file != c.file {
			t.Errorf("parseSpec(%q) = %+v, %v", c.in, got, ok)
		}
	}
}

func TestFetchScope(t *testing.T) {
	scope := func(s string) string { sp, _ := parseSpec(s); return fetchScope(sp) }
	if got := scope("cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js"); got != "cdn.jsdelivr.net/npm/three@0.180.0/" {
		t.Errorf("exact npm scope = %q", got)
	}
	for _, none := range []string{"unpkg.com/react@18/umd/react.production.min.js", "cdn.jsdelivr.net/npm/d3@latest", "cdn.tailwindcss.com/"} {
		if got := scope(none); got != "" {
			t.Errorf("scope(%q) = %q, want none", none, got)
		}
	}
	if got := scope("cdnjs.cloudflare.com/ajax/libs/lodash.js/4.17.21/lodash.min.js"); got != "cdnjs.cloudflare.com/ajax/libs/lodash.js/4.17.21/" {
		t.Errorf("cdnjs scope = %q", got)
	}
}

func writeBundle(t *testing.T, libs ...Library) *Bundle {
	t.Helper()
	dir := t.TempDir()
	for _, lib := range libs {
		for file := range lib.Files {
			path := filepath.Join(dir, lib.Name+"@"+lib.Version, filepath.FromSlash(file))
			if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
				t.Fatal(err)
			}
			if err := os.WriteFile(path, []byte("// "+lib.Name+"@"+lib.Version+" "+file), 0o644); err != nil {
				t.Fatal(err)
			}
		}
	}
	raw, _ := json.Marshal(manifest{Libraries: libs})
	if err := os.WriteFile(filepath.Join(dir, "manifest.json"), raw, 0o644); err != nil {
		t.Fatal(err)
	}
	bundle, err := LoadBundle(dir)
	if err != nil {
		t.Fatal(err)
	}
	return bundle
}

var chartLib = Library{Name: "chart.js", Version: "4.5.1", Main: "dist/chart.umd.min.js", Files: map[string]string{"dist/chart.umd.min.js": "x"}}
var tailwindLib = Library{Name: "tailwindcss-play", Version: "3.4.17", Host: "cdn.tailwindcss.com", Main: "tailwind.js", Files: map[string]string{"tailwind.js": "x"}}

// fakeCDN answers every download with a small script and counts the calls.
type fakeCDN struct {
	calls  atomic.Int32
	status int
}

func (f *fakeCDN) RoundTrip(req *http.Request) (*http.Response, error) {
	f.calls.Add(1)
	status := f.status
	if status == 0 {
		status = http.StatusOK
	}
	return &http.Response{
		StatusCode: status,
		Header:     http.Header{"Content-Type": []string{"application/javascript"}},
		Body:       io.NopCloser(strings.NewReader("// downloaded " + req.URL.String())),
		Request:    req,
	}, nil
}

func newTestService(t *testing.T, bundle *Bundle) (*Service, *fakeCDN) {
	t.Helper()
	cache, err := OpenCache(t.TempDir(), DefaultMaxBytes, DefaultMaxAge)
	if err != nil {
		t.Fatal(err)
	}
	svc := New(bundle, cache)
	cdn := &fakeCDN{}
	svc.client.Transport = cdn
	return svc, cdn
}

func serve(t *testing.T, svc *Service, target string) (Served, error) {
	t.Helper()
	return svc.Serve(context.Background(), target, base)
}

func TestServeShippedVersions(t *testing.T) {
	svc, cdn := newTestService(t, writeBundle(t, chartLib, tailwindLib))
	for _, target := range []string{
		"cdn.jsdelivr.net/npm/chart.js@4.5.1/dist/chart.umd.min.js",
		"cdn.jsdelivr.net/npm/chart.js",
		"unpkg.com/chart.js@4/dist/chart.umd.min.js",
		"cdn.tailwindcss.com/",
		"cdn.tailwindcss.com/3.4.17",
	} {
		got, err := serve(t, svc, target)
		if err != nil || got.Source != "bundle" {
			t.Errorf("%s: source %q, err %v", target, got.Source, err)
		}
	}
	if _, err := serve(t, svc, "cdn.jsdelivr.net/npm/chart.js@3/dist/chart.umd.min.js"); err == nil {
		t.Error("another major was served from the shipped version")
	}
	if cdn.calls.Load() != 0 {
		t.Errorf("downloaded %d times for shipped files", cdn.calls.Load())
	}
}

func TestDownloadOnlyForAllowedPages(t *testing.T) {
	svc, cdn := newTestService(t, writeBundle(t, chartLib))
	target := "cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"

	// Not named by any previewed page: the shipped version of the same major stands in, nothing is downloaded.
	got, err := serve(t, svc, target)
	if err != nil || got.Source != "bundle" || cdn.calls.Load() != 0 {
		t.Fatalf("unallowed request: source %q, err %v, downloads %d", got.Source, err, cdn.calls.Load())
	}

	svc.AllowPage(`<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>`)
	got, err = serve(t, svc, target)
	if err != nil || got.Source != "download" {
		t.Fatalf("allowed request: source %q, err %v", got.Source, err)
	}
	got, err = serve(t, svc, target)
	if err != nil || got.Source != "cache" || cdn.calls.Load() != 1 {
		t.Fatalf("second request: source %q, err %v, downloads %d", got.Source, err, cdn.calls.Load())
	}

	// A version range is never downloaded, even for an allowed page.
	svc.AllowPage(`<script src="https://unpkg.com/d3@7"></script>`)
	if _, err := serve(t, svc, "unpkg.com/d3@7"); err == nil || cdn.calls.Load() != 1 {
		t.Fatalf("range: err %v, downloads %d", err, cdn.calls.Load())
	}
}

func TestDownloadScopeExpires(t *testing.T) {
	svc, cdn := newTestService(t, &Bundle{})
	now := time.Now()
	svc.now = func() time.Time { return now }
	svc.AllowPage(`https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js`)
	now = now.Add(ScopeTTL + time.Minute)
	if _, err := serve(t, svc, "cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js"); err == nil || cdn.calls.Load() != 0 {
		t.Fatalf("expired scope still downloads: err %v, downloads %d", err, cdn.calls.Load())
	}
}

func TestFailedDownloadIsNotCached(t *testing.T) {
	svc, cdn := newTestService(t, &Bundle{})
	cdn.status = http.StatusNotFound
	svc.AllowPage(`https://unpkg.com/lodash@4.17.21/lodash.min.js`)
	if _, err := serve(t, svc, "unpkg.com/lodash@4.17.21/lodash.min.js"); err == nil {
		t.Fatal("a 404 was served")
	}
	if svc.cache.Size() != 0 {
		t.Fatal("a failed download was cached")
	}
}

func TestCacheBounds(t *testing.T) {
	dir := t.TempDir()
	now := time.Now()
	cache, err := OpenCache(dir, 25, time.Hour)
	if err != nil {
		t.Fatal(err)
	}
	cache.now = func() time.Time { return now }
	for i, url := range []string{"https://a/1", "https://a/2", "https://a/3"} {
		now = now.Add(time.Duration(i+1) * time.Minute)
		if err := cache.Put(url, []byte("0123456789"), "text/javascript"); err != nil {
			t.Fatal(err)
		}
	}
	if _, _, ok := cache.Get("https://a/1"); ok {
		t.Error("the least recently used file survived the size bound")
	}
	if cache.Size() > 25 {
		t.Errorf("cache holds %d bytes over its bound", cache.Size())
	}

	// Past its age a file goes when the cache opens again, and a file the index does not know goes too.
	if err := os.WriteFile(filepath.Join(dir, "stray"), []byte("x"), 0o644); err != nil {
		t.Fatal(err)
	}
	later := now.Add(2 * time.Hour)
	reopened := &Cache{dir: dir, maxBytes: 25, maxAge: time.Hour, now: func() time.Time { return later }, entries: map[string]*cacheEntry{}}
	raw, _ := os.ReadFile(filepath.Join(dir, indexName))
	var list []*cacheEntry
	_ = json.Unmarshal(raw, &list)
	for _, entry := range list {
		reopened.entries[entry.URL] = entry
	}
	reopened.pruneLocked()
	reopened.removeStrayFilesLocked()
	if len(reopened.entries) != 0 {
		t.Errorf("%d expired files kept", len(reopened.entries))
	}
	if _, err := os.Stat(filepath.Join(dir, "stray")); !os.IsNotExist(err) {
		t.Error("a stray file was kept")
	}
}

func TestMajorOf(t *testing.T) {
	for in, want := range map[string]string{"4.5.1": "4", "^4.2": "4", "4.x": "4", "18": "18", "0.180.0": "0.180", "~0.16": "0.16", "0": "0", "latest": "", "": ""} {
		if got := majorOf(in); got != want {
			t.Errorf("majorOf(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestContentTypeFor(t *testing.T) {
	cases := map[[2]string]string{
		{"x/chart.umd.min.js", ""}:                 "text/javascript; charset=utf-8",
		{"x/katex.min.css", ""}:                    "text/css; charset=utf-8",
		{"x/KaTeX_Main-Regular.woff2", ""}:         "font/woff2",
		{"react@18.3.1", "application/javascript"}: "text/javascript; charset=utf-8",
		{"x/page.html", "text/html"}:               "",
		{"x/icon.svg", "image/svg+xml"}:            "",
		{"x/tool.exe", "application/octet-stream"}: "",
	}
	for in, want := range cases {
		if got := contentTypeFor(in[0], in[1]); got != want {
			t.Errorf("contentTypeFor(%q, %q) = %q, want %q", in[0], in[1], got, want)
		}
	}
}
