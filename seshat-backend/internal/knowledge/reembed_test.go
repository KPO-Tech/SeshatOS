package knowledge

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/KPO-Tech/seshat-runtime/pkg/vector"
)

type memoryRecords struct{ records map[string]vector.Record }

func (m *memoryRecords) Get(_ context.Context, namespace string, _ []string) ([]vector.Record, error) {
	var out []vector.Record
	for _, r := range m.records {
		if r.Namespace == namespace {
			out = append(out, r)
		}
	}
	return out, nil
}

func (m *memoryRecords) Upsert(_ context.Context, records []vector.Record) error {
	for _, r := range records {
		m.records[r.Namespace+"/"+r.Key] = r
	}
	return nil
}

func passages(n int) *memoryRecords {
	m := &memoryRecords{records: map[string]vector.Record{}}
	for i := range n {
		key := fmt.Sprintf("doc#chunk-%d", i)
		m.records["c/"+key] = vector.Record{Namespace: "c", Key: key, Text: fmt.Sprintf("passage %d", i), Vector: []float32{9, 9}, Metadata: map[string]string{"filename": "doc.pdf"}}
	}
	return m
}

type scriptedEmbedder struct {
	mu    sync.Mutex
	calls int
	// failOn lists the calls (counted from 1) that fail, the way a quota does.
	failOn map[int]bool
}

func (e *scriptedEmbedder) EmbedTexts(_ context.Context, texts []string) ([][]float32, error) {
	e.mu.Lock()
	e.calls++
	failing := e.failOn[e.calls]
	e.mu.Unlock()
	if failing {
		return nil, errors.New("429 too many requests")
	}
	out := make([][]float32, len(texts))
	for i := range texts {
		out[i] = []float32{1, 2, 3}
	}
	return out, nil
}

func TestReembedMakesEveryVectorAgainAndKeepsTheTextAndMetadata(t *testing.T) {
	store := passages(40)
	var done atomic.Int64
	if err := reembedNamespace(context.Background(), store, &scriptedEmbedder{}, "c", "openrouter|nemotron", func(n int) { done.Add(int64(n)) }); err != nil {
		t.Fatal(err)
	}
	if done.Load() != 40 {
		t.Fatalf("%d passages reported, want 40", done.Load())
	}
	for key, record := range store.records {
		if len(record.Vector) != 3 || record.Metadata[embeddedWith] != "openrouter|nemotron" || record.Metadata["filename"] != "doc.pdf" || !strings.HasPrefix(record.Text, "passage ") {
			t.Fatalf("%s came out as %+v", key, record)
		}
	}
}

// A quota refuses a batch: it is tried again, and the passages made are not made twice when the whole is asked again.
func TestReembedTriesAgainAfterAQuotaAndGoesOnWhereItStopped(t *testing.T) {
	// One batch at a time, so that the call that fails is known.
	workers := reembedWorkers
	reembedWorkers = 1
	t.Cleanup(func() { reembedWorkers = workers })
	saved := reembedBackoff
	reembedBackoff = []time.Duration{time.Millisecond, time.Millisecond}
	t.Cleanup(func() { reembedBackoff = saved })

	store := passages(40) // 3 batches of 16, 16, 8
	embedder := &scriptedEmbedder{failOn: map[int]bool{2: true}}
	if err := reembedNamespace(context.Background(), store, embedder, "c", "m", func(int) {}); err != nil {
		t.Fatalf("one refused call must be tried again, got %v", err)
	}
	if embedder.calls != 4 {
		t.Fatalf("%d calls, want 4 (3 batches and 1 retry)", embedder.calls)
	}

	// Stops for good on the third batch, after two tries again.
	store = passages(40)
	embedder = &scriptedEmbedder{failOn: map[int]bool{3: true, 4: true, 5: true}}
	if err := reembedNamespace(context.Background(), store, embedder, "c", "m", func(int) {}); err == nil {
		t.Fatal("a service that keeps refusing must stop the re-embedding with an error")
	}
	madeFirst := 0
	for _, record := range store.records {
		if record.Metadata[embeddedWith] == "m" {
			madeFirst++
		}
	}
	if madeFirst != 32 {
		t.Fatalf("%d passages were made before it stopped, want the first two batches (32)", madeFirst)
	}

	// Asked again, it embeds only the 8 left.
	again := &scriptedEmbedder{}
	if err := reembedNamespace(context.Background(), store, again, "c", "m", func(int) {}); err != nil {
		t.Fatal(err)
	}
	if again.calls != 1 {
		t.Fatalf("%d calls to finish, want 1 (the 8 left)", again.calls)
	}
}

