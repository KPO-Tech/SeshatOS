package api

import (
	"sync"
	"time"
)

type rateWindow struct {
	count     int
	windowEnd time.Time
}

// RateLimiter is a simple fixed-window per-user in-memory rate limiter.
// A nil *RateLimiter is a no-op (all requests allowed).
type RateLimiter struct {
	mu      sync.Mutex
	windows map[string]*rateWindow
	max     int
	window  time.Duration
}

func NewRateLimiter(maxPerWindow int, window time.Duration) *RateLimiter {
	if maxPerWindow <= 0 {
		return nil
	}
	rl := &RateLimiter{
		windows: make(map[string]*rateWindow),
		max:     maxPerWindow,
		window:  window,
	}
	// Evict expired windows every 2× the window duration to bound memory growth.
	go func() {
		ticker := time.NewTicker(2 * window)
		defer ticker.Stop()
		for range ticker.C {
			rl.mu.Lock()
			now := time.Now()
			for id, w := range rl.windows {
				if now.After(w.windowEnd) {
					delete(rl.windows, id)
				}
			}
			rl.mu.Unlock()
		}
	}()
	return rl
}

func (l *RateLimiter) Allow(userID string) bool {
	if l == nil {
		return true
	}
	l.mu.Lock()
	defer l.mu.Unlock()
	now := time.Now()
	w, ok := l.windows[userID]
	if !ok || now.After(w.windowEnd) {
		l.windows[userID] = &rateWindow{count: 1, windowEnd: now.Add(l.window)}
		return true
	}
	w.count++
	return w.count <= l.max
}
