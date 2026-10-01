package db

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"gorm.io/gorm"
)

// gInboxWorkflow is a persisted automation.Job (see the seshat SDK's
// pkg/automation) for the Inbox event-triggered workflow feature - the
// Inbox Agent authors these via inbox_create_workflow rather than a human
// picking a schedule. Columns mirror automation.Job/Trigger/AgentConfig
// field-for-field so the round trip in InboxWorkflowStore is a plain
// rename, not a lossy projection - even though v1 only ever creates
// TriggerTypeEvent rows, the store stays a complete, correct
// automation.JobStore rather than one silently losing data for any other
// trigger type.
type gInboxWorkflow struct {
	ID          string `gorm:"primaryKey;size:64"`
	UserID      string `gorm:"column:user_id;size:64;not null;index"`
	Name        string `gorm:"column:name;not null;default:''"`
	Description string `gorm:"column:description;not null;default:''"`

	TriggerType     string     `gorm:"column:trigger_type;size:32;not null"`
	TriggerCron     string     `gorm:"column:trigger_cron;not null;default:''"`
	TriggerInterval int64      `gorm:"column:trigger_interval_ns;not null;default:0"`
	TriggerRunAt    *time.Time `gorm:"column:trigger_run_at"`
	EventType       string     `gorm:"column:event_type;size:64;not null;default:'';index"`
	EventFilter     string     `gorm:"column:event_filter;not null;default:''"`

	AgentSlug       string `gorm:"column:agent_slug;not null;default:''"`
	AgentBaseType   string `gorm:"column:agent_base_type;not null;default:''"`
	AgentToolsJSON  string `gorm:"column:agent_tools_json;not null;default:'[]'"`
	AgentSkillsJSON string `gorm:"column:agent_skills_json;not null;default:'[]'"`
	AgentModel      string `gorm:"column:agent_model;not null;default:''"`
	AgentMaxTurns   int    `gorm:"column:agent_max_turns;not null;default:0"`
	AgentSysPrompt  string `gorm:"column:agent_system_prompt;not null;default:''"`

	Task string `gorm:"column:task;not null;default:''"`
	// GraphJSON, when non-empty, is a JSON-encoded dataflow.Definition run
	// instead of Task — see internal/inbox/workflow_graph.go. Empty (the
	// default) keeps every existing workflow on the plain-Task path.
	GraphJSON     string `gorm:"column:graph_json;type:text"`
	Status        string `gorm:"column:status;size:32;not null;default:'active';index"`
	MaxDurationNs int64  `gorm:"column:max_duration_ns;not null;default:0"`
	MaxRuns       int    `gorm:"column:max_runs;not null;default:0"`
	RunCount      int    `gorm:"column:run_count;not null;default:0"`

	LastRunAt     *time.Time `gorm:"column:last_run_at"`
	NextRunAt     *time.Time `gorm:"column:next_run_at"`
	LastRunStatus string     `gorm:"column:last_run_status;not null;default:''"`

	CreatedAt time.Time `gorm:"column:created_at;not null"`
	UpdatedAt time.Time `gorm:"column:updated_at;not null"`
}

func (gInboxWorkflow) TableName() string { return "inbox_workflows" }

// gInboxWorkflowRun is one execution record (automation.JobRun) of a
// gInboxWorkflow.
type gInboxWorkflowRun struct {
	ID         string     `gorm:"primaryKey;size:64"`
	WorkflowID string     `gorm:"column:workflow_id;size:64;not null;index"`
	StartedAt  time.Time  `gorm:"column:started_at;not null"`
	EndedAt    *time.Time `gorm:"column:ended_at"`
	Status     string     `gorm:"column:status;size:32;not null;default:'running'"`
	Output     string     `gorm:"column:output;not null;default:''"`
	Error      string     `gorm:"column:error;not null;default:''"`
}

func (gInboxWorkflowRun) TableName() string { return "inbox_workflow_runs" }

