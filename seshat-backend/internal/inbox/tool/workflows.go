package tool

import (
	"context"
	"encoding/json"
	"fmt"
	"sort"
	"strings"

	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/agents"
	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/inbox"
	"github.com/KPO-Tech/seshat/pkg/dataflow"
	"github.com/KPO-Tech/seshat/pkg/tools"
)

// eventFilterDescription documents the $event shape every event_filter
// expression is evaluated against - shared between the create tool's own
// Description and its event_filter parameter so an authoring agent sees it
// in both places.
const eventFilterDescription = `A JavaScript boolean expression evaluated against the triggering message, exposed as $event. Available fields: $event.channel ("gmail" or "whatsapp"), $event.sender, $event.subject (empty for chat-style channels), $event.body, $event.threadStatus, $event.receivedAt (RFC3339). Example: $event.subject.toLowerCase().includes("invoice"). Leave empty to fire on every inbound message.`

// ─── inbox_create_workflow ──────────────────────────────────────────────────

const CreateWorkflowToolName = "inbox_create_workflow"

// graphDescription explains the "graph" alternative to "task" - shared
// between the tool's own Description and the graph parameter's description,
// same reasoning as eventFilterDescription above. %s is filled with the
// live node-type catalog (formatNodeCatalog) so it can never drift from
// what's actually registered (see inbox.Service.NodeTypes).
const graphDescriptionTemplate = `An alternative to "task" for a rule that needs more than one step (deterministic branching/data-shaping, or more than one agent turn) instead of a single flat instruction - mutually exclusive with "task", exactly one of the two is required. A graph is a small node-and-connection program: {name, description?, nodes: [{id, type, parameters?, connections?}]}. Each node has a unique "id" (referenced by other nodes' connections), a "type" selecting what it does, "parameters" specific to that type, and "connections": output port name -> list of downstream node ids (most types only ever use the "main" port; a node with no connections is a terminal step). A node with no incoming connections from any other node runs first, seeded with one item: {"event_context": "<the triggering message, same text task would otherwise receive>"}.

%s
Keep it as simple as the task actually needs - most rules still only need a single "agent" node (equivalent to "task"); reach for multiple nodes only when the rule genuinely branches or needs deterministic steps an LLM turn shouldn't be spent on (e.g. a filter/if before drafting, or a database write after).`

type CreateWorkflowTool struct {
	backend          *inbox.Service
	graphDescription string
}

func NewCreateWorkflowTool(backend *inbox.Service) *CreateWorkflowTool {
	var nodeTypes []dataflow.NodeDescription
	if backend != nil {
		nodeTypes = backend.NodeTypes()
	}
	return &CreateWorkflowTool{
		backend:          backend,
		graphDescription: fmt.Sprintf(graphDescriptionTemplate, formatNodeCatalog(nodeTypes)),
	}
}

// formatNodeCatalog renders the node types a Graph can reference as a
// plain-text list ("- type: description"), sorted for a stable prompt. Each
// dataflow.NodeExecutor's own Description() already documents its
// parameters and output shape inline (see e.g. pkg/dataflow/nodes/http.go),
// so this needs no separate per-type formatting logic here.
func formatNodeCatalog(types []dataflow.NodeDescription) string {
	if len(types) == 0 {
		return "(No node types are registered - \"graph\" is unavailable; use \"task\".)"
	}
	sorted := make([]dataflow.NodeDescription, len(types))
	copy(sorted, types)
	sort.Slice(sorted, func(i, j int) bool { return sorted[i].Type < sorted[j].Type })
	var b strings.Builder
	b.WriteString("Available node types:\n")
	for _, nt := range sorted {
		b.WriteString("- ")
		b.WriteString(nt.Type)
		b.WriteString(": ")
		b.WriteString(nt.Description)
		b.WriteString("\n")
	}
	return b.String()
}

