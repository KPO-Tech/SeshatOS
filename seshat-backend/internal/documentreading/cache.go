package documentreading

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/KPO-Tech/seshat/pkg/storage"
)

const ReadResultContentType = "application/vnd.seshat.document-read-result+json"

func ReadResultCacheKey(fileID string) string {
	return fmt.Sprintf("documents/read-results/%s.json", strings.TrimSpace(fileID))
}

func SaveReadResult(ctx context.Context, store storage.ArtifactStore, fileID string, result ReadResult) error {
	if store == nil || strings.TrimSpace(fileID) == "" || strings.TrimSpace(result.Text) == "" {
		return nil
	}
	result.SourceFileID = fileID
	body, err := json.Marshal(result)
	if err != nil {
		return fmt.Errorf("encode document read result: %w", err)
	}
	if _, err := store.Put(ctx, ReadResultCacheKey(fileID), body, ReadResultContentType); err != nil {
		return fmt.Errorf("store document read result: %w", err)
	}
	return nil
}

func LoadReadResult(ctx context.Context, store storage.ArtifactStore, fileID string) (ReadResult, bool, error) {
	if store == nil || strings.TrimSpace(fileID) == "" {
		return ReadResult{}, false, nil
	}
	body, err := store.Get(ctx, ReadResultCacheKey(fileID))
	if err != nil {
		return ReadResult{}, false, nil
	}
	var result ReadResult
	if err := json.Unmarshal(body, &result); err != nil {
		return ReadResult{}, false, fmt.Errorf("decode document read result: %w", err)
	}
	if strings.TrimSpace(result.Text) == "" {
		return ReadResult{}, false, nil
	}
	return result, true, nil
}
