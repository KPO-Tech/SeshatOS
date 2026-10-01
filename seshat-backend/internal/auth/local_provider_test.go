package auth

import (
	"context"
	"fmt"
	"path/filepath"
	"sync"
	"testing"

	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/db"
)

// TestRegisterConcurrentFirstAdmin is a regression test for the race where
// two concurrent first-ever registrations could both (or neither) become
// admin: Register used to count users, decide the role, and assign it as
// three unsynchronized steps, so two racing calls could each observe
// count==1 (their own freshly-inserted row) before the other's insert
// registered anywhere in the decision. registerMu now serializes that
// decision within this process — see its doc comment on LocalProvider.
func TestRegisterConcurrentFirstAdmin(t *testing.T) {
	database, err := db.Open(context.Background(), db.DefaultSQLiteConfig(filepath.Join(t.TempDir(), "register-race.db")))
	if err != nil {
		t.Fatalf("db.Open: %v", err)
	}
	defer database.Close()

	identity, err := db.NewIdentityStore(database)
	if err != nil {
		t.Fatalf("NewIdentityStore: %v", err)
	}

	provider := NewLocalProvider(identity, ServiceConfig{EnableSignup: true, DefaultUserRole: "member"})

	const concurrency = 8
	var wg sync.WaitGroup
	errs := make([]error, concurrency)
	for i := 0; i < concurrency; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			_, err := provider.Register(context.Background(), fmt.Sprintf("racer%d@example.com", i), "password123", fmt.Sprintf("Racer %d", i))
			errs[i] = err
		}(i)
	}
	wg.Wait()

	for i, err := range errs {
		if err != nil {
			t.Fatalf("Register racer %d: %v", i, err)
		}
	}

	users, err := identity.ListUsers(context.Background())
	if err != nil {
		t.Fatalf("ListUsers: %v", err)
	}
	if len(users) != concurrency {
		t.Fatalf("expected %d users, got %d", concurrency, len(users))
	}

	adminCount := 0
	for _, u := range users {
		roles, err := identity.ListUserRoles(context.Background(), u.ID)
		if err != nil {
			t.Fatalf("ListUserRoles(%s): %v", u.ID, err)
		}
		for _, r := range roles {
			if r.Name == "admin" {
				adminCount++
			}
		}
	}
	if adminCount != 1 {
		t.Fatalf("expected exactly 1 admin among %d concurrently registered users, got %d", concurrency, adminCount)
	}
}
