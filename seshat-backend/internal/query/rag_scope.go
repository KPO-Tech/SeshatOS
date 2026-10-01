package query

import (
	"context"
	"fmt"

	"github.com/KPO-Tech/seshat/pkg/vector"

	backendauth "github.com/KPO-Tech/SeshatOS/seshat-backend/internal/auth"
	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/db"
)

// ragAllowedOwnerIDs mirrors knowledge.Service.checkAccess's own ownership
// rule (corpus.UserID == principal.User.ID, or corpus.WorkspaceID is one the
// principal belongs to) as a flat set of identity IDs a corpus's UserID or
// WorkspaceID must match. Used to scope the rag_search/rag_ingest/rag_delete
// tools to corpora this caller can actually reach - see
// userScopedVectorStore's doc comment.
func ragAllowedOwnerIDs(principal *backendauth.Principal) []string {
	if principal == nil {
		return nil
	}
	ids := make([]string, 0, 1+len(principal.WorkspaceMemberships))
	ids = append(ids, principal.User.ID)
	for _, m := range principal.WorkspaceMemberships {
		ids = append(ids, m.WorkspaceID)
	}
	return ids
}

// userScopedVectorStore restricts a shared vector.Store to namespaces
// (corpus IDs) owned by - or shared via workspace membership with - one of
// a fixed set of identity IDs.
//
// sdk.ClientConfig.RAGService wires rag_search, rag_ingest, AND rag_delete
// onto a session's tool set, and all three take corpus_id/namespace as a
// plain model-supplied string with no ownership check of their own. Main
// Chat's HTTP corpus-search path already checks ownership via
// knowledge.Service.checkAccess, but that check is entirely bypassed here -
// without this wrapper, a Main Chat turn for one user could read another
// user's (or another workspace's) corpus simply by supplying its id
// (rag_ingest/rag_delete are separately blocked by PermissionModeNever
// denying their "ask" requirement, but rag_search declares
// RequiresPermission: false and goes through regardless). See
// SDKRuntime.SetRAGComponents for how this gets wired in.
type userScopedVectorStore struct {
	inner      vector.Store
	corpora    *db.CorpusStore
	allowedIDs map[string]struct{}
}

func newUserScopedVectorStore(inner vector.Store, corpora *db.CorpusStore, allowedOwnerIDs []string) vector.Store {
	allowed := make(map[string]struct{}, len(allowedOwnerIDs))
	for _, id := range allowedOwnerIDs {
		allowed[id] = struct{}{}
	}
	return &userScopedVectorStore{inner: inner, corpora: corpora, allowedIDs: allowed}
}

func (v *userScopedVectorStore) checkNamespace(ctx context.Context, namespace string) error {
	corpus, err := v.corpora.GetByID(ctx, namespace)
	if err != nil || corpus == nil {
		return fmt.Errorf("corpus %q not found", namespace)
	}
	if _, ok := v.allowedIDs[corpus.UserID]; ok {
		return nil
	}
	if corpus.WorkspaceID != "" {
		if _, ok := v.allowedIDs[corpus.WorkspaceID]; ok {
			return nil
		}
	}
	return fmt.Errorf("corpus %q not found", namespace)
}

func (v *userScopedVectorStore) Upsert(ctx context.Context, records []vector.Record) error {
	checked := make(map[string]struct{}, len(records))
	for _, r := range records {
		if _, ok := checked[r.Namespace]; ok {
			continue
		}
		if err := v.checkNamespace(ctx, r.Namespace); err != nil {
			return err
		}
		checked[r.Namespace] = struct{}{}
	}
	return v.inner.Upsert(ctx, records)
}

func (v *userScopedVectorStore) Search(ctx context.Context, query vector.Query) ([]vector.SearchResult, error) {
	if err := v.checkNamespace(ctx, query.Namespace); err != nil {
		return nil, err
	}
	return v.inner.Search(ctx, query)
}

func (v *userScopedVectorStore) Get(ctx context.Context, namespace string, keys []string) ([]vector.Record, error) {
	if err := v.checkNamespace(ctx, namespace); err != nil {
		return nil, err
	}
	return v.inner.Get(ctx, namespace, keys)
}

func (v *userScopedVectorStore) HasNamespace(ctx context.Context, namespace string) (bool, error) {
	if err := v.checkNamespace(ctx, namespace); err != nil {
		return false, nil
	}
	return v.inner.HasNamespace(ctx, namespace)
}

func (v *userScopedVectorStore) DeleteNamespace(ctx context.Context, namespace string) error {
	if err := v.checkNamespace(ctx, namespace); err != nil {
		return err
	}
	return v.inner.DeleteNamespace(ctx, namespace)
}

func (v *userScopedVectorStore) DeleteKeys(ctx context.Context, namespace string, keys []string) error {
	if err := v.checkNamespace(ctx, namespace); err != nil {
		return err
	}
	return v.inner.DeleteKeys(ctx, namespace, keys)
}
