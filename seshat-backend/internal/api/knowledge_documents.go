package api

import (
	"net/http"
	"strconv"
	"strings"

	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/knowledge"
)

// maxDocumentsPage is the most documents one request returns: the list is read a page at a time, whatever the size of the library.
const maxDocumentsPage = 100

type documentItem struct {
	CorpusID      string `json:"corpus_id"`
	CorpusName    string `json:"corpus_name"`
	FileID        string `json:"file_id"`
	Filename      string `json:"filename"`
	ChunkCount    int    `json:"chunk_count"`
	CreatedAtUnix int64  `json:"created_at"`
	Preview       string `json:"preview,omitempty"`
}

type documentCount struct {
	ID    string `json:"id"`
	Name  string `json:"name"`
	Count int    `json:"count"`
}

// handleKnowledgeDocuments handles GET /knowledge/documents: one page of the indexed documents of the collections the person can
// read, with how many there are in all, in each collection and of each kind.
//
//	?corpus_id=a&corpus_id=b   only these collections (default: all)
//	?kind=pdf                  pdf, docx, xlsx, pptx, md or other (default: all)
//	?file_id=x&file_id=y       only these files
//	?sort=recent|name          default recent
//	?limit=50&offset=0         a page; the limit is capped at 100
//	?preview=1                 add the beginning of each document's text (one read of the passages per collection)
func (a *App) handleKnowledgeDocuments(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	principal, _ := authPrincipalFromContext(r.Context())
	if principal == nil {
		writeJSONError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	svc, ok := a.localKnowledge(w)
	if !ok {
		return
	}
	values := r.URL.Query()
	limit, _ := strconv.Atoi(values.Get("limit"))
	if limit <= 0 || limit > maxDocumentsPage {
		limit = 50
	}
	offset, _ := strconv.Atoi(values.Get("offset"))
	if offset < 0 {
		offset = 0
	}
	sortKey := values.Get("sort")
	if sortKey != "name" {
		sortKey = "recent"
	}
	var corpusIDs []string
	for _, id := range values["corpus_id"] {
		if id = strings.TrimSpace(id); id != "" {
			corpusIDs = append(corpusIDs, id)
		}
	}

	var fileIDs []string
	for _, id := range values["file_id"] {
		if id = strings.TrimSpace(id); id != "" {
			fileIDs = append(fileIDs, id)
		}
	}

	page, err := svc.ListDocuments(r.Context(), principal, knowledge.DocumentsQuery{CorpusIDs: corpusIDs, Kind: values.Get("kind"), FileIDs: fileIDs, Sort: sortKey, Limit: limit, Offset: offset, Preview: values.Get("preview") == "1"})
	if err != nil {
		writeBackendError(w, err)
		return
	}
	items := make([]documentItem, 0, len(page.Documents))
	for _, doc := range page.Documents {
		items = append(items, documentItem{CorpusID: doc.CorpusID, CorpusName: doc.Collection, FileID: doc.FileID, Filename: doc.Filename, ChunkCount: doc.ChunkCount, CreatedAtUnix: doc.CreatedAt, Preview: doc.Preview})
	}
	collections := make([]documentCount, 0, len(page.Collections))
	for _, collection := range page.Collections {
		collections = append(collections, documentCount{ID: collection.CorpusID, Name: collection.Collection, Count: collection.Count})
	}
	writeJSON(w, http.StatusOK, map[string]any{"documents": items, "total": page.Total, "collections": collections, "kinds": page.Kinds})
}
