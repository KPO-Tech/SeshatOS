// Package cloudhooks fetches an organization's shared PreToolUse hook
// catalog from seshat-server, so a connected seshat-backend can offer them
// to its user without the org having to distribute a shell script by hand.
// Execution never moves to seshat-server - this is config only, mirroring
// cloudmcp exactly. A hook in this catalog is never auto-run: the local
// user must explicitly approve each one first (see
// internal/hooks.Service.ApproveOrgHook), since it's a shell command that
// will execute on the user's own machine before matching tool calls - an
// even more automatic, less visible action than an MCP stdio server, which
// is at least a discrete, one-time spawn rather than something firing on
// every tool call silently.
package cloudhooks

// HookConfig mirrors seshat-server's hookregistry.HookConfig.
type HookConfig struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Matcher     string `json:"matcher,omitempty"`
	Command     string `json:"command"`
	TimeoutSecs int    `json:"timeout_secs"`
}

type resolveResponse struct {
	HookConfigs []HookConfig `json:"hook_configs"`
}
