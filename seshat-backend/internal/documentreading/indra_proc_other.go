//go:build !windows

package documentreading

import "os/exec"

func hideWindow(*exec.Cmd) {}
