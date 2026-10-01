// Package cloudquotas makes seshat-backend a real usage-quota client of
// seshat-server in "connected" mode. It implements quotas.Provider, the
// same interface quotas.LocalProvider implements for standalone mode.
// Usage counters are strictly personal and purely descriptive (no enforced
// limit — see helps/seshat-architecture-target.md §7), so "connected"
// simply means "counted on the server instead of locally."
package cloudquotas

import "time"

// remoteUsageEntry mirrors seshat-server's quotas.UsageEntry.
type remoteUsageEntry struct {
	Metric    string    `json:"metric"`
	Period    string    `json:"period"`
	PeriodKey string    `json:"period_key"`
	Count     int64     `json:"count"`
	UpdatedAt time.Time `json:"updated_at"`
}

// remoteUsageSummary mirrors seshat-server's quotas.UsageSummary.
type remoteUsageSummary struct {
	UserID  string             `json:"user_id"`
	Entries []remoteUsageEntry `json:"entries"`
}

type incrementRequest struct {
	Metric string `json:"metric"`
	Delta  int64  `json:"delta"`
}
