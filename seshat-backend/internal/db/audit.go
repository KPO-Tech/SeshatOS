package db

import (
	"context"
	"fmt"
	"strings"
	"time"
)

const (
	AuditActionAuthLogin       = "auth.login"
	AuditActionAuthLoginFailed = "auth.login.failed"
	AuditActionAuthLogout      = "auth.logout"
	AuditActionAccountDelete   = "account.delete"
	AuditActionAdminUserCreate = "admin.user.create"
	AuditActionAdminUserUpdate = "admin.user.update"
	AuditActionAdminUserDelete = "admin.user.delete"
	AuditActionFileUpload      = "file.upload"
	AuditActionFileDelete      = "file.delete"
	AuditActionCorpusCreate    = "corpus.create"
	AuditActionCorpusDelete    = "corpus.delete"
	AuditActionKnowledgeIngest = "knowledge.ingest"
	AuditActionSettingsCreate  = "settings.create"
	AuditActionSettingsUpdate  = "settings.update"
	AuditActionSettingsDelete  = "settings.delete"
)

const (
	AuditStatusSuccess = "success"
	AuditStatusFailed  = "failed"
	AuditStatusDenied  = "denied"
)

type gAuditLog struct {
	ID            string `gorm:"primaryKey;size:64"`
	ActorUserID   string `gorm:"column:actor_user_id;size:64;not null;index"`
	Action        string `gorm:"column:action;size:128;not null;index"`
	ResourceType  string `gorm:"column:resource_type;size:64;not null;default:''"`
	ResourceID    string `gorm:"column:resource_id;size:64;not null;default:''"`
	IPAddress     string `gorm:"column:ip_address;size:64;not null;default:''"`
	Status        string `gorm:"column:status;size:32;not null;index"`
	MetadataJSON  string `gorm:"column:metadata_json;type:text;not null;default:'{}'"`
	CreatedAtUnix int64  `gorm:"column:created_at_unix;autoCreateTime:unix;index"`
}

func (gAuditLog) TableName() string { return "audit_logs" }

type AuditLog struct {
	ID           string
	ActorUserID  string
	Action       string
	ResourceType string
	ResourceID   string
	IPAddress    string
	Status       string
	Metadata     map[string]any
	CreatedAt    time.Time
}

type CreateAuditLogParams struct {
	ActorUserID  string
	Action       string
	ResourceType string
	ResourceID   string
	IPAddress    string
	Status       string
	Metadata     map[string]any
}

type ListAuditLogsParams struct {
	ActorUserID  string
	Action       string
	ResourceType string
	Limit        int
	Offset       int
}

type AuditLogStore struct {
	db *DB
}

func NewAuditLogStore(database *DB) (*AuditLogStore, error) {
	if database == nil {
		return nil, fmt.Errorf("audit log store: database is required")
	}
	return &AuditLogStore{db: database}, nil
}

func (s *AuditLogStore) Create(ctx context.Context, p CreateAuditLogParams) (*AuditLog, error) {
	if strings.TrimSpace(p.ActorUserID) == "" {
		return nil, fmt.Errorf("actor_user_id is required")
	}
	if strings.TrimSpace(p.Action) == "" {
		return nil, fmt.Errorf("action is required")
	}
	status := strings.TrimSpace(p.Status)
	if status == "" {
		status = AuditStatusSuccess
	}
	meta, err := marshalJSONMap(p.Metadata)
	if err != nil {
		return nil, err
	}
	row := gAuditLog{
		ID:           newIdentityID("aud"),
		ActorUserID:  strings.TrimSpace(p.ActorUserID),
		Action:       strings.TrimSpace(p.Action),
		ResourceType: strings.TrimSpace(p.ResourceType),
		ResourceID:   strings.TrimSpace(p.ResourceID),
		IPAddress:    strings.TrimSpace(p.IPAddress),
		Status:       status,
		MetadataJSON: meta,
	}
	if err := s.db.gormDB.WithContext(ctx).Create(&row).Error; err != nil {
		return nil, err
	}
	return auditLogFromModel(row)
}

func (s *AuditLogStore) List(ctx context.Context, p ListAuditLogsParams) ([]AuditLog, error) {
	if p.Limit <= 0 || p.Limit > 200 {
		p.Limit = 50
	}
	q := s.db.gormDB.WithContext(ctx).Model(&gAuditLog{}).Order("created_at_unix DESC")
	if p.ActorUserID != "" {
		q = q.Where("actor_user_id = ?", p.ActorUserID)
	}
	if p.Action != "" {
		q = q.Where("action LIKE ?", p.Action+"%")
	}
	if p.ResourceType != "" {
		q = q.Where("resource_type = ?", p.ResourceType)
	}
	q = q.Limit(p.Limit).Offset(p.Offset)
	var rows []gAuditLog
	if err := q.Find(&rows).Error; err != nil {
		return nil, err
	}
	result := make([]AuditLog, 0, len(rows))
	for _, row := range rows {
		entry, err := auditLogFromModel(row)
		if err != nil {
			return nil, err
		}
		result = append(result, *entry)
	}
	return result, nil
}

func auditLogFromModel(row gAuditLog) (*AuditLog, error) {
	meta, err := unmarshalJSONMap(row.MetadataJSON)
	if err != nil {
		return nil, err
	}
	return &AuditLog{
		ID:           row.ID,
		ActorUserID:  row.ActorUserID,
		Action:       row.Action,
		ResourceType: row.ResourceType,
		ResourceID:   row.ResourceID,
		IPAddress:    row.IPAddress,
		Status:       row.Status,
		Metadata:     meta,
		CreatedAt:    time.Unix(row.CreatedAtUnix, 0).UTC(),
	}, nil
}
