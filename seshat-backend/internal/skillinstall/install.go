package skillinstall

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"time"

	skillsloader "github.com/KPO-Tech/seshat-runtime/pkg/skills"
)

// installLimit bounds one installation: a large scientific stack can take a while on a slow line.
const installLimit = 25 * time.Minute

// Progress is told where an installation is. A nil Progress is allowed: the installation then says nothing.
type Progress interface {
	// Step says which part starts, and which one it is out of how many.
	Step(index, count int, name string)
	// Detail says what is being done now: a line printed by pip, uv or npm.
	Detail(line string)
}

// stepCount is how many parts an installation has: getting the tools, creating the environment, installing the packages, recording the result.
const stepCount = 4

// WriteInstall records, beside the cloned repository, what the person chose and the environment made for it (the runtime reads it).
func WriteInstall(repoRoot string, install skillsloader.RepoInstall) error {
	data, err := json.MarshalIndent(install, "", "  ")
	if err != nil {
		return err
	}
	part := filepath.Join(repoRoot, skillsloader.RepoInstallFile+".part")
	if err := os.WriteFile(part, data, 0o644); err != nil {
		return fmt.Errorf("write install file: %w", err)
	}
	return os.Rename(part, filepath.Join(repoRoot, skillsloader.RepoInstallFile))
}

// Environment makes the environment of a repository without reporting where it is; see EnvironmentWith.
func Environment(ctx context.Context, repoRoot, envDir string, spec Spec, plan Plan) error {
	return EnvironmentWith(ctx, repoRoot, envDir, spec, plan, nil)
}

// EnvironmentWith makes the Python environment and the Node packages the plan names, in envDir (outside the repository, so that the folders
// of the skills stay small to read), then records them as ready. Nothing of the repository is run: only the packages are installed, and the
// install scripts of Node packages are left out. The Python and the Node packages are installed at the same time, and the first to fail
// stops the other. What the programs print is passed on to progress as it is printed.
func EnvironmentWith(ctx context.Context, repoRoot, envDir string, spec Spec, plan Plan, progress Progress) error {
	ctx, cancel := context.WithTimeout(ctx, installLimit)
	defer cancel()
	if progress != nil {
		ctx = withLines(ctx, progress.Detail)
	}
	step := func(index int, name string) {
		if progress != nil {
			progress.Step(index, stepCount, name)
		}
	}
	if !plan.Ready() {
		return fmt.Errorf("a tool this repository needs is missing: %s", strings.Join(plan.Warnings, " "))
	}
	install := skillsloader.RepoInstall{Include: spec.Include, Pending: true}
	if err := os.MkdirAll(envDir, 0o755); err != nil {
		return fmt.Errorf("create environment folder: %w", err)
	}

	var pyEnv *pythonEnv
	if plan.Python != nil {
		step(1, "Getting the tools")
		base, err := findPython(plan.Python.Minimum)
		if err != nil {
			return err
		}
		pyEnv = &pythonEnv{base: base, venv: filepath.Join(envDir, "python")}
		if uv, ok := ensureUV(ctx, progress); ok {
			pyEnv.uv = uv
		}
		step(2, "Creating the environment")
		if err := pyEnv.create(ctx); err != nil {
			return err
		}
	}

	step(3, "Installing the packages")
	var (
		wg    sync.WaitGroup
		once  sync.Once
		first error
	)
	fail := func(err error) {
		once.Do(func() {
			first = err
			cancel()
		})
	}
	if pyEnv != nil {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if err := pyEnv.install(ctx, repoRoot, requirementArgs(repoRoot, plan.Python.Files, spec.PythonPackages)); err != nil {
				fail(err)
				return
			}
			install.Python = venvPython(pyEnv.venv)
		}()
	}
	if plan.Node != nil {
		wg.Add(1)
		go func() {
			defer wg.Done()
			modules, err := makeNode(ctx, envDir, plan.Node.Packages, repoRoot, spec.Include)
			if err != nil {
				fail(err)
				return
			}
			install.NodeModules = modules
		}()
	}
	wg.Wait()
	if first != nil {
		return first
	}

	step(4, "Finishing")
	install.Pending = false
	return WriteInstall(repoRoot, install)
}

func venvPython(venv string) string {
	if runtime.GOOS == "windows" {
		return filepath.Join(venv, "Scripts", "python.exe")
	}
	return filepath.Join(venv, "bin", "python")
}