// InboxWorkflowRow/InboxWorkflowRunRow are the exported row shapes -
// internal/inbox's workflow_store.go converts these to/from the SDK's
// automation.Job/JobRun (this package deliberately doesn't import the SDK,
// keeping that conversion where the SDK type is actually used).
type InboxWorkflowRow struct {
	ID              string
	UserID          string
	Name            string
	Description     string
	TriggerType     string
	TriggerCron     string
	TriggerInterval int64
	TriggerRunAt    *time.Time
	EventType       string
	EventFilter     string
	AgentSlug       string
	AgentBaseType   string
	AgentToolsJSON  string
	AgentSkillsJSON string
	AgentModel      string
	AgentMaxTurns   int
	AgentSysPrompt  string
	Task            string
	GraphJSON       string
	Status          string
	MaxDurationNs   int64
	MaxRuns         int
	RunCount        int
	LastRunAt       *time.Time
	NextRunAt       *time.Time
	LastRunStatus   string
	CreatedAt       time.Time
	UpdatedAt       time.Time
}

type InboxWorkflowRunRow struct {
	ID         string
	WorkflowID string
	StartedAt  time.Time
	EndedAt    *time.Time
	Status     string
	Output     string
	Error      string
}

// rowFromInboxWorkflow: same direct-conversion reasoning as
// inboxWorkflowFromRow below.
func rowFromInboxWorkflow(g gInboxWorkflow) *InboxWorkflowRow {
	row := InboxWorkflowRow(g)
	return &row
}

// inboxWorkflowFromRow converts via a direct struct conversion, not a
// field-by-field literal - InboxWorkflowRow's fields are declared in the
// exact same names/types/order as gInboxWorkflow's (tags are ignored for
// conversion purposes) specifically so this stays valid; keep the two
// declarations in sync if either one changes.
func inboxWorkflowFromRow(r InboxWorkflowRow) gInboxWorkflow {
	return gInboxWorkflow(r)
}

// rowFromInboxWorkflowRun: same direct-conversion reasoning as
// inboxWorkflowFromRow above.
func rowFromInboxWorkflowRun(g gInboxWorkflowRun) *InboxWorkflowRunRow {
	row := InboxWorkflowRunRow(g)
	return &row
}

// inboxWorkflowRunFromRow: same direct-conversion reasoning as
// inboxWorkflowFromRow above.
func inboxWorkflowRunFromRow(r InboxWorkflowRunRow) gInboxWorkflowRun {
	return gInboxWorkflowRun(r)
}

// InboxWorkflowStore is the GORM-backed persistence for Inbox event-triggered
// workflows - the local (standalone-capable) half of the feature; see
// internal/inbox/workflow_store.go for the automation.JobStore adapter that
// wraps this.
type InboxWorkflowStore struct {
	db *DB
}

func NewInboxWorkflowStore(database *DB) (*InboxWorkflowStore, error) {
	if database == nil {
		return nil, fmt.Errorf("inbox workflow store: database is required")
	}
	return &InboxWorkflowStore{db: database}, nil
}

// Create returns the persisted row (its ID in particular - minted here when
// row.ID is empty) so the caller can propagate it back, the same reason
// ChannelAccountStore.Create returns the full created record rather than
// just an error.
func (s *InboxWorkflowStore) Create(ctx context.Context, row InboxWorkflowRow) (*InboxWorkflowRow, error) {
	if strings.TrimSpace(row.ID) == "" {
		row.ID = newIdentityID("wkfl")
	}
	g := inboxWorkflowFromRow(row)
	if err := s.db.GormDB().WithContext(ctx).Create(&g).Error; err != nil {
		return nil, fmt.Errorf("create inbox workflow: %w", err)
	}
	return rowFromInboxWorkflow(g), nil
}

func (s *InboxWorkflowStore) Get(ctx context.Context, id string) (*InboxWorkflowRow, error) {
	var g gInboxWorkflow
	err := s.db.GormDB().WithContext(ctx).Where("id = ?", id).First(&g).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, fmt.Errorf("get inbox workflow: %w", err)
	}
	return rowFromInboxWorkflow(g), nil
}

