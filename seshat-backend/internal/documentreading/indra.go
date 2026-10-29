package documentreading

import (
	"bufio"
	"bytes"
	"context"
	_ "embed"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/KPO-Tech/seshat-runtime/pkg/documentreader"
	"github.com/KPO-Tech/seshat-runtime/pkg/runtimepath"
)

// Indra OCR (github.com/datalab-to/indra) is an optional reader for scanned pages. It is a Python package, not a set of model files for
// the native runtime, so it lives in a Python environment of its own under <runtime root>/models/indra, which a person creates from
// Settings. Nothing is installed or downloaded before that, and the weights are only fetched once the person has accepted their licence:
// the code is Apache 2.0, but the weights are under a modified OpenRAIL-M licence that limits who may use them.

const (
	// IndraVersion is the version of the indra-ocr package that is installed, pinned so that what was tested is what runs.
	IndraVersion = "1.1.2"
	// IndraLicenseVersion names the text of the weights licence that was shown. A new text needs a new acceptance.
	IndraLicenseVersion = "datalab-openrail-m-0.1-modified-2023-03-02"
	IndraLicenseURL     = "https://huggingface.co/datalab-to/indra-ocr/blob/main/LICENSE"
	IndraProjectURL     = "https://github.com/datalab-to/indra"

	// EnvIndraPython names the Python interpreter (3.10 or newer) the environment is created from, instead of looking for one.
	EnvIndraPython = "SESHAT_INDRA_PYTHON"

	// IndraSizeMB is about what the environment weighs (341 MB measured) once the package and the weights are installed.
	IndraSizeMB = 350

	indraStateFile  = "indra.json"
	indraIdleLimit  = 10 * time.Minute
	indraStartLimit = 3 * time.Minute
	indraReadLimit  = 10 * time.Minute
)

var (
	ErrIndraLicenseNotAccepted = errors.New("the Indra OCR licence has not been accepted")
	ErrIndraNotInstalled       = errors.New("indra OCR is not installed")
	ErrIndraPythonMissing      = errors.New("python 3.10 or newer was not found")
)

//go:embed indra_worker.py
var indraWorkerScript []byte

// IndraDir is where the Python environment, the weights and the person's choices are kept.
func IndraDir() string { return runtimepath.Join("", "models", "indra") }

func indraVenvDir() string { return filepath.Join(IndraDir(), "venv") }

func indraWorkerPath() string { return filepath.Join(IndraDir(), "indra_worker.py") }

// indraPython is the interpreter of the environment; a variable so that a test can run the worker with the Python of the machine.
var indraPython = indraVenvPython

func indraVenvPython() string {
	if runtime.GOOS == "windows" {
		return filepath.Join(indraVenvDir(), "Scripts", "python.exe")
	}
	return filepath.Join(indraVenvDir(), "bin", "python")
}

// indraEnv keeps the weights in the folder of Indra instead of the person's global Hugging Face cache, so that removing Indra removes
// everything it downloaded.
func indraEnv() []string {
	return append(os.Environ(),
		"HF_HOME="+filepath.Join(IndraDir(), "hf"),
		"HF_HUB_DISABLE_SYMLINKS_WARNING=1",
		"HF_HUB_DISABLE_PROGRESS_BARS=1",
		"PYTHONUTF8=1",
		"PYTHONIOENCODING=utf-8",
	)
}

// IndraState is what is remembered about Indra between runs.
type IndraState struct {
	// LicenseVersion is the licence text that was accepted; empty until then.
	LicenseVersion string `json:"license_version,omitempty"`
	AcceptedAt     string `json:"accepted_at,omitempty"`
	// Installed is the version of the package that was installed and checked, empty when there is none.
	Installed string `json:"installed,omitempty"`
	// Disabled keeps Indra installed but out of the reading path.
	Disabled bool `json:"disabled,omitempty"`
}

func LoadIndraState() IndraState {
	var state IndraState
	if data, err := os.ReadFile(filepath.Join(IndraDir(), indraStateFile)); err == nil {
		_ = json.Unmarshal(data, &state)
	}
	return state
}

func saveIndraState(state IndraState) error {
	if err := os.MkdirAll(IndraDir(), 0o755); err != nil {
		return fmt.Errorf("create indra dir: %w", err)
	}
	data, err := json.MarshalIndent(state, "", "  ")
	if err != nil {
		return err
	}
	part := filepath.Join(IndraDir(), indraStateFile+".part")
	if err := os.WriteFile(part, data, 0o644); err != nil {
		return fmt.Errorf("write indra state: %w", err)
	}
	return os.Rename(part, filepath.Join(IndraDir(), indraStateFile))
}

