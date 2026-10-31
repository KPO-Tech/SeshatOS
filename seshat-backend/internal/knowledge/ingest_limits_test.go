package knowledge

import (
	"context"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

func TestGateLetsOneIn(t *testing.T) {
	var g gate
	var inside, most atomic.Int32
	var wg sync.WaitGroup
	for i := 0; i < 8; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			leave, err := g.enter(context.Background())
			if err != nil {
				t.Error(err)
				return
			}
			n := inside.Add(1)
			for {
				m := most.Load()
				if n <= m || most.CompareAndSwap(m, n) {
					break
				}
			}
			time.Sleep(2 * time.Millisecond)
			inside.Add(-1)
			leave()
		}()
	}
	wg.Wait()
	if most.Load() != 1 {
		t.Fatalf("%d holders at once, want 1", most.Load())
	}
}

func TestGateGivesUpWhenTheContextEnds(t *testing.T) {
	var g gate
	leave, err := g.enter(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	defer leave()
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Millisecond)
	defer cancel()
	if _, err := g.enter(ctx); err == nil {
		t.Fatal("a second holder must wait, and give up with the context")
	}
}

func TestByteBudgetBoundsWhatIsBeingRead(t *testing.T) {
	var b byteBudget
	var inside int64
	var mu sync.Mutex
	var most int64
	var wg sync.WaitGroup
	const size = 100 << 20 // three of these do not fit in 256 MB
	for i := 0; i < 6; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			b.acquire(size)
			mu.Lock()
			inside += size
			most = max(most, inside)
			mu.Unlock()
			time.Sleep(3 * time.Millisecond)
			mu.Lock()
			inside -= size
			mu.Unlock()
			b.release(size)
		}()
	}
	wg.Wait()
	if most > maxBytesBeingRead {
		t.Fatalf("%d bytes were read at once, the budget is %d", most, maxBytesBeingRead)
	}
}

func TestAFileOverTheBudgetIsReadAlone(t *testing.T) {
	var b byteBudget
	done := make(chan struct{})
	go func() {
		b.acquire(maxBytesBeingRead * 2) // nothing else is being read: it must not wait for ever
		b.release(maxBytesBeingRead * 2)
		close(done)
	}()
	select {
	case <-done:
	case <-time.After(time.Second):
		t.Fatal("a file bigger than the budget was never let in")
	}
}
