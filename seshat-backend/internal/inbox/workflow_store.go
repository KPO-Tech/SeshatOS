package inbox

import (
	"context"
	"encoding/json"
	"time"

	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/db"
	"github.com/KPO-Tech/seshat/pkg/automation"
	"github.com/KPO-Tech/seshat/pkg/dataflow"
)

// WorkflowStore adapts db.InboxWorkflowStore (the local, standalone-capable
// persistence) to the seshat SDK's automation.JobStore interface - reused
// here purely for the Job/Trigger/AgentConfig/JobRun data shapes and their
// DB round trip, not for automation.JobScheduler's execution (see
// WorkflowExecutor in service.go for why: JobScheduler.RunEvent can't give
// the agent seshat-backend's real tools). See service.go's dispatchWorkflows
// for where TriggerTypeEvent jobs actually get evaluated and fired via
// WorkflowExecutor, and internal/config/bootstrap.go for the executor
// closure itself.
type WorkflowStore struct {
	rows *db.InboxWorkflowStore
}

func NewWorkflowStore(rows *db.InboxWorkflowStore) *WorkflowStore {
	return &WorkflowStore{rows: rows}
}

func (s *WorkflowStore) CreateJob(ctx context.Context, job *automation.Job) error {
	created, err := s.rows.Create(ctx, jobToRow(job))
	if err != nil {
		return err
	}
	job.ID = created.ID
	return nil
}

func (s *WorkflowStore) GetJob(ctx context.Context, id string) (*automation.Job, error) {
	row, err := s.rows.Get(ctx, id)
	if err != nil {
		return nil, err
	}
	if row == nil {
		return nil, nil
	}
	return rowToJob(*row), nil
}

func (s *WorkflowStore) ListJobs(ctx context.Context, ownerID string) ([]*automation.Job, error) {
	rows, err := s.rows.List(ctx, ownerID)
	if err != nil {
		return nil, err
	}
	jobs := make([]*automation.Job, len(rows))
	for i, row := range rows {
		jobs[i] = rowToJob(row)
	}
	return jobs, nil
}

func (s *WorkflowStore) UpdateJob(ctx context.Context, job *automation.Job) error {
	return s.rows.Update(ctx, jobToRow(job))
}

func (s *WorkflowStore) DeleteJob(ctx context.Context, id, ownerID string) error {
	return s.rows.Delete(ctx, id, ownerID)
}

func (s *WorkflowStore) CreateRun(ctx context.Context, run *automation.JobRun) error {
	created, err := s.rows.CreateRun(ctx, runToRow(run))
	if err != nil {
		return err
	}
	run.ID = created.ID
	return nil
}

func (s *WorkflowStore) UpdateRun(ctx context.Context, run *automation.JobRun) error {
	return s.rows.UpdateRun(ctx, runToRow(run))
}

func (s *WorkflowStore) ListRuns(ctx context.Context, jobID string, limit int) ([]*automation.JobRun, error) {
	rows, err := s.rows.ListRuns(ctx, jobID, limit)
	if err != nil {
		return nil, err
	}
	runs := make([]*automation.JobRun, len(rows))
	for i, row := range rows {
		runs[i] = rowToRun(row)
	}
	return runs, nil
}

func (s *WorkflowStore) GetRun(ctx context.Context, id string) (*automation.JobRun, error) {
	row, err := s.rows.GetRun(ctx, id)
	if err != nil {
		return nil, err
	}
	if row == nil {
		return nil, nil
	}
	return rowToRun(*row), nil
}