func failure(step, output string, err error) error {
	lines := strings.Split(strings.TrimSpace(output), "\n")
	if len(lines) > 12 {
		lines = lines[len(lines)-12:]
	}
	return fmt.Errorf("%s failed: %w\n%s", step, err, strings.Join(lines, "\n"))
}

// requirementArgs turns the requirement files and the packages of the catalog into the arguments of one install, so that the packages are
// resolved together: one run cannot pick a version that the next one then has to undo.
func requirementArgs(repoRoot string, files, packages []string) []string {
	var args []string
	for _, file := range files {
		args = append(args, "-r", filepath.Join(repoRoot, filepath.FromSlash(file)))
	}
	return append(args, packages...)
}

// pythonEnv is the Python environment of one repository. uv, when there is one, makes it and fills it from the shared cache; pip does it
// otherwise, and takes over when uv cannot make the environment.
type pythonEnv struct {
	base interpreter
	venv string
	uv   string
}

// works reports whether an environment left by an earlier attempt can still run, so that a second attempt keeps what was installed.
func (e *pythonEnv) works(ctx context.Context) bool {
	python := venvPython(e.venv)
	if _, err := os.Stat(python); err != nil {
		return false
	}
	check, cancel := context.WithTimeout(ctx, 20*time.Second)
	defer cancel()
	_, err := runCommand(check, "", nil, python, "-c", "pass")
	return err == nil
}

func (e *pythonEnv) create(ctx context.Context) error {
	if e.works(ctx) {
		return nil
	}
	_ = os.RemoveAll(e.venv)
	if e.uv != "" && e.base.executable != "" {
		// pip is put in the environment, as skills may call it.
		if _, err := runCommand(ctx, "", uvEnv(), e.uv, "venv", "--seed", "--python", e.base.executable, e.venv); err == nil {
			return nil
		}
		// Only a uv that could not make the environment gives way to pip; a package that cannot be installed fails the same way with pip.
		_ = os.RemoveAll(e.venv)
		e.uv = ""
	}
	if out, err := runCommand(ctx, "", nil, e.base.command[0], append(e.base.command[1:], "-m", "venv", e.venv)...); err != nil {
		return failure("creating the Python environment", out, err)
	}
	return nil
}

func (e *pythonEnv) install(ctx context.Context, repoRoot string, args []string) error {
	python := venvPython(e.venv)
	if e.uv != "" {
		if out, err := runCommand(ctx, repoRoot, uvEnv(), e.uv, append([]string{"pip", "install", "--python", python}, args...)...); err != nil {
			return failure("installing the Python packages", out, err)
		}
		return nil
	}
	pip := []string{"-m", "pip", "install", "--disable-pip-version-check", "--no-input", "--prefer-binary"}
	if out, err := runCommand(ctx, repoRoot, nil, python, append(pip, args...)...); err != nil {
		return failure("installing the Python packages", out, err)
	}
	return nil
}

func makeNode(ctx context.Context, envDir string, packages []string, repoRoot string, include []string) (string, error) {
	nodeDir := filepath.Join(envDir, "node")
	if err := os.MkdirAll(nodeDir, 0o755); err != nil {
		return "", err
	}
	// The dependencies are read again from the manifests of the chosen skills, with their versions, and written to a manifest of their own.
	dependencies := map[string]string{}
	for _, dir := range skillDirs(repoRoot, include) {
		if file := nearest(repoRoot, dir, "package.json"); file != "" {
			for name, version := range nodeDependencyVersions(file) {
				dependencies[name] = version
			}
		}
	}
	for _, name := range packages {
		if _, ok := dependencies[name]; !ok {
			dependencies[name] = "*"
		}
	}
	manifest, _ := json.MarshalIndent(map[string]any{"name": "seshat-skill-env", "private": true, "dependencies": dependencies}, "", "  ")
	if err := os.WriteFile(filepath.Join(nodeDir, "package.json"), manifest, 0o644); err != nil {
		return "", err
	}
	npm := "npm"
	if out, err := runCommand(ctx, nodeDir, nil, npm, "install", "--ignore-scripts", "--no-audit", "--no-fund", "--omit=dev", "--prefer-offline", "--loglevel=error"); err != nil {
		return "", failure("installing the Node packages", out, err)
	}
	return filepath.Join(nodeDir, "node_modules"), nil
}

func nodeDependencyVersions(path string) map[string]string {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil
	}
	var manifest struct {
		Dependencies map[string]string `json:"dependencies"`
	}
	if json.Unmarshal(data, &manifest) != nil {
		return nil
	}
	return manifest.Dependencies
}
