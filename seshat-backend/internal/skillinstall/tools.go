package skillinstall

import (
	"bytes"
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"time"
)

type interpreter struct {
	// command is the program and its leading arguments ("py", "-3").
	command []string
	version string
	// executable is the full path of the interpreter, which uv takes where the launcher "py -3" has no path; empty when it was not reported.
	executable string
}

// runCommand runs a program and returns what it printed; a variable so that a test can stand in for the machine.
var runCommand = func(ctx context.Context, dir string, env []string, name string, args ...string) (string, error) {
	cmd := exec.CommandContext(ctx, name, args...)
	cmd.Dir = dir
	if env != nil {
		cmd.Env = env
	}
	hideWindow(cmd)
	var out bytes.Buffer
	cmd.Stdout, cmd.Stderr = &out, &out
	err := cmd.Run()
	return out.String(), err
}

// findPython looks for a Python at least as new as minimum ("3.10"); EnvPython names one to use instead of searching.
func findPython(minimum string) (interpreter, error) {
	wantMajor, wantMinor := parseVersion(minimum)
	var candidates [][]string
	if explicit := strings.TrimSpace(os.Getenv(EnvPython)); explicit != "" {
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
		ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
		out, err := runCommand(ctx, "", nil, command[0], append(command[1:], "-c", "import sys; print(sys.version_info[0], sys.version_info[1], sys.version_info[2]); print(sys.executable)")...)
		cancel()
		if err != nil {
			continue
		}
		lines := strings.Split(strings.ReplaceAll(strings.TrimSpace(out), "\r\n", "\n"), "\n")
		fields := strings.Fields(lines[0])
		executable := ""
		if len(lines) > 1 {
			executable = strings.TrimSpace(lines[1])
		}
		if len(fields) != 3 {
			continue
		}
		major, _ := strconv.Atoi(fields[0])
		minor, _ := strconv.Atoi(fields[1])
		if major > wantMajor || (major == wantMajor && minor >= wantMinor) {
			return interpreter{command: command, version: strings.Join(fields, "."), executable: executable}, nil
		}
	}
	return interpreter{}, fmt.Errorf("python %s or newer was not found", minimum)
}

// EnvUV names the uv program to use for the environments of skills, in place of the one found on the machine; "off" keeps pip.
const EnvUV = "SESHAT_SKILL_UV"

// findUV looks for uv, which makes an environment in seconds where pip takes a minute: it links the packages from one shared cache instead of
// unpacking them again for every repository. It is a variable so that a test can stand in for the machine. When there is none, pip does the work.
var findUV = func() (string, bool) {
	var candidates []string
	if explicit := strings.TrimSpace(os.Getenv(EnvUV)); explicit != "" {
		if strings.EqualFold(explicit, "off") {
			return "", false
		}
		candidates = append(candidates, explicit)
	}
	if path, err := exec.LookPath("uv"); err == nil {
		candidates = append(candidates, path)
	}
	if home, err := os.UserHomeDir(); err == nil {
		name := "uv"
		if runtime.GOOS == "windows" {
			name = "uv.exe"
		}
		candidates = append(candidates, filepath.Join(home, ".local", "bin", name), filepath.Join(home, ".cargo", "bin", name))
	}
	for _, candidate := range candidates {
		if info, err := os.Stat(candidate); err != nil || info.IsDir() {
			continue
		}
		ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
		_, err := runCommand(ctx, "", nil, candidate, "--version")
		cancel()
		if err == nil {
			return candidate, true
		}
	}
	return "", false
}

// EnvPython names the Python to use for the environments of skills, in place of the one found on the machine.
const EnvPython = "SESHAT_SKILL_PYTHON"

func parseVersion(text string) (int, int) {
	parts := strings.SplitN(strings.TrimSpace(text), ".", 3)
	major, _ := strconv.Atoi(parts[0])
	minor := 0
	if len(parts) > 1 {
		minor, _ = strconv.Atoi(parts[1])
	}
	return major, minor
}

func nodeVersion() (string, error) {
	path, err := exec.LookPath("node")
	if err != nil {
		return "", err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	out, err := runCommand(ctx, "", nil, path, "--version")
	if err != nil {
		return "", err
	}
	return strings.TrimPrefix(strings.TrimSpace(out), "v"), nil
}
