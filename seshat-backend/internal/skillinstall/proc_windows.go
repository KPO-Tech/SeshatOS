//go:build windows

package skillinstall

import (
	"os/exec"
	"syscall"
)

// hideWindow keeps the console window of a child process from flashing on screen.
func hideWindow(cmd *exec.Cmd) {
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true, CreationFlags: 0x08000000}
}
