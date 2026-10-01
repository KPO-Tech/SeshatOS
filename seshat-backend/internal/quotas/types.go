package quotas

import "time"

const (
	MetricQueries    = "queries"
	MetricTokens     = "tokens"
	MetricFiles      = "files"
	MetricWebSearch  = "web_search"
	MetricIngestions = "ingestions"
)

const (
	PeriodDay   = "day"
	PeriodMonth = "month"
)

type UsageEntry struct {
	Metric    string    `json:"metric"`
	Period    string    `json:"period"`
	PeriodKey string    `json:"period_key"`
	Count     int64     `json:"count"`
	UpdatedAt time.Time `json:"updated_at"`
}

type UsageSummary struct {
	UserID  string       `json:"user_id"`
	Entries []UsageEntry `json:"entries"`
}
