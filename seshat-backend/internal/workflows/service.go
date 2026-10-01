// Package workflows runs a static workflow DAG definition (seshat SDK's
// pkg/workflow schema - the same one seshat-ui's Workflows page designs) via
// a short-lived sdk.Client, streaming a result per node as it completes.
//
// This is deliberately a "V1 simple" implementation: no session persistence,
// no quota tracking, no OpenTelemetry tracing, no tool access for workflow
// nodes - each node is a single Ask() call against the caller's default (or
// explicitly chosen) provider. It exists to make the Workflows designer page
// actually runnable; see internal/query for the much more fully-integrated
// chat/session engine this deliberately does not try to match.
package workflows

import (
	"context"
	"time"

	"gopkg.in/yaml.v3"

	backendauth "github.com/EngineerProjects/seshat-ai/seshat-backend/internal/auth"
	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/bkerr"
	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/settings"
	sdkproviders "github.com/KPO-Tech/seshat/pkg/providers"
	"github.com/KPO-Tech/seshat/pkg/sdk"
	sdktypes "github.com/KPO-Tech/seshat/pkg/types"
	"github.com/KPO-Tech/seshat/pkg/workflow"
)

type Service struct {
	settings *settings.Service
}

func New(settingsService *settings.Service) *Service {
	return &Service{settings: settingsService}
}

// RunParams are the caller-supplied inputs for one workflow execution. The
// definition itself is a separate argument to Run, not a field here - it
// must already be parsed (via ParseDefinition) before Run is called.
type RunParams struct {
	// ProviderSettingID selects which configured provider/model to run every
	// node against. Empty uses the caller's default provider.
	ProviderSettingID string
	MaxParallel       int
}

// NodeEvent reports one completed workflow node. Nodes in the same DAG level
// run in parallel, so events can arrive in any order within a level.
type NodeEvent struct {
	ID         string `json:"id"`
	Agent      string `json:"agent,omitempty"`
	Success    bool   `json:"success"`
	Output     string `json:"output,omitempty"`
	Error      string `json:"error,omitempty"`
	DurationMs int64  `json:"duration_ms"`
}

// DoneEvent is the final aggregate result, sent once every node has settled.
type DoneEvent struct {
	Name       string   `json:"name"`
	Success    bool     `json:"success"`
	DurationMs int64    `json:"duration_ms"`
	Order      []string `json:"order"`
}

// ParseDefinition parses raw workflow YAML or JSON text (pkg/workflow.Definition
// accepts both via the same yaml.v3 unmarshaler - JSON is a YAML subset).
func ParseDefinition(text string) (workflow.Definition, error) {
	var def workflow.Definition
	if err := yaml.Unmarshal([]byte(text), &def); err != nil {
		return workflow.Definition{}, bkerr.InvalidInput("invalid workflow definition: "+err.Error(), err)
	}
	return def, nil
}

// Run validates and executes def, invoking onNode once per completed node in
// real time, and returns the final aggregate result once the whole DAG has
// settled. The sdk.Client it builds is closed before Run returns.
func (s *Service) Run(ctx context.Context, principal *backendauth.Principal, def workflow.Definition, params RunParams, onNode func(NodeEvent)) (DoneEvent, error) {
	if err := workflow.Validate(def); err != nil {
		return DoneEvent{}, bkerr.InvalidInput(err.Error(), err)
	}

	resolved, err := s.resolveProvider(ctx, principal, params.ProviderSettingID)
	if err != nil {
		return DoneEvent{}, err
	}

	providerConfig := &sdkproviders.Config{Provider: sdktypes.APIProvider(resolved.Provider), APIKey: resolved.Secret}
	if resolved.BaseURL != "" {
		providerConfig.BaseURL = resolved.BaseURL
	}

	client, err := sdk.NewClient(&sdk.ClientConfig{
		APIKey:                 resolved.Secret,
		Model:                  sdk.ModelIdentifier{Provider: sdktypes.APIProvider(resolved.Provider), Model: resolved.ModelID},
		PermissionMode:         sdk.PermissionModeBypass,
		MaxTokens:              4096,
		AutoCompact:            true,
		PersistSessions:        false,
		DisableTitleGeneration: true,
		EnableMemory:           false,
		EnableHooks:            false,
		EnableMonitoring:       false,
		ProviderConfig:         providerConfig,
	})
	if err != nil {
		return DoneEvent{}, bkerr.Internal("create sdk client: "+err.Error(), err)
	}
	defer client.Close()

	maxParallel := params.MaxParallel
	if maxParallel <= 0 {
		maxParallel = 4
	}

	// No Tools are passed to Ask here (intentionally): workflow nodes are
	// LLM-reasoning-only in this V1, not tool-calling agents - see the
	// workspacechat.RequireSandbox fix for why unconstrained tool access on a
	// server-adjacent execution path needs care this package doesn't yet do.
	executor := workflow.ExecutorFunc(func(execCtx context.Context, node workflow.Node, inputs map[string]workflow.NodeResult) (string, error) {
		started := time.Now()
		response, askErr := client.Ask(execCtx, workflow.BuildNodePrompt(node, inputs), nil)
		evt := NodeEvent{ID: node.ID, Agent: node.Agent, DurationMs: time.Since(started).Milliseconds()}
		if askErr != nil {
			evt.Error = askErr.Error()
			if onNode != nil {
				onNode(evt)
			}
			return "", askErr
		}
		evt.Success = true
		evt.Output = response.Content
		if onNode != nil {
			onNode(evt)
		}
		return response.Content, nil
	})

	result, err := client.RunWorkflow(ctx, def, sdk.WorkflowOptions{MaxParallel: maxParallel, Executor: executor})
	if err != nil {
		return DoneEvent{}, err
	}
	return DoneEvent{
		Name:       result.Name,
		Success:    result.Success,
		DurationMs: result.Duration.Milliseconds(),
		Order:      result.Order,
	}, nil
}

func (s *Service) resolveProvider(ctx context.Context, principal *backendauth.Principal, providerSettingID string) (*settings.ResolvedProviderConfig, error) {
	if s == nil || s.settings == nil {
		return nil, bkerr.Unavailable("provider settings not configured", nil)
	}
	if providerSettingID != "" {
		return s.settings.ResolveRuntimeConfig(ctx, principal, providerSettingID)
	}
	resolved, err := s.settings.ResolveDefaultForUser(ctx, principal)
	if err != nil {
		return nil, err
	}
	if resolved == nil {
		return nil, bkerr.InvalidInput("no default provider configured", nil)
	}
	return resolved, nil
}
