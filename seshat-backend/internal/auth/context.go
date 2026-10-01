package auth

import "context"

// principalContextKey is unexported so WithContext is the only way to set
// this value - mirrors internal/api's own authPrincipalContextKey pattern,
// but lives here (not internal/api) so any internal package can read the
// current principal without importing internal/api, e.g. an agent tool
// deep in the query engine's call stack (see internal/knowledge/tool).
type principalContextKeyType struct{}

var principalContextKey = principalContextKeyType{}

// WithContext attaches principal to ctx, retrievable via FromContext.
func WithContext(ctx context.Context, principal *Principal) context.Context {
	return context.WithValue(ctx, principalContextKey, principal)
}

// FromContext retrieves the principal attached via WithContext, if any.
// Distinct from an HTTP-request-scoped principal lookup (internal/api's
// authPrincipalFromContext reads a request's auth middleware output) -
// this is for code that only has the query engine's derived context, not
// the original *http.Request, e.g. a tool call several layers into the
// SDK's session/tool-execution machinery.
func FromContext(ctx context.Context) (*Principal, bool) {
	principal, ok := ctx.Value(principalContextKey).(*Principal)
	return principal, ok && principal != nil
}
