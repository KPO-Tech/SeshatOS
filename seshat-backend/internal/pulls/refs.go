package pulls

import (
	"net/url"
	"regexp"
	"strconv"
	"strings"
)

var pullURL = regexp.MustCompile(`^/([^/]+)/([^/]+)/pull/(\d+)`)

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

func itoa(n int) string { return strconv.Itoa(n) }
