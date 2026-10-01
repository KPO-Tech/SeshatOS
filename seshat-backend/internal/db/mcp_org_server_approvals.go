package db

import (
	"context"
	"fmt"
	"time"
)

// gMCPOrgServerApproval tracks which org-catalog MCP server configs (an ID
// on the connected seshat-server, not a local mcp_servers row) this
// installation's user has explicitly approved to run locally. stdio
// servers spawn an arbitrary command on this machine, so an org admin
// alone cannot make that happen — the local user must opt in once, and
// that choice is remembered across restarts/reloads.
type gMCPOrgServerApproval struct {
	OrgServerID string `gorm:"primaryKey;size:64"`
	ApprovedAt  int64  `gorm:"column:approved_at_unix;not null"`
}

func (gMCPOrgServerApproval) TableName() string { return "mcp_org_server_approvals" }

type MCPOrgServerApprovalStore struct {
	db *DB
}

func NewMCPOrgServerApprovalStore(database *DB) (*MCPOrgServerApprovalStore, error) {
	if database == nil {
		return nil, fmt.Errorf("mcp org server approval store: database is required")
	}
	return &MCPOrgServerApprovalStore{db: database}, nil
}

// ListApprovedIDs returns every org server ID this installation has
// approved, as a set for quick membership checks.
func (s *MCPOrgServerApprovalStore) ListApprovedIDs(ctx context.Context) (map[string]bool, error) {
	var rows []gMCPOrgServerApproval
	if err := s.db.gormDB.WithContext(ctx).Find(&rows).Error; err != nil {
		return nil, err
	}
	out := make(map[string]bool, len(rows))
	for _, r := range rows {
		out[r.OrgServerID] = true
	}
	return out, nil
}

func (s *MCPOrgServerApprovalStore) Approve(ctx context.Context, orgServerID string) error {
	row := gMCPOrgServerApproval{OrgServerID: orgServerID, ApprovedAt: time.Now().UTC().Unix()}
	return s.db.gormDB.WithContext(ctx).Save(&row).Error
}

func (s *MCPOrgServerApprovalStore) Revoke(ctx context.Context, orgServerID string) error {
	return s.db.gormDB.WithContext(ctx).Delete(&gMCPOrgServerApproval{}, "org_server_id = ?", orgServerID).Error
}
