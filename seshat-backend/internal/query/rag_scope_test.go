package query

import (
	"context"
	"path/filepath"
	"strings"
	"testing"

	sdkrag "github.com/KPO-Tech/seshat/pkg/rag"
	"github.com/KPO-Tech/seshat/pkg/vector"

	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/db"
)

type fakeEmbedder struct{}

func (fakeEmbedder) EmbedTexts(_ context.Context, texts []string) ([][]float32, error) {
	out := make([][]float32, len(texts))
	for i := range texts {
		out[i] = []float32{1, 0, 0}
	}
	return out, nil
}

func newRAGScopeTestDB(t *testing.T) *db.CorpusStore {
	t.Helper()
	database, err := db.Open(context.Background(), db.DefaultSQLiteConfig(filepath.Join(t.TempDir(), "test.db")))
	if err != nil {
		t.Fatalf("open test db: %v", err)
	}
	t.Cleanup(func() { _ = database.Close() })
	corpora, err := db.NewCorpusStore(database)
	if err != nil {
		t.Fatalf("new corpus store: %v", err)
	}
	return corpora
}

// TestUserScopedVectorStoreRejectsCrossUserCorpusID is the regression test
// for the cross-user data-read gap described in userScopedVectorStore's doc
// comment: rag_search takes corpus_id as a plain model-supplied string, so
// without this wrapper, one user's Main Chat session could read another
// user's corpus content by supplying its id.
func TestUserScopedVectorStoreRejectsCrossUserCorpusID(t *testing.T) {
	ctx := context.Background()
	corpora := newRAGScopeTestDB(t)

	corpus, err := corpora.Create(ctx, db.CreateCorpusParams{UserID: "user-a", Name: "User A's Corpus"})
	if err != nil {
		t.Fatalf("create corpus: %v", err)
	}

	rawVectors := vector.NewMemoryStore()
	ragForOwner := sdkrag.NewService(nil, newUserScopedVectorStore(rawVectors, corpora, []string{"user-a"}), fakeEmbedder{}, nil)
	if _, err := ragForOwner.Ingest(ctx, sdkrag.IngestRequest{CorpusID: corpus.ID, Filename: "doc.txt", Text: "the launch code is 42"}); err != nil {
		t.Fatalf("owner ingest: %v", err)
	}

	// user-b's Main Chat session gets a rag.Service scoped to user-b...
	ragForOther := sdkrag.NewService(nil, newUserScopedVectorStore(rawVectors, corpora, []string{"user-b"}), fakeEmbedder{}, nil)

	// ...but the model can still try user-a's real corpus_id.
	if _, err := ragForOther.Search(ctx, sdkrag.SearchRequest{CorpusID: corpus.ID, Query: "launch code", TopK: 5}); err == nil {
		t.Fatal("expected searching another user's corpus_id to fail, got no error")
	} else if !strings.Contains(err.Error(), "not found") {
		t.Fatalf("expected a not-found style scoping error, got: %v", err)
	}
	if _, err := ragForOther.Ingest(ctx, sdkrag.IngestRequest{CorpusID: corpus.ID, Filename: "smuggled.txt", Text: "smuggled content"}); err == nil {
		t.Fatal("expected ingesting into another user's corpus_id to fail, got no error")
	} else if !strings.Contains(err.Error(), "not found") {
		t.Fatalf("expected a not-found style scoping error from ingest, got: %v", err)
	}

	// Sanity: the legitimate owner can still search its own corpus fine.
	resp, err := ragForOwner.Search(ctx, sdkrag.SearchRequest{CorpusID: corpus.ID, Query: "launch code", TopK: 5})
	if err != nil {
		t.Fatalf("expected the owner to search its own corpus fine, got: %v", err)
	}
	if len(resp.Results) == 0 {
		t.Fatal("expected at least one result searching the owner's own ingested corpus")
	}
}

// TestUserScopedVectorStoreAllowsWorkspaceMember mirrors
// knowledge.Service.checkAccess's workspace-sharing rule: a corpus attached
// to a workspace must stay reachable to every member of that workspace, not
// just its literal creator - this wrapper must not regress that sharing
// model down to a stricter per-user check.
func TestUserScopedVectorStoreAllowsWorkspaceMember(t *testing.T) {
	ctx := context.Background()
	corpora := newRAGScopeTestDB(t)

	corpus, err := corpora.Create(ctx, db.CreateCorpusParams{UserID: "owner", WorkspaceID: "workspace-1", Name: "Shared Corpus"})
	if err != nil {
		t.Fatalf("create corpus: %v", err)
	}
	rawVectors := vector.NewMemoryStore()
	ragForOwner := sdkrag.NewService(nil, newUserScopedVectorStore(rawVectors, corpora, []string{"owner", "workspace-1"}), fakeEmbedder{}, nil)
	if _, err := ragForOwner.Ingest(ctx, sdkrag.IngestRequest{CorpusID: corpus.ID, Filename: "doc.txt", Text: "shared team knowledge"}); err != nil {
		t.Fatalf("owner ingest: %v", err)
	}

	// A different user who is a member of the same workspace must still see it.
	ragForMember := sdkrag.NewService(nil, newUserScopedVectorStore(rawVectors, corpora, []string{"teammate", "workspace-1"}), fakeEmbedder{}, nil)
	resp, err := ragForMember.Search(ctx, sdkrag.SearchRequest{CorpusID: corpus.ID, Query: "team knowledge", TopK: 5})
	if err != nil {
		t.Fatalf("expected a workspace member to search the shared corpus fine, got: %v", err)
	}
	if len(resp.Results) == 0 {
		t.Fatal("expected at least one result for the workspace member")
	}

	// A user in neither the corpus's own ID nor its workspace must still be rejected.
	ragForOutsider := sdkrag.NewService(nil, newUserScopedVectorStore(rawVectors, corpora, []string{"outsider", "some-other-workspace"}), fakeEmbedder{}, nil)
	if _, err := ragForOutsider.Search(ctx, sdkrag.SearchRequest{CorpusID: corpus.ID, Query: "team knowledge", TopK: 5}); err == nil {
		t.Fatal("expected an outsider to be rejected")
	}
}
