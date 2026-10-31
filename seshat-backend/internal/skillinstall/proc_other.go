//go:build !windows

package skillinstall

import "os/exec"

func hideWindow(*exec.Cmd) {}
