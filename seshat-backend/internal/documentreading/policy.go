package documentreading

import (
	"context"
	"fmt"
	"strings"

	"github.com/KPO-Tech/seshat/pkg/documentreader"
	"github.com/KPO-Tech/seshat/pkg/textquality"
)

// PolicyConverter implements documentreader.Converter with Seshat's desired
// runtime policy: local readers are the default path, and an external document
// intelligence server is opt-in. When PreferExternal is true, the order flips
// to external-first with local fallback.
type PolicyConverter struct {
	LocalAdvanced  documentreader.Converter
	External       documentreader.Converter
	PreferExternal bool
}

func NewPolicyConverter(external documentreader.Converter, preferExternal bool) *PolicyConverter {
	return &PolicyConverter{External: external, PreferExternal: preferExternal}
}

func NewPolicyConverterWithLocalAdvanced(localAdvanced, external documentreader.Converter, preferExternal bool) *PolicyConverter {
	return &PolicyConverter{LocalAdvanced: localAdvanced, External: external, PreferExternal: preferExternal}
}

func (c *PolicyConverter) IsAvailable(ctx context.Context) bool {
	return true
}

func (c *PolicyConverter) ConvertFile(ctx context.Context, filePath string) (*documentreader.ConversionResult, error) {
	if c.PreferExternal {
		if result, ok := c.convertExternalFile(ctx, filePath); ok {
			return result, nil
		}
	}
	if result, ok, err := Convert(ctx, filePath, externalWhenFallbackAllowed(c)); err != nil {
		return nil, err
	} else if ok {
		return toConversionResult(result), nil
	}
	return nil, fmt.Errorf("document reader: no extractable text for %s", filePath)
}

func (c *PolicyConverter) ConvertBytes(ctx context.Context, data []byte, filename string) (*documentreader.ConversionResult, error) {
	if c.PreferExternal {
		if result, ok := c.convertExternalBytes(ctx, data, filename); ok {
			return result, nil
		}
	}
	if result, ok, err := ConvertBytes(ctx, data, filename, externalWhenFallbackAllowed(c)); err != nil {
		return nil, err
	} else if ok {
		return toConversionResult(result), nil
	}
	return nil, fmt.Errorf("document reader: no extractable text for %s", filename)
}

func (c *PolicyConverter) ConvertURL(ctx context.Context, docURL string) (*documentreader.ConversionResult, error) {
	if c.External != nil && c.External.IsAvailable(ctx) {
		result, err := c.External.ConvertURL(ctx, docURL)
		if err == nil && usableMarkdown(result.Markdown) {
			return result, nil
		}
	}
	return nil, fmt.Errorf("document reader: URL conversion requires a configured external reader")
}

func (c *PolicyConverter) convertExternalFile(ctx context.Context, filePath string) (*documentreader.ConversionResult, bool) {
	if c.External == nil || !c.External.IsAvailable(ctx) {
		return nil, false
	}
	result, err := c.External.ConvertFile(ctx, filePath)
	if err != nil || !usableMarkdown(result.Markdown) {
		return nil, false
	}
	return result, true
}

func (c *PolicyConverter) convertExternalBytes(ctx context.Context, data []byte, filename string) (*documentreader.ConversionResult, bool) {
	if c.External == nil || !c.External.IsAvailable(ctx) {
		return nil, false
	}
	result, err := c.External.ConvertBytes(ctx, data, filename)
	if err != nil || !usableMarkdown(result.Markdown) {
		return nil, false
	}
	return result, true
}

func externalWhenFallbackAllowed(c *PolicyConverter) documentreader.Converter {
	if c.PreferExternal {
		return converterIfAvailable(c.LocalAdvanced)
	}
	return newFallbackConverter(c.LocalAdvanced, c.External)
}

type fallbackConverter struct {
	First  documentreader.Converter
	Second documentreader.Converter
}

func newFallbackConverter(first, second documentreader.Converter) documentreader.Converter {
	first = converterIfAvailable(first)
	second = converterIfAvailable(second)
	if first == nil {
		return second
	}
	if second == nil {
		return first
	}
	return fallbackConverter{First: first, Second: second}
}

func converterIfAvailable(converter documentreader.Converter) documentreader.Converter {
	if converter == nil {
		return nil
	}
	return converter
}

func (c fallbackConverter) IsAvailable(ctx context.Context) bool {
	return nativeDocAvailable(ctx, c.First) || nativeDocAvailable(ctx, c.Second)
}

func (c fallbackConverter) ConvertFile(ctx context.Context, filePath string) (*documentreader.ConversionResult, error) {
	if result, ok := convertFileIfUsable(ctx, c.First, filePath); ok {
		return result, nil
	}
	if result, ok := convertFileIfUsable(ctx, c.Second, filePath); ok {
		return result, nil
	}
	return nil, fmt.Errorf("document reader: no extractable text for %s", filePath)
}

func (c fallbackConverter) ConvertBytes(ctx context.Context, data []byte, filename string) (*documentreader.ConversionResult, error) {
	if result, ok := convertBytesIfUsable(ctx, c.First, data, filename); ok {
		return result, nil
	}
	if result, ok := convertBytesIfUsable(ctx, c.Second, data, filename); ok {
		return result, nil
	}
	return nil, fmt.Errorf("document reader: no extractable text for %s", filename)
}

func (c fallbackConverter) ConvertURL(ctx context.Context, docURL string) (*documentreader.ConversionResult, error) {
	if result, ok := convertURLIfUsable(ctx, c.First, docURL); ok {
		return result, nil
	}
	if result, ok := convertURLIfUsable(ctx, c.Second, docURL); ok {
		return result, nil
	}
	return nil, fmt.Errorf("document reader: URL conversion requires a configured document reader")
}

func convertFileIfUsable(ctx context.Context, converter documentreader.Converter, filePath string) (*documentreader.ConversionResult, bool) {
	if converter == nil || !converter.IsAvailable(ctx) {
		return nil, false
	}
	result, err := converter.ConvertFile(ctx, filePath)
	if err != nil || result == nil || !usableMarkdown(result.Markdown) {
		return nil, false
	}
	return result, true
}

func convertBytesIfUsable(ctx context.Context, converter documentreader.Converter, data []byte, filename string) (*documentreader.ConversionResult, bool) {
	if converter == nil || !converter.IsAvailable(ctx) {
		return nil, false
	}
	result, err := converter.ConvertBytes(ctx, data, filename)
	if err != nil || result == nil || !usableMarkdown(result.Markdown) {
		return nil, false
	}
	return result, true
}

func convertURLIfUsable(ctx context.Context, converter documentreader.Converter, docURL string) (*documentreader.ConversionResult, bool) {
	if converter == nil || !converter.IsAvailable(ctx) {
		return nil, false
	}
	result, err := converter.ConvertURL(ctx, docURL)
	if err != nil || result == nil || !usableMarkdown(result.Markdown) {
		return nil, false
	}
	return result, true
}

func toConversionResult(result Result) *documentreader.ConversionResult {
	return &documentreader.ConversionResult{
		Markdown: result.Markdown,
		Images:   result.Images,
	}
}

func usableMarkdown(markdown string) bool {
	return strings.TrimSpace(markdown) != "" && !textquality.IsGarbledText(markdown)
}

var _ documentreader.Converter = (*PolicyConverter)(nil)
