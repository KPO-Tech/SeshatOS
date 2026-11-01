package pulls

import (
	"context"
	"os/exec"
	"strings"
	"time"
)

// Credential finds a GitHub token and says where it came from.
type Credential func(ctx context.Context) (token, source string)

// ChainCredential tries the connector's token first, then the one of the GitHub CLI when it is installed and signed in. Either may
// be nil. The token of the CLI is read when needed and never kept.
func ChainCredential(connector func(ctx context.Context) (string, bool)) Credential {
	return func(ctx context.Context) (string, string) {
		if connector != nil {
			if token, ok := connector(ctx); ok && strings.TrimSpace(token) != "" {
				return strings.TrimSpace(token), CredentialConnector
			}
		}
		if token := ghCLIToken(ctx); token != "" {
			return token, CredentialGH
		}
		return "", CredentialNone
	}
}

func ghCLIToken(ctx context.Context) string {
	if _, err := exec.LookPath("gh"); err != nil {
		return ""
	}
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	out, err := exec.CommandContext(ctx, "gh", "auth", "token").Output()
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(out))
}
