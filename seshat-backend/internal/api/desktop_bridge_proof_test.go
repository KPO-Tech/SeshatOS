package api

import (
	"bytes"
	"testing"
)

// The same vector is checked by the desktop (src/main/runtime.test.ts): both sides compute this HMAC and must
// agree byte for byte, or "continue without an account" stops working with no error on either side.
func TestDesktopBridgeProofMatchesTheDesktopVector(t *testing.T) {
	secret := bytes.Repeat([]byte{1}, 32)
	const want = "dda78979dbe0250586d67d89ab428f780e9e8d8ce5527c921bbcaf3cb8f0d4b2"
	if got := desktopBridgeProof(secret, localSessionProofContext); got != want {
		t.Fatalf("proof = %s, want %s", got, want)
	}
}
