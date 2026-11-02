package pulls

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"time"
)

const apiBase = "https://api.github.com"

var (
	errUnauthorized = errors.New("GitHub refused the token")
	errForbidden    = errors.New("the token cannot read this")
)

// client is the small part of the GitHub REST API the card needs.
type client struct {
	http  *http.Client
	base  string
	token string
}

func newClient(token string) *client {
	return &client{http: &http.Client{Timeout: 10 * time.Second}, base: apiBase, token: token}
}

func (c *client) get(ctx context.Context, path string, out any) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.base+path, nil)
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+c.token)
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("X-GitHub-Api-Version", "2022-11-28")
	resp, err := c.http.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	switch {
	case resp.StatusCode == http.StatusUnauthorized:
		return errUnauthorized
	case resp.StatusCode == http.StatusForbidden || resp.StatusCode == http.StatusNotFound:
		return errForbidden
	case resp.StatusCode != http.StatusOK:
		return fmt.Errorf("GitHub answered %d", resp.StatusCode)
	}
	return json.NewDecoder(resp.Body).Decode(out)
}

type apiPull struct {
	Number  int    `json:"number"`
	Title   string `json:"title"`
	HTMLURL string `json:"html_url"`
	State   string `json:"state"`
	Draft   bool   `json:"draft"`
	Merged  bool   `json:"merged"`
	// MergeableState is GitHub's word on merging: clean, blocked, behind, dirty, unstable, draft, has_hooks, or unknown while it computes.
	MergeableState string    `json:"mergeable_state"`
	Additions      int       `json:"additions"`
	Deletions      int       `json:"deletions"`
	CreatedAt      time.Time `json:"created_at"`
	UpdatedAt      time.Time `json:"updated_at"`
	Head           struct {
		SHA string `json:"sha"`
	} `json:"head"`
}

func (c *client) pull(ctx context.Context, owner, repo string, number int) (apiPull, error) {
	var p apiPull
	err := c.get(ctx, fmt.Sprintf("/repos/%s/%s/pulls/%d", owner, repo, number), &p)
	return p, err
}

// checks sums up the check runs of a commit into one verdict.
func (c *client) checks(ctx context.Context, owner, repo, sha string) (string, error) {
	var runs struct {
		CheckRuns []struct {
			Status     string `json:"status"`
			Conclusion string `json:"conclusion"`
		} `json:"check_runs"`
	}
	if err := c.get(ctx, fmt.Sprintf("/repos/%s/%s/commits/%s/check-runs?per_page=100", owner, repo, sha), &runs); err != nil {
		return ChecksUnknown, err
	}
	if len(runs.CheckRuns) == 0 {
		return ChecksNone, nil
	}
	verdict := ChecksPassing
	for _, run := range runs.CheckRuns {
		if run.Status != "completed" {
			verdict = ChecksPending
			continue
		}
		switch run.Conclusion {
		case "failure", "timed_out", "cancelled", "action_required", "startup_failure":
			return ChecksFailing, nil
		}
	}
	return verdict, nil
}

func stateOf(p apiPull) string {
	switch {
	case p.Merged:
		return StateMerged
	case p.State == "closed":
		return StateClosed
	case p.Draft:
		return StateDraft
	default:
		return StateOpen
	}
}
