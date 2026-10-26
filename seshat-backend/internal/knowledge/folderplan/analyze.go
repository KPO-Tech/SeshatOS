// Package folderplan analyses a folder of this computer and proposes the collections it could become (see seshat-runtime's
// pkg/collectionplan), and keeps the proposals on the server while the person edits them.
//
// The analysis lists the files and reads none of them. The plan stays on the server, with the folder it was made from: what a person
// can later ask to index is only what this scan found under that folder, so a request never carries the path of a file to read.
package folderplan

import (
	"context"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"strings"

	"github.com/KPO-Tech/seshat-runtime/pkg/collectionplan"
)

// DefaultMaxEntries is how many entries a scan lists before it gives up: the planner holds at most as many.
const DefaultMaxEntries = 100000

// ErrNotAFolder is returned for a path that is not a folder of this computer that can be analysed.
var ErrNotAFolder = errors.New("not a folder that can be analysed")

// ErrTooBig is returned when a folder holds more entries than a plan can.
var ErrTooBig = collectionplan.ErrTooManyFiles

// CheckRoot validates the folder to analyse and returns its absolute, cleaned path. It must exist and be a folder, and not be the root
// of a drive: choosing "C:\" or "/" would list the whole computer.
func CheckRoot(path string) (string, error) {
	if strings.TrimSpace(path) == "" {
		return "", fmt.Errorf("%w: no path given", ErrNotAFolder)
	}
	if !filepath.IsAbs(path) {
		return "", fmt.Errorf("%w: the path must be absolute", ErrNotAFolder)
	}
	root := filepath.Clean(path)
	if filepath.Dir(root) == root {
		return "", fmt.Errorf("%w: choose a folder, not a whole drive", ErrNotAFolder)
	}
	info, err := os.Stat(root)
	if err != nil {
		if errors.Is(err, fs.ErrNotExist) {
			return "", fmt.Errorf("%w: it does not exist", ErrNotAFolder)
		}
		return "", fmt.Errorf("%w: %s", ErrNotAFolder, err.Error())
	}
	if !info.IsDir() {
		return "", fmt.Errorf("%w: it is a file", ErrNotAFolder)
	}
	return root, nil
}

// Scan lists the files under root without reading them. A hidden folder is listed once and not entered; a symbolic link is listed as a
// link and not followed; what cannot be read is listed with the reason. It stops with ErrTooBig past limit entries (DefaultMaxEntries
// when zero) and with the context's error when the context ends. Paths are slash-separated and relative to root.
func Scan(ctx context.Context, root string, limit int) ([]collectionplan.Entry, error) {
	if limit <= 0 {
		limit = DefaultMaxEntries
	}
	var out []collectionplan.Entry
	err := filepath.WalkDir(root, func(p string, d fs.DirEntry, walkErr error) error {
		if err := ctx.Err(); err != nil {
			return err
		}
		rel, relErr := filepath.Rel(root, p)
		if relErr != nil || rel == "." {
			return walkErr // the folder itself cannot be read: nothing to list, and the person is told
		}
		rel = filepath.ToSlash(rel)
		if walkErr != nil {
			out = append(out, collectionplan.Entry{Path: rel, Problem: walkErr.Error()})
			if d != nil && d.IsDir() {
				return filepath.SkipDir
			}
			return nil
		}
		if len(out) >= limit {
			return ErrTooBig
		}
		if d.IsDir() {
			if strings.HasPrefix(d.Name(), ".") {
				out = append(out, collectionplan.Entry{Path: rel}) // listed once, as hidden, and not entered
				return filepath.SkipDir
			}
			return nil
		}
		if d.Type()&fs.ModeSymlink != 0 {
			out = append(out, collectionplan.Entry{Path: rel, Link: true})
			return nil
		}
		if !d.Type().IsRegular() {
			return nil
		}
		info, infoErr := d.Info()
		if infoErr != nil {
			out = append(out, collectionplan.Entry{Path: rel, Problem: infoErr.Error()})
			return nil
		}
		out = append(out, collectionplan.Entry{Path: rel, Size: info.Size(), ModTime: info.ModTime()})
		return nil
	})
	if errors.Is(err, ErrTooBig) {
		return nil, fmt.Errorf("%w: more than %d entries", ErrTooBig, limit)
	}
	return out, err
}

// Analyze scans a folder and proposes its collections. It reads no file.
func Analyze(ctx context.Context, path string, opts collectionplan.Options) (root string, entries int, plan collectionplan.Plan, err error) {
	root, err = CheckRoot(path)
	if err != nil {
		return "", 0, collectionplan.Plan{}, err
	}
	list, err := Scan(ctx, root, opts.MaxPlanFiles)
	if err != nil {
		return "", 0, collectionplan.Plan{}, err
	}
	plan, err = collectionplan.Make(list, opts)
	return root, len(list), plan, err
}
