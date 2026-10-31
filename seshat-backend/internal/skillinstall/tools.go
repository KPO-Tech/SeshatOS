package skillinstall

import (
	"bytes"
	"context"
	"fmt"
	"os"
	"os/exec"
	"runtime"
	"strconv"
	"strings"
	"time"
)

type interpreter struct {
	// command is the program and its leading arguments ("py", "-3").
	command []string
	version string
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
		out, err := runCommand(ctx, "", nil, command[0], append(command[1:], "-c", "import sys; print(sys.version_info[0], sys.version_info[1], sys.version_info[2])")...)
		cancel()
		if err != nil {
			continue
		}
		fields := strings.Fields(out)
		if len(fields) != 3 {
			continue
		}
		major, _ := strconv.Atoi(fields[0])
		minor, _ := strconv.Atoi(fields[1])
		if major > wantMajor || (major == wantMajor && minor >= wantMinor) {
			return interpreter{command: command, version: strings.Join(fields, ".")}, nil
		}
	}
	return interpreter{}, fmt.Errorf("python %s or newer was not found", minimum)
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
