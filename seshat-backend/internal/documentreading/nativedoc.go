package documentreading

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/KPO-Tech/seshat-runtime/pkg/documentreader"
	"github.com/KPO-Tech/seshat-runtime/pkg/nativedoc"
	"github.com/KPO-Tech/seshat-runtime/pkg/pdfsmart"
	"github.com/KPO-Tech/seshat-runtime/pkg/runtimepath"
)

const EnvNativeDocModelsDir = "SESHAT_NATIVEDOC_MODELS_DIR"
const EnvNativeDocModelsBaseURL = "SESHAT_NATIVEDOC_MODELS_BASE_URL"
const EnvNativeDocAutoInit = "SESHAT_NATIVEDOC_AUTO_INIT"

// The models come from a fixed revision of the repository, not from its main branch, and each file is checked against the SHA-256 below
// once downloaded: a file that changed upstream is refused instead of being loaded by the OCR runtime. Both apply to the default
// address only; a base URL set by the environment is the person's own mirror or model, and is not checked.
const nativeDocModelsRevision = "9c7aa2c730d7a242d7f04cf6109a6a239aefc717"
const nativeDocModelsBaseURL = "https://huggingface.co/InfiniFlow/deepdoc/resolve/" + nativeDocModelsRevision

// nativeDocSharedModelSHA256 are the checksums of the models every pack shares, at nativeDocModelsRevision.
var nativeDocSharedModelSHA256 = map[string]string{
	"det.ort":    "fd62614cbae0b073aa203b2393081e641826ecfc85414669458506d91e23c095",
	"layout.ort": "55e3e5743ba2f2a03879578ac818089afa32bdedda51159d340bc2eec968b030",
	"tsr.ort":    "24930ee6d025dc8e5c17587713d74a7d665d3ca8a464df015afb6e939af0d2f7",
}

var (
	ErrNativeDocNotCompiled   = errors.New("nativedoc is not compiled into this backend")
	ErrNativeDocModelsMissing = errors.New("nativedoc models are missing")
)

var nativeDocRequiredModelFiles = []string{"det.ort", "rec.ort", "ocr.res"}
var NativeDocModelFiles = []string{"det.ort", "rec.ort", "layout.ort", "tsr.ort", "ocr.res"}

type NativeDocDownloadProgress struct {
	File             string
	FileIndex        int
	FileCount        int
	BytesDownloaded  int64
	BytesTotal       int64
	AlreadyAvailable bool
}

func NativeDocModelsDir() string {
	if dir := strings.TrimSpace(os.Getenv(EnvNativeDocModelsDir)); dir != "" {
		return filepath.Clean(dir)
	}
	return runtimepath.DeepDocModelsDir("")
}

func NativeDocModelsBaseURL() string {
	if baseURL := strings.TrimRight(strings.TrimSpace(os.Getenv(EnvNativeDocModelsBaseURL)), "/"); baseURL != "" {
		return baseURL
	}
	return nativeDocModelsBaseURL
}

// nativeDocModelsPinned says whether the models are downloaded from the default address, the only one whose files have a known checksum.
func nativeDocModelsPinned() bool {
	return strings.TrimSpace(os.Getenv(EnvNativeDocModelsBaseURL)) == ""
}

func NativeDocModelsAvailable() bool {
	dir := NativeDocModelsDir()
	for _, name := range nativeDocRequiredModelFiles {
		if name == "rec.ort" {
			// The Latin recognizer is a plain ONNX file: the runtime reads rec.ort first and rec.onnx when there is none.
			if !usableModelFile(filepath.Join(dir, "rec.ort")) && !usableModelFile(filepath.Join(dir, "rec.onnx")) {
				return false
			}
			continue
		}
		if !usableModelFile(filepath.Join(dir, name)) {
			return false
		}
	}
	return true
}