func (t *CreateWorkflowTool) Definition() tools.Definition {
	return tools.Definition{
		Name:        CreateWorkflowToolName,
		DisplayName: "Create Inbox Workflow",
		Description: "Create a standing automation rule: whenever a new inbox message matches a condition, run a task automatically - no further confirmation from the user at trigger time. Use this instead of handling a recurring pattern manually every time it comes up (e.g. \"whenever an invoice email arrives, draft a reply asking for the PO number\"). Runs as this same Inbox Agent with the same tools and the same policy (prefer drafting over sending) each time it fires, so write task/graph as self-contained, since it won't have this conversation's context. " + eventFilterDescription,
		Category:    "inbox",
		InputSchema: tools.FromMap(map[string]any{
			"type": "object",
			"properties": map[string]any{
				"name": map[string]any{
					"type":        "string",
					"description": "Short, human-readable name for the rule (e.g. \"Draft replies to invoice emails\").",
				},
				"description": map[string]any{
					"type":        "string",
					"description": "Optional longer explanation of what this rule does and why.",
				},
				"event_filter": map[string]any{
					"type":        "string",
					"description": eventFilterDescription,
				},
				"task": map[string]any{
					"type":        "string",
					"description": "The self-contained instruction to run each time this rule fires (e.g. \"Draft a reply asking for the PO number and expected payment date.\"). Mutually exclusive with \"graph\" - exactly one of the two is required.",
				},
				"graph": map[string]any{
					"type":        "object",
					"description": t.graphDescription,
					"properties": map[string]any{
						"name":        map[string]any{"type": "string", "description": "Graph name."},
						"description": map[string]any{"type": "string", "description": "Optional graph description."},
						"nodes": map[string]any{
							"type":        "array",
							"description": "The graph's nodes.",
							"items": map[string]any{
								"type": "object",
								"properties": map[string]any{
									"id":          map[string]any{"type": "string", "description": "Stable unique id for this node, referenced by other nodes' connections."},
									"type":        map[string]any{"type": "string", "description": "Node type - see the catalog above."},
									"parameters":  map[string]any{"type": "object", "description": "Node-specific parameters - see the type's own description in the catalog above for what it needs."},
									"connections": map[string]any{"type": "object", "description": "Output port name -> list of downstream node ids. Most types only use \"main\". Omit for a terminal node."},
								},
								"required": []string{"id", "type"},
							},
							"minItems": 1,
						},
					},
					"required": []string{"name", "nodes"},
				},
				"max_runs": map[string]any{
					"type":        "integer",
					"description": "Optional cap on how many times this rule may fire before it deactivates itself. Omit or 0 for unlimited.",
				},
			},
			"required": []string{"name"},
		}),
		IsReadOnly:         false,
		IsConcurrencySafe:  true,
		RequiresPermission: false,
	}
}

func (t *CreateWorkflowTool) Call(ctx context.Context, input tools.CallInput, _ tools.CanUseToolFn) (tools.CallResult, error) {
	principal, err := principalFromContext(ctx)
	if err != nil {
		return tools.NewErrorResult(err), nil
	}
	name := stringInput(input.Parsed, "name")
	if name == "" {
		return tools.NewErrorResult(fmt.Errorf("name is required")), nil
	}
	task := stringInput(input.Parsed, "task")
	graph, err := graphInput(input.Parsed, "graph")
	if err != nil {
		return tools.NewErrorResult(err), nil
	}
	if task == "" && graph == nil {
		return tools.NewErrorResult(fmt.Errorf("task or graph is required")), nil
	}
	if task != "" && graph != nil {
		return tools.NewErrorResult(fmt.Errorf("task and graph are mutually exclusive")), nil
	}
	job, err := t.backend.CreateWorkflow(ctx, principal, inbox.CreateWorkflowParams{
		Name:        name,
		Description: stringInput(input.Parsed, "description"),
		EventFilter: stringInput(input.Parsed, "event_filter"),
		Task:        task,
		Graph:       graph,
		AgentSlug:   agents.InboxAgentSlug,
		MaxRuns:     intInput(input.Parsed, "max_runs"),
	})
	if err != nil {
		return tools.NewErrorResult(err), nil
	}
	result := tools.NewJSONResult(job)
	result.Content = fmt.Sprintf("Created workflow %q (id=%s). It's active now and will fire on the next matching inbound message.", job.Name, job.ID)
	return result, nil
}

