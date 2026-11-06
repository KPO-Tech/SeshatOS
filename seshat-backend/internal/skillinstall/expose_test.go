package skillinstall

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"

	skillsloader "github.com/KPO-Tech/seshat-runtime/pkg/skills"
)

func hiddenSkillRepo(t *testing.T) string {
	t.Helper()
	root := t.TempDir()
	write(t, filepath.Join(root, ".claude", "skills", "pro", "SKILL.md"), "---\nname: pro\n---\nRun ${CLAUDE_PLUGIN_ROOT}/.claude/skills/pro/scripts/run.py and then python run.py\n")
	write(t, filepath.Join(root, ".claude", "skills", "pro", "scripts", "run.py"), "print('hi')\n")
	write(t, filepath.Join(root, ".claude", "skills", "pro", "scripts", "__pycache__", "run.pyc"), "x")
	return root
}

func proSpec() Spec {
	return Spec{
		Include: []string{"pro"},
		Expose:  []Expose{{From: ".claude/skills/pro", To: "pro"}},
		Fixes:   []Fix{{In: "pro", File: "SKILL.md", Old: "${CLAUDE_PLUGIN_ROOT}/.claude/skills/pro", New: "${SESHAT_SKILL_DIR}/pro", Why: "path of a Claude plugin"}},
	}
}

func TestPrepareCopiesAHiddenSkillAndCorrectsTheCopyOnly(t *testing.T) {
	root := hiddenSkillRepo(t)
	if warnings := Prepare(root, proSpec()); len(warnings) != 0 {
		t.Fatalf("no warning expected, got %v", warnings)
	}
	copied, err := os.ReadFile(filepath.Join(root, "pro", "SKILL.md"))
	if err != nil {
		t.Fatalf("the skill must be copied to a folder that is read: %v", err)
	}
	if !strings.Contains(string(copied), "${SESHAT_SKILL_DIR}/pro/scripts/run.py") || strings.Contains(string(copied), "CLAUDE_PLUGIN_ROOT") {
		t.Fatalf("the path must be corrected in the copy: %s", copied)
	}
	original, _ := os.ReadFile(filepath.Join(root, ".claude", "skills", "pro", "SKILL.md"))
	if !strings.Contains(string(original), "CLAUDE_PLUGIN_ROOT") {
		t.Fatal("the repository itself must not change: an update from its source would meet a local change")
	}
	if _, err := os.Stat(filepath.Join(root, "pro", "scripts", "__pycache__")); err == nil {
		t.Fatal("caches are not copied")
	}
	if dirs := skillDirs(root, []string{"pro"}); len(dirs) != 1 || filepath.Base(dirs[0]) != "pro" || filepath.Dir(dirs[0]) != filepath.Clean(root) {
		t.Fatalf("only the copy is found as the skill, got %v", dirs)
	}
}

func TestPrepareRefreshesWhenTheSkillChangesAndLeavesItAloneOtherwise(t *testing.T) {
	root := hiddenSkillRepo(t)
	Prepare(root, proSpec())
	marker := filepath.Join(root, "pro", exposedMarker)
	first, _ := os.ReadFile(marker)
	Prepare(root, proSpec())
	if again, _ := os.ReadFile(marker); string(again) != string(first) {
		t.Fatal("an unchanged skill keeps its record")
	}
	// The skill changes upstream: a new file.
	write(t, filepath.Join(root, ".claude", "skills", "pro", "data", "new.csv"), "a,b\n")
	Prepare(root, proSpec())
	if _, err := os.Stat(filepath.Join(root, "pro", "data", "new.csv")); err != nil {
		t.Fatalf("the copy must follow the update: %v", err)
	}
	// The corrections change with a new version of the app.
	spec := proSpec()
	spec.Fixes[0].New = "${SESHAT_SKILL_DIR}/other"
	Prepare(root, spec)
	copied, _ := os.ReadFile(filepath.Join(root, "pro", "SKILL.md"))
	if !strings.Contains(string(copied), "${SESHAT_SKILL_DIR}/other") {
		t.Fatalf("new corrections must be applied: %s", copied)
	}
}

func TestPrepareSaysWhenACorrectionNoLongerFits(t *testing.T) {
	root := hiddenSkillRepo(t)
	write(t, filepath.Join(root, ".claude", "skills", "pro", "SKILL.md"), "---\nname: pro\n---\nThe text was rewritten upstream.\n")
	warnings := Prepare(root, proSpec())
	if len(warnings) != 1 || !strings.Contains(warnings[0], "changed upstream") || !strings.Contains(warnings[0], "path of a Claude plugin") {
		t.Fatalf("a correction that no longer fits is reported with its reason, got %v", warnings)
	}
	if _, err := os.Stat(filepath.Join(root, "pro", "SKILL.md")); err != nil {
		t.Fatal("the skill is still installed: it works as it was written")
	}
}

