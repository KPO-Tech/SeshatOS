package cloudlongterm

import "context"

// The SDK's longterm.Store interface is scoped by a raw userID string, with
// no room for a bearer token in its method signatures (it was designed for
// a purely local store, which never needs one). RemoteStore still needs a
// per-caller token to authenticate its HTTP calls, and — since a single
// seshat-backend process can serve multiple local user accounts
// concurrently — that token must travel with each individual request, not
// live in a shared mutable field on RemoteStore (which would risk one
// user's request being sent under another user's identity). context.Context
// is the idiomatic place for exactly this kind of request-scoped value
// crossing an interface boundary it wasn't designed for.
type tokenKey struct{}

// ContextWithToken attaches the caller's own session token to ctx, so a
// downstream longterm.Store call (whose signature has no room for one) can
// still authenticate if it turns out to be a RemoteStore. A no-op as far as
// the standalone LocalStore is concerned — it never reads this value.
func ContextWithToken(ctx context.Context, token string) context.Context {
	return context.WithValue(ctx, tokenKey{}, token)
}

func tokenFromContext(ctx context.Context) string {
	token, _ := ctx.Value(tokenKey{}).(string)
	return token
}