// graphInput extracts and decodes the "graph" parameter, if present. Rather
// than hand-walking the decoded map[string]any tree, it round-trips through
// JSON: dataflow.Definition/Node already carry the exact json tags matching
// this schema, so re-marshaling the raw input and unmarshaling into that
// type does the field-by-field work correctly for free (including
// Connections' map[string][]string and Parameters' map[string]any).
func graphInput(input map[string]any, key string) (*dataflow.Definition, error) {
	raw, ok := input[key]
	if !ok || raw == nil {
		return nil, nil
	}
	encoded, err := json.Marshal(raw)
	if err != nil {
		return nil, fmt.Errorf("encode graph: %w", err)
	}
	var def dataflow.Definition
	if err := json.Unmarshal(encoded, &def); err != nil {
		return nil, fmt.Errorf("invalid graph: %w", err)
	}
	return &def, nil
}

func (t *CreateWorkflowTool) Description(_ context.Context) (string, error) {
	return t.Definition().Description, nil
}
func (t *CreateWorkflowTool) ValidateInput(_ context.Context, input map[string]any) (map[string]any, error) {
	return input, nil
}
func (t *CreateWorkflowTool) CheckPermissions(_ context.Context, input map[string]any, _ tools.ToolUseContext) tools.PermissionResult {
	return tools.Passthrough(input)
}
func (t *CreateWorkflowTool) IsConcurrencySafe(_ map[string]any) bool { return true }
func (t *CreateWorkflowTool) IsReadOnly(_ map[string]any) bool        { return false }
func (t *CreateWorkflowTool) IsEnabled() bool                         { return t.backend != nil }
func (t *CreateWorkflowTool) FormatResult(data any) string {
	if s, ok := data.(string); ok {
		return s
	}
	return ""
}
func (t *CreateWorkflowTool) BackfillInput(_ context.Context, input map[string]any) map[string]any {
	return input
}

// ─── inbox_list_workflows ───────────────────────────────────────────────────

const ListWorkflowsToolName = "inbox_list_workflows"

type ListWorkflowsTool struct {
	backend *inbox.Service
}

func NewListWorkflowsTool(backend *inbox.Service) *ListWorkflowsTool {
	return &ListWorkflowsTool{backend: backend}
}

func (t *ListWorkflowsTool) Definition() tools.Definition {
	return tools.Definition{
		Name:        ListWorkflowsToolName,
		DisplayName: "List Inbox Workflows",
		Description: "List the standing automation rules already created for this user's inbox, including whether each is still active and how many times it has fired. Check this before creating a new rule, to avoid creating a duplicate of one that already exists.",
		Category:    "inbox",
		InputSchema: tools.FromMap(map[string]any{
			"type":       "object",
			"properties": map[string]any{},
		}),
		IsReadOnly:         true,
		IsConcurrencySafe:  true,
		RequiresPermission: false,
	}
}

func (t *ListWorkflowsTool) Call(ctx context.Context, _ tools.CallInput, _ tools.CanUseToolFn) (tools.CallResult, error) {
	principal, err := principalFromContext(ctx)
	if err != nil {
		return tools.NewErrorResult(err), nil
	}
	jobs, err := t.backend.ListWorkflows(ctx, principal)
	if err != nil {
		return tools.NewErrorResult(err), nil
	}
	result := tools.NewJSONResult(jobs)
	result.Content = fmt.Sprintf("%d workflow(s).", len(jobs))
	return result, nil
}

