package db

import (
	"os"
	"testing"

	"golang.org/x/crypto/bcrypt"
)

// TestMain lowers HashPassword's bcrypt cost for this package's tests. See
// SetBcryptCostForTesting's doc comment.
func TestMain(m *testing.M) {
	restore := SetBcryptCostForTesting(bcrypt.MinCost)
	code := m.Run()
	restore()
	os.Exit(code)
}
