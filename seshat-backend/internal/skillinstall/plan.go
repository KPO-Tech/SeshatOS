// Package skillinstall prepares what a skill repository needs on the machine: it reads what the repository asks for, tells the person before
// anything is installed, and then makes an environment of its own for it (a Python one, Node packages), so that the skills work and
// two repositories never share packages.
package skillinstall

import (
	"encoding/json"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

// Plan is what installing a repository will put on the machine, as it is shown to the person before they agree.
type Plan struct {
	Python *PythonPlan `json:"python,omitempty"`
	Node   *NodePlan   `json:"node,omitempty"`
	// Warnings are things to know before agreeing (a licence, a tool that is needed and not installed here).
	Warnings []string `json:"warnings,omitempty"`
}

// Empty reports whether the repository needs nothing installed.
func (p Plan) Empty() bool { return p.Python == nil && p.Node == nil }

// Ready reports whether the tools the plan needs were found on the machine.
func (p Plan) Ready() bool {
	return (p.Python == nil || p.Python.Found) && (p.Node == nil || p.Node.Found)
}

// PythonPlan is the Python environment to make.
type PythonPlan struct {
	// Minimum is the oldest Python the skills accept ("3.10").
	Minimum string `json:"minimum"`
	Found   bool   `json:"found"`
	// Version is the Python that will be used, when one was found.
	Version string `json:"version,omitempty"`
	// Files are the requirement files of the repository that will be read, relative to it.
	Files []string `json:"files,omitempty"`
	// Packages are the packages that will be installed, as named in the files and by the catalog.
	Packages []string `json:"packages"`
}

// NodePlan is the Node packages to install.
type NodePlan struct {
	Found    bool     `json:"found"`
	Version  string   `json:"version,omitempty"`
	Packages []string `json:"packages"`
}

// Spec is what the catalog says about a repository, on top of what its own files say.
type Spec struct {
	// Include is the skills chosen, by folder name; empty means every skill.
	Include []string
	// PythonMinimum is the oldest Python the skills accept; "3.10" when empty.
	PythonMinimum string
	// PythonPackages are packages the skills use and the repository does not list in a file.
	PythonPackages []string
}

const defaultPythonMinimum = "3.10"

// licenceNotes names the packages whose licence deserves a word before they are installed.
var licenceNotes = map[string]string{
	"pymupdf": "PyMuPDF is licensed under the AGPL-3.0: read its terms before you redistribute anything that contains it.",
}

// skillDirs returns the folders of the skills that were chosen: every folder that holds a SKILL.md, or only the ones named in include.
func skillDirs(repoRoot string, include []string) []string {
	repoRoot = filepath.Clean(repoRoot)
	want := map[string]bool{}
	for _, name := range include {
		want[strings.ToLower(name)] = true
	}
	var dirs []string
	_ = filepath.WalkDir(repoRoot, func(path string, entry os.DirEntry, err error) error {
		if err != nil {
			return nil
		}
		if entry.IsDir() {
			switch entry.Name() {
			case "node_modules", "venv", "__pycache__":
				return filepath.SkipDir
			}
			// Hidden folders (.git, .codex-marketplace...) hold copies and tools, not the skills that were chosen.
			if path != repoRoot && strings.HasPrefix(entry.Name(), ".") {
				return filepath.SkipDir
			}
			return nil
		}
		if !strings.EqualFold(entry.Name(), "SKILL.md") {
			return nil
		}
		dir := filepath.Dir(path)
		if len(want) == 0 || want[strings.ToLower(filepath.Base(dir))] || (dir == repoRoot && want[strings.ToLower(filepath.Base(repoRoot))]) {
			dirs = append(dirs, dir)
		}
		return nil
	})
	return dirs
}

// nearest finds the file called name in dir or the closest folder above it that is still inside the repository.
func nearest(repoRoot, dir, name string) string {
	repoRoot, dir = filepath.Clean(repoRoot), filepath.Clean(dir)
	for {
		candidate := filepath.Join(dir, name)
		if info, err := os.Stat(candidate); err == nil && !info.IsDir() {
			return candidate
		}
		if dir == repoRoot || !strings.HasPrefix(dir, repoRoot) {
			return ""
		}
		dir = filepath.Dir(dir)
	}
}

// requirementName gives the package a requirements line is about, or "" for a comment, an option or a blank line.
func requirementName(line string) string {
	line = strings.TrimSpace(line)
	if at := strings.Index(line, " #"); at >= 0 {
		line = strings.TrimSpace(line[:at])
	}
	if line == "" || strings.HasPrefix(line, "#") || strings.HasPrefix(line, "-") {
		return ""
	}
	end := strings.IndexAny(line, "=<>~!;[ @")
	if end < 0 {
		end = len(line)
	}
	return strings.TrimSpace(line[:end])
}

func readRequirements(path string) []string {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil
	}
	var names []string
	for _, line := range strings.Split(strings.ReplaceAll(string(data), "\r\n", "\n"), "\n") {
		if name := requirementName(line); name != "" {
			names = append(names, name)
		}
	}
	return names
}

