package db

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"github.com/KPO-Tech/seshat/pkg/mcp"
)

type gMCPServer struct {
	ID            string `gorm:"primaryKey;size:64"`
	Name          string `gorm:"column:name;size:255;not null;uniqueIndex"`
	DisplayName   string `gorm:"column:display_name;size:255;not null;default:''"`
	ServerType    string `gorm:"column:server_type;size:64;not null;default:'stdio'"`
	Command       string `gorm:"column:command;type:text;not null;default:''"`
	ArgsJSON      string `gorm:"column:args_json;type:text;not null;default:'[]'"`
	EnvJSON       string `gorm:"column:env_json;type:text;not null;default:''"`
	URL           string `gorm:"column:url;type:text;not null;default:''"`
	HeadersJSON   string `gorm:"column:headers_json;type:text;not null;default:''"`
	TimeoutSecs   int    `gorm:"column:timeout_secs;not null;default:30"`
	Icon          string `gorm:"column:icon;size:64;not null;default:'🔌'"`
	Enabled       bool   `gorm:"column:enabled;not null;default:true"`
	Source        string `gorm:"column:source;size:32;not null;default:'db'"` // 'db' | 'file'
	CreatedAtUnix int64  `gorm:"column:created_at_unix;autoCreateTime:unix"`
	UpdatedAtUnix int64  `gorm:"column:updated_at_unix;autoUpdateTime:unix"`
}

func (gMCPServer) TableName() string { return "mcp_servers" }

type MCPServer struct {
	ID          string
	Name        string
	DisplayName string
	ServerType  string
	Command     string
	Args        []string
	Env         map[string]string
	URL         string
	Headers     map[string]string
	TimeoutSecs int
	Icon        string
	Enabled     bool
	Source      string
	CreatedAt   time.Time
	UpdatedAt   time.Time
}

type CreateMCPServerParams struct {
	Name        string
	DisplayName string
	ServerType  string
	Command     string
	Args        []string
	Env         map[string]string
	URL         string
	Headers     map[string]string
	TimeoutSecs int
	Icon        string
	Enabled     bool
}

type UpdateMCPServerParams struct {
	DisplayName *string
	ServerType  *string
	Command     *string
	Args        []string
	Env         map[string]string
	URL         *string
	Headers     map[string]string
	TimeoutSecs *int
	Icon        *string
	Enabled     *bool
}

type MCPServerStore struct {
	db *DB
}

func NewMCPServerStore(database *DB) (*MCPServerStore, error) {
	if database == nil {
		return nil, fmt.Errorf("mcp server store: database is required")
	}
	return &MCPServerStore{db: database}, nil
}

func (s *MCPServerStore) List(ctx context.Context) ([]MCPServer, error) {
	var rows []gMCPServer
	if err := s.db.gormDB.WithContext(ctx).
		Order("created_at_unix ASC").
		Find(&rows).Error; err != nil {
		return nil, err
	}
	result := make([]MCPServer, 0, len(rows))
	for _, r := range rows {
		server, err := mcpServerFromModel(r)
		if err != nil {
			return nil, err
		}
		result = append(result, server)
	}
	return result, nil
}

func (s *MCPServerStore) ListEnabled(ctx context.Context) ([]MCPServer, error) {
	var rows []gMCPServer
	if err := s.db.gormDB.WithContext(ctx).
		Where("enabled = ?", true).
		Order("created_at_unix ASC").
		Find(&rows).Error; err != nil {
		return nil, err
	}
	result := make([]MCPServer, 0, len(rows))
	for _, r := range rows {
		server, err := mcpServerFromModel(r)
		if err != nil {
			return nil, err
		}
		result = append(result, server)
	}
	return result, nil
}

func (s *MCPServerStore) GetByID(ctx context.Context, id string) (*MCPServer, error) {
	var row gMCPServer
	err := s.db.gormDB.WithContext(ctx).Where("id = ?", id).First(&row).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, fmt.Errorf("mcp server not found")
	}
	if err != nil {
		return nil, err
	}
	m, err := mcpServerFromModel(row)
	if err != nil {
		return nil, err
	}
	return &m, nil
}