// IndraStatus is what Settings shows.
type IndraStatus struct {
	LicenseAccepted bool   `json:"license_accepted"`
	LicenseVersion  string `json:"license_version"`
	LicenseURL      string `json:"license_url"`
	ProjectURL      string `json:"project_url"`
	Installed       bool   `json:"installed"`
	Enabled         bool   `json:"enabled"`
	// Ready is true when Indra reads pages now: installed, licence accepted, not switched off.
	Ready       bool   `json:"ready"`
	Version     string `json:"version"`
	SizeMB      int    `json:"size_mb"`
	PythonFound bool   `json:"python_found"`
	Dir         string `json:"dir"`
}

func GetIndraStatus() IndraStatus {
	state := LoadIndraState()
	accepted := state.LicenseVersion == IndraLicenseVersion
	installed := state.Installed != "" && fileExists(indraVenvPython())
	_, pythonErr := findPython()
	return IndraStatus{
		LicenseAccepted: accepted,
		LicenseVersion:  IndraLicenseVersion,
		LicenseURL:      IndraLicenseURL,
		ProjectURL:      IndraProjectURL,
		Installed:       installed,
		Enabled:         installed && !state.Disabled,
		Ready:           installed && accepted && !state.Disabled,
		Version:         IndraVersion,
		SizeMB:          IndraSizeMB,
		PythonFound:     pythonErr == nil,
		Dir:             IndraDir(),
	}
}

// AcceptIndraLicense records that the person accepted the licence text of IndraLicenseVersion.
func AcceptIndraLicense() error {
	state := LoadIndraState()
	state.LicenseVersion = IndraLicenseVersion
	state.AcceptedAt = time.Now().UTC().Format(time.RFC3339)
	return saveIndraState(state)
}

// SetIndraEnabled switches Indra in or out of the reading path without removing it.
func SetIndraEnabled(enabled bool) error {
	state := LoadIndraState()
	if state.Installed == "" {
		return ErrIndraNotInstalled
	}
	if enabled && state.LicenseVersion != IndraLicenseVersion {
		return ErrIndraLicenseNotAccepted
	}
	state.Disabled = !enabled
	if !enabled {
		stopIndraWorker()
	}
	return saveIndraState(state)
}

// RemoveIndra deletes the environment and the weights, and forgets the acceptance of the licence.
func RemoveIndra() error {
	stopIndraWorker()
	if err := os.RemoveAll(IndraDir()); err != nil {
		return fmt.Errorf("remove indra: %w", err)
	}
	return nil
}

// IndraInstallProgress says which step of the installation is running.
type IndraInstallProgress struct {
	Step      string
	StepIndex int
	StepCount int
}

const indraStepCount = 4

// InstallIndra creates the Python environment, installs the package and loads the weights once, so that the first page read is not
// slow. It does nothing before the licence is accepted.
func InstallIndra(ctx context.Context, onProgress func(IndraInstallProgress)) error {
	state := LoadIndraState()
	if state.LicenseVersion != IndraLicenseVersion {
		return ErrIndraLicenseNotAccepted
	}
	step := func(index int, name string) {
		if onProgress != nil {
			onProgress(IndraInstallProgress{Step: name, StepIndex: index, StepCount: indraStepCount})
		}
	}

	step(1, "Looking for Python")
	python, err := findPython()
	if err != nil {
		return err
	}
	if err := os.MkdirAll(IndraDir(), 0o755); err != nil {
		return fmt.Errorf("create indra dir: %w", err)
	}

	step(2, "Creating the environment")
	if !fileExists(indraVenvPython()) {
		if err := runIndraCommand(ctx, append(append([]string{}, python...), "-m", "venv", indraVenvDir())...); err != nil {
			_ = os.RemoveAll(indraVenvDir())
			return fmt.Errorf("create the python environment: %w", err)
		}
	}

	step(3, "Installing indra-ocr")
	if err := runIndraCommand(ctx, indraVenvPython(), "-m", "pip", "install", "--disable-pip-version-check", "--no-input", "indra-ocr=="+IndraVersion); err != nil {
		return fmt.Errorf("install indra-ocr: %w", err)
	}

	step(4, "Downloading the model")
	if err := os.WriteFile(indraWorkerPath(), indraWorkerScript, 0o644); err != nil {
		return fmt.Errorf("write indra worker: %w", err)
	}
	if err := runIndraCommand(ctx, indraVenvPython(), indraWorkerPath(), "--check"); err != nil {
		return fmt.Errorf("load the model: %w", err)
	}

	state = LoadIndraState()
	state.Installed = IndraVersion
	state.Disabled = false
	return saveIndraState(state)
}

