// Package pulls follows the GitHub pull requests the agent of a session opened. It reads, never writes, and keeps nothing on disk.
package pulls

import "time"

// Visible is how many pull requests the card shows. The rest, closed ones above all, simply fall out of the list.
const Visible = 5

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
	Owner     string `json:"owner"`
	Repo      string `json:"repo"`
	Number    int    `json:"number"`
	Title     string `json:"title"`
	URL       string `json:"url"`
	State     string `json:"state"`
	Additions int    `json:"additions"`
	Deletions int    `json:"deletions"`
	Checks    string `json:"checks"`
	// MergeableState is GitHub's mergeable_state, as it gave it: the desktop turns it, with the checks, into one status.
	MergeableState string    `json:"mergeable_state"`
	UpdatedAt      time.Time `json:"updated_at"`
}

// MaxCandidates is how many addresses a request may hold: a call that lists pull requests prints many, and each is read once to learn when
// it was created.
const MaxCandidates = 20

// CreatedSlack widens the window of a call on both sides: GitHub's clock and the computer's are not the same, and created_at is to the
// second.
const CreatedSlack = 2 * time.Minute

// Candidate is a pull request address that a tool call of the agent printed. With the call's window, it counts only when GitHub says the
// pull request was created inside it: the call opened it, whatever the way (gh pr create, gh api, curl, a script, an MCP tool). A call
// that only listed or read it printed it too, but it was created before. Without a window (a runtime that did not time its calls, or a
// pull request already known to be the agent's), it counts as it is.
type Candidate struct {
	URL       string     `json:"url"`
	StartedAt *time.Time `json:"started_at,omitempty"`
	EndedAt   *time.Time `json:"ended_at,omitempty"`
}

// Request lists the pull request addresses the tool calls of the agent printed, the most recent first (see collectPullCandidates in the
// desktop).
type Request struct {
	Candidates []Candidate `json:"candidates"`
}

// Result is the list to draw, with what to tell the person when it is short.
type Result struct {
	Pulls      []Pull `json:"pulls"`
	Credential string `json:"credential"`
	// Note is a sentence for the card when something limits it: no credential, no right to read the checks, GitHub unreachable.
	Note string `json:"note,omitempty"`
}

// ref names a pull request before it is fetched, with the windows of the calls that printed it.
type ref struct {
	owner, repo string
	number      int
	// trusted is a printing call without a window: the pull request counts without looking at when it was created.
	trusted bool
	windows []window
}

type window struct{ from, to time.Time }

// openedBy says whether a pull request created at that time was opened by one of the calls that printed it.
func (r ref) openedBy(created time.Time) bool {
	if r.trusted {
		return true
	}
	for _, w := range r.windows {
		if !created.Before(w.from.Add(-CreatedSlack)) && !created.After(w.to.Add(CreatedSlack)) {
			return true
		}
	}
	return false
}
