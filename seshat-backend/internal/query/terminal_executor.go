package query

import (
	"context"
	"fmt"

	"github.com/KPO-Tech/seshat/pkg/sdk"
)

// terminalRemoteExecutor adapts TerminalRelay to sdk.RemoteExecutor so a
// session's bash-tool calls can be routed through Electron's real, visible
// terminal instead of the engine's local subprocess. One instance per
// session, registered on the sdk.Session via SetRemoteExecutor.
type terminalRemoteExecutor struct {
	relay     *TerminalRelay
	sessionID string
}

func (e *terminalRemoteExecutor) Run(ctx context.Context, req sdk.RemoteExecRequest) (sdk.RemoteExecResult, error) {
	res, err := e.relay.Run(ctx, e.sessionID, req.Command, req.WorkDir)
	if err != nil {
		return sdk.RemoteExecResult{}, err
	}
	return sdk.RemoteExecResult{
		Stdout:   res.Stdout,
		Stderr:   res.Stderr,
		ExitCode: res.ExitCode,
		Cwd:      res.Cwd,
	}, nil
}

func (e *terminalRemoteExecutor) Kind() sdk.RemoteExecKind {
	return sdk.RemoteExecKindRemote
}

func (e *terminalRemoteExecutor) Healthy(_ context.Context) error {
	if !e.relay.Available(e.sessionID) {
		return fmt.Errorf("no terminal relay connection for session %s", e.sessionID)
	}
	return nil
}