func TestPrepareNeverReplacesAFolderThatBelongsToTheRepository(t *testing.T) {
	root := hiddenSkillRepo(t)
	write(t, filepath.Join(root, "pro", "mine.txt"), "keep")
	warnings := Prepare(root, proSpec())
	if len(warnings) != 1 || !strings.Contains(warnings[0], "left alone") {
		t.Fatalf("got %v", warnings)
	}
	if data, _ := os.ReadFile(filepath.Join(root, "pro", "mine.txt")); string(data) != "keep" {
		t.Fatal("the folder of the repository was changed")
	}
}

func TestPrepareRefusesPathsOutsideTheRepository(t *testing.T) {
	root := hiddenSkillRepo(t)
	for _, item := range []Expose{{From: "../outside", To: "pro"}, {From: ".claude/skills/pro", To: "../escape"}, {From: ".claude/skills/pro", To: "."}} {
		if warnings := Prepare(root, Spec{Expose: []Expose{item}}); len(warnings) != 1 {
			t.Fatalf("%+v must be refused, got %v", item, warnings)
		}
	}
}

func TestSkillThatOnlyUsesThePythonLibraryGetsAnEnvironmentAnyway(t *testing.T) {
	rec := pretendMachine(t, "uv-tool", nil)
	root := hiddenSkillRepo(t)
	spec := proSpec()
	spec.PythonRequired = true
	Prepare(root, spec)
	plan := Detect(root, spec)
	if plan.Python == nil || !plan.Python.Found || len(plan.Python.Packages) != 0 || !plan.Ready() {
		t.Fatalf("a Python plan with no package is expected, got %+v", plan)
	}
	if err := Environment(context.Background(), root, t.TempDir(), spec, plan); err != nil {
		t.Fatal(err)
	}
	if rec.ran("pip", "install") {
		t.Fatalf("nothing is installed when there is no package: %v", rec.lines())
	}
	install, ok := skillsloader.LoadRepoInstall(root)
	if !ok || install.Python == "" || install.Pending {
		t.Fatalf("the interpreter must be recorded so that the agent runs the scripts with it, got %+v", install)
	}
}

func TestWithNoPythonOnTheMachineUvDownloadsOne(t *testing.T) {
	rec := pretendMachine(t, "uv-tool", nil)
	old := findPython
	findPython = func(string) (interpreter, error) {
		return interpreter{}, errors.New("python 3.10 or newer was not found")
	}
	t.Cleanup(func() { findPython = old })
	root := hiddenSkillRepo(t)
	spec := proSpec()
	spec.PythonRequired = true
	plan := Detect(root, spec)
	if plan.Python == nil || plan.Python.Found || !plan.Python.Managed || !plan.Ready() || len(plan.Warnings) != 0 {
		t.Fatalf("uv must be offered instead of a warning, got %+v", plan)
	}
	if len(plan.Notes) == 0 || !strings.Contains(plan.Notes[len(plan.Notes)-1], "uv will download") {
		t.Fatalf("the person is told before agreeing, got %v", plan.Notes)
	}
	if err := Environment(context.Background(), root, t.TempDir(), spec, plan); err != nil {
		t.Fatal(err)
	}
	if !rec.ran("uv-tool", "venv", "--python", "3.12") {
		t.Fatalf("uv must make the environment with a Python it downloads: %v", rec.lines())
	}
	if install, ok := skillsloader.LoadRepoInstall(root); !ok || install.Python == "" {
		t.Fatalf("got %+v", install)
	}
}

func TestWithNoPythonAndNoUvThePersonIsToldToInstallPython(t *testing.T) {
	pretendMachine(t, "", nil)
	t.Setenv(EnvUV, "off")
	old := findPython
	findPython = func(string) (interpreter, error) {
		return interpreter{}, errors.New("python 3.10 or newer was not found")
	}
	t.Cleanup(func() { findPython = old })
	plan := Detect(t.TempDir(), Spec{PythonRequired: true})
	if plan.Ready() || len(plan.Warnings) == 0 {
		t.Fatalf("without uv the person must install Python: %+v", plan)
	}
}

func TestManagedPythonVersionFollowsTheMinimum(t *testing.T) {
	for minimum, want := range map[string]string{"3.8": "3.12", "3.10": "3.12", "3.12": "3.12", "3.13": "3.13"} {
		if got := managedPythonVersion(minimum); got != want {
			t.Fatalf("%s: got %s, want %s", minimum, got, want)
		}
	}
}
