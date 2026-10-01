package documentreading

import (
	"bytes"
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/KPO-Tech/seshat/pkg/documentreader"
	"github.com/KPO-Tech/seshat/pkg/storage"
)

type fakeConverter struct {
	markdown string
}

func (f fakeConverter) IsAvailable(context.Context) bool { return true }

func (f fakeConverter) ConvertFile(context.Context, string) (*documentreader.ConversionResult, error) {
	return &documentreader.ConversionResult{Markdown: f.markdown}, nil
}

func (f fakeConverter) ConvertBytes(context.Context, []byte, string) (*documentreader.ConversionResult, error) {
	return &documentreader.ConversionResult{Markdown: f.markdown}, nil
}

func (f fakeConverter) ConvertURL(context.Context, string) (*documentreader.ConversionResult, error) {
	return &documentreader.ConversionResult{Markdown: f.markdown}, nil
}

type fakeHybridConverter struct {
	fakeConverter
	chunks []documentreader.Chunk
}

func (f fakeHybridConverter) ChunkHybridBytes(context.Context, []byte, string, documentreader.ChunkOptions) ([]documentreader.Chunk, error) {
	return f.chunks, nil
}

type fakeRecordingConverter struct {
	name      string
	markdown  string
	available bool
	calls     *strings.Builder
}

func (f fakeRecordingConverter) IsAvailable(context.Context) bool { return f.available }

func (f fakeRecordingConverter) record() {
	if f.calls != nil {
		f.calls.WriteString(f.name)
		f.calls.WriteString(";")
	}
}

func (f fakeRecordingConverter) ConvertFile(context.Context, string) (*documentreader.ConversionResult, error) {
	f.record()
	return &documentreader.ConversionResult{Markdown: f.markdown}, nil
}

func (f fakeRecordingConverter) ConvertBytes(context.Context, []byte, string) (*documentreader.ConversionResult, error) {
	f.record()
	return &documentreader.ConversionResult{Markdown: f.markdown}, nil
}

func (f fakeRecordingConverter) ConvertURL(context.Context, string) (*documentreader.ConversionResult, error) {
	f.record()
	return &documentreader.ConversionResult{Markdown: f.markdown}, nil
}

// Fixtures here are copied from the seshat SDK's own officetext/pdftext
// testdata (real office/PDF parser fixtures, already validated there) - kept
// self-contained rather than referenced across repos so these tests still
// work in CI, which builds against the published SDK module, not a sibling
// checkout.

func readTestdata(t *testing.T, name string) []byte {
	t.Helper()
	data, err := os.ReadFile(filepath.Join("testdata", name))
	if err != nil {
		t.Fatalf("read testdata/%s: %v", name, err)
	}
	return data
}

func copyToDir(t *testing.T, name, dir string) string {
	t.Helper()
	dest := filepath.Join(dir, name)
	if err := os.WriteFile(dest, readTestdata(t, name), 0o600); err != nil {
		t.Fatalf("write %s: %v", dest, err)
	}
	return dest
}

func TestConvert_DOCXNativeWithNilExternalConverter(t *testing.T) {
	t.Parallel()
	dir := t.TempDir()
	path := copyToDir(t, "sample.docx", dir)

	result, ok, err := Convert(context.Background(), path, nil)
	if err != nil {
		t.Fatalf("Convert: %v", err)
	}
	if !ok {
		t.Fatal("expected ok=true for a native-supported DOCX with no external converter")
	}
	if result.Source != SourceNative {
		t.Fatalf("expected SourceNative, got %q", result.Source)
	}
	if !strings.Contains(result.Markdown, "Sample Report") {
		t.Fatalf("expected extracted DOCX content, got:\n%s", result.Markdown)
	}
}

func TestConvert_XLSXNativeWithNilExternalConverter(t *testing.T) {
	t.Parallel()
	dir := t.TempDir()
	path := copyToDir(t, "sample.xlsx", dir)

	result, ok, err := Convert(context.Background(), path, nil)
	if err != nil {
		t.Fatalf("Convert: %v", err)
	}
	if !ok || result.Source != SourceNative {
		t.Fatalf("expected native XLSX extraction, got ok=%v source=%q", ok, result.Source)
	}
	if !strings.Contains(result.Markdown, "Carol") {
		t.Fatalf("expected extracted XLSX content, got:\n%s", result.Markdown)
	}
}