// findPython returns the command that starts a Python 3.10 or newer, as the program and its leading arguments.
func findPython() ([]string, error) {
	var candidates [][]string
	if explicit := strings.TrimSpace(os.Getenv(EnvIndraPython)); explicit != "" {
		candidates = append(candidates, []string{explicit})
	}
	if runtime.GOOS == "windows" {
		candidates = append(candidates, []string{"py", "-3"}, []string{"python"})
	} else {
		candidates = append(candidates, []string{"python3"}, []string{"python"})
	}
	for _, candidate := range candidates {
		path, err := exec.LookPath(candidate[0])
		if err != nil {
			continue
		}
		command := append([]string{path}, candidate[1:]...)
		cmd := exec.Command(command[0], append(command[1:], "-c", "import sys; print(sys.version_info[0], sys.version_info[1])")...)
		hideWindow(cmd)
		out, err := cmd.Output()
		if err != nil {
			continue
		}
		fields := strings.Fields(string(out))
		if len(fields) != 2 {
			continue
		}
		major, _ := strconv.Atoi(fields[0])
		minor, _ := strconv.Atoi(fields[1])
		if major == 3 && minor >= 10 {
			return command, nil
		}
	}
	return nil, ErrIndraPythonMissing
}

// runIndraCommand runs a command of the installation and returns the end of its output when it fails.
func runIndraCommand(ctx context.Context, args ...string) error {
	cmd := exec.CommandContext(ctx, args[0], args[1:]...)
	cmd.Env = indraEnv()
	hideWindow(cmd)
	var out bytes.Buffer
	cmd.Stdout, cmd.Stderr = &out, &out
	if err := cmd.Run(); err != nil {
		if ctx.Err() != nil {
			return ctx.Err()
		}
		return fmt.Errorf("%w: %s", err, tail(out.String(), 600))
	}
	return nil
}

func tail(text string, max int) string {
	text = strings.TrimSpace(text)
	if len(text) <= max {
		return text
	}
	return "..." + text[len(text)-max:]
}

// lastBytes keeps the end of what a process writes to stderr, to say why it stopped.
type lastBytes struct {
	mu    sync.Mutex
	limit int
	data  []byte
}

func (b *lastBytes) Write(p []byte) (int, error) {
	b.mu.Lock()
	defer b.mu.Unlock()
	b.data = append(b.data, p...)
	if len(b.data) > b.limit {
		b.data = b.data[len(b.data)-b.limit:]
	}
	return len(p), nil
}

func (b *lastBytes) String() string {
	b.mu.Lock()
	defer b.mu.Unlock()
	return string(b.data)
}

// indraWorker is the Python process that holds the loaded models. It is started when a page needs it and stopped when it has been idle
// for a while, or when Indra is switched off or removed.
type indraWorker struct {
	mu     sync.Mutex
	cmd    *exec.Cmd
	stdin  io.WriteCloser
	stdout *bufio.Reader
	nextID int
	timer  *time.Timer
}

var sharedIndraWorker indraWorker

func stopIndraWorker() {
	sharedIndraWorker.mu.Lock()
	defer sharedIndraWorker.mu.Unlock()
	sharedIndraWorker.stopLocked()
}

func (w *indraWorker) stopLocked() {
	if w.timer != nil {
		w.timer.Stop()
		w.timer = nil
	}
	if w.cmd == nil {
		return
	}
	_ = w.stdin.Close()
	done := make(chan struct{})
	go func(cmd *exec.Cmd) { _ = cmd.Wait(); close(done) }(w.cmd)
	select {
	case <-done:
	case <-time.After(3 * time.Second):
		_ = w.cmd.Process.Kill()
		<-done
	}
	w.cmd, w.stdin, w.stdout = nil, nil, nil
}

func (w *indraWorker) startLocked() error {
	if w.cmd != nil {
		return nil
	}
	if err := os.WriteFile(indraWorkerPath(), indraWorkerScript, 0o644); err != nil {
		return fmt.Errorf("write indra worker: %w", err)
	}
	cmd := exec.Command(indraPython(), indraWorkerPath())
	cmd.Env = indraEnv()
	hideWindow(cmd)
	stdin, err := cmd.StdinPipe()
	if err != nil {
		return err
	}
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return err
	}
	stderr := &lastBytes{limit: 8 << 10}
	cmd.Stderr = stderr
	if err := cmd.Start(); err != nil {
		return fmt.Errorf("start indra: %w", err)
	}
	reader := bufio.NewReaderSize(stdout, 1<<20)
	ready := make(chan error, 1)
	go func() {
		line, err := reader.ReadBytes('\n')
		if err != nil {
			ready <- fmt.Errorf("indra stopped before it was ready: %s", tail(stderr.String(), 400))
			return
		}
		var hello struct {
			Ready bool `json:"ready"`
		}
		if json.Unmarshal(line, &hello) != nil || !hello.Ready {
			ready <- fmt.Errorf("indra answered %q instead of ready", strings.TrimSpace(string(line)))
			return
		}
		ready <- nil
	}()
	select {
	case err := <-ready:
		if err != nil {
			_ = cmd.Process.Kill()
			_ = cmd.Wait()
			return err
		}
	case <-time.After(indraStartLimit):
		_ = cmd.Process.Kill()
		_ = cmd.Wait()
		return errors.New("indra took too long to start")
	}
	w.cmd, w.stdin, w.stdout = cmd, stdin, reader
	return nil
}

