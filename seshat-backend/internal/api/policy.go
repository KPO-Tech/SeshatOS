package api

import (
	"context"

	backendauth "github.com/KPO-Tech/SeshatOS/seshat-backend/internal/auth"
)

func authPrincipalFromContext(ctx context.Context) (*backendauth.Principal, bool) {
	principal, ok := ctx.Value(authPrincipalContextKey).(*backendauth.Principal)
	return principal, ok && principal != nil
}