func TestConvert_PDFTextLayerNativeWithNilExternalConverter(t *testing.T) {
	t.Parallel()
	dir := t.TempDir()
	path := copyToDir(t, "text_layer.pdf", dir)

	result, ok, err := Convert(context.Background(), path, nil)
	if err != nil {
		t.Fatalf("Convert: %v", err)
	}
	if !ok || result.Source != SourceNative {
		t.Fatalf("expected native PDF extraction, got ok=%v source=%q", ok, result.Source)
	}
	if !strings.Contains(result.Markdown, "Sample Report") {
		t.Fatalf("expected extracted PDF content, got:\n%s", result.Markdown)
	}
}

func TestConvert_ScannedPDFWithNilExternalConverterYieldsNoResult(t *testing.T) {
	t.Parallel()
	dir := t.TempDir()
	path := copyToDir(t, "scanned.pdf", dir)

	result, ok, err := Convert(context.Background(), path, nil)
	if err != nil {
		t.Fatalf("Convert: %v", err)
	}
	// No text layer and no external converter: nothing to extract, but this
	// is not an error condition. Callers decide whether to fail ingestion or
	// keep the attachment without a markdown sidecar.
	if ok {
		t.Fatalf("expected ok=false for a scanned PDF with no external converter, got markdown:\n%s", result.Markdown)
	}
}

func TestConvert_ScannedPDFUsesPDFSmartExternalFallback(t *testing.T) {
	t.Parallel()
	dir := t.TempDir()
	path := copyToDir(t, "scanned.pdf", dir)

	result, ok, err := Convert(context.Background(), path, fakeConverter{markdown: "OCR page text"})
	if err != nil {
		t.Fatalf("Convert: %v", err)
	}
	if !ok {
		t.Fatal("expected ok=true for scanned PDF with external reader")
	}
	if result.Source != SourceExternal {
		t.Fatalf("expected external source for fully OCR-routed scanned PDF, got %q", result.Source)
	}
	if !strings.Contains(result.Markdown, "OCR page text") {
		t.Fatalf("expected external page text, got:\n%s", result.Markdown)
	}
}

func TestConvert_UnsupportedExtensionWithNilExternalConverterYieldsNoResult(t *testing.T) {
	t.Parallel()
	dir := t.TempDir()
	path := filepath.Join(dir, "notes.wav")
	if err := os.WriteFile(path, []byte("not really audio"), 0o600); err != nil {
		t.Fatalf("write: %v", err)
	}

	_, ok, err := Convert(context.Background(), path, nil)
	if err != nil {
		t.Fatalf("Convert: %v", err)
	}
	if ok {
		t.Fatal("expected ok=false for an external-only format with no external converter")
	}
}

func TestConvertBytes_GarbledExternalOutputIsRejected(t *testing.T) {
	t.Parallel()

	client := fakeConverter{markdown: "Report (cid:12)(cid:47) Summary (cid:8)(cid:91)"}
	result, ok, err := ConvertBytes(context.Background(), []byte("not really audio, only the extension matters"), "voicenote.wav", client)
	if err != nil {
		t.Fatalf("ConvertBytes: %v", err)
	}
	if ok {
		t.Fatalf("expected garbled external output to be rejected, got markdown:\n%s", result.Markdown)
	}
}

func TestConvertBytes_DOCXNative(t *testing.T) {
	t.Parallel()
	result, ok, err := ConvertBytes(context.Background(), readTestdata(t, "sample.docx"), "sample.docx", nil)
	if err != nil {
		t.Fatalf("ConvertBytes: %v", err)
	}
	if !ok || result.Source != SourceNative {
		t.Fatalf("expected native DOCX extraction, got ok=%v source=%q", ok, result.Source)
	}
	if !strings.Contains(result.Markdown, "Sample Report") {
		t.Fatalf("expected extracted content, got:\n%s", result.Markdown)
	}
}

