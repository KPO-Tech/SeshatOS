package documentreading

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"path/filepath"
	"strings"
	"unicode"
	"unicode/utf8"

	"github.com/KPO-Tech/seshat/pkg/documentreader"
)

// ConverterResolver returns the current document converter for one operation.
// It is deliberately resolved per call so settings changes can affect new
// uploads/ingestions without rebuilding the service.
type ConverterResolver func(ctx context.Context) documentreader.Converter

// Processor is the backend document-reading entry point. It normalizes all
// local/external/plain-text extraction decisions before chat, file previews,
// Knowledge, or RAG consume the result.
type Processor struct {
	resolve ConverterResolver
}

func NewProcessor(resolve ConverterResolver) *Processor {
	return &Processor{resolve: resolve}
}

// ProcessorConverter adapts Processor back to the SDK documentreader.Converter
// interface used by read_file. That keeps chat tools on the same backend
// local-first policy as uploads and Knowledge ingestion while still fitting
// the SDK extension point.
type ProcessorConverter struct {
	processor *Processor
}

func NewProcessorConverter(resolve ConverterResolver) *ProcessorConverter {
	return &ProcessorConverter{processor: NewProcessor(resolve)}
}

// ReadInput describes a file to normalize.
type ReadInput struct {
	SourceFileID string
	Filename     string
	ContentType  string
	FilePath     string
	Data         []byte
	SHA256       string
}

// ReadResult is the canonical in-process document-reading result. Persistence
// can be added later without changing the callers that already consume this
// shape.
type ReadResult struct {
	SourceFileID string
	Filename     string
	ContentType  string
	SHA256       string
	Status       string
	Engine       string
	PageCount    int
	Pages        []PageReadResult
	Markdown     string
	Text         string
	Images       []documentreader.ExtractedImage
	Warnings     []string
	Errors       []string
}

const (
	StatusReady       = "ready"
	StatusUnavailable = "unavailable"

	EngineLocalBasic = "local-basic"
	EnginePDFSmart   = "pdfsmart"
	EngineExternal   = "external"
	EnginePlainText  = "plain-text"
)

func (p *Processor) ReadFile(ctx context.Context, input ReadInput) (ReadResult, bool, error) {
	result := baseResult(input)
	ext := strings.ToLower(filepath.Ext(input.Filename))
	if input.Filename == "" {
		ext = strings.ToLower(filepath.Ext(input.FilePath))
		result.Filename = filepath.Base(input.FilePath)
	}

	if AllConvertibleExtensions[ext] && input.FilePath != "" {
		converted, ok, err := Convert(ctx, input.FilePath, p.converter(ctx))
		if err != nil {
			result.Status = StatusUnavailable
			result.Errors = append(result.Errors, err.Error())
			return result, false, err
		}
		if ok {
			applyConversion(&result, converted)
			return result, true, nil
		}
	}

	if len(input.Data) > 0 {
		return p.ReadBytes(ctx, input)
	}

	result.Status = StatusUnavailable
	result.Warnings = append(result.Warnings, "no extractable text content")
	return result, false, nil
}

func (c *ProcessorConverter) IsAvailable(context.Context) bool {
	return true
}

func (c *ProcessorConverter) ConvertFile(ctx context.Context, filePath string) (*documentreader.ConversionResult, error) {
	processor := c.processor
	if processor == nil {
		processor = NewProcessor(nil)
	}
	result, ok, err := processor.ReadFile(ctx, ReadInput{
		Filename: filepath.Base(filePath),
		FilePath: filePath,
	})
	if err != nil {
		return nil, err
	}
	if !ok {
		return nil, fmt.Errorf("document reader: no extractable text for %s", filePath)
	}
	return readResultToConversion(result), nil
}

func (c *ProcessorConverter) ConvertBytes(ctx context.Context, data []byte, filename string) (*documentreader.ConversionResult, error) {
	processor := c.processor
	if processor == nil {
		processor = NewProcessor(nil)
	}
	result, ok, err := processor.ReadBytes(ctx, ReadInput{
		Filename: filename,
		Data:     data,
	})
	if err != nil {
		return nil, err
	}
	if !ok {
		return nil, fmt.Errorf("document reader: no extractable text for %s", filename)
	}
	return readResultToConversion(result), nil
}

