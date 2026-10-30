package documentreading

import (
	"context"
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"

	"github.com/KPO-Tech/seshat-runtime/pkg/documentreader"
)

func useIndraRoot(t *testing.T) {
	t.Helper()
	t.Setenv("SESHAT_RUNTIME_ROOT", t.TempDir())
	t.Cleanup(stopIndraWorker)
}

func TestIndraIsOffUntilTheLicenceIsAccepted(t *testing.T) {
	useIndraRoot(t)
	status := GetIndraStatus()
	if status.LicenseAccepted || status.Installed || status.Ready {
		t.Fatalf("nothing should be accepted, installed or ready on a fresh machine: %+v", status)
	}
	if NewIndraConverter() != nil {
		t.Fatal("no Indra reader should exist before it is installed")
	}
	if err := InstallIndra(context.Background(), nil); !errors.Is(err, ErrIndraLicenseNotAccepted) {
		t.Fatalf("installing before accepting the licence must be refused, got %v", err)
	}
	if err := SetIndraEnabled(true); !errors.Is(err, ErrIndraNotInstalled) {
		t.Fatalf("switching on what is not installed must be refused, got %v", err)
	}
	if fileExists(filepath.Join(IndraDir(), "venv")) {
		t.Fatal("a refused installation must not create the environment")
	}
}

func TestAcceptingTheLicenceIsRememberedAndOnlyForThatText(t *testing.T) {
	useIndraRoot(t)
	if err := AcceptIndraLicense(); err != nil {
		t.Fatal(err)
	}
	status := GetIndraStatus()
	if !status.LicenseAccepted || status.Installed {
		t.Fatalf("accepting is not installing: %+v", status)
	}
	if LoadIndraState().AcceptedAt == "" {
		t.Fatal("the date of the acceptance should be kept")
	}
	if err := saveIndraState(IndraState{LicenseVersion: "an-older-text", Installed: IndraVersion}); err != nil {
		t.Fatal(err)
	}
	if GetIndraStatus().LicenseAccepted {
		t.Fatal("a new licence text needs a new acceptance")
	}
	if err := SetIndraEnabled(true); !errors.Is(err, ErrIndraLicenseNotAccepted) {
		t.Fatalf("switching on without a current acceptance must be refused, got %v", err)
	}
}

// pythonForTest returns the interpreter of the machine, or skips the test when there is none.
func pythonForTest(t *testing.T) string {
	t.Helper()
	command, err := findPython()
	if err != nil {
		t.Skip("python 3.10 or newer is not installed")
	}
	out, err := exec.Command(command[0], append(command[1:], "-c", "import sys; print(sys.executable)")...).Output()
	if err != nil {
		t.Skip("cannot ask python for its path")
	}
	return strings.TrimSpace(string(out))
}

// A stand-in for the indra_ocr package: it upper-cases the pages of a text file, which are separated by form feeds.
const fakeIndraPackage = `
class _Page:
    def __init__(self, markdown):
        self.markdown = markdown

class _Converter:
    def convert(self, path):
        with open(path, encoding="utf-8") as handle:
            text = handle.read()
        for index, part in enumerate(text.split("\f")):
            yield index, _Page(part.upper())

def load():
    return _Converter()
`

