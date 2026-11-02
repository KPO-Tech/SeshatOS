package pulls

import (
	"net/url"
	"regexp"
	"strconv"
	"strings"
)

var (
	pullURL   = regexp.MustCompile(`^/([^/]+)/([^/]+)/pull/(\d+)`)
	sshRemote = regexp.MustCompile(`^git@github\.com:([^/]+)/(.+?)(?:\.git)?$`)
)

// parsePullURL reads owner, repo and number from a github.com pull request address.
func parsePullURL(raw string) (ref, bool) {
	parsed, err := url.Parse(strings.TrimSpace(raw))
	if err != nil || parsed.Hostname() != "github.com" {
		return ref{}, false
	}
	match := pullURL.FindStringSubmatch(parsed.Path)
	if match == nil {
		return ref{}, false
	}
	number, err := strconv.Atoi(match[3])
	if err != nil || number <= 0 {
		return ref{}, false
	}
	return ref{owner: match[1], repo: match[2], number: number}, true
}

// parseRemote reads owner and repo from a git remote that points at github.com, over https or ssh.
func parseRemote(remote string) (owner, repo string, ok bool) {
	remote = strings.TrimSpace(remote)
	if match := sshRemote.FindStringSubmatch(remote); match != nil {
		return match[1], match[2], true
	}
	parsed, err := url.Parse(remote)
	if err != nil || parsed.Hostname() != "github.com" {
		return "", "", false
	}
	parts := strings.Split(strings.Trim(parsed.Path, "/"), "/")
	if len(parts) != 2 || parts[0] == "" || parts[1] == "" {
		return "", "", false
	}
	return parts[0], strings.TrimSuffix(parts[1], ".git"), true
}

func itoa(n int) string { return strconv.Itoa(n) }