// GetByName looks up a configured MCP server by its unique Name - used by
// an ActionConnector implementation to resolve its target server by a
// well-known name rather than an opaque ID. found=false (not an error)
// means no server is configured under that name yet.
func (s *MCPServerStore) GetByName(ctx context.Context, name string) (*MCPServer, bool, error) {
	var row gMCPServer
	err := s.db.gormDB.WithContext(ctx).Where("name = ?", name).First(&row).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, false, nil
	}
	if err != nil {
		return nil, false, err
	}
	m, err := mcpServerFromModel(row)
	if err != nil {
		return nil, false, err
	}
	return &m, true, nil
}

func (s *MCPServerStore) Create(ctx context.Context, p CreateMCPServerParams) (*MCPServer, error) {
	if strings.TrimSpace(p.Name) == "" {
		return nil, fmt.Errorf("name is required")
	}
	serverType := strings.TrimSpace(p.ServerType)
	if serverType == "" {
		serverType = "stdio"
	}
	icon := strings.TrimSpace(p.Icon)
	if icon == "" {
		icon = "🔌"
	}
	timeout := p.TimeoutSecs
	if timeout <= 0 {
		timeout = 30
	}
	argsJSON, _ := json.Marshal(p.Args)
	envJSON, err := encodeMCPSecretMap(p.Env)
	if err != nil {
		return nil, err
	}
	headersJSON, err := encodeMCPSecretMap(p.Headers)
	if err != nil {
		return nil, err
	}
	row := gMCPServer{
		ID:          newIdentityID("mcp"),
		Name:        strings.TrimSpace(p.Name),
		DisplayName: strings.TrimSpace(p.DisplayName),
		ServerType:  serverType,
		Command:     strings.TrimSpace(p.Command),
		ArgsJSON:    string(argsJSON),
		EnvJSON:     envJSON,
		URL:         strings.TrimSpace(p.URL),
		HeadersJSON: headersJSON,
		TimeoutSecs: timeout,
		Icon:        icon,
		Enabled:     p.Enabled,
		Source:      "db",
	}
	if err := s.db.gormDB.WithContext(ctx).Create(&row).Error; err != nil {
		return nil, err
	}
	m, err := mcpServerFromModel(row)
	if err != nil {
		return nil, err
	}
	return &m, nil
}

func (s *MCPServerStore) Update(ctx context.Context, id string, p UpdateMCPServerParams) (*MCPServer, error) {
	updates := map[string]any{}
	if p.DisplayName != nil {
		updates["display_name"] = *p.DisplayName
	}
	if p.ServerType != nil {
		updates["server_type"] = *p.ServerType
	}
	if p.Command != nil {
		updates["command"] = *p.Command
	}
	if p.Args != nil {
		b, _ := json.Marshal(p.Args)
		updates["args_json"] = string(b)
	}
	if p.Env != nil {
		b, err := encodeMCPSecretMap(p.Env)
		if err != nil {
			return nil, err
		}
		updates["env_json"] = b
	}
	if p.URL != nil {
		updates["url"] = *p.URL
	}
	if p.Headers != nil {
		b, err := encodeMCPSecretMap(p.Headers)
		if err != nil {
			return nil, err
		}
		updates["headers_json"] = b
	}
	if p.TimeoutSecs != nil {
		updates["timeout_secs"] = *p.TimeoutSecs
	}
	if p.Icon != nil {
		updates["icon"] = *p.Icon
	}
	if p.Enabled != nil {
		updates["enabled"] = *p.Enabled
	}
	if len(updates) == 0 {
		return s.GetByID(ctx, id)
	}
	res := s.db.gormDB.WithContext(ctx).
		Model(&gMCPServer{}).
		Where("id = ?", id).
		Updates(updates)
	if res.Error != nil {
		return nil, res.Error
	}
	if res.RowsAffected == 0 {
		return nil, fmt.Errorf("mcp server not found")
	}
	return s.GetByID(ctx, id)
}

