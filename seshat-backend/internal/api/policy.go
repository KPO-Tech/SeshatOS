package api

import (
	"context"

	backendauth "github.com/EngineerProjects/seshat-ai/seshat-backend/internal/auth"
)

func authPrincipalFromContext(ctx context.Context) (*backendauth.Principal, bool) {
	principal, ok := ctx.Value(authPrincipalContextKey).(*backendauth.Principal)
	return principal, ok && principal != nil
}
