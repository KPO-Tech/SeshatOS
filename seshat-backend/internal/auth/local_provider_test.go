package auth

import (
	"context"
	"errors"
	"testing"

	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/bkerr"
)

// A device has one local identity; nothing may create another account on it,
// whatever the signup setting says.
func TestLocalProviderRefusesRegister(t *testing.T) {
	provider := NewLocalProvider(nil, ServiceConfig{EnableSignup: true})

	_, err := provider.Register(context.Background(), "someone@example.com", "password123", "Someone")
	if err == nil {
		t.Fatal("Register must be refused on a local device")
	}
	var coded *bkerr.Error
	if !errors.As(err, &coded) || coded.Kind != bkerr.ErrorKindForbidden {
		t.Fatalf("expected a forbidden error, got %v", err)
	}
}