func (s *MCPServerStore) Delete(ctx context.Context, id string) error {
	res := s.db.gormDB.WithContext(ctx).Delete(&gMCPServer{}, "id = ?", id)
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		return fmt.Errorf("mcp server not found")
	}
	return nil
}

// ImportFromMcpJSON upserts servers from a parsed seshat_mcp.json / mcp.json config.
// Returns number of servers imported.
func (s *MCPServerStore) ImportFromMcpJSON(ctx context.Context, cfg mcp.McpJsonConfig) (int, error) {
	count := 0
	for name, srv := range cfg.MCPServers {
		if strings.TrimSpace(name) == "" {
			continue
		}
		serverType := string(srv.Type)
		if serverType == "" {
			if srv.Command != "" {
				serverType = "stdio"
			} else if srv.URL != "" {
				serverType = "http"
			} else {
				serverType = "stdio"
			}
		}
		argsJSON, _ := json.Marshal(srv.Args)
		envJSON, err := encodeMCPSecretMap(srv.Env)
		if err != nil {
			return count, err
		}
		headersJSON, err := encodeMCPSecretMap(srv.Headers)
		if err != nil {
			return count, err
		}
		timeout := srv.Timeout
		if timeout <= 0 {
			timeout = 30
		}
		row := gMCPServer{
			ID:          newIdentityID("mcp"),
			Name:        name,
			DisplayName: name,
			ServerType:  serverType,
			Command:     srv.Command,
			ArgsJSON:    string(argsJSON),
			EnvJSON:     envJSON,
			URL:         srv.URL,
			HeadersJSON: headersJSON,
			TimeoutSecs: timeout,
			Icon:        "🔌",
			Enabled:     true,
			Source:      "file",
		}
		err = s.db.gormDB.WithContext(ctx).
			Clauses(clause.OnConflict{
				Columns: []clause.Column{{Name: "name"}},
				DoUpdates: clause.AssignmentColumns([]string{
					"server_type", "command", "args_json", "env_json",
					"url", "headers_json", "timeout_secs", "source", "updated_at_unix",
				}),
			}).
			Create(&row).Error
		if err != nil {
			return count, fmt.Errorf("import %q: %w", name, err)
		}
		count++
	}
	return count, nil
}

func migrateMCPServerSecretEncryption(ctx context.Context, db *DB) error {
	if db == nil || db.gormDB == nil {
		return fmt.Errorf("database is required")
	}
	var rows []gMCPServer
	if err := db.gormDB.WithContext(ctx).Find(&rows).Error; err != nil {
		return err
	}
	var key []byte
	for _, row := range rows {
		updates := map[string]any{}
		if migrated, changed, err := migrateLegacyMCPSecretMapJSON(key, row.EnvJSON); err != nil {
			return fmt.Errorf("migrate mcp env secrets for %s: %w", row.ID, err)
		} else if changed {
			if key == nil {
				key, err = loadOrCreateEncryptionKey()
				if err != nil {
					return err
				}
				migrated, _, err = migrateLegacyMCPSecretMapJSON(key, row.EnvJSON)
				if err != nil {
					return fmt.Errorf("migrate mcp env secrets for %s: %w", row.ID, err)
				}
			}
			updates["env_json"] = migrated
		}
		if migrated, changed, err := migrateLegacyMCPSecretMapJSON(key, row.HeadersJSON); err != nil {
			return fmt.Errorf("migrate mcp header secrets for %s: %w", row.ID, err)
		} else if changed {
			if key == nil {
				key, err = loadOrCreateEncryptionKey()
				if err != nil {
					return err
				}
				migrated, _, err = migrateLegacyMCPSecretMapJSON(key, row.HeadersJSON)
				if err != nil {
					return fmt.Errorf("migrate mcp header secrets for %s: %w", row.ID, err)
				}
			}
			updates["headers_json"] = migrated
		}
		if len(updates) == 0 {
			continue
		}
		if err := db.gormDB.WithContext(ctx).Model(&gMCPServer{}).Where("id = ?", row.ID).Updates(updates).Error; err != nil {
			return err
		}
	}
	return nil
}

