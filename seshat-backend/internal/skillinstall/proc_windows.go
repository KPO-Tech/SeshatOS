//go:build windows

package skillinstall

import (
	"os/exec"
	"strconv"
	"syscall"
	"time"
)

// hideWindow keeps the console window of a child process from flashing on screen.
func hideWindow(cmd *exec.Cmd) {
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true, CreationFlags: 0x08000000}
}

// stopWithChildren makes cancelling the context end the program and everything it started: git runs git-remote-https, pip runs its builds,
// and killing only the first leaves the others writing in the folder that is about to be removed.
func stopWithChildren(cmd *exec.Cmd) {
	cmd.Cancel = func() error {
		kill := exec.Command("taskkill", "/T", "/F", "/PID", strconv.Itoa(cmd.Process.Pid))
		kill.SysProcAttr = &syscall.SysProcAttr{HideWindow: true, CreationFlags: 0x08000000}
		_ = kill.Run()
		return cmd.Process.Kill()
	}
	cmd.WaitDelay = 5 * time.Second
}
