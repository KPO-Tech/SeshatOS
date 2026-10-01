package db

import (
	"crypto/rand"
	"encoding/base64"
	"fmt"

	"golang.org/x/crypto/bcrypt"
)

// bcryptCost matches the "cost 12 minimum" policy documented in SECURITY.md.
// bcrypt.DefaultCost (10) is bcrypt's own library default, not this project's.
// A var, not a const, so tests can lower it - see SetBcryptCostForTesting.
// Production code must never call the setter.
var bcryptCost = 12

// SetBcryptCostForTesting lowers bcryptCost for the duration of a test run
// and returns a function that restores the previous value. Cost 12 under
// the race detector makes password-hashing-heavy test suites (internal/api,
// which hashes a password per test fixture) slow enough to blow past go
// test's default 10-minute timeout; cost has no bearing on what those tests
// actually verify, so tests should call this (typically from TestMain) with
// bcrypt.MinCost instead of paying the real-world security cost.
func SetBcryptCostForTesting(cost int) (restore func()) {
	previous := bcryptCost
	bcryptCost = cost
	return func() { bcryptCost = previous }
}

func HashPassword(plaintext string) (string, error) {
	if plaintext == "" {
		return "", fmt.Errorf("password is required")
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(plaintext), bcryptCost)
	if err != nil {
		return "", fmt.Errorf("hash password: %w", err)
	}
	return string(hash), nil
}

func VerifyPassword(hash, plaintext string) error {
	if hash == "" {
		return fmt.Errorf("password hash is missing")
	}
	if plaintext == "" {
		return fmt.Errorf("password is required")
	}
	if err := bcrypt.CompareHashAndPassword([]byte(hash), []byte(plaintext)); err != nil {
		return fmt.Errorf("invalid credentials")
	}
	return nil
}

func GenerateSessionToken() (string, error) {
	var raw [32]byte
	if _, err := rand.Read(raw[:]); err != nil {
		return "", fmt.Errorf("generate session token: %w", err)
	}
	return base64.RawURLEncoding.EncodeToString(raw[:]), nil
}
