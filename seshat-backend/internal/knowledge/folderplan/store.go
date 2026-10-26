package folderplan

import (
	"crypto/rand"
	"encoding/hex"
	"sort"
	"sync"
	"time"

	"github.com/KPO-Tech/seshat-runtime/pkg/collectionplan"
)

// Analysis is a plan made from a folder, kept for the person who asked for it.
type Analysis struct {
	ID      string
	UserID  string
	Root    string
	Created time.Time
	// Listed is how many entries the scan found, before the plan left some out.
	Listed int
	Plan   collectionplan.Plan
}

// Store keeps analyses in memory for a while. A plan is a proposal the person is looking at: it is not worth a table, and losing it with
// the process only means asking again.
type Store struct {
	mu      sync.Mutex
	items   map[string]*Analysis
	ttl     time.Duration
	perUser int
	now     func() time.Time
}

// NewStore keeps an analysis for ttl, and at most perUser of them for one person (the oldest goes first).
func NewStore(ttl time.Duration, perUser int) *Store {
	if ttl <= 0 {
		ttl = time.Hour
	}
	if perUser <= 0 {
		perUser = 10
	}
	return &Store{items: map[string]*Analysis{}, ttl: ttl, perUser: perUser, now: time.Now}
}

// Add stores an analysis for a person and returns it with its id.
func (s *Store) Add(userID, root string, listed int, plan collectionplan.Plan) *Analysis {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.expireLocked()
	a := &Analysis{ID: newID(), UserID: userID, Root: root, Created: s.now(), Listed: listed, Plan: plan}
	s.items[a.ID] = a

	var mine []*Analysis
	for _, other := range s.items {
		if other.UserID == userID {
			mine = append(mine, other)
		}
	}
	sort.Slice(mine, func(i, j int) bool { return mine[i].Created.Before(mine[j].Created) })
	for len(mine) > s.perUser {
		delete(s.items, mine[0].ID)
		mine = mine[1:]
	}
	return a
}

// Get returns an analysis only to the person it was made for: for anyone else, as for an unknown or expired id, it is not found.
func (s *Store) Get(userID, id string) (*Analysis, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.expireLocked()
	a, ok := s.items[id]
	if !ok || a.UserID != userID {
		return nil, false
	}
	return a, true
}

func (s *Store) expireLocked() {
	cutoff := s.now().Add(-s.ttl)
	for id, a := range s.items {
		if a.Created.Before(cutoff) {
			delete(s.items, id)
		}
	}
}

func newID() string {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		panic("folderplan: no randomness: " + err.Error())
	}
	return hex.EncodeToString(b)
}
