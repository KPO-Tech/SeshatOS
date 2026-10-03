// Package documentreading is the single place seshat-backend decides how to turn a file's bytes into
// markdown text, for the document preview (files.Service.ReadMarkdown, read when the preview is opened,
// not when a file is attached), for the agent's Read tool, and for RAG ingestion (knowledge.Service).
//
// The reading policy itself (native Office extraction, PDFs page by page, then an optional external
// converter) lives in the engine's public pkg/documentreading, so a server can use the same default
// reader. This file re-exports it for the rest of this package and its callers; what stays here is what is
// specific to the local backend: the policy converter, the nativedoc bridge, the read-result cache and
// the processor.
package documentreading

import (
	"context"

	"github.com/KPO-Tech/seshat/pkg/documentreader"
	sdkreading "github.com/KPO-Tech/seshat/pkg/documentreading"
)

// NativeExtensions lists formats converted locally, no external service needed.
var NativeExtensions = sdkreading.NativeExtensions

// ExternalOnlyExtensions lists formats that always need an external reader.
var ExternalOnlyExtensions = sdkreading.ExternalOnlyExtensions

// AllConvertibleExtensions is every extension Convert can turn into markdown
// given a reachable external reader.
var AllConvertibleExtensions = sdkreading.AllConvertibleExtensions

// Source identifies which engine produced a Result's markdown.
type Source = sdkreading.Source

const (
	SourceNative   = sdkreading.SourceNative
	SourceExternal = sdkreading.SourceExternal
	SourcePDFSmart = sdkreading.SourcePDFSmart
)

// Result is the outcome of a successful conversion.
type Result = sdkreading.Result

// PageReadResult records how one PDF page was read.
type PageReadResult = sdkreading.PageReadResult

// Convert turns filePath's content into markdown; see sdkreading.Convert.
func Convert(ctx context.Context, filePath string, externalConverter documentreader.Converter) (Result, bool, error) {
	return sdkreading.Convert(ctx, filePath, externalConverter)
}

// ConvertBytes is Convert's counterpart for callers that only have the raw
// bytes and a filename; see sdkreading.ConvertBytes.
func ConvertBytes(ctx context.Context, data []byte, filename string, externalConverter documentreader.Converter) (Result, bool, error) {
	return sdkreading.ConvertBytes(ctx, data, filename, externalConverter)
}
