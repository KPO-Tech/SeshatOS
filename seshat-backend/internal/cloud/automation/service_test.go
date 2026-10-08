package cloudautomation

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestServiceStatusWhenNotConnected(t *testing.T) {
	service := newTestService(t)
	status, err := service.Status(context.Background())
	if err != nil {
		t.Fatalf("status: %v", err)
	}
	if status.Connected {
		t.Fatalf("expected not connected, got %+v", status)
	}
}

func TestServiceConnectValidatesAndPersists(t *testing.T) {
	var gotAuth string
	fakeServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/v1/device/heartbeat" || r.Method != http.MethodPost {
			t.Fatalf("unexpected request: %s %s", r.Method, r.URL.Path)
		}
		gotAuth = r.Header.Get("Authorization")
		_ = json.NewEncoder(w).Encode(Device{ID: "dev_123", Name: "Alice's laptop", Status: "active"})
	}))
	defer fakeServer.Close()

	service := newTestService(t)
	status, err := service.Connect(context.Background(), "usr_1", fakeServer.URL, "device-token-abc")
	if err != nil {
		t.Fatalf("connect: %v", err)
	}
	if gotAuth != "Bearer device-token-abc" {
		t.Fatalf("expected the device token to be sent as a bearer token, got %q", gotAuth)
	}
	if !status.Connected || status.DeviceID != "dev_123" || status.DeviceName != "Alice's laptop" {
		t.Fatalf("unexpected status after connect: %+v", status)
	}
	if status.ConnectedByUserID != "usr_1" {
		t.Fatalf("expected connected_by_user_id to be recorded, got %+v", status)
	}

	// A second call to Status must reflect the persisted connection, not
	// just the in-memory Connect result.
	reloaded, err := service.Status(context.Background())
	if err != nil {
		t.Fatalf("status after connect: %v", err)
	}
	if !reloaded.Connected || reloaded.DeviceID != "dev_123" {
		t.Fatalf("expected the connection to persist across calls, got %+v", reloaded)
	}
}

func TestServiceConnectPersistsHeartbeatPolicies(t *testing.T) {
	fakeServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewEncoder(w).Encode(Device{
			ID: "dev_123", Name: "Alice's laptop", Status: "active",
			Policies: map[string]bool{"allow_custom_providers": false, "allow_local_models": true},
		})
	}))
	defer fakeServer.Close()

	service, policies := newTestServiceWithPolicyStore(t)
	if _, err := service.Connect(context.Background(), "usr_1", fakeServer.URL, "device-token-abc"); err != nil {
		t.Fatalf("connect: %v", err)
	}

	ctx := context.Background()
	if policies.Allowed(ctx, "allow_custom_providers") {
		t.Fatal("expected Connect's own heartbeat to have persisted the restriction")
	}
	if !policies.Allowed(ctx, "allow_local_models") {
		t.Fatal("expected the allowed policy to also be persisted")
	}
}

func TestServiceStatusIncludesPolicies(t *testing.T) {
	fakeServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewEncoder(w).Encode(Device{
			ID: "dev_123", Name: "Alice's laptop", Status: "active",
			Policies: map[string]bool{"allow_custom_providers": false},
		})
	}))
	defer fakeServer.Close()

	service := newTestService(t)
	if _, err := service.Connect(context.Background(), "usr_1", fakeServer.URL, "device-token-abc"); err != nil {
		t.Fatalf("connect: %v", err)
	}

	status, err := service.Status(context.Background())
	if err != nil {
		t.Fatalf("status: %v", err)
	}
	if status.Policies["allow_custom_providers"] {
		t.Fatalf("expected Status to surface the synced policy bundle, got %+v", status.Policies)
	}
}

func TestServiceDisconnectClearsPolicies(t *testing.T) {
	fakeServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewEncoder(w).Encode(Device{
			ID: "dev_123", Name: "Alice's laptop", Status: "active",
			Policies: map[string]bool{"allow_custom_providers": false},
		})
	}))
	defer fakeServer.Close()

	service, policies := newTestServiceWithPolicyStore(t)
	if _, err := service.Connect(context.Background(), "usr_1", fakeServer.URL, "device-token-abc"); err != nil {
		t.Fatalf("connect: %v", err)
	}
	ctx := context.Background()
	if policies.Allowed(ctx, "allow_custom_providers") {
		t.Fatal("expected the restriction to apply before disconnect")
	}

	if err := service.Disconnect(ctx); err != nil {
		t.Fatalf("disconnect: %v", err)
	}
	if !policies.Allowed(ctx, "allow_custom_providers") {
		t.Fatal("expected a disconnected device to fail open again, not keep enforcing a stale restriction from an org it's no longer connected to")
	}
}

