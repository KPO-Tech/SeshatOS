package api

import (
	"strings"

	"github.com/KPO-Tech/seshat/pkg/types"
)

func extractSessionSearchContent(messages []types.Message) string {
	var parts []string
	for _, message := range messages {
		for _, block := range message.Content {
			switch content := block.(type) {
			case types.TextContent:
				if text := strings.TrimSpace(content.Text); text != "" {
					parts = append(parts, text)
				}
			case types.ToolResultContent:
				if text := strings.TrimSpace(content.Content); text != "" {
					parts = append(parts, text)
				}
			}
		}
	}
	return strings.Join(parts, "\n")
}

func buildSessionPreview(transcript, query string) string {
	text := strings.TrimSpace(transcript)
	if text == "" {
		return ""
	}
	if len(text) <= 180 {
		return text
	}
	lowerText := strings.ToLower(text)
	lowerQuery := strings.ToLower(strings.TrimSpace(query))
	if lowerQuery == "" {
		return text[:180]
	}
	idx := strings.Index(lowerText, lowerQuery)
	if idx < 0 {
		return text[:180]
	}
	start := idx - 60
	if start < 0 {
		start = 0
	}
	end := start + 180
	if end > len(text) {
		end = len(text)
	}
	return strings.TrimSpace(text[start:end])
}
