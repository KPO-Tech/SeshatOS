package db

// gAutomationActivation tracked whether a user had the old external
// automation daemon enabled.
//
// That daemon integration has been retired — automation now runs
// exclusively through seshat-server (see internal/cloudautomation). This
// type is kept solely so the historical migration
// "20260629_029_automation_activations" (migrations_backend.go) still
// compiles and keeps referring to the same table; never rewrite past
// migrations. No new code should read or write this table.
type gAutomationActivation struct {
	ID        string `gorm:"primaryKey;size:64"`
	UserID    string `gorm:"column:user_id;uniqueIndex;size:64;not null"`
	Enabled   bool   `gorm:"column:enabled;not null;default:false"`
	CreatedAt int64  `gorm:"column:created_at_unix;autoCreateTime:unix"`
	UpdatedAt int64  `gorm:"column:updated_at_unix;autoUpdateTime:unix"`
}

func (gAutomationActivation) TableName() string { return "automation_activations" }