func readNodeDependencies(path string) []string {
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
	var names []string
	for name := range manifest.Dependencies {
		names = append(names, name)
	}
	sort.Strings(names)
	return names
}

func uniqueSorted(values []string) []string {
	seen := map[string]bool{}
	var out []string
	for _, value := range values {
		key := strings.ToLower(value)
		if value == "" || seen[key] {
			continue
		}
		seen[key] = true
		out = append(out, value)
	}
	sort.Slice(out, func(i, j int) bool { return strings.ToLower(out[i]) < strings.ToLower(out[j]) })
	return out
}

// Detect reads what the chosen skills of a cloned repository ask for. It runs nothing, and it looks for the tools on the machine only to say
// whether they are there.
func Detect(repoRoot string, spec Spec) Plan {
	var plan Plan
	var files, packages, nodePackages []string
	for _, dir := range skillDirs(repoRoot, spec.Include) {
		if file := nearest(repoRoot, dir, "requirements.txt"); file != "" {
			rel, err := filepath.Rel(repoRoot, file)
			if err == nil {
				files = append(files, filepath.ToSlash(rel))
			}
			packages = append(packages, readRequirements(file)...)
		}
		if file := nearest(repoRoot, dir, "package.json"); file != "" {
			nodePackages = append(nodePackages, readNodeDependencies(file)...)
		}
	}
	packages = append(packages, spec.PythonPackages...)
	files, packages, nodePackages = uniqueSorted(files), uniqueSorted(packages), uniqueSorted(nodePackages)

	if len(packages) > 0 {
		minimum := spec.PythonMinimum
		if minimum == "" {
			minimum = defaultPythonMinimum
		}
		python := &PythonPlan{Minimum: minimum, Files: files, Packages: packages}
		if interpreter, err := findPython(minimum); err == nil {
			python.Found, python.Version = true, interpreter.version
		} else {
			plan.Warnings = append(plan.Warnings, "Python "+minimum+" or newer was not found on this machine: install it, then try again.")
		}
		plan.Python = python
		for _, name := range packages {
			if note, ok := licenceNotes[strings.ToLower(name)]; ok {
				plan.Warnings = append(plan.Warnings, note)
			}
		}
	}
	if len(nodePackages) > 0 {
		node := &NodePlan{Packages: nodePackages}
		if version, err := nodeVersion(); err == nil {
			node.Found, node.Version = true, version
		} else {
			plan.Warnings = append(plan.Warnings, "Node.js was not found on this machine: install it, then try again.")
		}
		plan.Node = node
		for _, name := range nodePackages {
			if strings.EqualFold(name, "puppeteer") {
				plan.Warnings = append(plan.Warnings, "Install scripts of Node packages are not run, so puppeteer will not download its browser: skills that make PDFs with it need one installed on the machine.")
			}
		}
	}
	return plan
}

// MissingSkills returns the chosen skills (by folder name) that the repository does not hold: a catalog check, run when an entry is written.
func MissingSkills(repoRoot string, include []string) []string {
	held := map[string]bool{}
	for _, dir := range skillDirs(repoRoot, nil) {
		held[strings.ToLower(filepath.Base(dir))] = true
	}
	var missing []string
	for _, name := range include {
		if !held[strings.ToLower(name)] {
			missing = append(missing, name)
		}
	}
	return missing
}
