package skillinstall

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
)

// exposedMarker is written in a folder that Prepare made, so that it is only ever replaced by Prepare and never a folder that belongs to the
// repository.
const exposedMarker = ".seshat-exposed"

// Expose says where a skill of a repository really lives and where Seshat reads it. Many repositories keep their skills in a hidden folder
// (.claude/skills, .agents/skills) that the installers and the loader skip on purpose, because such folders hold copies for other tools.
type Expose struct {
	// From is the folder of the skill in the repository, relative to its root ("/" separators).
	From string
	// To is the folder made for it at the top of the repository: its name is the name of the skill.
	To string
}

// Fix is a correction of a text file of an exposed skill. It replaces text instead of applying a diff: it still applies after the skill
// changes elsewhere, and when the text it looks for is gone it says so instead of breaking.
type Fix struct {
	// In is the To folder of the exposed skill.
	In string
	// File is the file to correct, relative to that folder.
	File string
	// Old is the text to find and New the text that replaces every occurrence of it.
	Old, New string
	// Why says in a few words what is wrong, for the person who reads the warning.
	Why string
}

// Prepare makes the skills of a repository readable by Seshat and corrects them: each Expose is copied to its To folder, then the Fixes are
// applied to the copy. The repository itself is never changed, so that updating it from its source (git pull) never meets a local change;
// Prepare is run again after each update to refresh the copies. It returns what could not be done, never an error that stops the install:
// a skill that did not change upstream keeps working, one that did is reported.
func Prepare(repoRoot string, spec Spec) []string {
	var warnings []string
	if len(spec.Expose) == 0 {
		return nil
	}
	repoRoot = filepath.Clean(repoRoot)
	fixesPrint := fingerprintOf(spec)
	for _, item := range spec.Expose {
		src, okSrc := insideRepo(repoRoot, item.From)
		dst, okDst := insideRepo(repoRoot, item.To)
		if !okSrc || !okDst || dst == repoRoot {
			warnings = append(warnings, fmt.Sprintf("skill %q: its folders are not inside the repository", item.To))
			continue
		}
		if info, err := os.Stat(src); err != nil || !info.IsDir() {
			warnings = append(warnings, fmt.Sprintf("skill %q: %q was not found in the repository (it may have moved)", item.To, item.From))
			continue
		}
		current := sourceFingerprint(src) + fixesPrint
		if recorded, err := os.ReadFile(filepath.Join(dst, exposedMarker)); err == nil {
			if string(recorded) == current {
				continue
			}
		} else if _, err := os.Stat(dst); err == nil {
			warnings = append(warnings, fmt.Sprintf("skill %q: a folder of that name already belongs to the repository, it was left alone", item.To))
			continue
		}
		if err := os.RemoveAll(dst); err != nil {
			warnings = append(warnings, fmt.Sprintf("skill %q: could not replace its copy: %v", item.To, err))
			continue
		}
		if err := copyTree(src, dst); err != nil {
			_ = os.RemoveAll(dst)
			warnings = append(warnings, fmt.Sprintf("skill %q: could not copy it: %v", item.To, err))
			continue
		}
		warnings = append(warnings, applyFixes(dst, item.To, spec.Fixes)...)
		if err := os.WriteFile(filepath.Join(dst, exposedMarker), []byte(current), 0o644); err != nil {
			warnings = append(warnings, fmt.Sprintf("skill %q: could not record its copy: %v", item.To, err))
		}
	}
	return warnings
}

func applyFixes(dst, name string, fixes []Fix) []string {
	var warnings []string
	for _, fix := range fixes {
		if fix.In != name {
			continue
		}
		file, ok := insideRepo(dst, fix.File)
		if !ok || file == dst {
			warnings = append(warnings, fmt.Sprintf("skill %q: a correction names a file outside the skill (%s)", name, fix.File))
			continue
		}
		data, err := os.ReadFile(file)
		if err != nil {
			warnings = append(warnings, fmt.Sprintf("skill %q: %s was not found, so a correction was not applied (%s)", name, fix.File, fix.Why))
			continue
		}
		text := string(data)
		if !strings.Contains(text, fix.Old) {
			warnings = append(warnings, fmt.Sprintf("skill %q: the text to correct in %s is gone (the skill changed upstream), so the correction was not applied (%s)", name, fix.File, fix.Why))
			continue
		}
		// #nosec G703 -- file is inside the copy made above: insideRepo refuses any path that leaves it
		if err := os.WriteFile(file, []byte(strings.ReplaceAll(text, fix.Old, fix.New)), 0o644); err != nil {
			warnings = append(warnings, fmt.Sprintf("skill %q: could not correct %s: %v", name, fix.File, err))
		}
	}
	return warnings
}

// insideRepo joins a relative path to root and says whether the result stays inside it.
func insideRepo(root, rel string) (string, bool) {
	rel = filepath.FromSlash(strings.TrimSpace(rel))
	if rel == "" || filepath.IsAbs(rel) {
		return "", false
	}
	path := filepath.Join(root, rel)
	back, err := filepath.Rel(root, path)
	if err != nil || back == ".." || strings.HasPrefix(back, ".."+string(filepath.Separator)) {
		return "", false
	}
	return path, true
}

// fingerprintOf identifies the corrections, so that a new version of the app that changes them refreshes the copies.
func fingerprintOf(spec Spec) string {
	hash := sha256.New()
	for _, fix := range spec.Fixes {
		fmt.Fprintf(hash, "%s\x00%s\x00%s\x00%s\x00", fix.In, fix.File, fix.Old, fix.New)
	}
	return hex.EncodeToString(hash.Sum(nil))[:16]
}

// sourceFingerprint identifies the state of a folder by the size and the date of its files, so that a copy is only redone when the skill
// changed.
func sourceFingerprint(dir string) string {
	var count, size, newest int64
	_ = filepath.WalkDir(dir, func(path string, entry fs.DirEntry, err error) error {
		if err != nil || entry.IsDir() {
			return nil
		}
		if info, err := entry.Info(); err == nil {
			count++
			size += info.Size()
			if stamp := info.ModTime().UnixNano(); stamp > newest {
				newest = stamp
			}
		}
		return nil
	})
	return fmt.Sprintf("%d:%d:%d:", count, size, newest)
}

// copyTree copies a folder, leaving out what a skill never needs to read.
func copyTree(src, dst string) error {
	return filepath.WalkDir(src, func(path string, entry fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		rel, _ := filepath.Rel(src, path)
		if entry.IsDir() {
			switch entry.Name() {
			case "__pycache__", "node_modules", ".git":
				return filepath.SkipDir
			}
			return os.MkdirAll(filepath.Join(dst, rel), 0o755)
		}
		if !entry.Type().IsRegular() {
			return nil
		}
		listed, err := entry.Info()
		if err != nil {
			return err
		}
		// #nosec G122 -- what was opened is compared with the file that was listed (os.SameFile) just below
		in, err := os.Open(path)
		if err != nil {
			return err
		}
		defer in.Close()
		// A repository from the outside can change a file between the listing and the opening, for example for a link to a file of the
		// person: what was opened must be the file that was listed, and a regular one.
		opened, err := in.Stat()
		if err != nil || !opened.Mode().IsRegular() || !os.SameFile(listed, opened) {
			return nil
		}
		out, err := os.OpenFile(filepath.Join(dst, rel), os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o644)
		if err != nil {
			return err
		}
		if _, err := io.Copy(out, in); err != nil {
			_ = out.Close()
			return err
		}
		return out.Close()
	})
}
