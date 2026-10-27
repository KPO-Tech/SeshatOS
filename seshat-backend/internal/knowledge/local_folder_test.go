package knowledge_test

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"

	backendauth "github.com/KPO-Tech/SeshatOS/seshat-backend/internal/auth"
	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/bkerr"
	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/knowledge"
)

func localCollections() []knowledge.LocalCollection {
	return []knowledge.LocalCollection{
		{Name: "Legal", Files: []knowledge.LocalFile{
			{Path: "/data/corpus/Legal/a.pdf", Name: "Legal/a.pdf"},
			{Path: "/data/corpus/Legal/b.pdf", Name: "Legal/b.pdf"},
		}},
		{Name: "Finance", Files: []knowledge.LocalFile{{Path: "/data/corpus/Finance/c.docx", Name: "Finance/c.docx"}}},
	}
}

func TestLocalCollectionsRecordTheFilesWhereTheyAreAndQueueNothing(t *testing.T) {
	database := openTestDB(t)
	svc := newTestService(t, database, newTestArtifactStore(t))
	ctx := context.Background()
	p := testPrincipal("user-1")

	made, err := svc.CreateLocalCollections(ctx, p, "", localCollections())
	require.NoError(t, err)
	require.Len(t, made, 2)
	require.Equal(t, 2, made[0].FileCount)

	files, err := svc.ListFiles(ctx, p, made[0].Corpus.ID)
	require.NoError(t, err)
	require.Len(t, files, 2)
	for _, f := range files {
		require.Equal(t, "pending", f.Status)
		require.Equal(t, knowledge.LocalFileID(f.SourcePath), f.FileID)
		require.NotEmpty(t, f.SourcePath)
	}
	jobs, err := svc.ListIngestionJobs(ctx, p, made[0].Corpus.ID)
	require.NoError(t, err)
	require.Empty(t, jobs, "creating the collections must not start indexing")
}

func TestLocalCollectionsAreRefusedWholeWhenANameIsTaken(t *testing.T) {
	database := openTestDB(t)
	svc := newTestService(t, database, newTestArtifactStore(t))
	ctx := context.Background()
	p := testPrincipal("user-1")
	_, err := svc.CreateCorpus(ctx, p, knowledge.CreateCorpusParams{Name: "legal"})
	require.NoError(t, err)

	_, err = svc.CreateLocalCollections(ctx, p, "", localCollections())
	require.Equal(t, bkerr.ErrorKindConflict, bkerr.KindOf(err))

	corpora, err := svc.ListCorpora(ctx, p)
	require.NoError(t, err)
	require.Len(t, corpora, 1, "a refused request makes nothing")

	// Another person's collection of the same name is not a clash.
	_, err = svc.CreateLocalCollections(ctx, testPrincipal("user-2"), "", localCollections())
	require.NoError(t, err)
}

func TestLocalCollectionsRefuseWhatCannotBeMade(t *testing.T) {
	database := openTestDB(t)
	svc := newTestService(t, database, newTestArtifactStore(t))
	ctx := context.Background()
	p := testPrincipal("user-1")
	one := knowledge.LocalFile{Path: "/x/a.pdf", Name: "a.pdf"}
	for name, in := range map[string][]knowledge.LocalCollection{
		"nothing":          nil,
		"no name":          {{Name: " ", Files: []knowledge.LocalFile{one}}},
		"no file":          {{Name: "Empty"}},
		"the same name x2": {{Name: "A", Files: []knowledge.LocalFile{one}}, {Name: "a", Files: []knowledge.LocalFile{one}}},
	} {
		_, err := svc.CreateLocalCollections(ctx, p, "", in)
		require.Equal(t, bkerr.ErrorKindInvalidInput, bkerr.KindOf(err), name)
	}
	corpora, _ := svc.ListCorpora(ctx, p)
	require.Empty(t, corpora)
}

func TestSourcesGroupTheCollectionsTheyHold(t *testing.T) {
	database := openTestDB(t)
	svc := newTestService(t, database, newTestArtifactStore(t))
	ctx := context.Background()
	p := testPrincipal("user-1")

	src, err := svc.CreateFolderSource(ctx, p, "", "/data/corpus", "")
	require.NoError(t, err)
	require.Equal(t, "corpus", src.Name, "a source without a name takes its folder's name")

	_, err = svc.CreateFolderSource(ctx, p, "again", "/data/corpus", "")
	require.Equal(t, bkerr.ErrorKindConflict, bkerr.KindOf(err), "the same folder is not a source twice")

	_, err = svc.CreateCorpus(ctx, p, knowledge.CreateCorpusParams{Name: "Mine"})
	require.NoError(t, err)
	made, err := svc.CreateLocalCollections(ctx, p, src.ID, localCollections())
	require.NoError(t, err)
	require.Equal(t, src.ID, made[0].Corpus.SourceID)

	sources, defaultCount, err := svc.ListSources(ctx, p)
	require.NoError(t, err)
	require.Equal(t, 1, defaultCount)
	require.Len(t, sources, 1)
	require.Equal(t, 2, sources[0].Count)

	require.Equal(t, bkerr.ErrorKindConflict, bkerr.KindOf(svc.DeleteSource(ctx, p, src.ID)), "a source that holds collections is not removed")
	for _, m := range made {
		require.NoError(t, svc.DeleteCorpus(ctx, p, m.Corpus.ID))
	}
	require.NoError(t, svc.DeleteSource(ctx, p, src.ID))
}