// List returns workflows for userID; pass "" to list across all owners
// (the local scheduler's own use, mirroring automation.JobStore.ListJobs).
func (s *InboxWorkflowStore) List(ctx context.Context, userID string) ([]InboxWorkflowRow, error) {
	q := s.db.GormDB().WithContext(ctx)
	if userID != "" {
		q = q.Where("user_id = ?", userID)
	}
	var rows []gInboxWorkflow
	if err := q.Order("created_at DESC").Find(&rows).Error; err != nil {
		return nil, fmt.Errorf("list inbox workflows: %w", err)
	}
	out := make([]InboxWorkflowRow, 0, len(rows))
	for _, g := range rows {
		out = append(out, *rowFromInboxWorkflow(g))
	}
	return out, nil
}

func (s *InboxWorkflowStore) Update(ctx context.Context, row InboxWorkflowRow) error {
	g := inboxWorkflowFromRow(row)
	res := s.db.GormDB().WithContext(ctx).Model(&gInboxWorkflow{}).Where("id = ?", row.ID).Updates(&g)
	if res.Error != nil {
		return fmt.Errorf("update inbox workflow: %w", res.Error)
	}
	if res.RowsAffected == 0 {
		return fmt.Errorf("inbox workflow not found")
	}
	return nil
}

// Delete removes a workflow by id; userID="" bypasses ownership check
// (mirrors automation.JobStore.DeleteJob's admin/system convention).
func (s *InboxWorkflowStore) Delete(ctx context.Context, id, userID string) error {
	q := s.db.GormDB().WithContext(ctx).Where("id = ?", id)
	if userID != "" {
		q = q.Where("user_id = ?", userID)
	}
	if err := q.Delete(&gInboxWorkflow{}).Error; err != nil {
		return fmt.Errorf("delete inbox workflow: %w", err)
	}
	return nil
}

// CreateRun returns the persisted row (see Create's doc comment - same
// "the caller needs the minted ID back" reasoning).
func (s *InboxWorkflowStore) CreateRun(ctx context.Context, row InboxWorkflowRunRow) (*InboxWorkflowRunRow, error) {
	if strings.TrimSpace(row.ID) == "" {
		row.ID = newIdentityID("wkflrun")
	}
	g := inboxWorkflowRunFromRow(row)
	if err := s.db.GormDB().WithContext(ctx).Create(&g).Error; err != nil {
		return nil, fmt.Errorf("create inbox workflow run: %w", err)
	}
	return rowFromInboxWorkflowRun(g), nil
}

func (s *InboxWorkflowStore) UpdateRun(ctx context.Context, row InboxWorkflowRunRow) error {
	g := inboxWorkflowRunFromRow(row)
	res := s.db.GormDB().WithContext(ctx).Model(&gInboxWorkflowRun{}).Where("id = ?", row.ID).Updates(&g)
	if res.Error != nil {
		return fmt.Errorf("update inbox workflow run: %w", res.Error)
	}
	if res.RowsAffected == 0 {
		return fmt.Errorf("inbox workflow run not found")
	}
	return nil
}

func (s *InboxWorkflowStore) ListRuns(ctx context.Context, workflowID string, limit int) ([]InboxWorkflowRunRow, error) {
	if limit <= 0 {
		limit = 50
	}
	var rows []gInboxWorkflowRun
	err := s.db.GormDB().WithContext(ctx).
		Where("workflow_id = ?", workflowID).
		Order("started_at DESC").
		Limit(limit).
		Find(&rows).Error
	if err != nil {
		return nil, fmt.Errorf("list inbox workflow runs: %w", err)
	}
	out := make([]InboxWorkflowRunRow, 0, len(rows))
	for _, g := range rows {
		out = append(out, *rowFromInboxWorkflowRun(g))
	}
	return out, nil
}

func (s *InboxWorkflowStore) GetRun(ctx context.Context, id string) (*InboxWorkflowRunRow, error) {
	var g gInboxWorkflowRun
	err := s.db.GormDB().WithContext(ctx).Where("id = ?", id).First(&g).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, fmt.Errorf("get inbox workflow run: %w", err)
	}
	return rowFromInboxWorkflowRun(g), nil
}