func TestPolicyConverterLocalAdvancedBeforeExternalByDefault(t *testing.T) {
	t.Parallel()

	var calls strings.Builder
	converter := NewPolicyConverterWithLocalAdvanced(
		fakeRecordingConverter{name: "local", markdown: "local OCR", available: true, calls: &calls},
		fakeRecordingConverter{name: "external", markdown: "external OCR", available: true, calls: &calls},
		false,
	)

	result, err := converter.ConvertBytes(context.Background(), []byte{0x89, 0x50, 0x4e, 0x47}, "scan.png")
	if err != nil {
		t.Fatalf("ConvertBytes: %v", err)
	}
	if result.Markdown != "local OCR" {
		t.Fatalf("expected local advanced result, got %q", result.Markdown)
	}
	if got := calls.String(); got != "local;" {
		t.Fatalf("expected only local advanced to be called, got %q", got)
	}
}

func TestPolicyConverterPreferExternalFallsBackToLocalAdvanced(t *testing.T) {
	t.Parallel()

	var calls strings.Builder
	converter := NewPolicyConverterWithLocalAdvanced(
		fakeRecordingConverter{name: "local", markdown: "local OCR", available: true, calls: &calls},
		fakeRecordingConverter{name: "external", markdown: "", available: true, calls: &calls},
		true,
	)

	result, err := converter.ConvertBytes(context.Background(), []byte{0x89, 0x50, 0x4e, 0x47}, "scan.png")
	if err != nil {
		t.Fatalf("ConvertBytes: %v", err)
	}
	if result.Markdown != "local OCR" {
		t.Fatalf("expected local fallback result, got %q", result.Markdown)
	}
	if got := calls.String(); got != "external;local;" {
		t.Fatalf("expected external then local advanced, got %q", got)
	}
}

func TestNativeDocModelsAvailableUsesConfiguredDir(t *testing.T) {
	dir := t.TempDir()
	t.Setenv(EnvNativeDocModelsDir, dir)
	if NativeDocModelsAvailable() {
		t.Fatal("expected models to be unavailable before required files exist")
	}
	for _, name := range nativeDocRequiredModelFiles {
		if err := os.WriteFile(filepath.Join(dir, name), bytes.Repeat([]byte("m"), 2048), 0o600); err != nil {
			t.Fatalf("write %s: %v", name, err)
		}
	}
	if !NativeDocModelsAvailable() {
		t.Fatal("expected models to be available when required files exist")
	}
}

func TestProcessor_ReadBytesPlainText(t *testing.T) {
	t.Parallel()

	processor := NewProcessor(nil)
	result, ok, err := processor.ReadBytes(context.Background(), ReadInput{
		SourceFileID: "file_123",
		Filename:     "notes.txt",
		ContentType:  "text/plain; charset=utf-8",
		Data:         []byte("local notes\nwith useful text"),
	})
	if err != nil {
		t.Fatalf("ReadBytes: %v", err)
	}
	if !ok {
		t.Fatal("expected ok=true for plain text")
	}
	if result.Status != StatusReady || result.Engine != EnginePlainText {
		t.Fatalf("expected plain-text ready result, got status=%q engine=%q", result.Status, result.Engine)
	}
	if result.SourceFileID != "file_123" {
		t.Fatalf("expected SourceFileID to be preserved, got %q", result.SourceFileID)
	}
	if result.Text != "local notes\nwith useful text" || result.Markdown != result.Text {
		t.Fatalf("unexpected text result: %#v", result)
	}
	if result.SHA256 == "" {
		t.Fatal("expected SHA256 to be computed from bytes")
	}
}

func TestProcessor_ReadBytesRejectsBinaryWithoutExternal(t *testing.T) {
	t.Parallel()

	processor := NewProcessor(nil)
	result, ok, err := processor.ReadBytes(context.Background(), ReadInput{
		Filename:    "scan.png",
		ContentType: "image/png",
		Data:        []byte{0x89, 0x50, 0x4e, 0x47, 0x00, 0xff},
	})
	if err != nil {
		t.Fatalf("ReadBytes: %v", err)
	}
	if ok {
		t.Fatalf("expected ok=false for image without external reader, got %#v", result)
	}
	if result.Status != StatusUnavailable {
		t.Fatalf("expected unavailable result, got %q", result.Status)
	}
}

