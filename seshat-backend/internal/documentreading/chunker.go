package documentreading

import (
	"context"
	"fmt"

	"github.com/KPO-Tech/seshat/pkg/documentreader"
)

// DynamicHybridChunker adapts the current document-reader settings to the
// HybridChunker interface expected by the RAG pipeline. It deliberately resolves
// on every call so Settings changes can affect new ingestions without a restart.
type DynamicHybridChunker struct {
	resolve ConverterResolver
}

func NewDynamicHybridChunker(resolve ConverterResolver) *DynamicHybridChunker {
	return &DynamicHybridChunker{resolve: resolve}
}

func (c *DynamicHybridChunker) IsAvailable(ctx context.Context) bool {
	chunker := c.current(ctx)
	return chunker != nil && chunker.IsAvailable(ctx)
}

func (c *DynamicHybridChunker) ChunkHybridBytes(ctx context.Context, data []byte, filename string, opts documentreader.ChunkOptions) ([]documentreader.Chunk, error) {
	chunker := c.current(ctx)
	if chunker == nil || !chunker.IsAvailable(ctx) {
		return nil, fmt.Errorf("document hybrid chunker is unavailable")
	}
	return chunker.ChunkHybridBytes(ctx, data, filename, opts)
}

func (c *DynamicHybridChunker) current(ctx context.Context) documentreader.HybridChunker {
	if c == nil || c.resolve == nil {
		return nil
	}
	converter := c.resolve(ctx)
	if converter == nil {
		return nil
	}
	if chunker, ok := converter.(documentreader.HybridChunker); ok {
		return chunker
	}
	// An external chunker reads the file itself, with its own parser, and ignores what the native readers make of
	// it (tables of every kind, page marks, decryption). It is used only when the settings say to prefer the
	// external reader; otherwise the document is chunked from the text the readers wrote, on every host.
	if policy, ok := converter.(*PolicyConverter); ok && policy.PreferExternal && policy.External != nil {
		if chunker, ok := policy.External.(documentreader.HybridChunker); ok {
			return chunker
		}
	}
	return nil
}

var _ documentreader.HybridChunker = (*DynamicHybridChunker)(nil)
