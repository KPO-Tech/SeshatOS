package cloudautomation

import (
	"context"
	"encoding/json"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/KPO-Tech/seshat/pkg/dataflow"

	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/cloud/http"
)

// JobsClient talks to seshat-server's job-management API
// (/api/v1/jobs*, /api/v1/devices), authenticated with the caller's own
// session token rather than a device token — the same way seshat-console
// does. Distinct from Client, which wraps the device-token-authenticated
// execution protocol a paired machine uses to claim and run its own work.
type JobsClient struct {
	serverURL  string
	httpClient *http.Client
}

func NewJobsClient(serverURL string) *JobsClient {
	return &JobsClient{
		serverURL:  strings.TrimRight(strings.TrimSpace(serverURL), "/"),
		httpClient: &http.Client{Timeout: 15 * time.Second},
	}
}

func (c *JobsClient) do(ctx context.Context, method, path, token string, body, out any) (int, error) {
	return cloudhttp.Do(ctx, c.httpClient, method, c.serverURL+path, token, body, out)
}

// ListJobs returns every job the caller can see in organizationID (an empty
// list, not an error, when the caller lacks jobs.read/jobs.manage).
func (c *JobsClient) ListJobs(ctx context.Context, token, organizationID string) ([]Job, error) {
	q := url.Values{"organization_id": {organizationID}}
	var payload struct {
		Jobs []Job `json:"jobs"`
	}
	if _, err := c.do(ctx, http.MethodGet, "/api/v1/jobs?"+q.Encode(), token, nil, &payload); err != nil {
		return nil, err
	}
	return payload.Jobs, nil
}

func (c *JobsClient) GetJob(ctx context.Context, token, jobID string) (*Job, error) {
	var job Job
	if _, err := c.do(ctx, http.MethodGet, "/api/v1/jobs/"+jobID, token, nil, &job); err != nil {
		return nil, err
	}
	return &job, nil
}

func (c *JobsClient) CreateJob(ctx context.Context, token, organizationID string, params JobParams) (*Job, error) {
	body := struct {
		JobParams
		OrganizationID string `json:"organization_id"`
	}{JobParams: params, OrganizationID: organizationID}
	var job Job
	if _, err := c.do(ctx, http.MethodPost, "/api/v1/jobs", token, body, &job); err != nil {
		return nil, err
	}
	return &job, nil
}

// DraftJob turns a natural-language request into a JobDraft via
// seshat-server's one-shot LLM call (see automation.Service.DraftJob's doc
// comment there) - nothing is persisted, the caller still does a separate
// CreateJob once it confirms the draft.
func (c *JobsClient) DraftJob(ctx context.Context, token, organizationID, provider, request string) (*JobDraft, error) {
	body := struct {
		OrganizationID string `json:"organization_id"`
		Provider       string `json:"provider"`
		Request        string `json:"request"`
	}{OrganizationID: organizationID, Provider: provider, Request: request}
	var draft JobDraft
	if _, err := c.do(ctx, http.MethodPost, "/api/v1/jobs/draft", token, body, &draft); err != nil {
		return nil, err
	}
	return &draft, nil
}

func (c *JobsClient) UpdateJob(ctx context.Context, token, jobID string, params JobParams) (*Job, error) {
	var job Job
	if _, err := c.do(ctx, http.MethodPut, "/api/v1/jobs/"+jobID, token, params, &job); err != nil {
		return nil, err
	}
	return &job, nil
}

func (c *JobsClient) DeleteJob(ctx context.Context, token, jobID string) error {
	_, err := c.do(ctx, http.MethodDelete, "/api/v1/jobs/"+jobID, token, nil, nil)
	return err
}

// SetJobPaused pauses or resumes a job (POST .../pause or .../resume).
func (c *JobsClient) SetJobPaused(ctx context.Context, token, jobID string, paused bool) (*Job, error) {
	action := "resume"
	if paused {
		action = "pause"
	}
	var job Job
	if _, err := c.do(ctx, http.MethodPost, "/api/v1/jobs/"+jobID+"/"+action, token, nil, &job); err != nil {
		return nil, err
	}
	return &job, nil
}

