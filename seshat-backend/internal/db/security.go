package db

import (
	"crypto/rand"
	"encoding/base64"
	"fmt"

	"golang.org/x/crypto/bcrypt"
)

// bcryptCost matches the "cost 12 minimum" policy documented in SECURITY.md.
// bcrypt.DefaultCost (10) is bcrypt's own library default, not this project's.
const bcryptCost = 12

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
