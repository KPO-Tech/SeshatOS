package db

import "context"

// Initialize applies versioned schema migrations. Backend product tables are
// migrated independently from the SQLite-only runtime/session tables so that
// PostgreSQL can act as the serious backend DB while the core runtime keeps its
// own SQLite session persistence when needed.
func (db *DB) Initialize(ctx context.Context) error {
	if err := db.runBackendMigrations(ctx); err != nil {
		return err
	}
	if db.driver != DriverSQLite {
		return nil
	}
	return db.runSQLiteCoreMigrations(ctx)
}
