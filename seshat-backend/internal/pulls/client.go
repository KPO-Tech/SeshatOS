package pulls

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
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
	Number    int       `json:"number"`
	Title     string    `json:"title"`
	HTMLURL   string    `json:"html_url"`
	State     string    `json:"state"`
	Draft     bool      `json:"draft"`
	Merged    bool      `json:"merged"`
	Additions int       `json:"additions"`
	Deletions int       `json:"deletions"`
	UpdatedAt time.Time `json:"updated_at"`
	Head      struct {
		SHA string `json:"sha"`
	} `json:"head"`
}

func (c *client) pull(ctx context.Context, owner, repo string, number int) (apiPull, error) {
	var p apiPull
	err := c.get(ctx, fmt.Sprintf("/repos/%s/%s/pulls/%d", owner, repo, number), &p)
	return p, err
}

// pullsOfBranch lists the pull requests opened from a branch of the repository, newest first.
func (c *client) pullsOfBranch(ctx context.Context, owner, repo, branch string) ([]apiPull, error) {
	query := url.Values{"head": {owner + ":" + branch}, "state": {"all"}, "sort": {"updated"}, "direction": {"desc"}, "per_page": {"5"}}
	var list []apiPull
	err := c.get(ctx, fmt.Sprintf("/repos/%s/%s/pulls?%s", owner, repo, query.Encode()), &list)
	return list, err
}

type searchItem struct {
	Number        int       `json:"number"`
	State         string    `json:"state"`
	UpdatedAt     time.Time `json:"updated_at"`
	RepositoryURL string    `json:"repository_url"`
}

// myPulls lists the pull requests the token's owner opened, the most recently updated first.
func (c *client) myPulls(ctx context.Context) ([]searchItem, error) {
	query := url.Values{"q": {"is:pr author:@me"}, "sort": {"updated"}, "order": {"desc"}, "per_page": {"10"}}
	var found struct {
		Items []searchItem `json:"items"`
	}
	err := c.get(ctx, "/search/issues?"+query.Encode(), &found)
	return found.Items, err
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
