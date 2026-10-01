package db

// gScheduledJob is the GORM model for the scheduled_jobs table.
//
// The local cron scheduler this table backed has been retired — automation
// now runs exclusively through seshat-server (see internal/cloudautomation).
// This type is kept solely so the historical migration
// "20260606_026_scheduled_jobs" (migrations_backend.go) still compiles and
// keeps referring to the same table; never rewrite past migrations. No new
// code should read or write this table.
type gScheduledJob struct {
	ID           string `gorm:"primaryKey;size:64"`
	UserID       string `gorm:"column:user_id;size:64;not null;index"`
	Name         string `gorm:"column:name;size:255;not null;default:''"`
	CronExpr     string `gorm:"column:cron_expr;size:128;not null"`
	AgentSlug    string `gorm:"column:agent_slug;size:128;not null;default:''"`
	Prompt       string `gorm:"column:prompt;type:text;not null"`
	SessionTitle string `gorm:"column:session_title;size:255;not null;default:''"`
	Enabled      bool   `gorm:"column:enabled;not null;default:true;index:idx_jobs_enabled_next,priority:1"`
	// last_run_at: 0 means never ran
	LastRunAtUnix int64  `gorm:"column:last_run_at_unix;not null;default:0"`
	NextRunAtUnix int64  `gorm:"column:next_run_at_unix;not null;index:idx_jobs_enabled_next,priority:2"`
	LastStatus    string `gorm:"column:last_status;size:16;not null;default:''"`
	LastError     string `gorm:"column:last_error;type:text;not null;default:''"`
	CreatedAtUnix int64  `gorm:"column:created_at_unix;not null"`
	UpdatedAtUnix int64  `gorm:"column:updated_at_unix;not null"`
}

func (gScheduledJob) TableName() string { return "scheduled_jobs" }
