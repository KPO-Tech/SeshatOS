// Package dataflowsecrets stores named secrets that pkg/dataflow graph
// nodes resolve by reference (e.g. a "postgres" node's dsnSecretRef) — the
// local, single-user counterpart to seshat-server's dataflowsecrets package.
// Unlike the server side (a new org-scoped DataflowSecret table + its own
// DEK), this reuses internal/db's existing generic keyed credential store
// (UpsertCredential/GetCredential/DeleteCredential/ListCredentialKeys,
// AES-256-GCM under the instance-wide key in ~/.seshat_secret) — no new
// table, no new encryption path, same posture as every other local secret
// (provider API keys, MCP server credentials) already stored there.
package dataflowsecrets

import (
	"context"
	"errors"
	"strings"

	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/db"
)

// keyPrefix namespaces this package's rows within internal/db's shared
// credentials table so a dataflow secret's name can never collide with an
// unrelated credential key stored by another feature.
const keyPrefix = "dataflow_secret:"

type Service struct {
	db *db.DB
}

func New(database *db.DB) *Service {
	return &Service{db: database}
}

// Set creates or replaces the secret stored under name. Unlike
// seshat-server's dataflowsecrets.Set, this allows overwriting — there's no
// multi-admin coordination concern in a single-user local install, so the
// extra "delete first" ceremony buys nothing here.
func (s *Service) Set(ctx context.Context, name, value string) error {
	name = strings.TrimSpace(name)
	if name == "" || value == "" {
		return errors.New("name and value are required")
	}
	return s.db.UpsertCredential(ctx, keyPrefix+name, value)
}

// List returns the configured secret names, never their values.
func (s *Service) List(ctx context.Context) ([]string, error) {
	keys, err := s.db.ListCredentialKeys(ctx)
	if err != nil {
		return nil, err
	}
	names := make([]string, 0, len(keys))
	for _, k := range keys {
		if name, ok := strings.CutPrefix(k, keyPrefix); ok {
			names = append(names, name)
		}
	}
	return names, nil
}

func (s *Service) Delete(ctx context.Context, name string) error {
	name = strings.TrimSpace(name)
	if name == "" {
		return errors.New("name is required")
	}
	return s.db.DeleteCredential(ctx, keyPrefix+name)
}

// Resolve implements pkg/dataflow.SecretResolver.
func (s *Service) Resolve(ctx context.Context, name string) (string, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		return "", errors.New("name is required")
	}
	value, ok, err := s.db.GetCredential(ctx, keyPrefix+name)
	if err != nil {
		return "", err
	}
	if !ok {
		return "", errors.New("no dataflow secret named " + name)
	}
	return value, nil
}