// TriggerJobNow queues an out-of-band run for jobID, independent of its
// schedule.
func (c *JobsClient) TriggerJobNow(ctx context.Context, token, jobID string) (*Run, error) {
	var run Run
	if _, err := c.do(ctx, http.MethodPost, "/api/v1/jobs/"+jobID+"/run", token, nil, &run); err != nil {
		return nil, err
	}
	return &run, nil
}

func (c *JobsClient) ListJobRuns(ctx context.Context, token, jobID string) ([]Run, error) {
	var payload struct {
		Runs []Run `json:"runs"`
	}
	if _, err := c.do(ctx, http.MethodGet, "/api/v1/jobs/"+jobID+"/runs", token, nil, &payload); err != nil {
		return nil, err
	}
	return payload.Runs, nil
}

// GetOverview returns Automation's dashboard aggregate (KPI stats, attention
// signals, recent activity) for organizationID.
func (c *JobsClient) GetOverview(ctx context.Context, token, organizationID string) (*Overview, error) {
	q := url.Values{"organization_id": {organizationID}}
	var overview Overview
	if _, err := c.do(ctx, http.MethodGet, "/api/v1/automation/overview?"+q.Encode(), token, nil, &overview); err != nil {
		return nil, err
	}
	return &overview, nil
}

// ListOrgDevices returns the organization's registered devices, for
// populating a job's target_device_id picker (an empty list, not an error,
// when the caller lacks devices.read/devices.manage).
func (c *JobsClient) ListOrgDevices(ctx context.Context, token, organizationID string) ([]Device, error) {
	q := url.Values{"organization_id": {organizationID}}
	var payload struct {
		Devices []Device `json:"devices"`
	}
	if _, err := c.do(ctx, http.MethodGet, "/api/v1/devices?"+q.Encode(), token, nil, &payload); err != nil {
		return nil, err
	}
	return payload.Devices, nil
}

// postDataflowRaw is a raw passthrough for the three dataflow "editor
// testing" endpoints below (preview-expression, test-connection, test-run):
// their request/response shapes are seshat-server internals the graph
// editor UI consumes directly (a preview value of any type, a live
// connection-test result, a full graph-execution trace) - re-declaring
// typed mirrors here would just be a second copy of seshat-server's own
// types to keep in sync for no behavioral benefit, unlike Job/Run/Variable/
// Template above which this package's own callers (job CRUD, the device
// protocol) need to inspect field-by-field.
func (c *JobsClient) postDataflowRaw(ctx context.Context, token, path string, body json.RawMessage) (json.RawMessage, error) {
	var out json.RawMessage
	if _, err := c.do(ctx, http.MethodPost, path, token, body, &out); err != nil {
		return nil, err
	}
	return out, nil
}

func (c *JobsClient) PreviewExpression(ctx context.Context, token string, body json.RawMessage) (json.RawMessage, error) {
	return c.postDataflowRaw(ctx, token, "/api/v1/dataflow/preview-expression", body)
}

func (c *JobsClient) TestConnection(ctx context.Context, token string, body json.RawMessage) (json.RawMessage, error) {
	return c.postDataflowRaw(ctx, token, "/api/v1/dataflow/test-connection", body)
}

func (c *JobsClient) TestRunGraph(ctx context.Context, token string, body json.RawMessage) (json.RawMessage, error) {
	return c.postDataflowRaw(ctx, token, "/api/v1/dataflow/test-run", body)
}

// ListNodeTypes returns the pkg/dataflow node types a Job.Graph on this
// server can reference, for populating a graph-building UI's node palette.
func (c *JobsClient) ListNodeTypes(ctx context.Context, token string) ([]dataflow.NodeDescription, error) {
	var payload struct {
		NodeTypes []dataflow.NodeDescription `json:"node_types"`
	}
	if _, err := c.do(ctx, http.MethodGet, "/api/v1/dataflow/node-types", token, nil, &payload); err != nil {
		return nil, err
	}
	return payload.NodeTypes, nil
}

