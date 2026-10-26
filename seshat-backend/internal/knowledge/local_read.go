package knowledge

import (
	"context"
	"mime"
	"os"
	"path/filepath"
	"strings"

	backendauth "github.com/KPO-Tech/SeshatOS/seshat-backend/internal/auth"
	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/bkerr"
	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/db"
)

// maxLocalFileBytes is the biggest file of a folder that is opened for reading in the app: it is read whole into memory.
const maxLocalFileBytes = 512 << 20

// LocalFileInfo describes a file of a folder source, for a viewer that wants its size and type before it asks for its content.
type LocalFileInfo struct {
	ID          string
	Filename    string
	ContentType string
	Size        int64
}

// IsLocalFileID tells whether an id is the one LocalFileID gives a file of a folder of this computer.
func IsLocalFileID(id string) bool { return strings.HasPrefix(id, "local-") }

// contentTypes covers what the standard table may not know on every system; the viewer picks its panel from the name anyway.
var contentTypes = map[string]string{
	".pdf":  "application/pdf",
	".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
	".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
	".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
	".md":   "text/markdown; charset=utf-8",
	".txt":  "text/plain; charset=utf-8",
}

func contentTypeOf(name string) string {
	ext := strings.ToLower(filepath.Ext(name))
	if t, ok := contentTypes[ext]; ok {
		return t
	}
	if t := mime.TypeByExtension(ext); t != "" {
		return t
	}
	return "application/octet-stream"
}

// localFile finds the file of a folder source that an id names, for a person who may read its collection, and checks that its path is
// still inside the folder of its source: the path was written when the collection was made, and a file is never read from anywhere else.
func (s *Service) localFile(ctx context.Context, principal *backendauth.Principal, fileID string) (*db.CorpusFile, error) {
	if s == nil || s.corpora == nil {
		return nil, bkerr.Unavailable("knowledge store not configured", nil)
	}
	rows, err := s.corpora.FindLocalFiles(ctx, fileID)
	if err != nil {
		return nil, bkerr.Internal(err.Error(), err)
	}
	for _, row := range rows {
		corpus, err := s.corpora.GetByID(ctx, row.CorpusID)
		if err != nil || s.checkAccess(principal, corpus) != nil || corpus.SourceID == "" {
			continue
		}
		source, err := s.corpora.GetSource(ctx, corpus.SourceID)
		if err != nil || !within(source.Root, row.SourcePath) {
			continue
		}
		return &row, nil
	}
	return nil, bkerr.NotFound("file not found", nil)
}

// within reports whether path is inside root.
func within(root, path string) bool {
	rel, err := filepath.Rel(filepath.Clean(root), filepath.Clean(path))
	return err == nil && rel != "." && rel != ".." && !strings.HasPrefix(rel, ".."+string(filepath.Separator))
}

// LocalFileInfo returns what is known of a file of a folder source without reading it.
func (s *Service) LocalFileInfo(ctx context.Context, principal *backendauth.Principal, fileID string) (*LocalFileInfo, error) {
	row, err := s.localFile(ctx, principal, fileID)
	if err != nil {
		return nil, err
	}
	stat, err := os.Stat(row.SourcePath)
	if err != nil {
		return nil, bkerr.NotFound("the file is no longer where it was: "+filepath.Base(row.SourcePath), err)
	}
	name := filepath.Base(row.SourcePath)
	return &LocalFileInfo{ID: fileID, Filename: name, ContentType: contentTypeOf(name), Size: stat.Size()}, nil
}

// readLocalFile reads a file of a folder source from where it is.
func (s *Service) readLocalFile(ctx context.Context, principal *backendauth.Principal, fileID string) (*DownloadedFile, error) {
	row, err := s.localFile(ctx, principal, fileID)
	if err != nil {
		return nil, err
	}
	stat, err := os.Stat(row.SourcePath)
	if err != nil {
		return nil, bkerr.NotFound("the file is no longer where it was: "+filepath.Base(row.SourcePath), err)
	}
	if !stat.Mode().IsRegular() {
		return nil, bkerr.InvalidInput("this is not a file", nil)
	}
	if stat.Size() > maxLocalFileBytes {
		return nil, bkerr.TooLarge("this file is too big to open here", nil)
	}
	data, err := os.ReadFile(row.SourcePath)
	if err != nil {
		return nil, bkerr.Internal("read the file: "+err.Error(), err)
	}
	name := filepath.Base(row.SourcePath)
	return &DownloadedFile{Data: data, Filename: name, ContentType: contentTypeOf(name)}, nil
}

// LocalFileMarkdown reads a file of a folder source as text, for the files a viewer cannot draw itself.
func (s *Service) LocalFileMarkdown(ctx context.Context, principal *backendauth.Principal, fileID string) (string, error) {
	file, err := s.readLocalFile(ctx, principal, fileID)
	if err != nil {
		return "", err
	}
	text := s.ExtractText(ctx, file.Data, file.ContentType, file.Filename)
	if strings.TrimSpace(text) == "" {
		return "", bkerr.InvalidInput("no text could be read from this file", nil)
	}
	return text, nil
}
