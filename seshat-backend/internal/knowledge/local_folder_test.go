package knowledge_test

import (
	"context"
	"testing"

	"github.com/stretchr/testify/require"

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

	made, err := svc.CreateLocalCollections(ctx, p, localCollections())
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

	_, err = svc.CreateLocalCollections(ctx, p, localCollections())
	require.Equal(t, bkerr.ErrorKindConflict, bkerr.KindOf(err))

	corpora, err := svc.ListCorpora(ctx, p)
	require.NoError(t, err)
	require.Len(t, corpora, 1, "a refused request makes nothing")

	// Another person's collection of the same name is not a clash.
	_, err = svc.CreateLocalCollections(ctx, testPrincipal("user-2"), localCollections())
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
		_, err := svc.CreateLocalCollections(ctx, p, in)
		require.Equal(t, bkerr.ErrorKindInvalidInput, bkerr.KindOf(err), name)
	}
	corpora, _ := svc.ListCorpora(ctx, p)
	require.Empty(t, corpora)
}