func TestProcessor_ReadBytesUsesExternalForImage(t *testing.T) {
	t.Parallel()

	processor := NewProcessor(func(context.Context) documentreader.Converter {
		return fakeConverter{markdown: "OCR text from image"}
	})
	result, ok, err := processor.ReadBytes(context.Background(), ReadInput{
		Filename:    "scan.png",
		ContentType: "image/png",
		Data:        []byte{0x89, 0x50, 0x4e, 0x47},
	})
	if err != nil {
		t.Fatalf("ReadBytes: %v", err)
	}
	if !ok {
		t.Fatal("expected ok=true with external reader")
	}
	if result.Engine != EngineExternal {
		t.Fatalf("expected external engine, got %q", result.Engine)
	}
	if result.Markdown != "OCR text from image" {
		t.Fatalf("unexpected markdown: %q", result.Markdown)
	}
}

func TestProcessor_ReadBytesUsesPDFSmartEngineForMixedPDF(t *testing.T) {
	t.Parallel()

	processor := NewProcessor(func(context.Context) documentreader.Converter {
		return fakeConverter{markdown: "OCR page text"}
	})
	result, ok, err := processor.ReadBytes(context.Background(), ReadInput{
		Filename:    "scan.pdf",
		ContentType: "application/pdf",
		Data:        readTestdata(t, "scanned.pdf"),
	})
	if err != nil {
		t.Fatalf("ReadBytes: %v", err)
	}
	if !ok {
		t.Fatal("expected ok=true with external reader")
	}
	if result.Engine != EngineExternal {
		t.Fatalf("expected external engine for fully OCR-routed scanned PDF, got %q", result.Engine)
	}
	if !strings.Contains(result.Markdown, "OCR page text") {
		t.Fatalf("unexpected markdown: %q", result.Markdown)
	}
}

func TestProcessorConverter_ResolvesConverterPerCall(t *testing.T) {
	t.Parallel()

	calls := 0
	converter := NewProcessorConverter(func(context.Context) documentreader.Converter {
		calls++
		return fakeConverter{markdown: "dynamic OCR"}
	})
	result, err := converter.ConvertBytes(context.Background(), []byte{0x89, 0x50, 0x4e, 0x47}, "scan.png")
	if err != nil {
		t.Fatalf("ConvertBytes: %v", err)
	}
	if result.Markdown != "dynamic OCR" {
		t.Fatalf("unexpected markdown: %q", result.Markdown)
	}
	if calls != 1 {
		t.Fatalf("expected resolver to be called once, got %d", calls)
	}
}

func TestReadResultCacheRoundTrip(t *testing.T) {
	t.Parallel()

	provider, err := storage.NewLocalProviderWithConfig(storage.Config{
		Provider:  storage.ProviderLocal,
		LocalPath: t.TempDir(),
	})
	if err != nil {
		t.Fatalf("NewLocalProviderWithConfig: %v", err)
	}
	store := storage.NewArtifactStore(provider)

	want := ReadResult{
		Filename:  "report.pdf",
		SHA256:    strings.Repeat("a", 64),
		Status:    StatusReady,
		Engine:    EngineLocalBasic,
		PageCount: 2,
		Pages: []PageReadResult{{
			Page:     1,
			Source:   "native",
			HasImage: true,
		}},
		Markdown: "# Report",
		Text:     "# Report",
	}
	if err := SaveReadResult(context.Background(), store, "file_123", want); err != nil {
		t.Fatalf("SaveReadResult: %v", err)
	}
	got, ok, err := LoadReadResult(context.Background(), store, "file_123")
	if err != nil {
		t.Fatalf("LoadReadResult: %v", err)
	}
	if !ok {
		t.Fatal("expected cached read result")
	}
	if got.SourceFileID != "file_123" {
		t.Fatalf("expected SourceFileID file_123, got %q", got.SourceFileID)
	}
	if got.Text != want.Text || got.Engine != want.Engine || got.SHA256 != want.SHA256 {
		t.Fatalf("unexpected cached result: %#v", got)
	}
	if got.PageCount != 2 || len(got.Pages) != 1 || got.Pages[0].Source != "native" || !got.Pages[0].HasImage {
		t.Fatalf("unexpected cached page metadata: %#v", got)
	}
}

