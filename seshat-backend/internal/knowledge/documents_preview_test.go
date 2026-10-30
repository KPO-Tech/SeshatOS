package knowledge_test

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/knowledge"
)

func TestPreviewOfIsTheBeginningOfAPassageOnOneLine(t *testing.T) {
	require.Equal(t, "Termination Either party may end it.", knowledge.PreviewOf("Termination\n\n  Either party   may end it.\n"))
	require.Equal(t, "The audit committee meets quarterly.", knowledge.PreviewOf("12\nThe audit committee meets quarterly.\n7"), "a line that is only a page number is left out")
	require.Equal(t, "", knowledge.PreviewOf("  \n 3 \n"))

	long := strings.Repeat("alpha beta gamma delta ", 30)
	cut := knowledge.PreviewOf(long)
	require.LessOrEqual(t, len([]rune(cut)), 224, "the preview is cut near its limit")
	require.True(t, strings.HasSuffix(cut, "..."), "a cut preview says so")
	require.False(t, strings.HasSuffix(strings.TrimSuffix(cut, "..."), " "), "it is cut at a word, with no space left before the dots")
}

func TestDocumentsCarryTheirPreviewOnlyWhenAskedFor(t *testing.T) {
	database := openTestDB(t)
	svc := newTestService(t, database, newTestArtifactStore(t))
	ctx := context.Background()
	p := testPrincipal("user-1")
	dir := t.TempDir()

	src, err := svc.CreateFolderSource(ctx, p, "", dir, "")
	require.NoError(t, err)
	path := filepath.Join(dir, "minutes.md")
	require.NoError(t, os.WriteFile(path, []byte("# Minutes\n\nThe audit committee meets quarterly to review the accounts."), 0o644))
	made, err := svc.CreateLocalCollections(ctx, p, src.ID, []knowledge.LocalCollection{{Name: "Board", Files: []knowledge.LocalFile{{Path: path, Name: "minutes.md"}}}})
	require.NoError(t, err)
	_, err = svc.EnqueueAllLocal(ctx, p, made[0].Corpus.ID)
	require.NoError(t, err)
	for {
		processed, err := svc.ProcessNextIngestionJob(ctx)
		require.NoError(t, err)
		if !processed {
			break
		}
	}

	plain, err := svc.ListDocuments(ctx, p, knowledge.DocumentsQuery{})
	require.NoError(t, err)
	require.Len(t, plain.Documents, 1)
	require.Empty(t, plain.Documents[0].Preview, "the listing is the database alone unless a preview is asked for")

	withPreview, err := svc.ListDocuments(ctx, p, knowledge.DocumentsQuery{Preview: true})
	require.NoError(t, err)
	require.Len(t, withPreview.Documents, 1)
	require.Contains(t, withPreview.Documents[0].Preview, "The audit committee meets quarterly", "the preview is the beginning of the first passage")
}
