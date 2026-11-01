//go:build !windows

package skillinstall

import (
	"os/exec"
	"syscall"
	"time"
)

func hideWindow(*exec.Cmd) {}

// stopWithChildren makes cancelling the context end the program and everything it started: git runs git-remote-https, pip runs its builds,
// and killing only the first leaves the others writing in the folder that is about to be removed.
func stopWithChildren(cmd *exec.Cmd) {
	if cmd.SysProcAttr == nil {
		cmd.SysProcAttr = &syscall.SysProcAttr{}
	}
	cmd.SysProcAttr.Setpgid = true
	cmd.Cancel = func() error {
		_ = syscall.Kill(-cmd.Process.Pid, syscall.SIGKILL)
		return cmd.Process.Kill()
	}
	cmd.WaitDelay = 5 * time.Second
}
