package artifactlibs

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"
)

const (
	// DefaultMaxBytes is the most the cache keeps on disk: past it, the files served longest ago go first.
	DefaultMaxBytes = 100 << 20
	// DefaultMaxAge removes a file no page has used for that long.
	DefaultMaxAge = 60 * 24 * time.Hour
	// MaxFileBytes is the largest file downloaded; Plotly, the largest library in use, is under 5 MB.
	MaxFileBytes = 15 << 20

	indexName = "index.json"
)

type cacheEntry struct {
	URL         string    `json:"url"`
	File        string    `json:"file"`
	Size        int64     `json:"size"`
	ContentType string    `json:"content_type"`
	SHA256      string    `json:"sha256"`
	Fetched     time.Time `json:"fetched"`
	LastUsed    time.Time `json:"last_used"`
}

// Cache keeps the exact library versions downloaded for previewed pages, in one folder of the user's data, bounded in size and age. Its
// index is the only record of what it holds: a file the index does not name is removed when the cache opens.
type Cache struct {
	dir      string
	maxBytes int64
	maxAge   time.Duration
	now      func() time.Time

	mu      sync.Mutex
	entries map[string]*cacheEntry
}

// OpenCache loads the index of dir (creating the folder) and prunes it at once: files past their age, files the index forgot, and the
// oldest used ones beyond maxBytes.
func OpenCache(dir string, maxBytes int64, maxAge time.Duration) (*Cache, error) {
	c := &Cache{dir: dir, maxBytes: maxBytes, maxAge: maxAge, now: time.Now, entries: map[string]*cacheEntry{}}
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return nil, err
	}
	if raw, err := os.ReadFile(filepath.Join(dir, indexName)); err == nil {
		var list []*cacheEntry
		if json.Unmarshal(raw, &list) == nil {
			for _, entry := range list {
				if entry != nil && entry.URL != "" && filepath.Base(entry.File) == entry.File {
					c.entries[entry.URL] = entry
				}
			}
		}
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	c.pruneLocked()
	c.removeStrayFilesLocked()
	return c, c.saveLocked()
}

func cacheKey(url string) string {
	sum := sha256.Sum256([]byte(url))
	return hex.EncodeToString(sum[:])
}

// Get returns the cached body of url and marks it used.
func (c *Cache) Get(url string) ([]byte, string, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	entry, ok := c.entries[url]
	if !ok {
		return nil, "", false
	}
	body, err := os.ReadFile(filepath.Join(c.dir, entry.File))
	if err != nil {
		delete(c.entries, url)
		_ = c.saveLocked()
		return nil, "", false
	}
	// The age only needs a day's precision: the index is not rewritten for every file of every page load.
	if now := c.now(); now.Sub(entry.LastUsed) > time.Hour {
		entry.LastUsed = now
		_ = c.saveLocked()
	}
	return body, entry.ContentType, true
}

// Put stores body for url, then prunes so the cache stays under its bounds.
func (c *Cache) Put(url string, body []byte, contentType string) error {
	if int64(len(body)) > MaxFileBytes {
		return nil
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	file := cacheKey(url)
	tmp := filepath.Join(c.dir, file+".tmp")
	if err := os.WriteFile(tmp, body, 0o644); err != nil {
		return err
	}
	if err := os.Rename(tmp, filepath.Join(c.dir, file)); err != nil {
		_ = os.Remove(tmp)
		return err
	}
	sum := sha256.Sum256(body)
	now := c.now()
	c.entries[url] = &cacheEntry{URL: url, File: file, Size: int64(len(body)), ContentType: contentType, SHA256: hex.EncodeToString(sum[:]), Fetched: now, LastUsed: now}
	c.pruneLocked()
	return c.saveLocked()
}

// Size is the total size of the cached files.
func (c *Cache) Size() int64 {
	c.mu.Lock()
	defer c.mu.Unlock()
	var total int64
	for _, entry := range c.entries {
		total += entry.Size
	}
	return total
}

func (c *Cache) pruneLocked() {
	now := c.now()
	for url, entry := range c.entries {
		if now.Sub(entry.LastUsed) > c.maxAge {
			c.removeLocked(url)
		}
	}
	var total int64
	list := make([]*cacheEntry, 0, len(c.entries))
	for _, entry := range c.entries {
		total += entry.Size
		list = append(list, entry)
	}
	sort.Slice(list, func(i, j int) bool { return list[i].LastUsed.Before(list[j].LastUsed) })
	for _, entry := range list {
		if total <= c.maxBytes {
			break
		}
		total -= entry.Size
		c.removeLocked(entry.URL)
	}
}

func (c *Cache) removeLocked(url string) {
	if entry, ok := c.entries[url]; ok {
		_ = os.Remove(filepath.Join(c.dir, entry.File))
		delete(c.entries, url)
	}
}

func (c *Cache) removeStrayFilesLocked() {
	known := map[string]bool{indexName: true}
	for _, entry := range c.entries {
		known[entry.File] = true
	}
	items, err := os.ReadDir(c.dir)
	if err != nil {
		return
	}
	for _, item := range items {
		if !item.IsDir() && !known[item.Name()] && !strings.HasPrefix(item.Name(), ".") {
			_ = os.Remove(filepath.Join(c.dir, item.Name()))
		}
	}
}

func (c *Cache) saveLocked() error {
	list := make([]*cacheEntry, 0, len(c.entries))
	for _, entry := range c.entries {
		list = append(list, entry)
	}
	sort.Slice(list, func(i, j int) bool { return list[i].URL < list[j].URL })
	raw, err := json.MarshalIndent(list, "", "  ")
	if err != nil {
		return err
	}
	tmp := filepath.Join(c.dir, indexName+".tmp")
	if err := os.WriteFile(tmp, raw, 0o644); err != nil {
		return err
	}
	return os.Rename(tmp, filepath.Join(c.dir, indexName))
}
