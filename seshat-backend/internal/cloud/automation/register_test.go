package cloudautomation

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestRegisterAndConnectRegistersThenPersists(t *testing.T) {
	var gotRegisterAuth string
	var gotParams registerDeviceParams
	var gotHeartbeatAuth string

	fakeServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.URL.Path == "/api/v1/devices" && r.Method == http.MethodPost:
			gotRegisterAuth = r.Header.Get("Authorization")
			_ = json.NewDecoder(r.Body).Decode(&gotParams)
			_ = json.NewEncoder(w).Encode(registerDeviceResult{
				Device: Device{ID: "dev_new", Name: gotParams.Name, Status: "active"},
				Token:  "freshly-minted-token",
			})
		case r.URL.Path == "/api/v1/device/heartbeat" && r.Method == http.MethodPost:
			gotHeartbeatAuth = r.Header.Get("Authorization")
			_ = json.NewEncoder(w).Encode(Device{ID: "dev_new", Name: gotParams.Name, Status: "active"})
		default:
			t.Fatalf("unexpected request: %s %s", r.Method, r.URL.Path)
		}
	}))
	defer fakeServer.Close()

	service := newTestService(t)
	status, err := service.RegisterAndConnect(context.Background(), "usr_1", fakeServer.URL, "user-session-token", "org_1", "")
	if err != nil {
		t.Fatalf("register and connect: %v", err)
	}

	if gotRegisterAuth != "Bearer user-session-token" {
		t.Fatalf("expected registration to use the caller's session token, got %q", gotRegisterAuth)
	}
	if gotParams.OrganizationID != "org_1" {
		t.Fatalf("expected organization_id to be forwarded, got %q", gotParams.OrganizationID)
	}
	if gotParams.Name == "" {
		t.Fatal("expected a default device name to be generated when none is supplied")
	}
	if gotHeartbeatAuth != "Bearer freshly-minted-token" {
		t.Fatalf("expected the freshly registered device token to be used to validate+persist, got %q", gotHeartbeatAuth)
	}
	if !status.Connected || status.DeviceID != "dev_new" {
		t.Fatalf("unexpected status after register-and-connect: %+v", status)
	}
}

func TestRegisterAndConnectHonorsCustomName(t *testing.T) {
	var gotParams registerDeviceParams
	fakeServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/api/v1/devices" {
			_ = json.NewDecoder(r.Body).Decode(&gotParams)
			_ = json.NewEncoder(w).Encode(registerDeviceResult{Device: Device{ID: "dev_x", Name: gotParams.Name}, Token: "tok"})
			return
		}
		_ = json.NewEncoder(w).Encode(Device{ID: "dev_x", Name: gotParams.Name})
	}))
	defer fakeServer.Close()

	service := newTestService(t)
	if _, err := service.RegisterAndConnect(context.Background(), "usr_1", fakeServer.URL, "tok", "org_1", "Custom Name"); err != nil {
		t.Fatalf("register and connect: %v", err)
	}
	if gotParams.Name != "Custom Name" {
		t.Fatalf("expected the caller-supplied name to be used, got %q", gotParams.Name)
	}
}

func TestRegisterAndConnectIsIdempotentWhenAlreadyConnected(t *testing.T) {
	registerCalls := 0
	fakeServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/api/v1/devices" {
			registerCalls++
		}
		switch r.URL.Path {
		case "/api/v1/devices":
			_ = json.NewEncoder(w).Encode(registerDeviceResult{Device: Device{ID: "dev_1", Name: "n"}, Token: "tok"})
		default:
			_ = json.NewEncoder(w).Encode(Device{ID: "dev_1", Name: "n"})
		}
	}))
	defer fakeServer.Close()

	service := newTestService(t)
	if _, err := service.RegisterAndConnect(context.Background(), "usr_1", fakeServer.URL, "tok", "org_1", ""); err != nil {
		t.Fatalf("first register and connect: %v", err)
	}
	if registerCalls != 1 {
		t.Fatalf("expected exactly one registration call, got %d", registerCalls)
	}

	// Already connected: a second call must be a no-op, not a second device.
	status, err := service.RegisterAndConnect(context.Background(), "usr_1", fakeServer.URL, "tok", "org_1", "")
	if err != nil {
		t.Fatalf("second register and connect: %v", err)
	}
	if !status.Connected || status.DeviceID != "dev_1" {
		t.Fatalf("unexpected status on idempotent call: %+v", status)
	}
	if registerCalls != 1 {
		t.Fatalf("expected no additional registration call once already connected, got %d total", registerCalls)
	}
}

func TestRegisterAndConnectRejectsMissingOrganization(t *testing.T) {
	service := newTestService(t)
	if _, err := service.RegisterAndConnect(context.Background(), "usr_1", "https://example.test", "tok", "", ""); err == nil {
		t.Fatal("expected an error when organization_id is missing")
	}
}