func TestASourceBelongsToItsPerson(t *testing.T) {
	database := openTestDB(t)
	svc := newTestService(t, database, newTestArtifactStore(t))
	ctx := context.Background()
	src, err := svc.CreateFolderSource(ctx, testPrincipal("user-1"), "", "/data/corpus", "")
	require.NoError(t, err)

	_, err = svc.GetSource(ctx, testPrincipal("user-2"), src.ID)
	require.Equal(t, bkerr.ErrorKindNotFound, bkerr.KindOf(err))
	_, err = svc.CreateLocalCollections(ctx, testPrincipal("user-2"), src.ID, localCollections())
	require.Equal(t, bkerr.ErrorKindNotFound, bkerr.KindOf(err), "collections cannot be made under someone else's source")
	require.Equal(t, bkerr.ErrorKindNotFound, bkerr.KindOf(svc.DeleteSource(ctx, testPrincipal("user-2"), src.ID)))
}

func localSourceWithFiles(t *testing.T, svc *knowledge.Service, p *backendauth.Principal, inside, outside string) (id string) {
	t.Helper()
	ctx := context.Background()
	src, err := svc.CreateFolderSource(ctx, p, "", inside, "")
	require.NoError(t, err)
	_, err = svc.CreateLocalCollections(ctx, p, src.ID, []knowledge.LocalCollection{{Name: "Docs", Files: []knowledge.LocalFile{
		{Path: filepath.Join(inside, "a.md"), Name: "a.md"},
		{Path: filepath.Join(outside, "b.md"), Name: "b.md"},
		{Path: filepath.Join(inside, "gone.pdf"), Name: "gone.pdf"},
	}}})
	require.NoError(t, err)
	return src.ID
}

func TestAFileOfAFolderSourceIsReadFromWhereItIsAndOnlyFromThere(t *testing.T) {
	database := openTestDB(t)
	svc := newTestService(t, database, newTestArtifactStore(t))
	ctx := context.Background()
	p := testPrincipal("user-1")
	inside, outside := t.TempDir(), t.TempDir()
	require.NoError(t, os.WriteFile(filepath.Join(inside, "a.md"), []byte("# Hello"), 0o644))
	require.NoError(t, os.WriteFile(filepath.Join(outside, "b.md"), []byte("secret"), 0o644))
	localSourceWithFiles(t, svc, p, inside, outside)

	got, err := svc.DownloadFile(ctx, p, knowledge.LocalFileID(filepath.Join(inside, "a.md")))
	require.NoError(t, err)
	require.Equal(t, "# Hello", string(got.Data))
	require.Equal(t, "a.md", got.Filename)
	require.Contains(t, got.ContentType, "markdown")

	info, err := svc.LocalFileInfo(ctx, p, knowledge.LocalFileID(filepath.Join(inside, "a.md")))
	require.NoError(t, err)
	require.EqualValues(t, 7, info.Size)

	_, err = svc.DownloadFile(ctx, p, knowledge.LocalFileID(filepath.Join(outside, "b.md")))
	require.Equal(t, bkerr.ErrorKindNotFound, bkerr.KindOf(err), "a path outside the folder of its source is never read")

	_, err = svc.DownloadFile(ctx, p, knowledge.LocalFileID(filepath.Join(inside, "gone.pdf")))
	require.Equal(t, bkerr.ErrorKindNotFound, bkerr.KindOf(err), "a file that was moved is reported, not invented")

	_, err = svc.DownloadFile(ctx, testPrincipal("user-2"), knowledge.LocalFileID(filepath.Join(inside, "a.md")))
	require.Equal(t, bkerr.ErrorKindNotFound, bkerr.KindOf(err), "another person cannot read it")
}

