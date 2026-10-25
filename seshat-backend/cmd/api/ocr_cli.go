package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"time"

	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/documentreading"
)

// The native OCR models are fetched by the backend, which knows the packs, where they come from and how to turn a PaddleOCR model into
// the files the runtime reads. The first-run setup of the desktop app runs before anyone is signed in, so it cannot ask the API: it runs
// the backend with one of these commands instead. Each one writes JSON lines on out and needs no server, no database and no account.
//
//	seshat-backend --ocr-packs
//	seshat-backend --download-ocr-pack <id>

type ocrPackInfo struct {
	ID            string   `json:"id"`
	Label         string   `json:"label"`
	Languages     []string `json:"languages"`
	SizeMB        int      `json:"size_mb"`
	DownloadBytes int64    `json:"download_bytes"`
	Installed     bool     `json:"installed"`
	Active        bool     `json:"active"`
}

type ocrPacksReport struct {
	// Compiled says whether this build has the native OCR at all. A build without it can download the models but not run them.
	Compiled bool          `json:"compiled"`
	ModelDir string        `json:"model_dir"`
	Packs    []ocrPackInfo `json:"packs"`
}

type ocrDownloadEvent struct {
	Event     string `json:"event"`
	File      string `json:"file,omitempty"`
	FileIndex int    `json:"file_index,omitempty"`
	FileCount int    `json:"file_count,omitempty"`
	Received  int64  `json:"received,omitempty"`
	Total     int64  `json:"total,omitempty"`
	Message   string `json:"message,omitempty"`
}

// runOCRCommand runs the OCR command in args, if there is one. It reports whether args held a command, and the exit code to use.
func runOCRCommand(ctx context.Context, args []string, out io.Writer) (handled bool, code int) {
	if len(args) == 0 {
		return false, 0
	}
	switch args[0] {
	case "--ocr-packs":
		return true, writeOCRPacks(out)
	case "--download-ocr-pack":
		if len(args) < 2 {
			writeJSONLine(out, ocrDownloadEvent{Event: "error", Message: "--download-ocr-pack needs a pack id"})
			return true, 2
		}
		return true, downloadOCRPack(ctx, args[1], out)
	}
	return false, 0
}

func writeOCRPacks(out io.Writer) int {
	active := documentreading.NativeDocActivePack()
	report := ocrPacksReport{
		Compiled: documentreading.DetectCapabilities().NativeDocCompiled,
		ModelDir: documentreading.NativeDocModelsDir(),
		Packs:    []ocrPackInfo{},
	}
	for _, pack := range documentreading.NativeDocPacks() {
		report.Packs = append(report.Packs, ocrPackInfo{
			ID:            pack.ID,
			Label:         pack.Label,
			Languages:     pack.Languages,
			SizeMB:        pack.SizeMB,
			DownloadBytes: documentreading.NativeDocPackDownloadBytes(pack.ID),
			Installed:     documentreading.NativeDocPackInstalled(pack.ID),
			Active:        pack.ID == active,
		})
	}
	writeJSONLine(out, report)
	return 0
}

func downloadOCRPack(ctx context.Context, id string, out io.Writer) int {
	if _, ok := documentreading.NativeDocPackByID(id); !ok {
		writeJSONLine(out, ocrDownloadEvent{Event: "error", Message: "unknown OCR pack: " + id})
		return 2
	}
	// A progress line for every chunk read would be thousands of lines: one at most every 200 ms, and always the first and the last of a
	// file (the size is not always known, so the last is recognized by the next file starting).
	var last time.Time
	var lastFile string
	err := documentreading.DownloadNativeDocPack(ctx, id, func(p documentreading.NativeDocDownloadProgress) {
		finished := p.AlreadyAvailable || (p.BytesTotal > 0 && p.BytesDownloaded >= p.BytesTotal)
		if !finished && p.File == lastFile && time.Since(last) < 200*time.Millisecond {
			return
		}
		last, lastFile = time.Now(), p.File
		writeJSONLine(out, ocrDownloadEvent{Event: "progress", File: p.File, FileIndex: p.FileIndex, FileCount: p.FileCount, Received: p.BytesDownloaded, Total: p.BytesTotal})
	})
	if err != nil {
		writeJSONLine(out, ocrDownloadEvent{Event: "error", Message: err.Error()})
		return 1
	}
	writeJSONLine(out, ocrDownloadEvent{Event: "done"})
	return 0
}

func writeJSONLine(out io.Writer, value any) {
	data, err := json.Marshal(value)
	if err != nil {
		fmt.Fprintf(out, "{\"event\":\"error\",\"message\":%q}\n", err.Error())
		return
	}
	fmt.Fprintf(out, "%s\n", data)
}