func TestServiceConnectPersistsHeartbeatAppVersionStatus(t *testing.T) {
	minVersion := "1.0.0"
	fakeServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewEncoder(w).Encode(Device{
			ID: "dev_123", Name: "Alice's laptop", Status: "active",
			MinAppVersion: &minVersion, AppVersionOutdated: true,
		})
	}))
	defer fakeServer.Close()

	service, versions := newTestServiceWithVersionStore(t)
	if _, err := service.Connect(context.Background(), "usr_1", fakeServer.URL, "device-token-abc"); err != nil {
		t.Fatalf("connect: %v", err)
	}

	gotMin, gotOutdated := versions.Status(context.Background())
	if gotMin == nil || *gotMin != minVersion {
		t.Fatalf("expected min_app_version to be persisted, got %+v", gotMin)
	}
	if !gotOutdated {
		t.Fatal("expected the outdated flag to be persisted")
	}
}

func TestServiceStatusIncludesAppVersionStatus(t *testing.T) {
	minVersion := "1.0.0"
	fakeServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewEncoder(w).Encode(Device{
			ID: "dev_123", Name: "Alice's laptop", Status: "active",
			MinAppVersion: &minVersion, AppVersionOutdated: true,
		})
	}))
	defer fakeServer.Close()

	service := newTestService(t)
	if _, err := service.Connect(context.Background(), "usr_1", fakeServer.URL, "device-token-abc"); err != nil {
		t.Fatalf("connect: %v", err)
	}

	status, err := service.Status(context.Background())
	if err != nil {
		t.Fatalf("status: %v", err)
	}
	if status.MinAppVersion == nil || *status.MinAppVersion != minVersion {
		t.Fatalf("expected Status to surface the synced min app version, got %+v", status.MinAppVersion)
	}
	if !status.AppVersionOutdated {
		t.Fatal("expected Status to surface the outdated flag")
	}
}

func TestServiceDisconnectClearsAppVersionStatus(t *testing.T) {
	minVersion := "1.0.0"
	fakeServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewEncoder(w).Encode(Device{
			ID: "dev_123", Name: "Alice's laptop", Status: "active",
			MinAppVersion: &minVersion, AppVersionOutdated: true,
		})
	}))
	defer fakeServer.Close()

	service, versions := newTestServiceWithVersionStore(t)
	if _, err := service.Connect(context.Background(), "usr_1", fakeServer.URL, "device-token-abc"); err != nil {
		t.Fatalf("connect: %v", err)
	}
	ctx := context.Background()
	if gotMin, _ := versions.Status(ctx); gotMin == nil {
		t.Fatal("expected the app version status to apply before disconnect")
	}

	if err := service.Disconnect(ctx); err != nil {
		t.Fatalf("disconnect: %v", err)
	}
	if gotMin, gotOutdated := versions.Status(ctx); gotMin != nil || gotOutdated {
		t.Fatalf("expected a disconnected device to clear its stale app version status, got min=%+v outdated=%v", gotMin, gotOutdated)
	}
}

func TestServiceConnectRejectsInvalidToken(t *testing.T) {
	fakeServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusUnauthorized)
		_, _ = w.Write([]byte(`{"error":{"message":"invalid device token"}}`))
	}))
	defer fakeServer.Close()

	service := newTestService(t)
	if _, err := service.Connect(context.Background(), "usr_1", fakeServer.URL, "bad-token"); err == nil {
		t.Fatal("expected connect to fail for a rejected token")
	}

	status, err := service.Status(context.Background())
	if err != nil {
		t.Fatalf("status: %v", err)
	}
	if status.Connected {
		t.Fatal("expected a failed connect attempt to not persist anything")
	}
}

func TestServiceConnectRequiresServerURLAndToken(t *testing.T) {
	service := newTestService(t)
	if _, err := service.Connect(context.Background(), "usr_1", "", "token"); err == nil {
		t.Fatal("expected connect to reject an empty server_url")
	}
	if _, err := service.Connect(context.Background(), "usr_1", "https://cloud.example.com", ""); err == nil {
		t.Fatal("expected connect to reject an empty device_token")
	}
}

func TestServiceDisconnectClearsConnection(t *testing.T) {
	fakeServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewEncoder(w).Encode(Device{ID: "dev_123", Name: "Worker"})
	}))
	defer fakeServer.Close()

	service := newTestService(t)
	if _, err := service.Connect(context.Background(), "usr_1", fakeServer.URL, "tok"); err != nil {
		t.Fatalf("connect: %v", err)
	}
	if err := service.Disconnect(context.Background()); err != nil {
		t.Fatalf("disconnect: %v", err)
	}
	status, err := service.Status(context.Background())
	if err != nil {
		t.Fatalf("status: %v", err)
	}
	if status.Connected {
		t.Fatal("expected disconnect to clear the connection")
	}
}
