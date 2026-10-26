package knowledge

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"path/filepath"
	"strings"

	backendauth "github.com/KPO-Tech/SeshatOS/seshat-backend/internal/auth"
	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/bkerr"
	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/db"
)

// LocalFile is a file of this computer that a collection holds: indexed from where it is, never copied.
type LocalFile struct {
	// Path is the absolute path of the file.
	Path string
	// Name is what the collection shows: the path under the folder it came from.
	Name string
}

// LocalCollection is a collection to create from files of this computer.
type LocalCollection struct {
	Name        string
	Description string
	Files       []LocalFile
}

// CreatedLocalCollection is what CreateLocalCollections made.
type CreatedLocalCollection struct {
	Corpus    Corpus
	FileCount int
}

// LocalFileID is the id a file of this computer has in its collection: stable for a path, so a file is never added twice to a collection.
func LocalFileID(path string) string {
	sum := sha256.Sum256([]byte(filepath.Clean(path)))
	return "local-" + hex.EncodeToString(sum[:])[:32]
}

// CreateLocalCollections creates collections whose files stay where they are on this computer. Each file is recorded as waiting to be
// indexed, with its path; none is read here, and no indexing job is queued (indexing is a separate step).
//
// It is all or nothing: a name that a collection of the person already has refuses the whole request before anything is made, and a
// failure half way removes what was made.
func (s *Service) CreateLocalCollections(ctx context.Context, principal *backendauth.Principal, collections []LocalCollection) ([]CreatedLocalCollection, error) {
	if s == nil || s.corpora == nil {
		return nil, bkerr.Unavailable("knowledge store not configured", nil)
	}
	if principal == nil {
		return nil, bkerr.Unauthorized("authentication required", nil)
	}
	if len(collections) == 0 {
		return nil, bkerr.InvalidInput("there is no collection to create", nil)
	}
	existing, err := s.corpora.ListByUserID(ctx, principal.User.ID)
	if err != nil {
		return nil, bkerr.Internal("list corpora: "+err.Error(), err)
	}
	taken := map[string]bool{}
	for _, c := range existing {
		taken[strings.ToLower(strings.TrimSpace(c.Name))] = true
	}
	var clashes []string
	asked := map[string]bool{}
	for _, c := range collections {
		name := strings.TrimSpace(c.Name)
		key := strings.ToLower(name)
		switch {
		case name == "":
			return nil, bkerr.InvalidInput("a collection has no name", nil)
		case len(name) > 255:
			return nil, bkerr.InvalidInput("a collection name exceeds 255 characters", nil)
		case len(c.Files) == 0:
			return nil, bkerr.InvalidInput(fmt.Sprintf("collection %q holds no file", name), nil)
		case asked[key]:
			return nil, bkerr.InvalidInput(fmt.Sprintf("two collections are named %q", name), nil)
		}
		asked[key] = true
		if taken[key] {
			clashes = append(clashes, name)
		}
	}
	if len(clashes) > 0 {
		return nil, bkerr.Conflict("you already have a collection named "+strings.Join(clashes, ", ")+": rename it in the plan", nil)
	}

	var made []CreatedLocalCollection
	rollback := func() {
		for _, m := range made {
			_ = s.DeleteCorpus(context.WithoutCancel(ctx), principal, m.Corpus.ID)
		}
	}
	for _, c := range collections {
		record, err := s.corpora.Create(ctx, db.CreateCorpusParams{UserID: principal.User.ID, Name: strings.TrimSpace(c.Name), Description: c.Description})
		if err != nil {
			rollback()
			return nil, bkerr.Internal("create corpus: "+err.Error(), err)
		}
		made = append(made, CreatedLocalCollection{Corpus: *corpusFromDB(*record), FileCount: len(c.Files)})
		for _, f := range c.Files {
			if _, err := s.corpora.AddFile(ctx, db.UpsertCorpusFileParams{
				CorpusID:   record.ID,
				FileID:     LocalFileID(f.Path),
				Filename:   f.Name,
				Status:     db.CorpusFileStatusPending,
				SourcePath: f.Path,
			}); err != nil {
				rollback()
				return nil, bkerr.Internal("add file to corpus: "+err.Error(), err)
			}
		}
	}
	return made, nil
}
