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

	"gopkg.in/yaml.v3"
)

// The native OCR needs one detector and one recognizer. The detector, the layout model and the table model are the same for every
// language and live in the model directory. The recognizer and its character file decide which alphabets can be read, so they come
// in packs: each pack is kept in <model dir>/packs/<id>/ and the active one is copied to the model directory, where the runtime
// looks for rec.ort (or rec.onnx) and ocr.res.

const (
	// EnvNativeDocLatinBaseURL overrides where the Latin recognizer is downloaded from.
	EnvNativeDocLatinBaseURL = "SESHAT_NATIVEDOC_LATIN_BASE_URL"

	nativeDocLatinBaseURL = "https://huggingface.co/PaddlePaddle/latin_PP-OCRv5_mobile_rec_onnx/resolve/main"

	// NativeDocPackDefault is the recognizer the models came with before packs existed: Chinese and English.
	NativeDocPackDefault = "ch-en"
	// NativeDocPackLatin reads the Latin alphabets: French, English, Spanish, German, Italian, Portuguese and others.
	NativeDocPackLatin = "latin"

	nativeDocActivePackFile = "pack.txt"
)

var ErrNativeDocUnknownPack = errors.New("unknown native OCR pack")

// nativeDocSharedModelFiles are the models every pack uses.
var nativeDocSharedModelFiles = []string{"det.ort", "layout.ort", "tsr.ort"}

type nativeDocPackFile struct {
	// Name is the file name in the model directory.
	Name string
	// URL is where it is downloaded from.
	URL func() string
	// CharDictFromYAML says the download is the inference.yml of a PaddleOCR model, whose character list is written to Name.
	CharDictFromYAML bool
}

// NativeDocPack is a recognizer and its character file.
type NativeDocPack struct {
	ID        string
	Label     string
	Languages []string
	SizeMB    int
	files     []nativeDocPackFile
}

func nativeDocPacks() []NativeDocPack {
	return []NativeDocPack{
		{
			ID:        NativeDocPackDefault,
			Label:     "Chinese and English",
			Languages: []string{"zh", "en"},
			SizeMB:    11,
			files: []nativeDocPackFile{
				{Name: "rec.ort", URL: func() string { return NativeDocModelsBaseURL() + "/rec.ort" }},
				{Name: "ocr.res", URL: func() string { return NativeDocModelsBaseURL() + "/ocr.res" }},
			},
		},
		{
			ID:        NativeDocPackLatin,
			Label:     "Latin alphabets (French, English, Spanish, German, Italian, Portuguese...)",
			Languages: []string{"fr", "en", "es", "de", "it", "pt", "nl", "pl", "ro", "sv", "da", "no", "fi", "tr", "cs", "hu"},
			SizeMB:    8,
			files: []nativeDocPackFile{
				{Name: "rec.onnx", URL: func() string { return nativeDocLatinBase() + "/inference.onnx" }},
				{Name: "ocr.res", URL: func() string { return nativeDocLatinBase() + "/inference.yml" }, CharDictFromYAML: true},
			},
		},
	}
}

func nativeDocLatinBase() string {
	if baseURL := strings.TrimRight(strings.TrimSpace(os.Getenv(EnvNativeDocLatinBaseURL)), "/"); baseURL != "" {
		return baseURL
	}
	return nativeDocLatinBaseURL
}

// NativeDocPacks lists the recognizer packs.
func NativeDocPacks() []NativeDocPack { return nativeDocPacks() }

// NativeDocPackByID returns the pack with this id.
func NativeDocPackByID(id string) (NativeDocPack, bool) {
	for _, pack := range nativeDocPacks() {
		if pack.ID == id {
			return pack, true
		}
	}
	return NativeDocPack{}, false
}

func nativeDocPackDir(id string) string {
	return filepath.Join(NativeDocModelsDir(), "packs", id)
}

// NativeDocActivePack is the pack whose recognizer sits in the model directory. A directory with no record is the Chinese and
// English one, which is what was installed before packs existed.
func NativeDocActivePack() string {
	data, err := os.ReadFile(filepath.Join(NativeDocModelsDir(), nativeDocActivePackFile))
	if err != nil {
		return NativeDocPackDefault
	}
	id := strings.TrimSpace(string(data))
	if _, ok := NativeDocPackByID(id); !ok {
		return NativeDocPackDefault
	}
	return id
}