// NativeDocModelStatus says whether one of the files the native OCR reads is on disk, so Settings can show each model on its own.
type NativeDocModelStatus struct {
	File      string `json:"file"`
	Installed bool   `json:"installed"`
	SizeBytes int64  `json:"size_bytes"`
	// Required is false for the models the reader can do without (the layout and the table structure): a page is then read as lines of text.
	Required bool `json:"required"`
}

// NativeDocModelStatuses lists every model file with its state, in the order they work on a scanned page.
func NativeDocModelStatuses() []NativeDocModelStatus {
	dir := NativeDocModelsDir()
	statuses := make([]NativeDocModelStatus, 0, len(NativeDocModelFiles))
	for _, name := range NativeDocModelFiles {
		required := false
		for _, need := range nativeDocRequiredModelFiles {
			required = required || need == name
		}
		candidates := []string{name}
		if name == "rec.ort" {
			// The Latin recognizer is a plain ONNX file, read when there is no rec.ort.
			candidates = append(candidates, "rec.onnx")
		}
		status := NativeDocModelStatus{File: name, Required: required}
		for _, candidate := range candidates {
			path := filepath.Join(dir, candidate)
			if usableModelFile(path) {
				if info, err := os.Stat(path); err == nil {
					status.Installed, status.SizeBytes = true, info.Size()
				}
				break
			}
		}
		statuses = append(statuses, status)
	}
	return statuses
}

func NativeDocReady() bool {
	return nativeDocCompiled() && nativedoc.Initialized() && NativeDocModelsAvailable()
}

func NativeDocAutoInitEnabled() bool {
	raw := strings.TrimSpace(strings.ToLower(os.Getenv(EnvNativeDocAutoInit)))
	return raw == "1" || raw == "true" || raw == "yes" || raw == "on"
}

func InitNativeDocRuntime() (Capabilities, error) {
	if !nativeDocCompiled() {
		return DetectCapabilities(), ErrNativeDocNotCompiled
	}
	if !NativeDocModelsAvailable() {
		return DetectCapabilities(), fmt.Errorf("%w in %s", ErrNativeDocModelsMissing, NativeDocModelsDir())
	}
	if err := nativedoc.InitORT(); err != nil {
		return DetectCapabilities(), err
	}
	return DetectCapabilities(), nil
}

// DownloadNativeDocModels downloads the models of the active recognizer pack (Chinese and English until another is chosen).
func DownloadNativeDocModels(ctx context.Context, onProgress func(NativeDocDownloadProgress)) error {
	return DownloadNativeDocPack(ctx, NativeDocActivePack(), onProgress)
}

func NewNativeDocConverter() documentreader.Converter {
	// The models can arrive after the backend started (the first-run setup, or Settings): bring the OCR up when a document needs it
	// rather than at the next start. InitORT runs once, so a machine where it fails pays for it once.
	if nativeDocCompiled() && !nativedoc.Initialized() && NativeDocModelsAvailable() {
		_ = nativedoc.InitORT()
	}
	if !NativeDocReady() {
		return nil
	}
	return nativedoc.New(NativeDocModelsDir())
}

type NativeDocPageRenderer struct{}

func NewNativeDocPageRenderer() pdfsmart.PageRenderer {
	return NativeDocPageRenderer{}
}

func (NativeDocPageRenderer) RenderPage(ctx context.Context, data []byte, pageNum int) ([]byte, error) {
	if !nativeDocCompiled() {
		return nil, ErrNativeDocNotCompiled
	}
	if !NativeDocModelsAvailable() {
		return nil, fmt.Errorf("%w in %s", ErrNativeDocModelsMissing, NativeDocModelsDir())
	}
	if !nativedoc.Initialized() {
		if err := nativedoc.InitORT(); err != nil {
			return nil, err
		}
	}
	return nativedoc.New(NativeDocModelsDir()).RenderPage(ctx, data, pageNum)
}

func nativeDocAvailable(ctx context.Context, converter documentreader.Converter) bool {
	return converter != nil && converter.IsAvailable(ctx)
}

func usableModelFile(path string) bool {
	info, err := os.Stat(path)
	return err == nil && !info.IsDir() && info.Size() > 1024
}