func (t *ListWorkflowsTool) Description(_ context.Context) (string, error) {
	return t.Definition().Description, nil
}
func (t *ListWorkflowsTool) ValidateInput(_ context.Context, input map[string]any) (map[string]any, error) {
	return input, nil
}
func (t *ListWorkflowsTool) CheckPermissions(_ context.Context, input map[string]any, _ tools.ToolUseContext) tools.PermissionResult {
	return tools.Passthrough(input)
}
func (t *ListWorkflowsTool) IsConcurrencySafe(_ map[string]any) bool { return true }
func (t *ListWorkflowsTool) IsReadOnly(_ map[string]any) bool        { return true }
func (t *ListWorkflowsTool) IsEnabled() bool                         { return t.backend != nil }
func (t *ListWorkflowsTool) FormatResult(data any) string {
	if s, ok := data.(string); ok {
		return s
	}
	return ""
}
func (t *ListWorkflowsTool) BackfillInput(_ context.Context, input map[string]any) map[string]any {
	return input
}

// ─── inbox_delete_workflow ──────────────────────────────────────────────────

const DeleteWorkflowToolName = "inbox_delete_workflow"

type DeleteWorkflowTool struct {
	backend *inbox.Service
}

func NewDeleteWorkflowTool(backend *inbox.Service) *DeleteWorkflowTool {
	return &DeleteWorkflowTool{backend: backend}
}

func (t *DeleteWorkflowTool) Definition() tools.Definition {
	return tools.Definition{
		Name:        DeleteWorkflowToolName,
		DisplayName: "Delete Inbox Workflow",
		Description: "Permanently delete a standing inbox automation rule by ID (from inbox_list_workflows). There's no separate edit tool - to change a rule, delete it and create a new one with inbox_create_workflow.",
		Category:    "inbox",
		InputSchema: tools.FromMap(map[string]any{
			"type": "object",
			"properties": map[string]any{
				"workflow_id": map[string]any{
					"type":        "string",
					"description": "The workflow ID, as returned by inbox_list_workflows or inbox_create_workflow.",
				},
			},
			"required": []string{"workflow_id"},
		}),
		IsReadOnly:         false,
		IsConcurrencySafe:  true,
		RequiresPermission: false,
	}
}

func (t *DeleteWorkflowTool) Call(ctx context.Context, input tools.CallInput, _ tools.CanUseToolFn) (tools.CallResult, error) {
	principal, err := principalFromContext(ctx)
	if err != nil {
		return tools.NewErrorResult(err), nil
	}
	workflowID := stringInput(input.Parsed, "workflow_id")
	if workflowID == "" {
		return tools.NewErrorResult(fmt.Errorf("workflow_id is required")), nil
	}
	if err := t.backend.DeleteWorkflow(ctx, principal, workflowID); err != nil {
		return tools.NewErrorResult(err), nil
	}
	result := tools.NewJSONResult(map[string]any{"deleted": workflowID})
	result.Content = fmt.Sprintf("Deleted workflow %s.", workflowID)
	return result, nil
}

func (t *DeleteWorkflowTool) Description(_ context.Context) (string, error) {
	return t.Definition().Description, nil
}
func (t *DeleteWorkflowTool) ValidateInput(_ context.Context, input map[string]any) (map[string]any, error) {
	return input, nil
}
func (t *DeleteWorkflowTool) CheckPermissions(_ context.Context, input map[string]any, _ tools.ToolUseContext) tools.PermissionResult {
	return tools.Passthrough(input)
}
func (t *DeleteWorkflowTool) IsConcurrencySafe(_ map[string]any) bool { return true }
func (t *DeleteWorkflowTool) IsReadOnly(_ map[string]any) bool        { return false }
func (t *DeleteWorkflowTool) IsEnabled() bool                         { return t.backend != nil }
func (t *DeleteWorkflowTool) FormatResult(data any) string {
	if s, ok := data.(string); ok {
		return s
	}
	return ""
}
func (t *DeleteWorkflowTool) BackfillInput(_ context.Context, input map[string]any) map[string]any {
	return input
}

var (
	_ tools.Tool = (*CreateWorkflowTool)(nil)
	_ tools.Tool = (*ListWorkflowsTool)(nil)
	_ tools.Tool = (*DeleteWorkflowTool)(nil)
)