// read sends one file to the worker and returns the markdown of each page.
func (w *indraWorker) read(ctx context.Context, path string) ([]string, error) {
	w.mu.Lock()
	defer w.mu.Unlock()
	if err := w.startLocked(); err != nil {
		return nil, err
	}
	w.nextID++
	id := w.nextID
	request, _ := json.Marshal(map[string]any{"id": id, "path": path})
	if _, err := w.stdin.Write(append(request, '\n')); err != nil {
		w.stopLocked()
		return nil, fmt.Errorf("send to indra: %w", err)
	}

	type reply struct {
		line []byte
		err  error
	}
	got := make(chan reply, 1)
	reader := w.stdout
	go func() {
		line, err := reader.ReadBytes('\n')
		got <- reply{line, err}
	}()
	var answer reply
	select {
	case answer = <-got:
	case <-ctx.Done():
		w.stopLocked()
		return nil, ctx.Err()
	case <-time.After(indraReadLimit):
		w.stopLocked()
		return nil, errors.New("indra took too long to read the page")
	}
	if answer.err != nil {
		w.stopLocked()
		return nil, fmt.Errorf("read from indra: %w", answer.err)
	}
	var response struct {
		ID    int      `json:"id"`
		Pages []string `json:"pages"`
		Error string   `json:"error"`
	}
	if err := json.Unmarshal(answer.line, &response); err != nil {
		w.stopLocked()
		return nil, fmt.Errorf("decode indra answer: %w", err)
	}
	if response.ID != id {
		w.stopLocked()
		return nil, fmt.Errorf("indra answered request %d instead of %d", response.ID, id)
	}
	if w.timer != nil {
		w.timer.Stop()
	}
	w.timer = time.AfterFunc(indraIdleLimit, stopIndraWorker)
	if response.Error != "" {
		return nil, errors.New(response.Error)
	}
	return response.Pages, nil
}

// indraConverter reads a file with Indra OCR.
type indraConverter struct{}

// NewIndraConverter returns the Indra reader when it is installed, its licence accepted and it is not switched off; otherwise nil.
func NewIndraConverter() documentreader.Converter {
	if !GetIndraStatus().Ready {
		return nil
	}
	return indraConverter{}
}

func (indraConverter) IsAvailable(context.Context) bool { return GetIndraStatus().Ready }

func (indraConverter) ConvertFile(ctx context.Context, filePath string) (*documentreader.ConversionResult, error) {
	pages, err := sharedIndraWorker.read(ctx, filePath)
	if err != nil {
		return nil, err
	}
	return &documentreader.ConversionResult{Markdown: strings.TrimSpace(strings.Join(pages, "\n\n")), PageCount: len(pages)}, nil
}

func (c indraConverter) ConvertBytes(ctx context.Context, data []byte, filename string) (*documentreader.ConversionResult, error) {
	tmpDir := filepath.Join(IndraDir(), "tmp")
	if err := os.MkdirAll(tmpDir, 0o755); err != nil {
		return nil, fmt.Errorf("create indra tmp dir: %w", err)
	}
	file, err := os.CreateTemp(tmpDir, "page-*"+strings.ToLower(filepath.Ext(filename)))
	if err != nil {
		return nil, fmt.Errorf("create indra tmp file: %w", err)
	}
	defer os.Remove(file.Name())
	if _, err := file.Write(data); err != nil {
		file.Close()
		return nil, fmt.Errorf("write indra tmp file: %w", err)
	}
	if err := file.Close(); err != nil {
		return nil, fmt.Errorf("close indra tmp file: %w", err)
	}
	return c.ConvertFile(ctx, file.Name())
}

func (indraConverter) ConvertURL(context.Context, string) (*documentreader.ConversionResult, error) {
	return nil, errors.New("indra reads files, not URLs")
}

// NewLocalAdvancedConverter puts Indra ahead of the native OCR when it is ready: the person chose it, and the native OCR reads what it
// leaves empty.
func NewLocalAdvancedConverter(native documentreader.Converter) documentreader.Converter {
	return newFallbackConverter(NewIndraConverter(), native)
}

var _ documentreader.Converter = indraConverter{}
