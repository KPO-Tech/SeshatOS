package db

import (
	"context"
	"fmt"
	"time"
)

// gHookOrgApproval tracks which org-catalog hook configs (an ID on the
// connected seshat-server, not a local resource) this installation's user
// has explicitly approved to run locally. A hook executes a shell command
// automatically before every matching tool call - even more implicit than
// an MCP stdio server's one-time spawn - so an org admin alone can never
// make that happen; the local user must opt in once, and that choice is
// remembered across restarts/reloads, same shape as
// gMCPOrgServerApproval.
type gHookOrgApproval struct {
	OrgHookID  string `gorm:"primaryKey;size:64"`
	ApprovedAt int64  `gorm:"column:approved_at_unix;not null"`
}

func (gHookOrgApproval) TableName() string { return "hook_org_approvals" }

type HookOrgApprovalStore struct {
	db *DB
}

func NewHookOrgApprovalStore(database *DB) (*HookOrgApprovalStore, error) {
	if database == nil {
		return nil, fmt.Errorf("hook org approval store: database is required")
	}
	return &HookOrgApprovalStore{db: database}, nil
}

// ListApprovedIDs returns every org hook ID this installation has approved,
// as a set for quick membership checks.
func (s *HookOrgApprovalStore) ListApprovedIDs(ctx context.Context) (map[string]bool, error) {
	var rows []gHookOrgApproval
	if err := s.db.gormDB.WithContext(ctx).Find(&rows).Error; err != nil {
		return nil, err
	}
	out := make(map[string]bool, len(rows))
	for _, r := range rows {
		out[r.OrgHookID] = true
	}
	return out, nil
}

func (s *HookOrgApprovalStore) Approve(ctx context.Context, orgHookID string) error {
	row := gHookOrgApproval{OrgHookID: orgHookID, ApprovedAt: time.Now().UTC().Unix()}
	return s.db.gormDB.WithContext(ctx).Save(&row).Error
}

func (s *HookOrgApprovalStore) Revoke(ctx context.Context, orgHookID string) error {
	return s.db.gormDB.WithContext(ctx).Delete(&gHookOrgApproval{}, "org_hook_id = ?", orgHookID).Error
}
