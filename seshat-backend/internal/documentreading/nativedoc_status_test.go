package documentreading

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestEveryModelFileIsReportedWithItsOwnState(t *testing.T) {
	dir := t.TempDir()
	t.Setenv(EnvNativeDocModelsDir, dir)
	big := make([]byte, 4096)
	for _, name := range []string{"det.ort", "rec.onnx", "ocr.res", "tsr.ort"} {
		require.NoError(t, os.WriteFile(filepath.Join(dir, name), big, 0o644))
	}

	got := map[string]NativeDocModelStatus{}
	var order []string
	for _, status := range NativeDocModelStatuses() {
		got[status.File] = status
		order = append(order, status.File)
	}

	require.Equal(t, NativeDocModelFiles, order)
	require.True(t, got["rec.ort"].Installed, "the plain ONNX recognizer counts for rec.ort")
	require.True(t, got["tsr.ort"].Installed)
	require.False(t, got["layout.ort"].Installed)
	require.False(t, got["layout.ort"].Required, "the layout is optional")
	require.True(t, got["det.ort"].Required)
	require.EqualValues(t, 4096, got["det.ort"].SizeBytes)
}
