package inbox

import (
	"context"
	"testing"

	backendauth "github.com/KPO-Tech/SeshatOS/seshat-backend/internal/auth"
	"github.com/KPO-Tech/seshat/pkg/dataflow"
)

func TestCreateWorkflowWithGraphInsteadOfTask(t *testing.T) {
	database := openWorkflowTestDB(t)
	exec := &fakeExecutor{}
	svc, _ := newWorkflowTestService(t, database, exec)
	principal := &backendauth.Principal{User: backendauth.User{ID: "user-1"}}

	job, err := svc.CreateWorkflow(context.Background(), principal, CreateWorkflowParams{
		Name: "graph rule",
		Graph: &dataflow.Definition{Name: "g", Nodes: []dataflow.Node{
			{ID: "a", Type: "agent", Parameters: map[string]any{"prompt": "do it"}},
		}},
	})
	if err != nil {
		t.Fatalf("CreateWorkflow: %v", err)
	}
	if job.Graph == nil || job.Task != "" {
		t.Fatalf("expected Graph set and Task empty, got Graph=%v Task=%q", job.Graph, job.Task)
	}

	listed, err := svc.ListWorkflows(context.Background(), principal)
	if err != nil {
		t.Fatalf("ListWorkflows: %v", err)
	}
	if len(listed) != 1 || listed[0].Graph == nil || listed[0].Graph.Name != "g" {
		t.Fatalf("expected Graph to round-trip through storage, got %#v", listed)
	}
}

func TestCreateWorkflowRejectsTaskAndGraphTogether(t *testing.T) {
	database := openWorkflowTestDB(t)
	exec := &fakeExecutor{}
	svc, _ := newWorkflowTestService(t, database, exec)
	principal := &backendauth.Principal{User: backendauth.User{ID: "user-1"}}

	_, err := svc.CreateWorkflow(context.Background(), principal, CreateWorkflowParams{
		Name: "bad",
		Task: "do it",
		Graph: &dataflow.Definition{Name: "g", Nodes: []dataflow.Node{
			{ID: "a", Type: "agent", Parameters: map[string]any{"prompt": "x"}},
		}},
	})
	if err == nil {
		t.Fatal("expected an error when both Task and Graph are set")
	}
}

func TestCreateWorkflowRejectsInvalidGraph(t *testing.T) {
	database := openWorkflowTestDB(t)
	exec := &fakeExecutor{}
	svc, _ := newWorkflowTestService(t, database, exec)
	principal := &backendauth.Principal{User: backendauth.User{ID: "user-1"}}

	_, err := svc.CreateWorkflow(context.Background(), principal, CreateWorkflowParams{
		Name:  "bad",
		Graph: &dataflow.Definition{Name: "empty"}, // no nodes - dataflow.Validate rejects this
	})
	if err == nil {
		t.Fatal("expected an error for a graph with no nodes")
	}
}

func TestCreateWorkflowRejectsNeitherTaskNorGraph(t *testing.T) {
	database := openWorkflowTestDB(t)
	exec := &fakeExecutor{}
	svc, _ := newWorkflowTestService(t, database, exec)
	principal := &backendauth.Principal{User: backendauth.User{ID: "user-1"}}

	_, err := svc.CreateWorkflow(context.Background(), principal, CreateWorkflowParams{Name: "bad"})
	if err == nil {
		t.Fatal("expected an error when neither Task nor Graph is set")
	}
}
