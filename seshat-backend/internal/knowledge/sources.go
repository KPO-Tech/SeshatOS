package knowledge

import (
	"context"
	"errors"
	"path/filepath"
	"strings"

	backendauth "github.com/KPO-Tech/SeshatOS/seshat-backend/internal/auth"
	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/bkerr"
	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/db"
)

// Source is a place the collections of a person come from other than the app itself. Adding one reads nothing: collections are made from
// it afterwards.
type Source struct {
	ID    string `json:"id"`
	Kind  string `json:"kind"`
	Name  string `json:"name"`
	Root  string `json:"root,omitempty"`
	// Icon is the key of the icon the person chose; empty for the kind's own.
	Icon  string `json:"icon,omitempty"`
	Count int    `json:"collection_count"`
}

// SourceKindLocalFolder is a folder of this computer.
const SourceKindLocalFolder = db.KnowledgeSourceLocalFolder

// ListSources returns the sources of the person, oldest first, with how many collections each holds. The default source (what is made in
// the app) is not listed: it is always there, and collections without a source belong to it. Its count is returned apart.
func (s *Service) ListSources(ctx context.Context, principal *backendauth.Principal) (sources []Source, defaultCount int, err error) {
	if s == nil || s.corpora == nil {
		return nil, 0, bkerr.Unavailable("knowledge store not configured", nil)
	}
	if principal == nil {
		return nil, 0, bkerr.Unauthorized("authentication required", nil)
	}
	rows, err := s.corpora.ListSources(ctx, principal.User.ID)
	if err != nil {
		return nil, 0, bkerr.Internal(err.Error(), err)
	}
	counts, err := s.corpora.CountBySource(ctx, principal.User.ID)
	if err != nil {
		return nil, 0, bkerr.Internal(err.Error(), err)
	}
	sources = make([]Source, 0, len(rows))
	for _, r := range rows {
		sources = append(sources, Source{ID: r.ID, Kind: r.Kind, Name: r.Name, Root: r.Root, Icon: r.Icon, Count: counts[r.ID]})
	}
	return sources, counts[""], nil
}

// CreateFolderSource adds a folder of this computer as a source. The folder must already have been checked (absolute, a folder, not a
// drive); adding the same folder twice answers with the source that exists.
func (s *Service) CreateFolderSource(ctx context.Context, principal *backendauth.Principal, name, root, icon string) (*Source, error) {
	if s == nil || s.corpora == nil {
		return nil, bkerr.Unavailable("knowledge store not configured", nil)
	}
	if principal == nil {
		return nil, bkerr.Unauthorized("authentication required", nil)
	}
	root = filepath.Clean(root)
	existing, err := s.corpora.ListSources(ctx, principal.User.ID)
	if err != nil {
		return nil, bkerr.Internal(err.Error(), err)
	}
	for _, e := range existing {
		if e.Kind == SourceKindLocalFolder && strings.EqualFold(e.Root, root) {
			return nil, bkerr.Conflict("this folder is already a source: "+e.Name, nil)
		}
	}
	name = strings.TrimSpace(name)
	if name == "" {
		name = filepath.Base(root)
	}
	if len(name) > 255 {
		return nil, bkerr.InvalidInput("the name exceeds 255 characters", nil)
	}
	if err := checkIcon(icon); err != nil {
		return nil, err
	}
	row, err := s.corpora.CreateSource(ctx, db.CreateKnowledgeSourceParams{UserID: principal.User.ID, Kind: SourceKindLocalFolder, Name: name, Root: root, Icon: icon})
	if err != nil {
		return nil, bkerr.Internal(err.Error(), err)
	}
	return &Source{ID: row.ID, Kind: row.Kind, Name: row.Name, Root: row.Root, Icon: row.Icon}, nil
}

// GetSource returns a source of the person; for anyone else it is not found.
func (s *Service) GetSource(ctx context.Context, principal *backendauth.Principal, id string) (*Source, error) {
	if s == nil || s.corpora == nil {
		return nil, bkerr.Unavailable("knowledge store not configured", nil)
	}
	if principal == nil {
		return nil, bkerr.Unauthorized("authentication required", nil)
	}
	row, err := s.corpora.GetSource(ctx, id)
	if err != nil || row.UserID != principal.User.ID {
		if err != nil && !errors.Is(err, db.ErrKnowledgeSourceNotFound) {
			return nil, bkerr.Internal(err.Error(), err)
		}
		return nil, bkerr.NotFound("source not found", nil)
	}
	return &Source{ID: row.ID, Kind: row.Kind, Name: row.Name, Root: row.Root, Icon: row.Icon}, nil
}

// UpdateSource renames a source or changes its icon; a nil field is left as it is. The default source cannot be changed, it is not a
// stored source.
func (s *Service) UpdateSource(ctx context.Context, principal *backendauth.Principal, id string, name, icon *string) (*Source, error) {
	src, err := s.GetSource(ctx, principal, id)
	if err != nil {
		return nil, err
	}
	if name != nil {
		trimmed := strings.TrimSpace(*name)
		if trimmed == "" || len(trimmed) > 255 {
			return nil, bkerr.InvalidInput("the name must be 1 to 255 characters", nil)
		}
		name = &trimmed
	}
	if icon != nil {
		if err := checkIcon(*icon); err != nil {
			return nil, err
		}
	}
	if err := s.corpora.UpdateSource(ctx, src.ID, name, icon); err != nil {
		return nil, bkerr.Internal(err.Error(), err)
	}
	return s.GetSource(ctx, principal, id)
}

// checkIcon accepts an empty icon (the kind's own) or a short key of letters and dashes; which keys the screen knows is its business, and
// an unknown one is shown as the kind's own.
func checkIcon(icon string) error {
	if icon == "" {
		return nil
	}
	if len(icon) > 32 {
		return bkerr.InvalidInput("the icon is not valid", nil)
	}
	for _, r := range icon {
		if (r < 'a' || r > 'z') && r != '-' {
			return bkerr.InvalidInput("the icon is not valid", nil)
		}
	}
	return nil
}

// DeleteSource removes a source that holds no collection: deleting collections is a separate, deliberate act.
func (s *Service) DeleteSource(ctx context.Context, principal *backendauth.Principal, id string) error {
	src, err := s.GetSource(ctx, principal, id)
	if err != nil {
		return err
	}
	counts, err := s.corpora.CountBySource(ctx, principal.User.ID)
	if err != nil {
		return bkerr.Internal(err.Error(), err)
	}
	if counts[src.ID] > 0 {
		return bkerr.Conflict("this source still holds collections: delete them first", nil)
	}
	if err := s.corpora.DeleteSource(ctx, src.ID); err != nil {
		return bkerr.Internal(err.Error(), err)
	}
	return nil
}
