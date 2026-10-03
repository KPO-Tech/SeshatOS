package documentreading

import (
	"context"

	"github.com/KPO-Tech/seshat/pkg/documentreader"
	"github.com/KPO-Tech/seshat/pkg/pdfsmart"
)

// The SDK reads a PDF's tables that have no ruling lines with a layout model when the document reader it is given
// can find them (pdfsmart.TableFinder: the native reader, with its models, can). The readers of this package wrap
// the native one, so each hands the question on to the reader underneath that knows the answer; a reader that does
// not, or that fails, answers nothing and the page reads as it would without the models.

func findTables(ctx context.Context, converter documentreader.Converter, data []byte, pageIndex int) ([]pdfsmart.TableStructure, error) {
	finder, ok := converter.(pdfsmart.TableFinder)
	if !ok || finder == nil {
		return nil, nil
	}
	return finder.FindTables(ctx, data, pageIndex)
}

// FindTables asks the first reader that has an answer: the local one first, as for every other read.
func (c fallbackConverter) FindTables(ctx context.Context, data []byte, pageIndex int) ([]pdfsmart.TableStructure, error) {
	if tables, err := findTables(ctx, c.First, data, pageIndex); err == nil && len(tables) > 0 {
		return tables, nil
	}
	return findTables(ctx, c.Second, data, pageIndex)
}

// FindTables is the local advanced reader's: an external server reads whole pages itself and has no use for it.
func (c *PolicyConverter) FindTables(ctx context.Context, data []byte, pageIndex int) ([]pdfsmart.TableStructure, error) {
	return findTables(ctx, converterIfAvailable(c.LocalAdvanced), data, pageIndex)
}

// FindTables is the resolved reader's, so the chat tools see the same tables as uploads and Knowledge ingestion.
func (c *ProcessorConverter) FindTables(ctx context.Context, data []byte, pageIndex int) ([]pdfsmart.TableStructure, error) {
	if c == nil || c.processor == nil {
		return nil, nil
	}
	return findTables(ctx, c.processor.converter(ctx), data, pageIndex)
}

var (
	_ pdfsmart.TableFinder = fallbackConverter{}
	_ pdfsmart.TableFinder = (*PolicyConverter)(nil)
	_ pdfsmart.TableFinder = (*ProcessorConverter)(nil)
)
