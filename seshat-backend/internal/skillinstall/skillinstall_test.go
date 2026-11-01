package skillinstall

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"

	skillsloader "github.com/KPO-Tech/seshat-runtime/pkg/skills"
)

func write(t *testing.T, path, text string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte(text), 0o644); err != nil {
		t.Fatal(err)
	}
}

// pretendMachine lets the tests run on a machine with no Python, no uv and no Node: the test binary stands for the interpreter, and the
// commands that would run are recorded. fail may refuse some of them; uv is the program found as uv, or "" for a machine that has none.
func pretendMachine(t *testing.T, uv string, fail func(line string) error) *recorder {
	t.Helper()
	exe, err := os.Executable()
	if err != nil {
		t.Fatal(err)
	}
	t.Setenv(EnvPython, exe)
	rec := &recorder{}
	oldRun, oldUV, oldEnsure := runCommand, findUV, ensureUV
	runCommand = func(_ context.Context, _ string, _ []string, name string, args ...string) (string, error) {
		call := append([]string{name}, args...)
		rec.add(call)
		if len(args) > 0 && args[0] == "-c" && strings.Contains(args[1], "sys.version_info") {
			return "3 12 1\n/pretend/python", nil
		}
		if fail != nil {
			return "", fail(strings.Join(call, " "))
		}
		return "", nil
	}
	findUV = func() (string, bool) { return uv, uv != "" }
	ensureUV = func(context.Context, Progress) (string, bool) { return findUV() }
	t.Cleanup(func() { runCommand, findUV, ensureUV = oldRun, oldUV, oldEnsure })
	return rec
}

// recorder keeps the commands of a test; the Python and the Node parts run at the same time, so it is locked.
type recorder struct {
	mu    sync.Mutex
	calls [][]string
}

func (r *recorder) add(call []string) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.calls = append(r.calls, call)
}

// lines gives each command as one line.
func (r *recorder) lines() []string {
	r.mu.Lock()
	defer r.mu.Unlock()
	out := make([]string, len(r.calls))
	for i, call := range r.calls {
		out[i] = strings.Join(call, " ")
	}
	return out
}

// ran reports whether a command containing all the parts was run.
func (r *recorder) ran(parts ...string) bool {
	for _, line := range r.lines() {
		all := true
		for _, part := range parts {
			all = all && strings.Contains(line, part)
		}
		if all {
			return true
		}
	}
	return false
}

func pretendPython(t *testing.T) *recorder { return pretendMachine(t, "", nil) }

func TestDetectReadsTheRequirementsOfTheChosenSkillsOnly(t *testing.T) {
	pretendPython(t)
	root := t.TempDir()
	write(t, filepath.Join(root, "skills", "wanted", "SKILL.md"), "---\nname: wanted\n---\n")
	write(t, filepath.Join(root, "skills", "wanted", "requirements.txt"), "# tools\nrequests>=2.31.0\nPyMuPDF>=1.23.0  # pdf\n-r other.txt\n\nPillow\n")
	write(t, filepath.Join(root, "skills", "other", "SKILL.md"), "---\nname: other\n---\n")
	write(t, filepath.Join(root, "skills", "other", "requirements.txt"), "flask\n")

	plan := Detect(root, Spec{Include: []string{"wanted"}})
	if plan.Python == nil || !plan.Python.Found {
		t.Fatalf("a python plan with an interpreter is expected, got %+v", plan)
	}
	if got := strings.Join(plan.Python.Packages, ","); got != "Pillow,PyMuPDF,requests" {
		t.Fatalf("packages of the chosen skill only, got %q", got)
	}
	if len(plan.Python.Files) != 1 || plan.Python.Files[0] != "skills/wanted/requirements.txt" {
		t.Fatalf("files: %v", plan.Python.Files)
	}
	if len(plan.Warnings) != 1 || !strings.Contains(plan.Warnings[0], "AGPL") {
		t.Fatalf("the licence of PyMuPDF is said: %v", plan.Warnings)
	}
}