// NativeDocPackInstalled reports whether the files of a pack are on disk, in its own folder or, for the active pack, in the model
// directory.
func NativeDocPackInstalled(id string) bool {
	pack, ok := NativeDocPackByID(id)
	if !ok {
		return false
	}
	all := func(dir string) bool {
		for _, file := range pack.files {
			if !usableModelFile(filepath.Join(dir, file.Name)) {
				return false
			}
		}
		return true
	}
	if all(nativeDocPackDir(id)) {
		return true
	}
	return id == NativeDocActivePack() && all(NativeDocModelsDir())
}

// ActivateNativeDocPack makes a pack the recognizer of the model directory. The pack must be installed.
func ActivateNativeDocPack(id string) error {
	pack, ok := NativeDocPackByID(id)
	if !ok {
		return fmt.Errorf("%w: %s", ErrNativeDocUnknownPack, id)
	}
	modelDir := NativeDocModelsDir()
	if err := os.MkdirAll(modelDir, 0o755); err != nil {
		return fmt.Errorf("create nativedoc model dir: %w", err)
	}
	if id == NativeDocActivePack() && !fileExists(nativeDocPackDir(id)) {
		return writeActivePack(modelDir, id)
	}
	if err := keepActivePack(); err != nil {
		return err
	}
	src := nativeDocPackDir(id)
	for _, file := range pack.files {
		if !usableModelFile(filepath.Join(src, file.Name)) {
			return fmt.Errorf("native OCR pack %s is not installed: %s is missing", id, file.Name)
		}
	}
	// The runtime reads rec.ort first, then rec.onnx: drop the recognizer of the pack being replaced.
	for _, name := range []string{"rec.ort", "rec.onnx", "ocr.res"} {
		if err := os.Remove(filepath.Join(modelDir, name)); err != nil && !errors.Is(err, os.ErrNotExist) {
			return fmt.Errorf("remove %s: %w", name, err)
		}
	}
	for _, file := range pack.files {
		if err := copyFile(filepath.Join(src, file.Name), filepath.Join(modelDir, file.Name)); err != nil {
			return err
		}
	}
	return writeActivePack(modelDir, id)
}

// keepActivePack saves the recognizer in the model directory into the folder of its pack, so that it can be put back later. The
// Chinese and English recognizer of an install made before packs existed is only there.
func keepActivePack() error {
	active := NativeDocActivePack()
	pack, _ := NativeDocPackByID(active)
	dir := nativeDocPackDir(active)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return fmt.Errorf("create pack dir: %w", err)
	}
	for _, file := range pack.files {
		dest := filepath.Join(dir, file.Name)
		src := filepath.Join(NativeDocModelsDir(), file.Name)
		if usableModelFile(dest) || !usableModelFile(src) {
			continue
		}
		if err := copyFile(src, dest); err != nil {
			return err
		}
	}
	return nil
}

func writeActivePack(modelDir, id string) error {
	return os.WriteFile(filepath.Join(modelDir, nativeDocActivePackFile), []byte(id+"\n"), 0o644)
}

// DownloadNativeDocPack downloads the models every pack shares, then the recognizer of the pack, and makes it the active one.
func DownloadNativeDocPack(ctx context.Context, id string, onProgress func(NativeDocDownloadProgress)) error {
	pack, ok := NativeDocPackByID(id)
	if !ok {
		return fmt.Errorf("%w: %s", ErrNativeDocUnknownPack, id)
	}
	modelDir := NativeDocModelsDir()
	packDir := nativeDocPackDir(id)
	if err := os.MkdirAll(packDir, 0o755); err != nil {
		return fmt.Errorf("create nativedoc pack dir: %w", err)
	}
	client := &http.Client{}
	total := len(nativeDocSharedModelFiles) + len(pack.files)
	index := 0
	for _, name := range nativeDocSharedModelFiles {
		index++
		progress := NativeDocDownloadProgress{File: name, FileIndex: index, FileCount: total}
		url := NativeDocModelsBaseURL() + "/" + name
		if err := fetchModelFile(ctx, client, url, filepath.Join(modelDir, name), progress, onProgress, nil); err != nil {
			return err
		}
	}
	for _, file := range pack.files {
		index++
		progress := NativeDocDownloadProgress{File: file.Name, FileIndex: index, FileCount: total}
		var transform func([]byte) ([]byte, error)
		if file.CharDictFromYAML {
			transform = charDictFromYAML
		}
		// The default pack's files already sit in the model directory when it was installed before packs existed.
		dest := filepath.Join(packDir, file.Name)
		if id == NativeDocPackDefault && !usableModelFile(dest) && usableModelFile(filepath.Join(modelDir, file.Name)) && NativeDocActivePack() == id {
			dest = filepath.Join(modelDir, file.Name)
		}
		if err := fetchModelFile(ctx, client, file.URL(), dest, progress, onProgress, transform); err != nil {
			return err
		}
	}
	return ActivateNativeDocPack(id)
}

