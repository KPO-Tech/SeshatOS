package db

import (
	"context"
	"fmt"
	"strings"
)

// The kinds of document the app tells apart, by the extension of the file. They are the same as the ones the desktop draws an icon for.
var documentKinds = map[string][]string{
	"pdf":  {".pdf"},
	"docx": {".doc", ".docx", ".odt", ".rtf"},
	"xlsx": {".xls", ".xlsx", ".csv"},
	"pptx": {".ppt", ".pptx"},
	"md":   {".md", ".markdown", ".txt"},
}

// DocumentKinds lists the kinds in the order they are shown; "other" is every file with none of the extensions above.
var DocumentKinds = []string{"pdf", "docx", "xlsx", "pptx", "md", "other"}

// kindClause is the SQL condition that holds for the files of a kind; an empty kind holds for every file.
func kindClause(kind string) (string, []any) {
	if kind == "" {
		return "", nil
	}
	if kind == "other" {
		var all []string
		for _, extensions := range documentKinds {
			all = append(all, extensions...)
		}
		return extensionClause(all, true)
	}
	extensions, ok := documentKinds[kind]
	if !ok {
		return "1 = 0", nil
	}
	return extensionClause(extensions, false)
}

func extensionClause(extensions []string, negate bool) (string, []any) {
	parts := make([]string, 0, len(extensions))
	args := make([]any, 0, len(extensions))
	for _, extension := range extensions {
		parts = append(parts, "lower(filename) LIKE ?")
		args = append(args, "%"+extension)
	}
	clause := "(" + strings.Join(parts, " OR ") + ")"
	if negate {
		clause = "NOT " + clause
	}
	return clause, args
}

// DocumentRow is one indexed document of a collection, as it is listed.
type DocumentRow struct {
	CorpusID      string
	FileID        string
	Filename      string
	ChunkCount    int
	CreatedAtUnix int64
}

// DocumentsQuery says which indexed documents to list. Accessible is every collection the person may read; Selected is the ones chosen
// among them (none: all of them).
type DocumentsQuery struct {
	Accessible []string
	Selected   []string
	Kind       string
	// FileIDs narrows the list to these files (none: no narrowing), to read what is known of the documents a search found.
	FileIDs []string
	// Sort is "recent" (the most recently added first) or "name".
	Sort   string
	Limit  int
	Offset int
}

// DocumentsPage is a page of documents with what is needed to narrow them down: how many there are in all, in each collection (under
// the kind chosen) and of each kind (under the collections chosen).
type DocumentsPage struct {
	Rows     []DocumentRow
	Total    int
	ByCorpus map[string]int
	ByKind   map[string]int
}

// ListDocuments reads one page of the indexed documents, and the counts, in a few queries: nothing is read that is not shown or counted.
func (s *CorpusStore) ListDocuments(ctx context.Context, q DocumentsQuery) (*DocumentsPage, error) {
	page := &DocumentsPage{Rows: []DocumentRow{}, ByCorpus: map[string]int{}, ByKind: map[string]int{}}
	if len(q.Accessible) == 0 {
		return page, nil
	}
	chosen := q.Accessible
	if len(q.Selected) > 0 {
		allowed := make(map[string]bool, len(q.Accessible))
		for _, id := range q.Accessible {
			allowed[id] = true
		}
		chosen = chosen[:0:0]
		for _, id := range q.Selected {
			if allowed[id] {
				chosen = append(chosen, id)
			}
		}
		if len(chosen) == 0 {
			return page, nil
		}
	}

	db := s.db.GormDB().WithContext(ctx)
	kindSQL, kindArgs := kindClause(q.Kind)
	where := func(corpora []string, withKind bool) (string, []any) {
		clause := "corpus_id IN ? AND status = ?"
		args := []any{corpora, CorpusFileStatusIngested}
		if withKind && kindSQL != "" {
			clause += " AND " + kindSQL
			args = append(args, kindArgs...)
		}
		return clause, args
	}

	// The page and its total: the collections chosen, the kind chosen.
	clause, args := where(chosen, true)
	if len(q.FileIDs) > 0 {
		clause += " AND file_id IN ?"
		args = append(args, q.FileIDs)
	}
	var total int64
	if err := db.Table("corpus_files").Where(clause, args...).Count(&total).Error; err != nil {
		return nil, fmt.Errorf("count documents: %w", err)
	}
	page.Total = int(total)

	order := "created_at_unix DESC, filename COLLATE NOCASE ASC"
	if q.Sort == "name" {
		order = "filename COLLATE NOCASE ASC"
	}
	limit := q.Limit
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	var rows []gCorpusFile
	if err := db.Where(clause, args...).Order(order).Limit(limit).Offset(max(q.Offset, 0)).Find(&rows).Error; err != nil {
		return nil, fmt.Errorf("list documents: %w", err)
	}
	for _, row := range rows {
		page.Rows = append(page.Rows, DocumentRow{CorpusID: row.CorpusID, FileID: row.FileID, Filename: row.Filename, ChunkCount: row.ChunkCount, CreatedAtUnix: row.CreatedAtUnix})
	}

	// Documents per collection: every collection that can be read, under the kind chosen.
	type countRow struct {
		CorpusID string
		Count    int
	}
	var perCorpus []countRow
	clause, args = where(q.Accessible, true)
	if err := db.Table("corpus_files").Select("corpus_id, COUNT(*) AS count").Where(clause, args...).Group("corpus_id").Scan(&perCorpus).Error; err != nil {
		return nil, fmt.Errorf("count documents per collection: %w", err)
	}
	for _, row := range perCorpus {
		page.ByCorpus[row.CorpusID] = row.Count
	}

	// Documents per kind: the collections chosen, whatever the kind.
	var cases strings.Builder
	var caseArgs []any
	cases.WriteString("CASE")
	for _, kind := range DocumentKinds[:len(DocumentKinds)-1] {
		clause, args := kindClause(kind)
		cases.WriteString(" WHEN " + clause + " THEN '" + kind + "'")
		caseArgs = append(caseArgs, args...)
	}
	cases.WriteString(" ELSE 'other' END")
	type kindRow struct {
		Kind  string
		Count int
	}
	var perKind []kindRow
	clause, args = where(chosen, false)
	if err := db.Table("corpus_files").Select(cases.String()+" AS kind, COUNT(*) AS count", caseArgs...).Where(clause, args...).Group("kind").Scan(&perKind).Error; err != nil {
		return nil, fmt.Errorf("count documents per kind: %w", err)
	}
	for _, row := range perKind {
		page.ByKind[row.Kind] = row.Count
	}
	return page, nil
}
