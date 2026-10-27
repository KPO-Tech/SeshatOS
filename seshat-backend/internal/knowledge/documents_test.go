package knowledge_test

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/knowledge"
)

func TestDocumentsAreListedAPageAtATimeWithTheirCounts(t *testing.T) {
	database := openTestDB(t)
	svc := newTestService(t, database, newTestArtifactStore(t))
	ctx := context.Background()
	p := testPrincipal("user-1")
	dir := t.TempDir()

	src, err := svc.CreateFolderSource(ctx, p, "", dir, "")
	require.NoError(t, err)
	write := func(name, text string) knowledge.LocalFile {
		path := filepath.Join(dir, name)
		require.NoError(t, os.WriteFile(path, []byte(text), 0o644))
		return knowledge.LocalFile{Path: path, Name: name}
	}
	var notes, tables []knowledge.LocalFile
	for i := 0; i < 5; i++ {
		notes = append(notes, write(fmt.Sprintf("note-%d.md", i), fmt.Sprintf("# Note %d\n\nThe audit committee meets quarterly.", i)))
	}
	tables = append(tables, write("figures.csv", "year,total\n2025,10"), write("minutes.txt", "The board approved the budget."))
	made, err := svc.CreateLocalCollections(ctx, p, src.ID, []knowledge.LocalCollection{{Name: "Notes", Files: notes}, {Name: "Tables", Files: tables}})
	require.NoError(t, err)
	for _, collection := range made {
		_, err := svc.EnqueueAllLocal(ctx, p, collection.Corpus.ID)
		require.NoError(t, err)
	}
	for {
		processed, err := svc.ProcessNextIngestionJob(ctx)
		require.NoError(t, err)
		if !processed {
			break
		}
	}

	all, err := svc.ListDocuments(ctx, p, knowledge.DocumentsQuery{Limit: 3})
	require.NoError(t, err)
	require.Equal(t, 7, all.Total, "the total counts every indexed document, not the page")
	require.Len(t, all.Documents, 3, "a page holds at most the limit")
	require.Equal(t, 6, all.Kinds["md"], "the text kind holds the five notes and the minutes")
	require.Equal(t, 1, all.Kinds["xlsx"])

	second, err := svc.ListDocuments(ctx, p, knowledge.DocumentsQuery{Limit: 3, Offset: 3, Sort: "name"})
	require.NoError(t, err)
	third, err := svc.ListDocuments(ctx, p, knowledge.DocumentsQuery{Limit: 3, Offset: 6, Sort: "name"})
	require.NoError(t, err)
	require.Len(t, second.Documents, 3)
	require.Len(t, third.Documents, 1, "the last page is what is left")
	seen := map[string]bool{}
	for _, doc := range append(second.Documents, third.Documents...) {
		require.False(t, seen[doc.FileID], "a document is on one page only")
		seen[doc.FileID] = true
	}

	onlyTables, err := svc.ListDocuments(ctx, p, knowledge.DocumentsQuery{CorpusIDs: []string{made[1].Corpus.ID}})
	require.NoError(t, err)
	require.Equal(t, 2, onlyTables.Total)
	require.Equal(t, 1, onlyTables.Kinds["md"], "the kinds are counted under the collection chosen: one text, not the five notes")
	require.Equal(t, 1, onlyTables.Kinds["xlsx"])
	require.Len(t, onlyTables.Collections, 2, "the collections are still all listed, to choose another")

	csv, err := svc.ListDocuments(ctx, p, knowledge.DocumentsQuery{Kind: "xlsx"})
	require.NoError(t, err)
	require.Equal(t, 1, csv.Total)
	require.Equal(t, "figures.csv", csv.Documents[0].Filename)
	require.Len(t, csv.Collections, 1, "the collections are counted under the kind chosen: only one holds a table")

	other, err := svc.ListDocuments(ctx, testPrincipal("user-2"), knowledge.DocumentsQuery{})
	require.NoError(t, err)
	require.Zero(t, other.Total, "another person sees none of them")
}