func jobToRow(job *automation.Job) db.InboxWorkflowRow {
	return db.InboxWorkflowRow{
		ID:              job.ID,
		UserID:          job.OwnerID,
		Name:            job.Name,
		Description:     job.Description,
		TriggerType:     string(job.Trigger.Type),
		TriggerCron:     job.Trigger.Cron,
		TriggerInterval: int64(job.Trigger.Interval),
		TriggerRunAt:    job.Trigger.RunAt,
		EventType:       job.Trigger.EventType,
		EventFilter:     job.Trigger.EventFilter,
		AgentSlug:       job.Agent.Slug,
		AgentBaseType:   job.Agent.BaseType,
		AgentToolsJSON:  stringsToJSON(job.Agent.Tools),
		AgentSkillsJSON: stringsToJSON(job.Agent.Skills),
		AgentModel:      job.Agent.Model,
		AgentMaxTurns:   job.Agent.MaxTurns,
		AgentSysPrompt:  job.Agent.SystemPrompt,
		Task:            job.Task,
		GraphJSON:       graphToJSON(job.Graph),
		Status:          string(job.Status),
		MaxDurationNs:   int64(job.MaxDuration),
		MaxRuns:         job.MaxRuns,
		RunCount:        job.RunCount,
		LastRunAt:       job.LastRunAt,
		NextRunAt:       job.NextRunAt,
		LastRunStatus:   job.LastRunStatus,
		CreatedAt:       job.CreatedAt,
		UpdatedAt:       job.UpdatedAt,
	}
}

func rowToJob(row db.InboxWorkflowRow) *automation.Job {
	return &automation.Job{
		ID:          row.ID,
		OwnerID:     row.UserID,
		Name:        row.Name,
		Description: row.Description,
		Trigger: automation.Trigger{
			Type:        automation.TriggerType(row.TriggerType),
			Cron:        row.TriggerCron,
			Interval:    time.Duration(row.TriggerInterval),
			RunAt:       row.TriggerRunAt,
			EventType:   row.EventType,
			EventFilter: row.EventFilter,
		},
		Agent: automation.AgentConfig{
			Slug:         row.AgentSlug,
			BaseType:     row.AgentBaseType,
			Tools:        stringsFromJSON(row.AgentToolsJSON),
			Skills:       stringsFromJSON(row.AgentSkillsJSON),
			Model:        row.AgentModel,
			MaxTurns:     row.AgentMaxTurns,
			SystemPrompt: row.AgentSysPrompt,
		},
		Task:          row.Task,
		Graph:         graphFromJSON(row.GraphJSON),
		Status:        automation.JobStatus(row.Status),
		MaxDuration:   time.Duration(row.MaxDurationNs),
		MaxRuns:       row.MaxRuns,
		RunCount:      row.RunCount,
		LastRunAt:     row.LastRunAt,
		NextRunAt:     row.NextRunAt,
		LastRunStatus: row.LastRunStatus,
		CreatedAt:     row.CreatedAt,
		UpdatedAt:     row.UpdatedAt,
	}
}

func runToRow(run *automation.JobRun) db.InboxWorkflowRunRow {
	return db.InboxWorkflowRunRow{
		ID:         run.ID,
		WorkflowID: run.JobID,
		StartedAt:  run.StartedAt,
		EndedAt:    run.EndedAt,
		Status:     string(run.Status),
		Output:     run.Output,
		Error:      run.Error,
	}
}

func rowToRun(row db.InboxWorkflowRunRow) *automation.JobRun {
	return &automation.JobRun{
		ID:        row.ID,
		JobID:     row.WorkflowID,
		StartedAt: row.StartedAt,
		EndedAt:   row.EndedAt,
		Status:    automation.RunStatus(row.Status),
		Output:    row.Output,
		Error:     row.Error,
	}
}

func stringsToJSON(ss []string) string {
	if len(ss) == 0 {
		return "[]"
	}
	data, _ := json.Marshal(ss)
	return string(data)
}

func stringsFromJSON(s string) []string {
	var out []string
	if s == "" || s == "[]" {
		return out
	}
	_ = json.Unmarshal([]byte(s), &out)
	return out
}

func graphToJSON(g *dataflow.Definition) string {
	if g == nil {
		return ""
	}
	data, _ := json.Marshal(g)
	return string(data)
}

func graphFromJSON(s string) *dataflow.Definition {
	if s == "" {
		return nil
	}
	var g dataflow.Definition
	if err := json.Unmarshal([]byte(s), &g); err != nil {
		return nil
	}
	return &g
}
