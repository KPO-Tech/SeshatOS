package cloudautomation

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestAutoRegisterFirstDeviceRegistersWhenOrgHasNoDevices(t *testing.T) {
	registerCalls := 0
	fakeServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.URL.Path == "/api/v1/devices" && r.Method == http.MethodGet:
			_ = json.NewEncoder(w).Encode(map[string]any{"devices": []Device{}})
		case r.URL.Path == "/api/v1/devices" && r.Method == http.MethodPost:
			registerCalls++
			_ = json.NewEncoder(w).Encode(registerDeviceResult{Device: Device{ID: "dev_1", Name: "n"}, Token: "tok"})
		case r.URL.Path == "/api/v1/device/heartbeat":
			_ = json.NewEncoder(w).Encode(Device{ID: "dev_1", Name: "n"})
		default:
			t.Fatalf("unexpected request: %s %s", r.Method, r.URL.Path)
		}
	}))
	defer fakeServer.Close()

	service := newTestService(t)
	status := service.AutoRegisterFirstDevice(context.Background(), "usr_1", fakeServer.URL, "user-session-token", "org_1")

	if registerCalls != 1 {
		t.Fatalf("expected exactly one registration call, got %d", registerCalls)
	}
	if !status.Connected || status.DeviceID != "dev_1" {
		t.Fatalf("expected the device to auto-register when the organization has none yet, got %+v", status)
	}
}

func TestAutoRegisterFirstDeviceSkipsWhenOrgAlreadyHasADevice(t *testing.T) {
	registerCalls := 0
	fakeServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.URL.Path == "/api/v1/devices" && r.Method == http.MethodGet:
			_ = json.NewEncoder(w).Encode(map[string]any{"devices": []Device{{ID: "dev_elsewhere", Name: "Someone else's laptop"}}})
		case r.URL.Path == "/api/v1/devices" && r.Method == http.MethodPost:
			registerCalls++
			_ = json.NewEncoder(w).Encode(registerDeviceResult{Device: Device{ID: "dev_2", Name: "n"}, Token: "tok"})
		default:
			t.Fatalf("unexpected request: %s %s", r.Method, r.URL.Path)
		}
	}))
	defer fakeServer.Close()

	service := newTestService(t)
	status := service.AutoRegisterFirstDevice(context.Background(), "usr_1", fakeServer.URL, "user-session-token", "org_1")

	if registerCalls != 0 {
		t.Fatalf("expected no registration call once the organization already has a device, got %d", registerCalls)
	}
	if status.Connected {
		t.Fatalf("expected this machine to stay disconnected - moving automation to a new device is an explicit action, got %+v", status)
	}
}

func TestAutoRegisterFirstDeviceIsNoOpWhenAlreadyConnected(t *testing.T) {
	listCalls := 0
	fakeServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.URL.Path == "/api/v1/devices" && r.Method == http.MethodGet:
			listCalls++
			_ = json.NewEncoder(w).Encode(map[string]any{"devices": []Device{}})
		default:
			_ = json.NewEncoder(w).Encode(Device{ID: "dev_existing", Name: "n"})
		}
	}))
	defer fakeServer.Close()

	service := newTestService(t)
	if _, err := service.Connect(context.Background(), "usr_1", fakeServer.URL, "device-token-abc"); err != nil {
		t.Fatalf("connect: %v", err)
	}

	status := service.AutoRegisterFirstDevice(context.Background(), "usr_1", fakeServer.URL, "user-session-token", "org_1")
	if !status.Connected || status.DeviceID != "dev_existing" {
		t.Fatalf("expected the existing connection to be returned unchanged, got %+v", status)
	}
	if listCalls != 0 {
		t.Fatalf("expected no organization device lookup once this machine is already connected, got %d calls", listCalls)
	}
}

func TestAutoRegisterFirstDeviceStaysDisconnectedOnListError(t *testing.T) {
	registerCalls := 0
	fakeServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/api/v1/devices" && r.Method == http.MethodGet {
			w.WriteHeader(http.StatusInternalServerError)
			return
		}
		registerCalls++
		_ = json.NewEncoder(w).Encode(registerDeviceResult{Device: Device{ID: "dev_1", Name: "n"}, Token: "tok"})
	}))
	defer fakeServer.Close()

	service := newTestService(t)
	status := service.AutoRegisterFirstDevice(context.Background(), "usr_1", fakeServer.URL, "user-session-token", "org_1")

	if status == nil || status.Connected {
		t.Fatalf("expected a disconnected status (not a panic or nil) when the device lookup fails, got %+v", status)
	}
	if registerCalls != 0 {
		t.Fatalf("expected no registration attempt when the organization's device count couldn't be confirmed, got %d", registerCalls)
	}
}