func TestDetectUsesTheRequirementsOfTheRepositoryRootAndTheCatalogPackages(t *testing.T) {
	pretendPython(t)
	root := t.TempDir()
	write(t, filepath.Join(root, "skills", "a", "SKILL.md"), "---\nname: a\n---\n")
	write(t, filepath.Join(root, "requirements.txt"), "requests\npython-dotenv\n")
	plan := Detect(root, Spec{PythonMinimum: "3.11", PythonPackages: []string{"polars", "requests"}})
	if plan.Python == nil || strings.Join(plan.Python.Packages, ",") != "polars,python-dotenv,requests" || plan.Python.Minimum != "3.11" {
		t.Fatalf("got %+v", plan.Python)
	}
}

func TestDetectLeavesOutDevDependenciesAndFindsNothingToInstallWhenThereIsNothing(t *testing.T) {
	root := t.TempDir()
	write(t, filepath.Join(root, "skills", "a", "SKILL.md"), "---\nname: a\n---\n")
	write(t, filepath.Join(root, "package.json"), `{"devDependencies":{"eslint":"1"}}`)
	if plan := Detect(root, Spec{}); !plan.Empty() {
		t.Fatalf("a repository that needs nothing gives an empty plan, got %+v", plan)
	}
}

func TestDetectListsNodePackages(t *testing.T) {
	root := t.TempDir()
	write(t, filepath.Join(root, "comptable", "SKILL.md"), "---\nname: comptable\n---\n")
	write(t, filepath.Join(root, "package.json"), `{"dependencies":{"marked":"^15.0.0","puppeteer":"^24.0.0"}}`)
	plan := Detect(root, Spec{})
	if plan.Node == nil || strings.Join(plan.Node.Packages, ",") != "marked,puppeteer" {
		t.Fatalf("got %+v", plan.Node)
	}
	joined := strings.Join(plan.Warnings, " ")
	if plan.Node.Found && !strings.Contains(joined, "puppeteer") {
		t.Fatalf("the missing browser of puppeteer is said: %v", plan.Warnings)
	}
}

func skillRepo(t *testing.T) (root, envDir string, spec Spec) {
	t.Helper()
	root = t.TempDir()
	envDir = filepath.Join(t.TempDir(), "env")
	write(t, filepath.Join(root, "skills", "a", "SKILL.md"), "---\nname: a\n---\n")
	write(t, filepath.Join(root, "skills", "a", "requirements.txt"), "requests\n")
	return root, envDir, Spec{Include: []string{"a"}, PythonPackages: []string{"polars"}}
}

func TestEnvironmentMakesTheEnvironmentAndRecordsIt(t *testing.T) {
	rec := pretendPython(t)
	root, envDir, spec := skillRepo(t)

	if err := Environment(context.Background(), root, envDir, spec, Detect(root, spec)); err != nil {
		t.Fatal(err)
	}
	install, ok := skillsloader.LoadRepoInstall(root)
	if !ok || install.Pending || install.Python == "" || len(install.Include) != 1 {
		t.Fatalf("the install file records the environment, got %+v (ok=%v)", install, ok)
	}
	if !rec.ran("-m venv") {
		t.Fatalf("the environment is made with venv: %v", rec.lines())
	}
	if !rec.ran("pip install", "-r", "requirements.txt", "polars") {
		t.Fatalf("the files and the packages are installed in one run: %v", rec.lines())
	}
}

func TestEnvironmentUsesUVWhenThereIsOne(t *testing.T) {
	rec := pretendMachine(t, "uvbin", nil)
	root, envDir, spec := skillRepo(t)

	if err := Environment(context.Background(), root, envDir, spec, Detect(root, spec)); err != nil {
		t.Fatal(err)
	}
	if !rec.ran("uvbin venv --seed --python /pretend/python") {
		t.Fatalf("uv makes the environment, from the interpreter that was found: %v", rec.lines())
	}
	if !rec.ran("uvbin pip install --python", "-r", "requirements.txt", "polars") {
		t.Fatalf("uv installs the files and the packages in one run: %v", rec.lines())
	}
	if rec.ran("-m venv") || rec.ran("-m pip") {
		t.Fatalf("pip is not used when uv works: %v", rec.lines())
	}
}