// fetchModelFile downloads one file to dest unless a usable copy is there. When transform is set the download is passed through it
// before being written.
func fetchModelFile(ctx context.Context, client *http.Client, url, dest string, progress NativeDocDownloadProgress, onProgress func(NativeDocDownloadProgress), transform func([]byte) ([]byte, error)) error {
	name := progress.File
	if usableModelFile(dest) {
		progress.AlreadyAvailable = true
		if onProgress != nil {
			onProgress(progress)
		}
		return nil
	}
	if err := os.MkdirAll(filepath.Dir(dest), 0o755); err != nil {
		return fmt.Errorf("create model dir for %s: %w", name, err)
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return fmt.Errorf("build download request for %s: %w", name, err)
	}
	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("download %s: %w", name, err)
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("download %s: HTTP %d", name, resp.StatusCode)
	}
	progress.BytesTotal = resp.ContentLength
	part := dest + ".part"
	file, err := os.Create(part)
	if err != nil {
		return fmt.Errorf("create partial model file %s: %w", part, err)
	}
	cleanup := func() { file.Close(); _ = os.Remove(part) }
	var kept []byte
	buf := make([]byte, 256*1024)
	for {
		n, readErr := resp.Body.Read(buf)
		if n > 0 {
			if transform != nil {
				kept = append(kept, buf[:n]...)
			} else if _, err := file.Write(buf[:n]); err != nil {
				cleanup()
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
			cleanup()
			return fmt.Errorf("read model download %s: %w", name, readErr)
		}
	}
	if transform != nil {
		out, err := transform(kept)
		if err != nil {
			cleanup()
			return fmt.Errorf("read %s: %w", name, err)
		}
		if _, err := file.Write(out); err != nil {
			cleanup()
			return fmt.Errorf("write model file %s: %w", name, err)
		}
	}
	if err := file.Close(); err != nil {
		_ = os.Remove(part)
		return fmt.Errorf("close model file %s: %w", name, err)
	}
	if !usableModelFile(part) {
		_ = os.Remove(part)
		return fmt.Errorf("download %s looks truncated or empty", name)
	}
	if err := os.Rename(part, dest); err != nil {
		_ = os.Remove(part)
		return fmt.Errorf("install model file %s: %w", name, err)
	}
	return nil
}

// charDictFromYAML turns the inference.yml of a PaddleOCR recognizer into the character file the runtime reads: one character per
// line, in the order of the model's output.
func charDictFromYAML(data []byte) ([]byte, error) {
	var doc struct {
		PostProcess struct {
			CharacterDict []string `yaml:"character_dict"`
		} `yaml:"PostProcess"`
	}
	if err := yaml.Unmarshal(data, &doc); err != nil {
		return nil, err
	}
	chars := doc.PostProcess.CharacterDict
	if len(chars) < 100 {
		return nil, fmt.Errorf("character_dict has %d entries", len(chars))
	}
	return []byte(strings.Join(chars, "\n")), nil
}

func copyFile(src, dest string) error {
	in, err := os.Open(src)
	if err != nil {
		return fmt.Errorf("open %s: %w", src, err)
	}
	defer in.Close()
	part := dest + ".part"
	out, err := os.Create(part)
	if err != nil {
		return fmt.Errorf("create %s: %w", part, err)
	}
	if _, err := io.Copy(out, in); err != nil {
		out.Close()
		_ = os.Remove(part)
		return fmt.Errorf("copy %s: %w", src, err)
	}
	if err := out.Close(); err != nil {
		_ = os.Remove(part)
		return fmt.Errorf("close %s: %w", part, err)
	}
	return os.Rename(part, dest)
}

func fileExists(path string) bool {
	_, err := os.Stat(path)
	return err == nil
}
