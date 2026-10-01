package db

import (
	"context"
	"fmt"
	"strings"
	"time"
)

const storageConfigID = "default"

type gStorageConfig struct {
	ID                   string `gorm:"primaryKey;size:64"`
	Provider             string `gorm:"column:provider;size:64;not null;default:'local'"`
	LocalPath            string `gorm:"column:local_path;type:text;not null;default:''"`
	S3Endpoint           string `gorm:"column:s3_endpoint;type:text;not null;default:''"`
	S3Bucket             string `gorm:"column:s3_bucket;size:255;not null;default:''"`
	S3AccessKeyEncrypted string `gorm:"column:s3_access_key_encrypted;type:text;not null;default:''"`
	S3SecretKeyEncrypted string `gorm:"column:s3_secret_key_encrypted;type:text;not null;default:''"`
	S3Region             string `gorm:"column:s3_region;size:64;not null;default:'us-east-1'"`
	S3KeyPrefix          string `gorm:"column:s3_key_prefix;size:255;not null;default:''"`
	UpdatedAtUnix        int64  `gorm:"column:updated_at_unix;autoUpdateTime:unix"`
	CreatedAtUnix        int64  `gorm:"column:created_at_unix;autoCreateTime:unix"`
}

func (gStorageConfig) TableName() string { return "storage_config" }

type StorageConfig struct {
	Provider       string
	LocalPath      string
	S3Endpoint     string
	S3Bucket       string
	S3Region       string
	S3KeyPrefix    string
	HasS3AccessKey bool
	HasS3SecretKey bool
	IsConfigured   bool
	UpdatedAt      time.Time
}

type UpsertStorageConfigParams struct {
	Provider    string
	LocalPath   string
	S3Endpoint  string
	S3Bucket    string
	S3AccessKey *string // nil = keep existing
	S3SecretKey *string // nil = keep existing
	S3Region    string
	S3KeyPrefix string
}

type StorageConfigStore struct {
	db *DB
}

func NewStorageConfigStore(database *DB) (*StorageConfigStore, error) {
	if database == nil {
		return nil, fmt.Errorf("storage config store: database is required")
	}
	return &StorageConfigStore{db: database}, nil
}

func (s *StorageConfigStore) Get(ctx context.Context) (*StorageConfig, error) {
	var row gStorageConfig
	err := s.db.gormDB.WithContext(ctx).Where("id = ?", storageConfigID).First(&row).Error
	if err != nil {
		return nil, err
	}
	cfg := storageConfigFromModel(row)
	return &cfg, nil
}

func (s *StorageConfigStore) Upsert(ctx context.Context, p UpsertStorageConfigParams) (*StorageConfig, error) {
	provider := strings.TrimSpace(p.Provider)
	if provider == "" {
		provider = "local"
	}

	encryptKey := func(plain string) (string, error) {
		if plain == "" {
			return "", nil
		}
		k, err := loadOrCreateEncryptionKey()
		if err != nil {
			return "", err
		}
		return encryptAESGCM(k, []byte(plain))
	}

	var row gStorageConfig
	isNew := false
	if err := s.db.gormDB.WithContext(ctx).Where("id = ?", storageConfigID).First(&row).Error; err != nil {
		isNew = true
		row = gStorageConfig{ID: storageConfigID}
	}

	row.Provider = provider
	row.LocalPath = strings.TrimSpace(p.LocalPath)
	row.S3Endpoint = strings.TrimRight(strings.TrimSpace(p.S3Endpoint), "/")
	row.S3Bucket = strings.TrimSpace(p.S3Bucket)
	row.S3Region = strings.TrimSpace(p.S3Region)
	if row.S3Region == "" {
		row.S3Region = "us-east-1"
	}
	row.S3KeyPrefix = strings.TrimSpace(p.S3KeyPrefix)

	if p.S3AccessKey != nil {
		enc, err := encryptKey(*p.S3AccessKey)
		if err != nil {
			return nil, fmt.Errorf("encrypt s3 access key: %w", err)
		}
		row.S3AccessKeyEncrypted = enc
	}
	if p.S3SecretKey != nil {
		enc, err := encryptKey(*p.S3SecretKey)
		if err != nil {
			return nil, fmt.Errorf("encrypt s3 secret key: %w", err)
		}
		row.S3SecretKeyEncrypted = enc
	}

	var dbErr error
	if isNew {
		dbErr = s.db.gormDB.WithContext(ctx).Create(&row).Error
	} else {
		dbErr = s.db.gormDB.WithContext(ctx).Save(&row).Error
	}
	if dbErr != nil {
		return nil, dbErr
	}
	cfg := storageConfigFromModel(row)
	return &cfg, nil
}

func (s *StorageConfigStore) GetDecryptedS3Keys(ctx context.Context) (accessKey, secretKey string, err error) {
	var row gStorageConfig
	if err = s.db.gormDB.WithContext(ctx).Where("id = ?", storageConfigID).First(&row).Error; err != nil {
		return "", "", err
	}
	k, err := loadOrCreateEncryptionKey()
	if err != nil {
		return "", "", err
	}
	if row.S3AccessKeyEncrypted != "" {
		if plain, e := decryptAESGCM(k, row.S3AccessKeyEncrypted); e == nil {
			accessKey = string(plain)
		}
	}
	if row.S3SecretKeyEncrypted != "" {
		if plain, e := decryptAESGCM(k, row.S3SecretKeyEncrypted); e == nil {
			secretKey = string(plain)
		}
	}
	return accessKey, secretKey, nil
}

func storageConfigFromModel(r gStorageConfig) StorageConfig {
	isConfigured := false
	switch r.Provider {
	case "local":
		isConfigured = true
	case "s3", "minio":
		isConfigured = r.S3Endpoint != "" && r.S3Bucket != ""
	}
	var updatedAt time.Time
	if r.UpdatedAtUnix > 0 {
		updatedAt = time.Unix(r.UpdatedAtUnix, 0).UTC()
	}
	return StorageConfig{
		Provider:       r.Provider,
		LocalPath:      r.LocalPath,
		S3Endpoint:     r.S3Endpoint,
		S3Bucket:       r.S3Bucket,
		S3Region:       r.S3Region,
		S3KeyPrefix:    r.S3KeyPrefix,
		HasS3AccessKey: r.S3AccessKeyEncrypted != "",
		HasS3SecretKey: r.S3SecretKeyEncrypted != "",
		IsConfigured:   isConfigured,
		UpdatedAt:      updatedAt,
	}
}
