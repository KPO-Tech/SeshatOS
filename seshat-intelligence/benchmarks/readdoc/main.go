// readdoc reads one file with the Go reader (native only, no external engine) and prints JSON, so
// the Go reader can sit in the same benchmark as the Python readers.
package main

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/KPO-Tech/seshat/pkg/documentreading"
	"github.com/KPO-Tech/seshat/pkg/pdfsmart"
)

type page struct {
	Page int    `json:"page"`
	Text string `json:"text"`
}

type output struct {
	Markdown string `json:"markdown,omitempty"`
	Pages    []page `json:"pages,omitempty"`
	Source   string `json:"source,omitempty"`
	Error    string `json:"error,omitempty"`
}

func main() {
	if len(os.Args) != 2 {
		fmt.Fprintln(os.Stderr, "usage: readdoc FILE")
		os.Exit(2)
	}
	_ = json.NewEncoder(os.Stdout).Encode(read(os.Args[1]))
}

func read(path string) output {
	data, err := os.ReadFile(path)
	if err != nil {
		return output{Error: err.Error()}
	}
	ctx := context.Background()
	if strings.EqualFold(filepath.Ext(path), ".pdf") {
		result, ok, err := pdfsmart.Convert(ctx, data, nil, pdfsmart.VisionFallback{})
		if err != nil {
			return output{Error: err.Error()}
		}
		if !ok {
			return output{Error: "no usable text (a scan needs an engine)"}
		}
		pages := make([]page, 0, len(result.Pages))
		for _, p := range result.Pages {
			pages = append(pages, page{Page: p.Page, Text: p.Text})
		}
		return output{Markdown: result.Markdown, Pages: pages, Source: "native"}
	}
	result, ok, err := documentreading.ConvertBytes(ctx, data, filepath.Base(path), nil)
	if err != nil {
		return output{Error: err.Error()}
	}
	if !ok {
		return output{Error: "no usable text (this format needs an engine)"}
	}
	return output{Markdown: result.Markdown, Source: string(result.Source)}
}
