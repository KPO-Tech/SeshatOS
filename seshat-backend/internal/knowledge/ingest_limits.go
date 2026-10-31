package knowledge

import (
	"context"
	"os"
	"runtime"
	"strconv"
	"strings"
	"sync"
)

// The readers of an indexing run go side by side, but three things stay one at a time or bounded: the step that chunks and embeds (the
// provider sees one request at a time, as before), the reads through an external reader, and the bytes of the files being read.

// maxBytesBeingRead bounds the memory of the files being read at once; a file bigger than this is still read, alone.
const maxBytesBeingRead = 256 << 20

// IngestWorkers is how many documents are read at once: the SESHAT_INGEST_WORKERS variable when it holds a number, otherwise half of the
// cores, at least one and at most four (measured: four readers read the test corpus 2.66 times faster, six only 3.02).
func IngestWorkers() int {
	if n, err := strconv.Atoi(strings.TrimSpace(os.Getenv("SESHAT_INGEST_WORKERS"))); err == nil && n >= 1 {
		return min(n, 16)
	}
	return min(max(runtime.NumCPU()/2, 1), 4)
}

// gate lets one holder in at a time and gives up when the context ends. The zero value is ready to use.
type gate struct {
	once sync.Once
	slot chan struct{}
}

func (g *gate) enter(ctx context.Context) (leave func(), err error) {
	g.once.Do(func() { g.slot = make(chan struct{}, 1) })
	select {
	case g.slot <- struct{}{}:
		return func() { <-g.slot }, nil
	case <-ctx.Done():
		return nil, ctx.Err()
	}
}

// byteBudget bounds the bytes held by the readers at once.
type byteBudget struct {
	mu   sync.Mutex
	cond *sync.Cond
	used int64
}

func (b *byteBudget) acquire(n int64) {
	b.mu.Lock()
	defer b.mu.Unlock()
	if b.cond == nil {
		b.cond = sync.NewCond(&b.mu)
	}
	// A file over the budget is let in alone rather than never.
	for b.used > 0 && b.used+n > maxBytesBeingRead {
		b.cond.Wait()
	}
	b.used += n
}

func (b *byteBudget) release(n int64) {
	b.mu.Lock()
	defer b.mu.Unlock()
	b.used -= n
	if b.cond != nil {
		b.cond.Broadcast()
	}
}

// usesExternalReader tells whether the converter in use hands documents to an external reader.
func usesExternalReader(converter interface{}) bool {
	external, ok := converter.(interface{ UsesExternalReader() bool })
	return ok && external.UsesExternalReader()
}
