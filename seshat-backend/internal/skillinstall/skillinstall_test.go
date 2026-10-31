package skillinstall

import (
	"context"
	"os"
	"path/filepath"
	"strings"
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

// pretendPython lets the tests run on a machine with no Python: the test binary stands for it, and the commands it would run are recorded.
func pretendPython(t *testing.T) *[][]string {
	t.Helper()
	exe, err := os.Executable()
	if err != nil {
		t.Fatal(err)
	}
	t.Setenv(EnvPython, exe)
	var calls [][]string
	old := runCommand
	runCommand = func(_ context.Context, _ string, _ []string, name string, args ...string) (string, error) {
		calls = append(calls, append([]string{name}, args...))
		if len(args) > 0 && args[0] == "-c" {
			return "3 12 1", nil
		}
		return "", nil
	}
	t.Cleanup(func() { runCommand = old })
	return &calls
}

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

func TestEnvironmentMakesTheEnvironmentAndRecordsIt(t *testing.T) {
	calls := pretendPython(t)
	root := t.TempDir()
	envDir := filepath.Join(t.TempDir(), "env")
	write(t, filepath.Join(root, "skills", "a", "SKILL.md"), "---\nname: a\n---\n")
	write(t, filepath.Join(root, "skills", "a", "requirements.txt"), "requests\n")
	spec := Spec{Include: []string{"a"}, PythonPackages: []string{"polars"}}

	if err := Environment(context.Background(), root, envDir, spec, Detect(root, spec)); err != nil {
		t.Fatal(err)
	}
	install, ok := skillsloader.LoadRepoInstall(root)
	if !ok || install.Pending || install.Python == "" || len(install.Include) != 1 {
		t.Fatalf("the install file records the environment, got %+v (ok=%v)", install, ok)
	}
	var venv, pipFile, pipPackages bool
	for _, call := range *calls {
		line := strings.Join(call, " ")
		venv = venv || strings.Contains(line, "-m venv")
		pipFile = pipFile || (strings.Contains(line, "pip install") && strings.Contains(line, "-r"))
		pipPackages = pipPackages || (strings.Contains(line, "pip install") && strings.HasSuffix(line, "polars"))
	}
	if !venv || !pipFile || !pipPackages {
		t.Fatalf("venv=%v pip file=%v pip packages=%v in %v", venv, pipFile, pipPackages, *calls)
	}
}

func TestEnvironmentRefusesWhenAToolIsMissing(t *testing.T) {
	t.Setenv(EnvPython, filepath.Join(t.TempDir(), "nope"))
	plan := Plan{Python: &PythonPlan{Minimum: "3.10", Found: false, Packages: []string{"requests"}}}
	if err := Environment(context.Background(), t.TempDir(), t.TempDir(), Spec{}, plan); err == nil {
		t.Fatal("an installation without its tool must fail")
	}
}
