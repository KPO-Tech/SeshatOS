package api

import (
	"context"
	"encoding/json"

	backendfiles "github.com/KPO-Tech/SeshatOS/seshat-backend/internal/files"
	backendquery "github.com/KPO-Tech/SeshatOS/seshat-backend/internal/query"
	"github.com/KPO-Tech/seshat/pkg/types"
)

// attachmentPayload mirrors the frontend's MessageAttachment shape
// (seshat-ui/src/renderer/stores/session.ts) - this is the JSON shape the UI
// reads back out of message.metadata.attachments.
type attachmentPayload struct {
	ID                      string `json:"id"`
	Filename                string `json:"filename"`
	ContentType             string `json:"content_type,omitempty"`
	Size                    int64  `json:"size,omitempty"`
	Category                string `json:"category,omitempty"`
	LocalPath               string `json:"local_path,omitempty"`
	DocumentReadStatus      string `json:"document_read_status,omitempty"`
	DocumentReadEngine      string `json:"document_read_engine,omitempty"`
	DocumentReadPages       int    `json:"document_read_pages,omitempty"`
	DocumentReadImages      int    `json:"document_read_images,omitempty"`
	DocumentReadVisualPages []int  `json:"document_read_visual_pages,omitempty"`
}

// decorateMessagesWithAttachments merges each user message's persisted file
// attachments (see filesProvider.AttachToMessage) into message.metadata.attachments,
// round-tripping each message through a generic map since types.MessageMetadata
// is a closed SDK struct with no room for this field. Returns one
// json.RawMessage per input message, in order, ready to drop straight into a
// JSON response.
func decorateMessagesWithAttachments(ctx context.Context, files *backendfiles.Service, sessionID string, msgs []types.Message) []json.RawMessage {
	out := make([]json.RawMessage, len(msgs))

	byIndex := map[int][]attachmentPayload{}
	if files != nil && sessionID != "" {
		if attachments, err := files.ListMessageAttachments(ctx, sessionID); err == nil {
			for _, f := range attachments {
				if f.UserMessageIndex == nil {
					continue
				}
				byIndex[*f.UserMessageIndex] = append(byIndex[*f.UserMessageIndex], attachmentPayload{
					ID:                      f.ID,
					Filename:                f.Filename,
					ContentType:             f.ContentType,
					Size:                    f.Size,
					Category:                f.Category,
					LocalPath:               f.LocalPath,
					DocumentReadStatus:      f.DocumentReadStatus,
					DocumentReadEngine:      f.DocumentReadEngine,
					DocumentReadPages:       f.DocumentReadPages,
					DocumentReadImages:      f.DocumentReadImages,
					DocumentReadVisualPages: f.DocumentReadVisualPages,
				})
			}
		}
	}

	userIndex := 0
	for i, m := range msgs {
		raw, err := json.Marshal(m)
		if err != nil {
			continue
		}
		out[i] = raw

		if m.Role != types.RoleUser {
			continue
		}
		attachments := byIndex[userIndex]
		userIndex++
		if len(attachments) == 0 {
			continue
		}

		var decoded map[string]any
		if err := json.Unmarshal(raw, &decoded); err != nil {
			continue
		}
		metadata, _ := decoded["metadata"].(map[string]any)
		if metadata == nil {
			metadata = map[string]any{}
		}
		metadata["attachments"] = attachments
		decoded["metadata"] = metadata

		if merged, err := json.Marshal(decoded); err == nil {
			out[i] = merged
		}
	}
	return out
}

// sessionDetailResponse re-shapes a query.SessionDetail for the wire: same
// fields, but Messages carries the attachment-decorated JSON instead of the
// SDK's own Message. The explicit Messages field here shadows the embedded
// one for both direct access and JSON marshaling (Go/encoding-json both
// resolve same-named fields by shallowest depth).
type sessionDetailResponse struct {
	*backendquery.SessionDetail
	Messages []json.RawMessage `json:"messages,omitempty"`
}

func withDecoratedMessages(ctx context.Context, files *backendfiles.Service, sessionID string, detail *backendquery.SessionDetail) *sessionDetailResponse {
	return &sessionDetailResponse{
		SessionDetail: detail,
		Messages:      decorateMessagesWithAttachments(ctx, files, sessionID, detail.Messages),
	}
}