func TestReadFailureCacheRoundTrip(t *testing.T) {
	t.Parallel()

	provider, err := storage.NewLocalProviderWithConfig(storage.Config{
		Provider:  storage.ProviderLocal,
		LocalPath: t.TempDir(),
	})
	if err != nil {
		t.Fatalf("NewLocalProviderWithConfig: %v", err)
	}
	store := storage.NewArtifactStore(provider)

	if err := SaveReadFailure(context.Background(), store, "file_123", "ocr runtime unavailable"); err != nil {
		t.Fatalf("SaveReadFailure: %v", err)
	}
	got, ok, err := LoadReadFailure(context.Background(), store, "file_123")
	if err != nil {
		t.Fatalf("LoadReadFailure: %v", err)
	}
	if !ok {
		t.Fatal("expected cached read failure")
	}
	if got.SourceFileID != "file_123" || got.Error != "ocr runtime unavailable" || got.UpdatedAt.IsZero() {
		t.Fatalf("unexpected cached read failure: %#v", got)
	}
}

func TestDynamicHybridChunkerUsesPolicyExternalChunker(t *testing.T) {
	t.Parallel()

	chunker := NewDynamicHybridChunker(func(context.Context) documentreader.Converter {
		return NewPolicyConverter(fakeHybridConverter{
			fakeConverter: fakeConverter{markdown: "converted"},
			chunks: []documentreader.Chunk{{
				ChunkIndex: 0,
				Text:       "hybrid chunk",
			}},
		}, false)
	})
	if !chunker.IsAvailable(context.Background()) {
		t.Fatal("expected dynamic hybrid chunker to be available")
	}
	chunks, err := chunker.ChunkHybridBytes(context.Background(), []byte("data"), "report.pdf", documentreader.ChunkOptions{})
	if err != nil {
		t.Fatalf("ChunkHybridBytes: %v", err)
	}
	if len(chunks) != 1 || chunks[0].Text != "hybrid chunk" {
		t.Fatalf("unexpected chunks: %#v", chunks)
	}
}

func TestDynamicHybridChunkerUnavailableWithoutHybridBackend(t *testing.T) {
	t.Parallel()

	chunker := NewDynamicHybridChunker(func(context.Context) documentreader.Converter {
		return NewPolicyConverter(fakeConverter{markdown: "converted"}, false)
	})
	if chunker.IsAvailable(context.Background()) {
		t.Fatal("expected dynamic hybrid chunker to be unavailable")
	}
	if _, err := chunker.ChunkHybridBytes(context.Background(), []byte("data"), "report.pdf", documentreader.ChunkOptions{}); err == nil {
		t.Fatal("expected ChunkHybridBytes to fail without a hybrid backend")
	}
}

func TestExtensionSetsAreDisjointAndConsistent(t *testing.T) {
	t.Parallel()
	for ext := range NativeExtensions {
		if ExternalOnlyExtensions[ext] {
			t.Errorf("%q is in both NativeExtensions and ExternalOnlyExtensions", ext)
		}
		if !AllConvertibleExtensions[ext] {
			t.Errorf("%q from NativeExtensions is missing from AllConvertibleExtensions", ext)
		}
	}
	for ext := range ExternalOnlyExtensions {
		if !AllConvertibleExtensions[ext] {
			t.Errorf("%q from ExternalOnlyExtensions is missing from AllConvertibleExtensions", ext)
		}
	}
	if !AllConvertibleExtensions[".pdf"] {
		t.Error(`".pdf" must be in AllConvertibleExtensions`)
	}
}