func TestReembedSkipsPassagesWithoutTextAndStopsWhenCancelled(t *testing.T) {
	store := passages(3)
	store.records["c/doc#chunk-0"] = vector.Record{Namespace: "c", Key: "doc#chunk-0", Text: "  "}
	embedder := &scriptedEmbedder{}
	if err := reembedNamespace(context.Background(), store, embedder, "c", "m", func(int) {}); err != nil || embedder.calls != 1 {
		t.Fatalf("err %v, %d calls; a passage with no text is left as it is", err, embedder.calls)
	}

	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if err := reembedNamespace(ctx, passages(40), &scriptedEmbedder{failOn: map[int]bool{1: true}}, "c", "m", func(int) {}); !errors.Is(err, context.Canceled) {
		t.Fatalf("cancelled gave %v, want context.Canceled", err)
	}
}

// Several batches at once must still reach every passage, and a failure of one must stop the rest.
func TestReembedWithSeveralBatchesAtOnceReachesEveryPassage(t *testing.T) {
	store := &lockedRecords{memoryRecords: passages(500)}
	var done atomic.Int64
	if err := reembedNamespace(context.Background(), store, &scriptedEmbedder{}, "c", "m", func(n int) { done.Add(int64(n)) }); err != nil {
		t.Fatal(err)
	}
	if done.Load() != 500 {
		t.Fatalf("%d reported, want 500", done.Load())
	}
	for key, record := range store.records {
		if record.Metadata[embeddedWith] != "m" {
			t.Fatalf("%s was not made again", key)
		}
	}
}

func TestReembedStopsEverythingWhenOneBatchCannotBeMade(t *testing.T) {
	saved := reembedBackoff
	reembedBackoff = nil
	t.Cleanup(func() { reembedBackoff = saved })
	failing := map[int]bool{}
	for i := 3; i < 200; i++ {
		failing[i] = true
	}
	embedder := &scriptedEmbedder{failOn: failing}
	err := reembedNamespace(context.Background(), &lockedRecords{memoryRecords: passages(500)}, embedder, "c", "m", func(int) {})
	if err == nil {
		t.Fatal("a batch that cannot be made must stop the re-embedding with an error")
	}
	if embedder.calls > 20 {
		t.Fatalf("%d calls were made after the failure; the others should have stopped", embedder.calls)
	}
}

// lockedRecords makes the in-memory store safe for the batches that save at once (the real store is).
type lockedRecords struct {
	*memoryRecords
	mu sync.Mutex
}

func (l *lockedRecords) Upsert(ctx context.Context, records []vector.Record) error {
	l.mu.Lock()
	defer l.mu.Unlock()
	return l.memoryRecords.Upsert(ctx, records)
}

func TestLiveEmbedderFailsUntilAModelIsSetAndSwapsWithoutRestart(t *testing.T) {
	live := &LiveEmbedder{}
	if _, err := live.EmbedTexts(context.Background(), []string{"a"}); !errors.Is(err, ErrNoEmbedder) {
		t.Fatalf("no model set gave %v", err)
	}
	live.Set(&scriptedEmbedder{}, "a|m1")
	if live.Key() != "a|m1" {
		t.Fatalf("key %q", live.Key())
	}
	if out, err := live.EmbedTexts(context.Background(), []string{"a"}); err != nil || len(out) != 1 {
		t.Fatalf("%v %v", out, err)
	}
	live.Set(nil, "")
	if live.Key() != "" {
		t.Fatal("unsetting must clear the key")
	}
}

// A limit for the day is reported at once, with what to do, instead of being tried again for minutes.
func TestReembedStopsAtOnceWhenTheServiceHasReachedItsLimitForTheDay(t *testing.T) {
	saved := reembedBackoff
	reembedBackoff = []time.Duration{time.Hour}
	t.Cleanup(func() { reembedBackoff = saved })
	embedder := &dailyLimitEmbedder{}
	started := time.Now()
	err := reembedNamespace(context.Background(), passages(100), embedder, "c", "m", func(int) {})
	if !errors.Is(err, errDailyLimit) {
		t.Fatalf("got %v, want the daily limit", err)
	}
	if time.Since(started) > 5*time.Second {
		t.Fatal("it waited instead of stopping")
	}
}

type dailyLimitEmbedder struct{}

func (dailyLimitEmbedder) EmbedTexts(context.Context, []string) ([][]float32, error) {
	return nil, errors.New(`embedding API returned 429: {"error":{"message":"Rate limit exceeded: free-models-per-day."}}`)
}
