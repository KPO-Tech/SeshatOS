package documentreading

import (
	"encoding/json"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/KPO-Tech/seshat/pkg/documentreader"
)

const ExternalConversionTimeout = 15 * time.Minute

// NewSeshatIntelligenceClient builds the neutral HTTP document-reader client
// used by seshat-backend when an external runtime is configured. The Python
// service may use Docling, Marker, or another provider internally; that is not
// part of the backend contract.
func NewSeshatIntelligenceClient(baseURL string) (documentreader.Converter, error) {
	return NewSeshatIntelligenceClientWithTimeout(baseURL, ExternalConversionTimeout)
}

func NewSeshatIntelligenceClientWithTimeout(baseURL string, timeout time.Duration) (documentreader.Converter, error) {
	return documentreader.NewGenericClient(documentreader.GenericConfig{
		BaseURL:     strings.TrimSpace(baseURL),
		FileField:   "file",
		ConvertPath: "/v1/documents",
		ChunkPath:   "/v1/documents/chunks",
		// The chunk endpoint takes the size the chunks should have, in tokens of its own tokenizer. Without it the
		// service cuts at its tokenizer's limit (256 tokens), whatever profile the host chunks with.
		ChunkFields: func(opts documentreader.ChunkOptions) map[string]string {
			if opts.MaxTokens <= 0 {
				return nil
			}
			return map[string]string{"max_tokens": strconv.Itoa(opts.MaxTokens)}
		},
		HealthPath:  "/health",
		Timeout:     timeout,
		UserAgent:   "seshat-backend-document-reader",
		ParseConvert: func(raw []byte) (*documentreader.ConversionResult, error) {
			var response struct {
				Status   string   `json:"status"`
				Markdown string   `json:"markdown"`
				Errors   []string `json:"errors"`
			}
			if err := json.Unmarshal(raw, &response); err != nil {
				return nil, fmt.Errorf("decode document reader response: %w", err)
			}
			if response.Status != "" && response.Status != "success" && response.Status != "partial_success" {
				msg := strings.Join(response.Errors, "; ")
				if msg == "" {
					msg = response.Status
				}
				return nil, fmt.Errorf("document reader conversion failed: %s", msg)
			}
			return &documentreader.ConversionResult{Markdown: response.Markdown}, nil
		},
		ParseChunk: func(raw []byte) ([]documentreader.Chunk, error) {
			var response struct {
				Filename string `json:"filename"`
				Chunks   []struct {
					Index       int      `json:"index"`
					Text        string   `json:"text"`
					RawText     string   `json:"raw_text"`
					NumTokens   *int     `json:"num_tokens"`
					Headings    []string `json:"headings"`
					Captions    []string `json:"captions"`
					PageNumbers []int    `json:"page_numbers"`
					DocItems    []string `json:"doc_items"`
				} `json:"chunks"`
			}
			if err := json.Unmarshal(raw, &response); err != nil {
				return nil, fmt.Errorf("decode document reader chunks response: %w", err)
			}
			chunks := make([]documentreader.Chunk, 0, len(response.Chunks))
			for _, chunk := range response.Chunks {
				chunks = append(chunks, documentreader.Chunk{
					Filename:    response.Filename,
					ChunkIndex:  chunk.Index,
					Text:        chunk.Text,
					RawText:     chunk.RawText,
					NumTokens:   chunk.NumTokens,
					Headings:    chunk.Headings,
					Captions:    chunk.Captions,
					PageNumbers: chunk.PageNumbers,
					DocItems:    chunk.DocItems,
				})
			}
			return chunks, nil
		},
	})
}