func (c *ProcessorConverter) ConvertURL(ctx context.Context, docURL string) (*documentreader.ConversionResult, error) {
	if c == nil || c.processor == nil {
		return nil, fmt.Errorf("document reader: URL conversion requires a configured external reader")
	}
	external := c.processor.converter(ctx)
	if external != nil && external.IsAvailable(ctx) {
		return external.ConvertURL(ctx, docURL)
	}
	return nil, fmt.Errorf("document reader: URL conversion requires a configured external reader")
}

func readResultToConversion(result ReadResult) *documentreader.ConversionResult {
	return &documentreader.ConversionResult{
		Markdown:  result.Markdown,
		Images:    result.Images,
		PageCount: result.PageCount,
	}
}

func (p *Processor) ReadBytes(ctx context.Context, input ReadInput) (ReadResult, bool, error) {
	result := baseResult(input)
	ext := strings.ToLower(filepath.Ext(input.Filename))

	if AllConvertibleExtensions[ext] {
		converted, ok, err := ConvertBytes(ctx, input.Data, input.Filename, p.converter(ctx))
		if err != nil {
			result.Status = StatusUnavailable
			result.Errors = append(result.Errors, err.Error())
			return result, false, err
		}
		if ok {
			applyConversion(&result, converted)
			return result, true, nil
		}
	}

	if text := ExtractPlainText(input.Data, input.ContentType); strings.TrimSpace(text) != "" {
		result.Status = StatusReady
		result.Engine = EnginePlainText
		result.Markdown = text
		result.Text = text
		return result, true, nil
	}

	result.Status = StatusUnavailable
	result.Warnings = append(result.Warnings, "no extractable text content")
	return result, false, nil
}

func (p *Processor) converter(ctx context.Context) documentreader.Converter {
	if p == nil || p.resolve == nil {
		return nil
	}
	return p.resolve(ctx)
}

func baseResult(input ReadInput) ReadResult {
	sum := strings.TrimSpace(input.SHA256)
	if sum == "" && len(input.Data) > 0 {
		h := sha256.Sum256(input.Data)
		sum = hex.EncodeToString(h[:])
	}
	return ReadResult{
		SourceFileID: input.SourceFileID,
		Filename:     input.Filename,
		ContentType:  strings.TrimSpace(input.ContentType),
		SHA256:       sum,
		Status:       StatusUnavailable,
	}
}

func applyConversion(result *ReadResult, converted Result) {
	result.Status = StatusReady
	switch converted.Source {
	case SourceExternal:
		result.Engine = EngineExternal
	case SourcePDFSmart:
		result.Engine = EnginePDFSmart
	default:
		result.Engine = EngineLocalBasic
	}
	result.Markdown = converted.Markdown
	result.Text = converted.Markdown
	result.Images = converted.Images
	result.PageCount = converted.PageCount
	result.Pages = converted.Pages
}

// ExtractPlainText returns text for plain-text-like blobs only. It rejects
// binary data even when a lossy string conversion would produce printable
// replacement runes.
func ExtractPlainText(data []byte, contentType string) string {
	ct := strings.ToLower(strings.TrimSpace(strings.Split(contentType, ";")[0]))
	if strings.HasPrefix(ct, "text/") ||
		ct == "application/json" ||
		ct == "application/xml" ||
		ct == "application/x-yaml" {
		return string(data)
	}
	text := string(data)
	if IsPrintableText(text) {
		return text
	}
	return ""
}

func IsPrintableText(s string) bool {
	if len(s) == 0 || !utf8.ValidString(s) {
		return false
	}
	printable := 0
	total := 0
	for _, r := range s {
		total++
		if unicode.IsPrint(r) || r == '\n' || r == '\r' || r == '\t' {
			printable++
		}
	}
	return float64(printable)/float64(total) > 0.8
}
