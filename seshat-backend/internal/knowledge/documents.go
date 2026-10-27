package knowledge

import (
	"context"

	backendauth "github.com/KPO-Tech/SeshatOS/seshat-backend/internal/auth"
	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/bkerr"
	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/db"
)

// DocumentsQuery says which indexed documents a page lists.
type DocumentsQuery struct {
	// CorpusIDs narrows the list to some collections (none: every collection the person can read).
	CorpusIDs []string
	// Kind is pdf, docx, xlsx, pptx, md or other (none: every kind).
	Kind string
	// FileIDs narrows the list to these files.
	FileIDs []string
	// Sort is "recent" (the most recently added first) or "name".
	Sort   string
	Limit  int
	Offset int
}

// Document is one indexed document, as the listing shows it.
type Document struct {
	CorpusID   string
	Collection string
	FileID     string
	Filename   string
	ChunkCount int
	CreatedAt  int64
}

// DocumentCount is a number of documents in one collection.
type DocumentCount struct {
	CorpusID   string
	Collection string
	Count      int
}

// DocumentsPage is a page of documents, and how many there are in all, in each collection and of each kind.
type DocumentsPage struct {
	Documents   []Document
	Total       int
	Collections []DocumentCount
	Kinds       map[string]int
}

// ListDocuments reads one page of the indexed documents of the collections the person can read. The counts come from the database, so
// a page costs the same whether there are a hundred documents or a million.
func (s *Service) ListDocuments(ctx context.Context, principal *backendauth.Principal, q DocumentsQuery) (*DocumentsPage, error) {
	corpora, err := s.ListCorpora(ctx, principal)
	if err != nil {
		return nil, err
	}
	names := make(map[string]string, len(corpora))
	accessible := make([]string, 0, len(corpora))
	for _, corpus := range corpora {
		names[corpus.ID] = corpus.Name
		accessible = append(accessible, corpus.ID)
	}
	result, err := s.corpora.ListDocuments(ctx, db.DocumentsQuery{Accessible: accessible, Selected: q.CorpusIDs, Kind: q.Kind, FileIDs: q.FileIDs, Sort: q.Sort, Limit: q.Limit, Offset: q.Offset})
	if err != nil {
		return nil, bkerr.Internal("list documents: "+err.Error(), err)
	}
	page := &DocumentsPage{Documents: make([]Document, 0, len(result.Rows)), Total: result.Total, Collections: []DocumentCount{}, Kinds: result.ByKind}
	for _, row := range result.Rows {
		page.Documents = append(page.Documents, Document{CorpusID: row.CorpusID, Collection: names[row.CorpusID], FileID: row.FileID, Filename: row.Filename, ChunkCount: row.ChunkCount, CreatedAt: row.CreatedAtUnix})
	}
	for _, corpus := range corpora {
		if count := result.ByCorpus[corpus.ID]; count > 0 {
			page.Collections = append(page.Collections, DocumentCount{CorpusID: corpus.ID, Collection: corpus.Name, Count: count})
		}
	}
	return page, nil
}
