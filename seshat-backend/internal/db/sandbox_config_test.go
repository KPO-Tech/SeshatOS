package db

import (
	"context"
	"testing"
)

// An install from before the Docker mode went runs direct, and knows it until a new choice.
func TestSandboxConfigStoredDockerModeBecomesDirectAndIsReported(t *testing.T) {
	database := openSQLiteTestDB(t)
	store, err := NewSandboxConfigStore(database)
	if err != nil {
		t.Fatal(err)
	}
	ctx := context.Background()
	if _, err := store.Upsert(ctx, UpsertSandboxConfigParams{Mode: SandboxModeLocal}); err != nil {
		t.Fatal(err)
	}
	if err := database.gormDB.Exec(`UPDATE sandbox_config SET mode = 'docker'`).Error; err != nil {
		t.Fatal(err)
	}

	cfg, err := store.Get(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if cfg.Mode != SandboxModeLocal || !cfg.DockerModeRemoved {
		t.Fatalf("%+v", cfg)
	}

	if _, err := store.Upsert(ctx, UpsertSandboxConfigParams{Mode: "docker"}); err == nil {
		t.Fatal("the mode cannot be chosen any more")
	}
	cfg, err = store.Upsert(ctx, UpsertSandboxConfigParams{Mode: SandboxModeLocal})
	if err != nil {
		t.Fatal(err)
	}
	if cfg.DockerModeRemoved {
		t.Fatal("a new choice clears the notice")
	}
}
