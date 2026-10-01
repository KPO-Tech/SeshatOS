package audit

import "time"

const (
	ActionAuthLogin       = "auth.login"
	ActionAuthLoginFailed = "auth.login.failed"
	ActionAuthLogout      = "auth.logout"
	ActionAccountDelete   = "account.delete"
	ActionAdminUserCreate = "admin.user.create"
	ActionAdminUserUpdate = "admin.user.update"
	ActionAdminUserDelete = "admin.user.delete"
	ActionFileUpload      = "file.upload"
	ActionFileDelete      = "file.delete"
	ActionCorpusCreate    = "corpus.create"
	ActionCorpusDelete    = "corpus.delete"
	ActionKnowledgeIngest = "knowledge.ingest"
	ActionSettingsCreate  = "settings.create"
	ActionSettingsUpdate  = "settings.update"
	ActionSettingsDelete  = "settings.delete"
)

const (
	StatusSuccess = "success"
	StatusFailed  = "failed"
	StatusDenied  = "denied"
)

type LogParams struct {
	ActorUserID  string
	Action       string
	ResourceType string
	ResourceID   string
	IPAddress    string
	Status       string
	Metadata     map[string]any
}

type ListParams struct {
	ActorUserID  string
	Action       string
	ResourceType string
	Limit        int
	Offset       int
}

type Entry struct {
	ID           string         `json:"id"`
	ActorUserID  string         `json:"actor_user_id"`
	Action       string         `json:"action"`
	ResourceType string         `json:"resource_type,omitempty"`
	ResourceID   string         `json:"resource_id,omitempty"`
	IPAddress    string         `json:"ip_address,omitempty"`
	Status       string         `json:"status"`
	Metadata     map[string]any `json:"metadata,omitempty"`
	CreatedAt    time.Time      `json:"created_at"`
}
