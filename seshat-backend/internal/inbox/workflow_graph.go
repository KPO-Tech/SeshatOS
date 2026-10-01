package inbox

import (
	"context"
	"errors"
	"fmt"
	"log"
	"time"

	"github.com/KPO-Tech/seshat/pkg/automation"
	"github.com/KPO-Tech/seshat/pkg/dataflow"
	"github.com/KPO-Tech/seshat/pkg/workflow"
)

// WorkflowAsker runs one prompt turn as agentSlug on behalf of ownerID,
// threading session continuity across repeated calls: pass sessionID=""
// for the first call in a run, then feed back the returned session id on
// every subsequent call so multiple "agent"/"subworkflow" nodes in one
// Job.Graph share conversation context — the graph-execution counterpart to
// WorkflowExecutor (which only ever needs one call per job). Same
// plain-function-type reasoning as WorkflowExecutor: internal/inbox never
// imports internal/query directly.
type WorkflowAsker func(ctx context.Context, ownerID, agentSlug, prompt, modelOverride, sessionID string) (content, newSessionID string, err error)

// WithWorkflowAsker attaches the closure Job.Graph execution uses for its
// "agent"/"subworkflow" node types (see internal/config/bootstrap.go).
// Nil-tolerant: a workflow whose Graph is set fails clearly at dispatch
// time without it, same posture as WithWorkflowExecutor for the flat-Task
// path.
func (s *Service) WithWorkflowAsker(fn WorkflowAsker) *Service {
	s.askWorkflow = fn
	return s
}

// WithNodeRegistry attaches the pkg/dataflow node types a Job.Graph can
// reference (generic + database, from the SDK — see bootstrap.go for what's
// actually registered). Nil-tolerant, same posture as WithWorkflowAsker.
func (s *Service) WithNodeRegistry(registry *dataflow.Registry) *Service {
	s.nodeRegistry = registry
	return s
}

// NodeTypes lists the node types a Graph on this Service can reference (see
// WithNodeRegistry) — nil-safe, returns nil if no registry is configured.
// Used by internal/inbox/tool.NewCreateWorkflowTool to build the
// inbox_create_workflow tool's node-catalog guidance from whatever's
// actually registered, instead of a hand-maintained list that can drift.
func (s *Service) NodeTypes() []dataflow.NodeDescription {
	if s == nil || s.nodeRegistry == nil {
		return nil
	}
	return s.nodeRegistry.Types()
}

// WithDataflowSecrets attaches the resolver a Graph's credential-needing
// node types (e.g. a "postgres" node's dsnSecretRef) use — see
// internal/dataflowsecrets.Service, which already satisfies
// dataflow.SecretResolver. Nil is valid: a graph using no such node type
// never calls it.
func (s *Service) WithDataflowSecrets(resolver dataflow.SecretResolver) *Service {
	s.graphSecrets = resolver
	return s
}

// runGraphAndRecord is runWorkflowAndRecord's counterpart for job.Graph !=
// nil — same JobRun/RunCount/MaxRuns bookkeeping, different execution
// (dataflow.Run instead of one flat prompt). See WorkflowAsker's doc
// comment for the session-continuity contract its "agent"/"subworkflow"
// nodes rely on.
func (s *Service) runGraphAndRecord(ctx context.Context, job *automation.Job, contextText string) {
	run := &automation.JobRun{
		JobID:     job.ID,
		StartedAt: time.Now(),
		Status:    automation.RunStatusRunning,
	}
	if err := s.workflows.CreateRun(ctx, run); err != nil {
		log.Printf("[inbox] runGraphAndRecord: create run for workflow %s: %v", job.ID, err)
		return
	}

	execCtx := ctx
	if job.MaxDuration > 0 {
		var cancel context.CancelFunc
		execCtx, cancel = context.WithTimeout(ctx, job.MaxDuration)
		defer cancel()
	}

	output, execErr := s.executeGraph(execCtx, job, contextText)

	endedAt := time.Now()
	run.EndedAt = &endedAt
	run.Output = output
	if execErr != nil {
		run.Status = automation.RunStatusError
		if errors.Is(execErr, context.DeadlineExceeded) {
			run.Error = fmt.Sprintf("execution timed out after %s", job.MaxDuration)
		} else {
			run.Error = execErr.Error()
		}
		log.Printf("[inbox] runGraphAndRecord: workflow %q (%s) failed: %v", job.Name, job.ID, execErr)
	} else {
		run.Status = automation.RunStatusSuccess
	}
	if err := s.workflows.UpdateRun(ctx, run); err != nil {
		log.Printf("[inbox] runGraphAndRecord: update run for workflow %s: %v", job.ID, err)
	}

	job.LastRunAt = &endedAt
	job.LastRunStatus = string(run.Status)
	job.RunCount++
	if job.MaxRuns > 0 && job.RunCount >= job.MaxRuns {
		job.Status = automation.JobStatusInactive
	}
	job.UpdatedAt = endedAt
	if err := s.workflows.UpdateJob(ctx, job); err != nil {
		log.Printf("[inbox] runGraphAndRecord: update workflow %s: %v", job.ID, err)
	}
}

