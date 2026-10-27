package knowledge

import (
	"context"
	"fmt"
	"sort"
	"strconv"

	backendauth "github.com/KPO-Tech/SeshatOS/seshat-backend/internal/auth"
	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/bkerr"
)

// FileChunk is one passage of a document as it was indexed: what a search can return for it.
type FileChunk struct {
	Position int
	Text     string
}

// FileChunks returns the passages a document was cut into when it was indexed, in the order of the document.
func (s *Service) FileChunks(ctx context.Context, principal *backendauth.Principal, corpusID, fileID string) ([]FileChunk, error) {
	if s == nil || s.corpora == nil || s.rag == nil {
		return nil, bkerr.Unavailable("knowledge store not configured", nil)
	}
	corpus, err := s.corpora.GetByID(ctx, corpusID)
	if err != nil {
		return nil, bkerr.NotFound("corpus not found", err)
	}
	if err := s.checkAccess(principal, corpus); err != nil {
		return nil, err
	}
	file, err := s.corpora.GetFile(ctx, corpusID, fileID)
	if err != nil {
		return nil, bkerr.NotFound("file not found", err)
	}
	if file.ChunkCount == 0 || s.rag.Vectors() == nil {
		return []FileChunk{}, nil
	}
	// The key of a chunk is known from its position, so only this document's passages are read, not the whole collection.
	prefix := fmt.Sprintf("rag/%s/%s", corpusID, fileID)
	keys := make([]string, 0, file.ChunkCount)
	for i := 0; i < file.ChunkCount; i++ {
		keys = append(keys, fmt.Sprintf("%s#chunk-%d", prefix, i))
	}
	records, err := s.rag.Vectors().Get(ctx, corpusID, keys)
	if err != nil {
		return nil, bkerr.Internal("read the passages: "+err.Error(), err)
	}
	chunks := make([]FileChunk, 0, len(records))
	for _, record := range records {
		position, err := strconv.Atoi(record.Metadata["position"])
		if err != nil {
			continue
		}
		chunks = append(chunks, FileChunk{Position: position, Text: record.Text})
	}
	sort.Slice(chunks, func(i, j int) bool { return chunks[i].Position < chunks[j].Position })
	return chunks, nil
}
