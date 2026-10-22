package config

import (
	"slices"

	knowledgeTools "github.com/KPO-Tech/SeshatOS/seshat-backend/internal/knowledge/tool"
	"github.com/KPO-Tech/seshat-runtime/pkg/sdk"
)

// desktopMainAgentTools returns the tools the desktop agent has loaded at every request: the runtime's profile for a general
// agent in a company setting, plus the one tool this application registers itself, knowledge search. A tool that is in neither
// this list nor desktopMainAgentDeferredTools is not offered to the agent at all, so a tool added by this application must be
// added here.
func desktopMainAgentTools() []string {
	tools := sdk.EnterpriseAgentTools()
	if !slices.Contains(tools, knowledgeTools.ToolName) {
		tools = append(tools, knowledgeTools.ToolName)
	}
	return tools
}

// desktopMainAgentDeferredTools returns the tools the desktop agent finds with tool_search when it needs them. MCP tools are
// deferred by the runtime and found the same way.
func desktopMainAgentDeferredTools() []string {
	return sdk.EnterpriseAgentDeferredTools()
}
