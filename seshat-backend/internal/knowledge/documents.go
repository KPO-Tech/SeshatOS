package knowledge

import (
	"context"
	"fmt"
	"strings"

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
	// Preview adds to each document the beginning of its text, read from its first passage: one read of the vector store per collection
	// on the page. Left out, the listing is the database alone.
	Preview bool
}

// Document is one indexed document, as the listing shows it.
type Document struct {
	CorpusID   string
	Collection string
	FileID     string
	Filename   string
	ChunkCount int
	CreatedAt  int64
	// Preview is the beginning of the text of the document, when the query asked for it and the first passage could be read.
	Preview string
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
	if q.Preview {
		s.attachPreviews(ctx, page.Documents)
	}
	for _, corpus := range corpora {
		if count := result.ByCorpus[corpus.ID]; count > 0 {
			page.Collections = append(page.Collections, DocumentCount{CorpusID: corpus.ID, Collection: corpus.Name, Count: count})
		}
	}
	return page, nil
}

// previewLength is how much of a document is kept as its preview.
const previewLength = 220

// attachPreviews reads the first passage of each document, one read per collection, and keeps the beginning of its text. A preview is
// a convenience: a collection whose passages cannot be read leaves its documents without one, and the listing still answers.
func (s *Service) attachPreviews(ctx context.Context, documents []Document) {
	if s == nil || s.rag == nil || s.rag.Vectors() == nil {
		return
	}
	byCorpus := map[string][]int{}
	for i, doc := range documents {
		if doc.ChunkCount > 0 {
			byCorpus[doc.CorpusID] = append(byCorpus[doc.CorpusID], i)
		}
	}
	// The first two passages are read: a document often opens with a passage that is only its title, which says little alone.
	for corpusID, indexes := range byCorpus {
		keys := make([]string, 0, 2*len(indexes))
		at := make(map[string]struct{ doc, part int }, 2*len(indexes))
		for _, i := range indexes {
			for part := 0; part < 2 && part < documents[i].ChunkCount; part++ {
				key := fmt.Sprintf("rag/%s/%s#chunk-%d", corpusID, documents[i].FileID, part)
				keys = append(keys, key)
				at[key] = struct{ doc, part int }{i, part}
			}
		}
		records, err := s.rag.Vectors().Get(ctx, corpusID, keys)
		if err != nil {
			continue
		}
		texts := make(map[int][2]string, len(indexes))
		for _, record := range records {
			if place, ok := at[record.Key]; ok {
				pair := texts[place.doc]
				pair[place.part] = record.Text
				texts[place.doc] = pair
			}
		}
		for i, pair := range texts {
			documents[i].Preview = PreviewOf(pair[0] + "\n" + pair[1])
		}
	}
}

// PreviewOf is the beginning of a passage as a line of text: the lines that are only a page number are left out, the rest is joined and
// cut at a word.
func PreviewOf(text string) string {
	var kept []string
	for _, line := range strings.Split(text, "\n") {
		// The marks of a Markdown heading are not part of what is said.
		line = strings.TrimSpace(strings.TrimLeft(strings.TrimSpace(line), "#"))
		if line == "" || isPageNumber(line) {
			continue
		}
		kept = append(kept, line)
	}
	flat := strings.Join(strings.Fields(strings.Join(kept, " ")), " ")
	if len([]rune(flat)) <= previewLength {
		return flat
	}
	cut := []rune(flat)[:previewLength]
	if space := strings.LastIndex(string(cut), " "); space > previewLength/2 {
		return strings.TrimRight(string(cut)[:space], " ,;:-") + "..."
	}
	return strings.TrimRight(string(cut), " ,;:-") + "..."
}

func isPageNumber(line string) bool {
	if len(line) == 0 || len(line) > 4 {
		return false
	}
	for _, r := range line {
		if r < '0' || r > '9' {
			return false
		}
	}
	return true
}
