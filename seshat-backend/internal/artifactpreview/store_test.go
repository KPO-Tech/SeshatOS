package artifactpreview

import (
	"strings"
	"testing"
	"time"
)

func TestPutGetRoundTrip(t *testing.T) {
	s := NewStore()
	id, err := s.Put("<html><body>hi</body></html>")
	if err != nil {
		t.Fatalf("Put: %v", err)
	}
	html, ok := s.Get(id)
	if !ok {
		t.Fatal("expected Get to find the stored entry")
	}
	if html != "<html><body>hi</body></html>" {
		t.Errorf("unexpected html: %q", html)
	}
}

func TestGetUnknownID(t *testing.T) {
	s := NewStore()
	if _, ok := s.Get("does-not-exist"); ok {
		t.Fatal("expected Get to report not-found for an unknown id")
	}
}

func TestPutRejectsOversizedHTML(t *testing.T) {
	s := NewStore()
	oversized := strings.Repeat("a", MaxHTMLBytes+1)
	if _, err := s.Put(oversized); err == nil {
		t.Fatal("expected an error for oversized HTML")
	}
}

func TestGetExpiredEntry(t *testing.T) {
	s := NewStore()
	id, err := s.Put("<html></html>")
	if err != nil {
		t.Fatalf("Put: %v", err)
	}
	s.mu.Lock()
	e := s.entries[id]
	e.expiresAt = time.Now().Add(-time.Second)
	s.entries[id] = e
	s.mu.Unlock()

	if _, ok := s.Get(id); ok {
		t.Fatal("expected an expired entry to be treated as not-found")
	}
	s.mu.Lock()
	_, stillPresent := s.entries[id]
	s.mu.Unlock()
	if stillPresent {
		t.Error("expected Get to lazily evict the expired entry")
	}
}

func TestSweepRemovesExpiredOnly(t *testing.T) {
	s := NewStore()
	freshID, err := s.Put("<html>fresh</html>")
	if err != nil {
		t.Fatalf("Put fresh: %v", err)
	}
	expiredID, err := s.Put("<html>expired</html>")
	if err != nil {
		t.Fatalf("Put expired: %v", err)
	}
	s.mu.Lock()
	e := s.entries[expiredID]
	e.expiresAt = time.Now().Add(-time.Second)
	s.entries[expiredID] = e
	s.mu.Unlock()

	s.Sweep()

	if _, ok := s.Get(freshID); !ok {
		t.Error("expected the fresh entry to survive Sweep")
	}
	s.mu.Lock()
	_, expiredStillPresent := s.entries[expiredID]
	s.mu.Unlock()
	if expiredStillPresent {
		t.Error("expected Sweep to remove the expired entry")
	}
}

func TestTwoIDsAreDistinct(t *testing.T) {
	s := NewStore()
	id1, err := s.Put("<html>a</html>")
	if err != nil {
		t.Fatalf("Put: %v", err)
	}
	id2, err := s.Put("<html>b</html>")
	if err != nil {
		t.Fatalf("Put: %v", err)
	}
	if id1 == id2 {
		t.Fatal("expected distinct ids for distinct Put calls")
	}
}
