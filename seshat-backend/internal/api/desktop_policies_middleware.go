package api

import (
	"net/http"

	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/cloud/automation"
)

// requireSettingsWritable is the settings-write half of the desktop policies
// plan (see docs/helps/audit-2026-08-29-openwork-den-comparison.md § 5):
// blocks any non-read request on a wrapped route when this device's synced
// allow_settings_modification policy is false. A pure http.Handler wrapper,
// deliberately not bundling its own auth check like requireRole does - every
// route this wraps already has its own auth middleware (authMiddleware,
// mcpRoute, or requireRole) further in; this is meant to be composed as the
// outermost wrap around an already-fully-wrapped handler, e.g.
// app.requireSettingsWritable(app.authMiddleware(...)).
//
// GET/HEAD/OPTIONS always pass through untouched - viewing current settings
// is never "modifying" them. app.backend.DesktopPolicies is always
// non-nil (see App.DesktopPolicies's own doc comment), but the nil check
// stays as a defensive no-op for any test that constructs an *App by hand
// without wiring one.
func (app *App) requireSettingsWritable(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if isReadOnlyHTTPMethod(r.Method) {
			next.ServeHTTP(w, r)
			return
		}
		if app.backend != nil && app.backend.DesktopPolicies != nil &&
			!app.backend.DesktopPolicies.Allowed(r.Context(), cloudautomation.DesktopPolicyAllowSettingsModification) {
			writeJSONError(w, http.StatusForbidden, "your organization does not allow modifying settings on this device")
			return
		}
		next.ServeHTTP(w, r)
	})
}

func isReadOnlyHTTPMethod(method string) bool {
	switch method {
	case http.MethodGet, http.MethodHead, http.MethodOptions:
		return true
	default:
		return false
	}
}
