package documentreading

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/KPO-Tech/seshat/pkg/storage"
)

const ReadResultContentType = "application/vnd.seshat.document-read-result+json"
const ReadFailureContentType = "application/vnd.seshat.document-read-failure+json"

type ReadFailure struct {
	SourceFileID string    `json:"source_file_id"`
	Error        string    `json:"error"`
	UpdatedAt    time.Time `json:"updated_at"`
}

type ReadSidecar struct {
	SourceFileID string             `json:"source_file_id,omitempty"`
	Filename     string             `json:"filename,omitempty"`
	ContentType  string             `json:"content_type,omitempty"`
	SHA256       string             `json:"sha256,omitempty"`
	Engine       string             `json:"engine,omitempty"`
	PageCount    int                `json:"page_count,omitempty"`
	Pages        []PageReadResult   `json:"pages,omitempty"`
	Images       []ReadSidecarImage `json:"images,omitempty"`
	UpdatedAt    time.Time          `json:"updated_at"`
}

type ReadSidecarImage struct {
	Filename string `json:"filename"`
	MimeType string `json:"mime_type,omitempty"`
}

func ReadResultCacheKey(fileID string) string {
	return fmt.Sprintf("documents/read-results/%s.json", strings.TrimSpace(fileID))
}

func ReadFailureCacheKey(fileID string) string {
	return fmt.Sprintf("documents/read-results/%s.error.json", strings.TrimSpace(fileID))
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

func SaveReadFailure(ctx context.Context, store storage.ArtifactStore, fileID, message string) error {
	if store == nil || strings.TrimSpace(fileID) == "" {
		return nil
	}
	failure := ReadFailure{
		SourceFileID: strings.TrimSpace(fileID),
		Error:        strings.TrimSpace(message),
		UpdatedAt:    time.Now().UTC(),
	}
	body, err := json.Marshal(failure)
	if err != nil {
		return fmt.Errorf("encode document read failure: %w", err)
	}
	if _, err := store.Put(ctx, ReadFailureCacheKey(fileID), body, ReadFailureContentType); err != nil {
		return fmt.Errorf("store document read failure: %w", err)
	}
	return nil
}

func LoadReadFailure(ctx context.Context, store storage.ArtifactStore, fileID string) (ReadFailure, bool, error) {
	if store == nil || strings.TrimSpace(fileID) == "" {
		return ReadFailure{}, false, nil
	}
	body, err := store.Get(ctx, ReadFailureCacheKey(fileID))
	if err != nil {
		return ReadFailure{}, false, nil
	}
	var failure ReadFailure
	if err := json.Unmarshal(body, &failure); err != nil {
		return ReadFailure{}, false, fmt.Errorf("decode document read failure: %w", err)
	}
	if strings.TrimSpace(failure.SourceFileID) == "" {
		failure.SourceFileID = strings.TrimSpace(fileID)
	}
	return failure, true, nil
}

func NewReadSidecar(result ReadResult) ReadSidecar {
	images := make([]ReadSidecarImage, 0, len(result.Images))
	for _, img := range result.Images {
		if strings.TrimSpace(img.Filename) == "" {
			continue
		}
		images = append(images, ReadSidecarImage{
			Filename: img.Filename,
			MimeType: img.MimeType,
		})
	}
	return ReadSidecar{
		SourceFileID: result.SourceFileID,
		Filename:     result.Filename,
		ContentType:  result.ContentType,
		SHA256:       result.SHA256,
		Engine:       result.Engine,
		PageCount:    result.PageCount,
		Pages:        result.Pages,
		Images:       images,
		UpdatedAt:    time.Now().UTC(),
	}
}