func migrateLegacyMCPSecretMapJSON(key []byte, raw string) (string, bool, error) {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return "", false, nil
	}
	if isLikelyJSONObject(trimmed) {
		var legacy map[string]string
		if err := json.Unmarshal([]byte(trimmed), &legacy); err == nil {
			if key == nil {
				return raw, true, nil
			}
			encoded, err := encryptMCPSecretMapWithKey(key, legacy)
			return encoded, true, err
		}
	}
	if key == nil {
		return raw, false, nil
	}
	if _, err := decodeMCPSecretMapWithKey(key, trimmed); err == nil {
		return raw, false, nil
	}
	return "", false, fmt.Errorf("invalid mcp secret payload")
}

func encodeMCPSecretMap(values map[string]string) (string, error) {
	if len(values) == 0 {
		return "", nil
	}
	key, err := loadOrCreateEncryptionKey()
	if err != nil {
		return "", err
	}
	return encryptMCPSecretMapWithKey(key, values)
}

func encryptMCPSecretMapWithKey(key []byte, values map[string]string) (string, error) {
	payload, err := json.Marshal(values)
	if err != nil {
		return "", fmt.Errorf("marshal mcp secrets: %w", err)
	}
	encoded, err := encryptAESGCM(key, payload)
	if err != nil {
		return "", fmt.Errorf("encrypt mcp secrets: %w", err)
	}
	return encoded, nil
}

func decodeMCPSecretMap(raw string) (map[string]string, error) {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return nil, nil
	}
	if isLikelyJSONObject(trimmed) {
		var legacy map[string]string
		if err := json.Unmarshal([]byte(trimmed), &legacy); err == nil {
			return legacy, nil
		}
	}
	key, err := loadOrCreateEncryptionKey()
	if err != nil {
		return nil, err
	}
	decoded, err := decodeMCPSecretMapWithKey(key, trimmed)
	if err == nil {
		return decoded, nil
	}
	var legacy map[string]string
	if legacyErr := json.Unmarshal([]byte(trimmed), &legacy); legacyErr == nil {
		return legacy, nil
	}
	return nil, err
}

func decodeMCPSecretMapWithKey(key []byte, raw string) (map[string]string, error) {
	plain, err := decryptAESGCM(key, raw)
	if err != nil {
		return nil, err
	}
	var values map[string]string
	if err := json.Unmarshal(plain, &values); err != nil {
		return nil, fmt.Errorf("unmarshal mcp secrets: %w", err)
	}
	return values, nil
}

func isLikelyJSONObject(value string) bool {
	value = strings.TrimSpace(value)
	return strings.HasPrefix(value, "{")
}

func mcpServerFromModel(r gMCPServer) (MCPServer, error) {
	var args []string
	_ = json.Unmarshal([]byte(r.ArgsJSON), &args)
	env, err := decodeMCPSecretMap(r.EnvJSON)
	if err != nil {
		return MCPServer{}, err
	}
	headers, err := decodeMCPSecretMap(r.HeadersJSON)
	if err != nil {
		return MCPServer{}, err
	}
	return MCPServer{
		ID:          r.ID,
		Name:        r.Name,
		DisplayName: r.DisplayName,
		ServerType:  r.ServerType,
		Command:     r.Command,
		Args:        args,
		Env:         env,
		URL:         r.URL,
		Headers:     headers,
		TimeoutSecs: r.TimeoutSecs,
		Icon:        r.Icon,
		Enabled:     r.Enabled,
		Source:      r.Source,
		CreatedAt:   time.Unix(r.CreatedAtUnix, 0).UTC(),
		UpdatedAt:   time.Unix(r.UpdatedAtUnix, 0).UTC(),
	}, nil
}
