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

	src, err := svc.CreateFolderSource(ctx, p, "", "/data/corpus")
	require.NoError(t, err)
	require.Equal(t, "corpus", src.Name, "a source without a name takes its folder's name")

	_, err = svc.CreateFolderSource(ctx, p, "again", "/data/corpus")
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
	src, err := svc.CreateFolderSource(ctx, testPrincipal("user-1"), "", "/data/corpus")
	require.NoError(t, err)

	_, err = svc.GetSource(ctx, testPrincipal("user-2"), src.ID)
	require.Equal(t, bkerr.ErrorKindNotFound, bkerr.KindOf(err))
	_, err = svc.CreateLocalCollections(ctx, testPrincipal("user-2"), src.ID, localCollections())
	require.Equal(t, bkerr.ErrorKindNotFound, bkerr.KindOf(err), "collections cannot be made under someone else's source")
	require.Equal(t, bkerr.ErrorKindNotFound, bkerr.KindOf(svc.DeleteSource(ctx, testPrincipal("user-2"), src.ID)))
}
