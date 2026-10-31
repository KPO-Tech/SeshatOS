// Package pulls follows the GitHub pull requests of the person using the app: the ones a session worked on and the ones they
// opened. It reads, never writes, and keeps nothing on disk.
package pulls

import "time"

// Visible is how many pull requests the card shows. The rest, closed ones above all, simply fall out of the list.
const Visible = 5

// StaleAfter is how long a closed or merged pull request stays in the list after its last update.
const StaleAfter = 7 * 24 * time.Hour

// Pull request states.
const (
	StateOpen   = "open"
	StateDraft  = "draft"
	StateMerged = "merged"
	StateClosed = "closed"
)

// Verdicts of the checks of a pull request.
const (
	ChecksPassing = "passing"
	ChecksFailing = "failing"
	ChecksPending = "pending"
	ChecksNone    = "none"
	// ChecksUnknown is a token that cannot read the checks.
	ChecksUnknown = "unknown"
)

// Where the GitHub credential came from.
const (
	CredentialConnector = "connector"
	CredentialGH        = "gh"
	CredentialNone      = "none"
)

// Pull is one pull request as the card draws it.
type Pull struct {
	Owner       string    `json:"owner"`
	Repo        string    `json:"repo"`
	Number      int       `json:"number"`
	Title       string    `json:"title"`
	URL         string    `json:"url"`
	State       string    `json:"state"`
	Additions   int       `json:"additions"`
	Deletions   int       `json:"deletions"`
	Checks      string    `json:"checks"`
	UpdatedAt   time.Time `json:"updated_at"`
	FromSession bool      `json:"from_session"`
}

// Request says what the session knows: its folder, and the pull request addresses its tools printed.
type Request struct {
	WorkspacePath string   `json:"workspace_path"`
	URLs          []string `json:"urls"`
}

// Result is the list to draw, with what to tell the person when it is short.
type Result struct {
	Pulls      []Pull `json:"pulls"`
	Credential string `json:"credential"`
	// Note is a sentence for the card when something limits it: no credential, no right to read the checks, GitHub unreachable.
	Note string `json:"note,omitempty"`
}

// ref names a pull request before it is fetched.
type ref struct {
	owner, repo string
	number      int
	updatedAt   time.Time
	session     bool
}
