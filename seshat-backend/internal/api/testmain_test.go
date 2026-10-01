package api

import (
	"os"
	"testing"

	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/db"
	"golang.org/x/crypto/bcrypt"
)

// TestMain lowers db.HashPassword's bcrypt cost for this package's tests.
// This package hashes a real password per security-test fixture; at the
// production cost (12) the race detector's overhead is enough to blow past
// go test's default 10-minute timeout well before every test runs. See
// db.SetBcryptCostForTesting's doc comment.
func TestMain(m *testing.M) {
	restore := db.SetBcryptCostForTesting(bcrypt.MinCost)
	code := m.Run()
	restore()
	os.Exit(code)
}