func TestEnvironmentFallsBackToPipWhenUVCannotMakeTheEnvironment(t *testing.T) {
	rec := pretendMachine(t, "uvbin", func(line string) error {
		if strings.HasPrefix(line, "uvbin venv") {
			return errors.New("uv is broken")
		}
		return nil
	})
	root, envDir, spec := skillRepo(t)

	if err := Environment(context.Background(), root, envDir, spec, Detect(root, spec)); err != nil {
		t.Fatal(err)
	}
	if !rec.ran("-m venv") || !rec.ran("-m pip install") {
		t.Fatalf("pip takes over: %v", rec.lines())
	}
}

func TestEnvironmentDoesNotRetryWithPipWhenAPackageCannotBeInstalled(t *testing.T) {
	rec := pretendMachine(t, "uvbin", func(line string) error {
		if strings.HasPrefix(line, "uvbin pip install") {
			return errors.New("no matching distribution")
		}
		return nil
	})
	root, envDir, spec := skillRepo(t)

	err := Environment(context.Background(), root, envDir, spec, Detect(root, spec))
	if err == nil || !strings.Contains(err.Error(), "installing the Python packages failed") {
		t.Fatalf("the failure of the packages is reported, got %v", err)
	}
	if rec.ran("-m pip install") {
		t.Fatalf("pip would fail the same way and cost the time again: %v", rec.lines())
	}
	if install, ok := skillsloader.LoadRepoInstall(root); ok && !install.Pending {
		t.Fatalf("a failed installation is not recorded as ready: %+v", install)
	}
}

func TestEnvironmentKeepsAnEnvironmentThatStillWorks(t *testing.T) {
	rec := pretendPython(t)
	root, envDir, spec := skillRepo(t)
	write(t, venvPython(filepath.Join(envDir, "python")), "")

	if err := Environment(context.Background(), root, envDir, spec, Detect(root, spec)); err != nil {
		t.Fatal(err)
	}
	if rec.ran("-m venv") {
		t.Fatalf("a second attempt keeps what the first one installed: %v", rec.lines())
	}
	if !rec.ran("pip install") {
		t.Fatalf("the packages are installed again, which pip makes cheap: %v", rec.lines())
	}
}

func TestEnvironmentMakesPythonAndNodeAndStopsOnTheFirstFailure(t *testing.T) {
	rec := pretendPython(t)
	root, envDir, spec := skillRepo(t)
	write(t, filepath.Join(root, "package.json"), `{"dependencies":{"marked":"^15.0.0"}}`)
	plan := Detect(root, spec)
	plan.Node = &NodePlan{Found: true, Packages: []string{"marked"}}

	if err := Environment(context.Background(), root, envDir, spec, plan); err != nil {
		t.Fatal(err)
	}
	install, _ := skillsloader.LoadRepoInstall(root)
	if install.Python == "" || install.NodeModules == "" {
		t.Fatalf("both parts are recorded: %+v", install)
	}
	if !rec.ran("npm install --ignore-scripts") {
		t.Fatalf("the Node packages are installed: %v", rec.lines())
	}

	pretendMachine(t, "", func(line string) error {
		if strings.HasPrefix(line, "npm install") {
			return errors.New("registry unreachable")
		}
		return nil
	})
	if err := Environment(context.Background(), root, filepath.Join(t.TempDir(), "env2"), spec, plan); err == nil || !strings.Contains(err.Error(), "installing the Node packages failed") {
		t.Fatalf("the failure of one part is the one reported, got %v", err)
	}
}

func TestEnvironmentRefusesWhenAToolIsMissing(t *testing.T) {
	t.Setenv(EnvPython, filepath.Join(t.TempDir(), "nope"))
	plan := Plan{Python: &PythonPlan{Minimum: "3.10", Found: false, Packages: []string{"requests"}}}
	if err := Environment(context.Background(), t.TempDir(), t.TempDir(), Spec{}, plan); err == nil {
		t.Fatal("an installation without its tool must fail")
	}
}
