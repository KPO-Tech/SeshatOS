package metrics

import (
	"context"
	"reflect"

	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/bkerr"
)

type Snapshotter interface {
	GetMetricsSnapshot(format string) (string, error)
}

type Service struct {
	monitoring Snapshotter
}

func NewService(monitoring Snapshotter) *Service {
	return &Service{monitoring: monitoring}
}

func (s *Service) Snapshot(ctx context.Context, format string) (string, error) {
	_ = ctx
	if s == nil || isNilSnapshotter(s.monitoring) {
		return "", bkerr.Unavailable("monitoring not available", nil)
	}
	snapshot, err := s.monitoring.GetMetricsSnapshot(format)
	if err != nil {
		return "", bkerr.Internal("failed to collect metrics", err)
	}
	return snapshot, nil
}

func isNilSnapshotter(s Snapshotter) bool {
	if s == nil {
		return true
	}
	v := reflect.ValueOf(s)
	switch v.Kind() {
	case reflect.Ptr, reflect.Interface, reflect.Map, reflect.Slice, reflect.Func:
		return v.IsNil()
	default:
		return false
	}
}
