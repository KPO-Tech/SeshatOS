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

const nativeDocModelsBaseURL = "https://huggingface.co/InfiniFlow/deepdoc/resolve/main"

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
