package documentreading

import (
	"bytes"
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func bigFile(label string) []byte { return bytes.Repeat([]byte(label), 2048) }

// packServer serves what DownloadNativeDocPack asks for: the shared models, the Chinese and English recognizer, and the Latin one.
func packServer(t *testing.T) *httptest.Server {
	t.Helper()
	yml, err := os.ReadFile(filepath.Join("testdata", "latin_rec_inference.yml"))
	if err != nil {
		t.Fatal(err)
	}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case strings.HasSuffix(r.URL.Path, "/inference.yml"):
			_, _ = w.Write(yml)
		case strings.HasSuffix(r.URL.Path, "/inference.onnx"):
			_, _ = w.Write(bigFile("latin-rec"))
		default:
			_, _ = w.Write(bigFile(filepath.Base(r.URL.Path)))
		}
	}))
	t.Cleanup(server.Close)
	t.Setenv(EnvNativeDocModelsBaseURL, server.URL)
	t.Setenv(EnvNativeDocLatinBaseURL, server.URL)
	return server
}

func TestCharDictFromYAMLKeepsAccentsAndTheApostrophe(t *testing.T) {
	yml, err := os.ReadFile(filepath.Join("testdata", "latin_rec_inference.yml"))
	if err != nil {
		t.Fatal(err)
	}
	out, err := charDictFromYAML(yml)
	if err != nil {
		t.Fatal(err)
	}
	chars := strings.Split(string(out), "\n")
	// The model has 838 outputs: a blank, the 836 characters, and the space the runtime appends.
	if len(chars) != 836 {
		t.Fatalf("expected 836 characters, got %d", len(chars))
	}
	set := map[string]bool{}
	for _, c := range chars {
		set[c] = true
	}
	for _, want := range []string{"é", "è", "ê", "à", "ç", "ù", "ô", "î", "œ", "'"} {
		if !set[want] {
			t.Errorf("character %q is missing", want)
		}
	}
	if set["''"] {
		t.Error("the apostrophe was read as two characters")
	}
}

func TestCharDictFromYAMLRejectsAFileWithNoCharacters(t *testing.T) {
	if _, err := charDictFromYAML([]byte("Global:\n  model_name: x\n")); err == nil {
		t.Fatal("expected an error when character_dict is missing")
	}
}

func TestDownloadNativeDocPackInstallsAndActivatesTheLatinPack(t *testing.T) {
	dir := t.TempDir()
	t.Setenv(EnvNativeDocModelsDir, dir)
	packServer(t)

	if err := DownloadNativeDocPack(context.Background(), NativeDocPackLatin, nil); err != nil {
		t.Fatal(err)
	}
	for _, name := range []string{"det.ort", "layout.ort", "tsr.ort", "rec.onnx", "ocr.res", filepath.Join("packs", "latin", "rec.onnx")} {
		if !usableModelFile(filepath.Join(dir, name)) {
			t.Errorf("%s is missing", name)
		}
	}
	if fileExists(filepath.Join(dir, "rec.ort")) {
		t.Error("rec.ort must not be there: the runtime would read it before rec.onnx")
	}
	if got := NativeDocActivePack(); got != NativeDocPackLatin {
		t.Fatalf("active pack = %q", got)
	}
	if !NativeDocModelsAvailable() {
		t.Fatal("the models must count as available with rec.onnx")
	}
	if !NativeDocPackInstalled(NativeDocPackLatin) {
		t.Fatal("the Latin pack must be installed")
	}
	if NativeDocPackInstalled(NativeDocPackDefault) {
		t.Fatal("the default pack was never downloaded")
	}
}

func TestActivatingAnotherPackKeepsAndRestoresTheInstalledOne(t *testing.T) {
	dir := t.TempDir()
	t.Setenv(EnvNativeDocModelsDir, dir)
	packServer(t)
	// An install made before packs existed: the Chinese and English recognizer sits in the model directory, with no record.
	for _, name := range []string{"det.ort", "layout.ort", "tsr.ort", "rec.ort", "ocr.res"} {
		if err := os.WriteFile(filepath.Join(dir, name), bigFile("old-"+name), 0o600); err != nil {
			t.Fatal(err)
		}
	}
	if got := NativeDocActivePack(); got != NativeDocPackDefault {
		t.Fatalf("an install with no record is the default pack, got %q", got)
	}
	if !NativeDocPackInstalled(NativeDocPackDefault) {
		t.Fatal("the existing Chinese and English files must count as an installed default pack")
	}

	if err := DownloadNativeDocPack(context.Background(), NativeDocPackLatin, nil); err != nil {
		t.Fatal(err)
	}
	if !usableModelFile(filepath.Join(dir, "packs", NativeDocPackDefault, "rec.ort")) {
		t.Fatal("the old recognizer must be kept in its pack folder")
	}
	if fileExists(filepath.Join(dir, "rec.ort")) {
		t.Fatal("rec.ort of the old pack must leave the model directory")
	}

	if err := ActivateNativeDocPack(NativeDocPackDefault); err != nil {
		t.Fatal(err)
	}
	got, err := os.ReadFile(filepath.Join(dir, "rec.ort"))
	if err != nil || !bytes.Equal(got, bigFile("old-rec.ort")) {
		t.Fatalf("the old recognizer was not restored: %v", err)
	}
	if fileExists(filepath.Join(dir, "rec.onnx")) {
		t.Fatal("rec.onnx of the Latin pack must leave the model directory")
	}
	if NativeDocActivePack() != NativeDocPackDefault {
		t.Fatal("the default pack must be active again")
	}
}

func TestUnknownNativeDocPack(t *testing.T) {
	t.Setenv(EnvNativeDocModelsDir, t.TempDir())
	if err := DownloadNativeDocPack(context.Background(), "klingon", nil); !errors.Is(err, ErrNativeDocUnknownPack) {
		t.Fatalf("expected ErrNativeDocUnknownPack, got %v", err)
	}
	if err := ActivateNativeDocPack("klingon"); !errors.Is(err, ErrNativeDocUnknownPack) {
		t.Fatalf("expected ErrNativeDocUnknownPack, got %v", err)
	}
}