func installFakeIndra(t *testing.T) {
	t.Helper()
	python := pythonForTest(t)
	useIndraRoot(t)
	packages := t.TempDir()
	if err := os.WriteFile(filepath.Join(packages, "indra_ocr.py"), []byte(fakeIndraPackage), 0o644); err != nil {
		t.Fatal(err)
	}
	t.Setenv("PYTHONPATH", packages)
	previous := indraPython
	indraPython = func() string { return python }
	t.Cleanup(func() { indraPython = previous })
	// The status looks for the environment's interpreter, so a file stands in for it.
	if err := os.MkdirAll(filepath.Dir(indraVenvPython()), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(indraVenvPython(), []byte("stand-in"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := saveIndraState(IndraState{LicenseVersion: IndraLicenseVersion, Installed: IndraVersion}); err != nil {
		t.Fatal(err)
	}
}

func TestIndraConverterReadsThroughTheWorkerAndSurvivesAnError(t *testing.T) {
	installFakeIndra(t)
	converter := NewIndraConverter()
	if converter == nil {
		t.Fatal("an installed, accepted Indra should give a reader")
	}
	ctx := context.Background()

	first, err := converter.ConvertBytes(ctx, []byte("page one\fpage two"), "scan.txt")
	if err != nil {
		t.Fatal(err)
	}
	if first.Markdown != "PAGE ONE\n\nPAGE TWO" || first.PageCount != 2 {
		t.Fatalf("unexpected result: %+v", first)
	}

	if _, err := converter.ConvertFile(ctx, filepath.Join(t.TempDir(), "missing.txt")); err == nil {
		t.Fatal("a file that cannot be read should be an error")
	}
	again, err := converter.ConvertBytes(ctx, []byte("still works"), "next.txt")
	if err != nil || again.Markdown != "STILL WORKS" {
		t.Fatalf("the worker should survive a failed page: %+v, %v", again, err)
	}
	if entries, _ := os.ReadDir(filepath.Join(IndraDir(), "tmp")); len(entries) != 0 {
		t.Fatalf("the temporary copies of the pages should be removed, %d left", len(entries))
	}
}

func TestSwitchingIndraOffTakesItOutOfTheReadingPath(t *testing.T) {
	installFakeIndra(t)
	if NewIndraConverter() == nil {
		t.Fatal("Indra should be ready")
	}
	if err := SetIndraEnabled(false); err != nil {
		t.Fatal(err)
	}
	status := GetIndraStatus()
	if !status.Installed || status.Enabled || status.Ready {
		t.Fatalf("off should mean installed but not ready: %+v", status)
	}
	if NewIndraConverter() != nil {
		t.Fatal("a switched-off Indra must not read")
	}
	if err := SetIndraEnabled(true); err != nil {
		t.Fatal(err)
	}
	if NewIndraConverter() == nil {
		t.Fatal("switching on again should bring it back")
	}
}

func TestRemovingIndraDeletesEverythingIncludingTheAcceptance(t *testing.T) {
	installFakeIndra(t)
	if err := RemoveIndra(); err != nil {
		t.Fatal(err)
	}
	status := GetIndraStatus()
	if status.Installed || status.LicenseAccepted || fileExists(IndraDir()) {
		t.Fatalf("nothing should be left: %+v", status)
	}
}

func TestLocalAdvancedConverterUsesTheNativeReaderWhenIndraIsOff(t *testing.T) {
	useIndraRoot(t)
	if NewLocalAdvancedConverter(nil) != nil {
		t.Fatal("with no Indra and no native reader there is no local advanced reader")
	}
	native := fakeConverter{markdown: "native text"}
	if got := NewLocalAdvancedConverter(native); got != documentreader.Converter(native) {
		t.Fatalf("without Indra the native reader should be used as it is, got %T", got)
	}
}

func TestLocalAdvancedConverterTriesIndraFirstThenTheNativeReader(t *testing.T) {
	installFakeIndra(t)
	chain := NewLocalAdvancedConverter(fakeConverter{markdown: "native text"})
	ctx := context.Background()

	result, err := chain.ConvertBytes(ctx, []byte("scanned words"), "page.txt")
	if err != nil || result.Markdown != "SCANNED WORDS" {
		t.Fatalf("Indra should read first: %+v, %v", result, err)
	}
	// A page Indra reads as nothing is left to the native reader.
	result, err = chain.ConvertBytes(ctx, []byte(""), "empty.txt")
	if err != nil || result.Markdown != "native text" {
		t.Fatalf("the native reader should take over when Indra finds no text: %+v, %v", result, err)
	}
}