// ListVariables returns organizationID's $vars.NAME workspace variables (an
// empty list, not an error, when the caller lacks visibility - same
// convention as ListJobs/ListOrgDevices).
func (c *JobsClient) ListVariables(ctx context.Context, token, organizationID string) ([]Variable, error) {
	q := url.Values{"organization_id": {organizationID}}
	var payload struct {
		Variables []Variable `json:"variables"`
	}
	if _, err := c.do(ctx, http.MethodGet, "/api/v1/variables?"+q.Encode(), token, nil, &payload); err != nil {
		return nil, err
	}
	return payload.Variables, nil
}

func (c *JobsClient) CreateVariable(ctx context.Context, token, organizationID, name, value string) (*Variable, error) {
	body := struct {
		OrganizationID string `json:"organization_id"`
		Name           string `json:"name"`
		Value          string `json:"value"`
	}{OrganizationID: organizationID, Name: name, Value: value}
	var variable Variable
	if _, err := c.do(ctx, http.MethodPost, "/api/v1/variables", token, body, &variable); err != nil {
		return nil, err
	}
	return &variable, nil
}

func (c *JobsClient) UpdateVariable(ctx context.Context, token, id, name, value string) (*Variable, error) {
	body := struct {
		Name  string `json:"name"`
		Value string `json:"value"`
	}{Name: name, Value: value}
	var variable Variable
	if _, err := c.do(ctx, http.MethodPut, "/api/v1/variables/"+id, token, body, &variable); err != nil {
		return nil, err
	}
	return &variable, nil
}

func (c *JobsClient) DeleteVariable(ctx context.Context, token, id string) error {
	_, err := c.do(ctx, http.MethodDelete, "/api/v1/variables/"+id, token, nil, nil)
	return err
}

// ListTemplates returns the built-in workflow templates Templates can start
// a new project from.
func (c *JobsClient) ListTemplates(ctx context.Context, token string) ([]Template, error) {
	var payload struct {
		Templates []Template `json:"templates"`
	}
	if _, err := c.do(ctx, http.MethodGet, "/api/v1/dataflow/templates", token, nil, &payload); err != nil {
		return nil, err
	}
	return payload.Templates, nil
}

// DataflowSecret is the org-scoped named secret a graph node's *SecretRef
// parameter (dsnSecretRef, uriSecretRef, ...) resolves by name at run time -
// never the value, which seshat-server's dataflowsecrets service treats as
// write-once/read-never-again (Set/List/Delete only, no update).
type DataflowSecret struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

// ListDataflowSecrets returns organizationID's dataflow secrets (an empty
// list, not an error, when the caller lacks dataflow_secrets.read/.manage -
// same convention as ListJobs/ListOrgDevices).
func (c *JobsClient) ListDataflowSecrets(ctx context.Context, token, organizationID string) ([]DataflowSecret, error) {
	q := url.Values{"organization_id": {organizationID}}
	var payload struct {
		DataflowSecrets []DataflowSecret `json:"dataflow_secrets"`
	}
	if _, err := c.do(ctx, http.MethodGet, "/api/v1/dataflow-secrets?"+q.Encode(), token, nil, &payload); err != nil {
		return nil, err
	}
	return payload.DataflowSecrets, nil
}

func (c *JobsClient) CreateDataflowSecret(ctx context.Context, token, organizationID, name, value string) (*DataflowSecret, error) {
	body := struct {
		OrganizationID string `json:"organization_id"`
		Name           string `json:"name"`
		Value          string `json:"value"`
	}{OrganizationID: organizationID, Name: name, Value: value}
	var secret DataflowSecret
	if _, err := c.do(ctx, http.MethodPost, "/api/v1/dataflow-secrets", token, body, &secret); err != nil {
		return nil, err
	}
	return &secret, nil
}

func (c *JobsClient) DeleteDataflowSecret(ctx context.Context, token, id string) error {
	_, err := c.do(ctx, http.MethodDelete, "/api/v1/dataflow-secrets/"+id, token, nil, nil)
	return err
}