// executeGraph seeds the graph's starting nodes with contextText (the
// triggering event's readable text, same content the flat-Task path
// appends below job.Task) as one Item, so a "set"/"if"/"agent" node can
// reference $json.event_context, then runs it and returns a summary string
// for JobRun.Output.
func (s *Service) executeGraph(ctx context.Context, job *automation.Job, contextText string) (string, error) {
	if s.nodeRegistry == nil {
		return "", fmt.Errorf("job has a Graph but no dataflow node registry is configured")
	}
	if s.askWorkflow == nil {
		return "", fmt.Errorf("job has a Graph but no workflow asker is configured")
	}

	asker := &inboxAsker{ask: s.askWorkflow, ownerID: job.OwnerID, modelOverride: job.Agent.Model}
	rt := &dataflow.Runtime{
		Secrets:     s.graphSecrets,
		Agent:       asker,
		Subworkflow: subworkflowAsker{asker: asker},
	}
	input := []dataflow.Item{{"event_context": contextText}}
	result, err := dataflow.Run(ctx, *job.Graph, s.nodeRegistry, rt, input, dataflow.Options{})
	if err != nil {
		return "", fmt.Errorf("run graph: %w", err)
	}
	if !result.Success {
		for _, id := range result.Order {
			if r := result.Results[id]; !r.Success && r.Error != "" {
				return "", fmt.Errorf("graph %q failed at node %q: %s", job.Graph.Name, id, r.Error)
			}
		}
		return "", fmt.Errorf("graph %q failed", job.Graph.Name)
	}
	return summarizeGraphResult(result), nil
}

func summarizeGraphResult(result dataflow.Result) string {
	if len(result.Order) == 0 {
		return ""
	}
	last := result.Results[result.Order[len(result.Order)-1]]
	if len(last.Output) == 0 {
		return ""
	}
	if text, ok := last.Output[0]["text"].(string); ok {
		return text
	}
	return fmt.Sprintf("%v", last.Output[0])
}

// inboxAsker adapts WorkflowAsker to dataflow.AgentCaller, threading
// session continuity (see WorkflowAsker's doc comment) across every "agent"
// node call within one graph run so they share the same conversation.
type inboxAsker struct {
	ask                    WorkflowAsker
	ownerID, modelOverride string
	sessionID              string
}

// tools is accepted for dataflow.AgentCaller's interface but not wired
// through yet - unlike agentSlug (already resolved for real via
// ContextBuildParams.AgentSlug in bootstrap.go's WithWorkflowAsker
// closure), query.ContextBuildParams has no tools/tool-names field today.
// Rather than silently ignore an override a workflow author explicitly
// set, it fails loudly instead (same behavior/reasoning as the SDK's own
// sessionAgentCaller and seshat-server's dataflowAgentCaller). graphTools
// (nodes-as-tools, automation-app-pages.md §37.9) is the same story - not
// wired here either; only the SDK repo's own sessionAgentCaller has real
// support today.
func (a *inboxAsker) Ask(ctx context.Context, agentSlug, prompt string, tools []string, graphTools []dataflow.ToolSpec) (string, error) {
	if len(tools) > 0 {
		return "", fmt.Errorf("dataflow: agent node requested tools=%v, but per-node tool scoping is not implemented yet - omit it to use the workflow's own agent's tools", tools)
	}
	if len(graphTools) > 0 {
		return "", fmt.Errorf("dataflow: agent node has %d node(s) wired as tools, but that's not implemented yet here - omit them to run without graph-node tools", len(graphTools))
	}
	content, sessionID, err := a.ask(ctx, a.ownerID, agentSlug, prompt, a.modelOverride, a.sessionID)
	if err != nil {
		return "", err
	}
	a.sessionID = sessionID
	return content, nil
}

// subworkflowAsker adapts the same asker to dataflow.SubworkflowRunner for
// the "subworkflow" node type, reusing asker's session continuity across
// pkg/workflow's own per-node calls too.
type subworkflowAsker struct{ asker *inboxAsker }

func (r subworkflowAsker) Run(ctx context.Context, def workflow.Definition) (workflow.Result, error) {
	executor := workflow.ExecutorFunc(func(execCtx context.Context, node workflow.Node, inputs map[string]workflow.NodeResult) (string, error) {
		return r.asker.Ask(execCtx, node.Agent, workflow.BuildNodePrompt(node, inputs), nil, nil)
	})
	return workflow.Run(ctx, def, executor, workflow.Options{})
}