func TestTheFilesOfAFolderSourceAreIndexedFromWhereTheyAreCheapestFirst(t *testing.T) {
	database := openTestDB(t)
	svc := newTestService(t, database, newTestArtifactStore(t))
	ctx := context.Background()
	p := testPrincipal("user-1")
	dir := t.TempDir()
	require.NoError(t, os.WriteFile(filepath.Join(dir, "big.md"), []byte("# Big\n\n"+strings.Repeat("Retention of records is required for seven years. ", 200)), 0o644))
	require.NoError(t, os.WriteFile(filepath.Join(dir, "small.txt"), []byte(strings.Repeat("The audit committee meets quarterly. ", 60)), 0o644))
	require.NoError(t, os.WriteFile(filepath.Join(dir, "broken.pdf"), []byte("not a pdf at all"), 0o644))

	src, err := svc.CreateFolderSource(ctx, p, "", dir, "")
	require.NoError(t, err)
	made, err := svc.CreateLocalCollections(ctx, p, src.ID, []knowledge.LocalCollection{{Name: "Docs", Files: []knowledge.LocalFile{
		{Path: filepath.Join(dir, "big.md"), Name: "big.md"},
		{Path: filepath.Join(dir, "small.txt"), Name: "small.txt"},
		{Path: filepath.Join(dir, "broken.pdf"), Name: "broken.pdf"},
		{Path: filepath.Join(dir, "moved.txt"), Name: "moved.txt"},
	}}})
	require.NoError(t, err)
	corpusID := made[0].Corpus.ID

	queued, err := svc.EnqueueAllLocal(ctx, p, corpusID)
	require.NoError(t, err)
	require.Equal(t, 4, queued)
	again, err := svc.EnqueueAllLocal(ctx, p, corpusID)
	require.NoError(t, err)
	require.Zero(t, again, "asking twice queues nothing twice")

	// Plain text goes first, the small file before the big one, and the PDF last: the order the jobs are taken in.
	var order []string
	seen := map[string]bool{}
	for {
		processed, err := svc.ProcessNextIngestionJob(ctx)
		require.NoError(t, err)
		if !processed {
			break
		}
		jobs, err := svc.ListIngestionJobs(ctx, p, corpusID)
		require.NoError(t, err)
		for _, j := range jobs {
			if j.AttemptCount > 0 && !seen[j.Filename] {
				seen[j.Filename] = true
				order = append(order, j.Filename)
			}
		}
	}
	require.Equal(t, []string{"moved.txt", "small.txt", "big.md", "broken.pdf"}, order, "a missing file fails at once, then text smallest first, the PDF last")

	files, err := svc.ListFiles(ctx, p, corpusID)
	require.NoError(t, err)
	status := map[string]string{}
	for _, f := range files {
		status[f.Filename] = f.Status
	}
	require.Equal(t, "ingested", status["small.txt"])
	require.Equal(t, "ingested", status["big.md"])
	require.Equal(t, "failed", status["moved.txt"], "a file that was moved fails with its reason, the others go on")
	require.Equal(t, "failed", status["broken.pdf"])

	res, err := svc.Search(ctx, p, knowledge.SearchParams{CorpusID: corpusID, Query: "audit committee", TopK: 3})
	require.NoError(t, err)
	require.NotEmpty(t, res.Results, "what was indexed can be searched")
}

func TestThePassagesOfAnIndexedFileCanBeRead(t *testing.T) {
	database := openTestDB(t)
	svc := newTestService(t, database, newTestArtifactStore(t))
	ctx := context.Background()
	p := testPrincipal("user-1")
	dir := t.TempDir()
	require.NoError(t, os.WriteFile(filepath.Join(dir, "policy.md"), []byte("# Policy\n\n"+strings.Repeat("Retention of records is required for seven years. ", 120)), 0o644))
	require.NoError(t, os.WriteFile(filepath.Join(dir, "other.txt"), []byte("Unrelated text kept in the same collection."), 0o644))

	src, err := svc.CreateFolderSource(ctx, p, "", dir, "")
	require.NoError(t, err)
	made, err := svc.CreateLocalCollections(ctx, p, src.ID, []knowledge.LocalCollection{{Name: "Docs", Files: []knowledge.LocalFile{
		{Path: filepath.Join(dir, "policy.md"), Name: "policy.md"},
		{Path: filepath.Join(dir, "other.txt"), Name: "other.txt"},
	}}})
	require.NoError(t, err)
	corpusID := made[0].Corpus.ID
	_, err = svc.EnqueueAllLocal(ctx, p, corpusID)
	require.NoError(t, err)
	for {
		processed, err := svc.ProcessNextIngestionJob(ctx)
		require.NoError(t, err)
		if !processed {
			break
		}
	}

	policy := knowledge.LocalFileID(filepath.Join(dir, "policy.md"))
	chunks, err := svc.FileChunks(ctx, p, corpusID, policy)
	require.NoError(t, err)
	require.Greater(t, len(chunks), 1, "a long document is cut into several passages")
	var all strings.Builder
	for i, chunk := range chunks {
		require.Equal(t, i, chunk.Position, "in the order of the document")
		all.WriteString(chunk.Text)
	}
	require.Contains(t, all.String(), "Retention of records")
	require.NotContains(t, all.String(), "Unrelated", "the passages of this file only, not of the others in the collection")

	_, err = svc.FileChunks(ctx, testPrincipal("user-2"), corpusID, policy)
	require.Error(t, err, "another person cannot read them")
}
