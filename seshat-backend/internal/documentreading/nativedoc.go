package documentreading

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/KPO-Tech/seshat/pkg/documentreader"
	"github.com/KPO-Tech/seshat/pkg/nativedoc"
	"github.com/KPO-Tech/seshat/pkg/pdfsmart"
	"github.com/KPO-Tech/seshat/pkg/runtimepath"
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

func DownloadNativeDocModels(ctx context.Context, onProgress func(NativeDocDownloadProgress)) error {
	modelDir := NativeDocModelsDir()
	if err := os.MkdirAll(modelDir, 0o755); err != nil {
		return fmt.Errorf("create nativedoc model dir: %w", err)
	}
	baseURL := NativeDocModelsBaseURL()
	client := &http.Client{}
	for i, name := range NativeDocModelFiles {
		progress := NativeDocDownloadProgress{File: name, FileIndex: i + 1, FileCount: len(NativeDocModelFiles)}
		dest := filepath.Join(modelDir, name)
		if usableModelFile(dest) {
			progress.AlreadyAvailable = true
			if onProgress != nil {
				onProgress(progress)
			}
			continue
		}
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, baseURL+"/"+name, nil)
		if err != nil {
			return fmt.Errorf("build download request for %s: %w", name, err)
		}
		resp, err := client.Do(req)
		if err != nil {
			return fmt.Errorf("download %s: %w", name, err)
		}
		if resp.StatusCode < 200 || resp.StatusCode >= 300 {
			resp.Body.Close()
			return fmt.Errorf("download %s: HTTP %d", name, resp.StatusCode)
		}
		progress.BytesTotal = resp.ContentLength
		part := dest + ".part"
		file, err := os.Create(part)
		if err != nil {
			resp.Body.Close()
			return fmt.Errorf("create partial model file %s: %w", part, err)
		}
		buf := make([]byte, 256*1024)
		for {
			n, readErr := resp.Body.Read(buf)
			if n > 0 {
				if _, err := file.Write(buf[:n]); err != nil {
					file.Close()
					resp.Body.Close()
					_ = os.Remove(part)
					return fmt.Errorf("write model file %s: %w", name, err)
				}
				progress.BytesDownloaded += int64(n)
				if onProgress != nil {
					onProgress(progress)
				}
			}
			if readErr == io.EOF {
				break
			}
			if readErr != nil {
				file.Close()
				resp.Body.Close()
				_ = os.Remove(part)
				return fmt.Errorf("read model download %s: %w", name, readErr)
			}
		}
		if err := file.Close(); err != nil {
			resp.Body.Close()
			_ = os.Remove(part)
			return fmt.Errorf("close model file %s: %w", name, err)
		}
		resp.Body.Close()
		if !usableModelFile(part) {
			_ = os.Remove(part)
			return fmt.Errorf("download %s looks truncated or empty", name)
		}
		if err := os.Rename(part, dest); err != nil {
			_ = os.Remove(part)
			return fmt.Errorf("install model file %s: %w", name, err)
		}
	}
	return nil
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
