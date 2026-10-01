package memories

import "time"

type UserMemory struct {
	ID         string
	UserID     string
	Type       string
	Key        string
	Value      string
	Importance float64
	Source     string
	CreatedAt  time.Time
	UpdatedAt  time.Time
}

type CreateParams struct {
	UserID     string
	Type       string
	Key        string
	Value      string
	Importance float64
	Source     string
}

type UpdateParams struct {
	Type       *string
	Key        *string
	Value      *string
	Importance *float64
	Source     *string
}
