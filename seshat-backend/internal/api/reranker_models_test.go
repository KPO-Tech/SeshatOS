package api

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"

	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/db"
)

type rerankerModelsList struct {
	Models []rerankerModelResponse `json:"models"`
}

// The person sets up two rerank models, uses the second, then forgets it: the list says which one is in use at each step.
func TestRerankModelsCanBeAddedUsedAndForgotten(t *testing.T) {
	database, err := db.Open(context.Background(), db.DefaultSQLiteConfig(filepath.Join(t.TempDir(), "test.db")))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { database.Close() })
	store, err := db.NewRerankerConfigStore(database)
	if err != nil {
		t.Fatal(err)
	}
	app := &App{rerankerStore: store}

	call := func(method, path, body string) rerankerModelsList {
		t.Helper()
		request := httptest.NewRequest(method, "/api/v1/settings/reranker/models"+path, strings.NewReader(body))
		recorder := httptest.NewRecorder()
		app.handleRerankerModels(recorder, request, store)
		if recorder.Code != http.StatusOK {
			t.Fatalf("%s %s: %d %s", method, path, recorder.Code, recorder.Body.String())
		}
		var list rerankerModelsList
		if err := json.Unmarshal(recorder.Body.Bytes(), &list); err != nil {
			t.Fatal(err)
		}
		return list
	}

	byModel := func(list rerankerModelsList, model string) rerankerModelResponse {
		t.Helper()
		for _, item := range list.Models {
			if item.Model == model {
				return item
			}
		}
		t.Fatalf("%s is not in %+v", model, list.Models)
		return rerankerModelResponse{}
	}

	call(http.MethodPost, "", `{"base_url":"https://api.cohere.com/v2/rerank","model":"rerank-v3.5","api_key":"k"}`)
	list := call(http.MethodPost, "", `{"base_url":"https://api.voyageai.com/v1/rerank","model":"rerank-2.5","api_key":"k","use":true}`)
	if len(list.Models) != 2 || byModel(list, "rerank-v3.5").Active || !byModel(list, "rerank-2.5").Active {
		t.Fatalf("after using the second: %+v", list.Models)
	}
	if strings.Contains(listJSON(list), `"api_key"`) {
		t.Fatal("the list must not carry the keys")
	}

	list = call(http.MethodPost, "/"+byModel(list, "rerank-v3.5").ID+"/use", "")
	if !byModel(list, "rerank-v3.5").Active || byModel(list, "rerank-2.5").Active {
		t.Fatalf("after using the first: %+v", list.Models)
	}

	list = call(http.MethodDelete, "/"+byModel(list, "rerank-v3.5").ID, "")
	if len(list.Models) != 1 || list.Models[0].Active || list.Models[0].Model != "rerank-2.5" {
		t.Fatalf("after forgetting the one in use: %+v", list.Models)
	}
	if current, _ := store.Get(context.Background()); current == nil || current.Enabled {
		t.Fatalf("reranking is still on after the model in use was forgotten: %+v", current)
	}
}

func listJSON(list rerankerModelsList) string {
	out, _ := json.Marshal(list)
	return string(out)
}
