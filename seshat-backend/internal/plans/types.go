package plans

import "time"

type Plan struct {
	ID        string
	SessionID string
	UserID    string
	Slug      string
	Filename  string
	Content   string
	Status    string
	Version   int
	CreatedAt time.Time
	UpdatedAt time.Time
}

type PatchParams struct {
	Content *string
	Status  *string
}
