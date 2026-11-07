package metrics

import (
	"context"
	"errors"
	"testing"

	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/bkerr"
)

type fakeSnapshotter struct {
	format string
	text   string
	err    error
}

func (f *fakeSnapshotter) GetMetricsSnapshot(format string) (string, error) {
	f.format = format
	return f.text, f.err
}

func TestTheSnapshotIsAskedInTheFormatThatWasChosen(t *testing.T) {
	fake := &fakeSnapshotter{text: "requests_total 3"}
	got, err := NewService(fake).Snapshot(context.Background(), "prometheus")
	if err != nil || got != "requests_total 3" {
		t.Fatalf("got %q, %v", got, err)
	}
	if fake.format != "prometheus" {
		t.Errorf("the format must reach the monitoring as it was asked, got %q", fake.format)
	}
}

// A typed nil pointer inside an interface is not equal to nil: calling a method on it would panic. The service must say the monitoring is
// not there, for each way of not having it.
func TestAMissingMonitoringIsUnavailableWhateverWayItIsMissing(t *testing.T) {
	var typedNil *fakeSnapshotter
	var nilService *Service
	cases := map[string]*Service{
		"no monitoring":      NewService(nil),
		"a typed nil":        NewService(typedNil),
		"a nil service":      nilService,
		"an empty service":   {},
		"a nil in the field": {monitoring: Snapshotter(typedNil)},
	}
	for name, service := range cases {
		_, err := service.Snapshot(context.Background(), "json")
		if err == nil || bkerr.KindOf(err) != bkerr.ErrorKindUnavailable {
			t.Errorf("%s: want an unavailable error, got %v", name, err)
		}
	}
}

func TestAFailureOfTheMonitoringIsAnInternalErrorThatKeepsTheCause(t *testing.T) {
	cause := errors.New("collector stopped")
	_, err := NewService(&fakeSnapshotter{err: cause}).Snapshot(context.Background(), "json")
	if bkerr.KindOf(err) != bkerr.ErrorKindInternal || !errors.Is(err, cause) {
		t.Fatalf("want an internal error that wraps the cause, got %v", err)
	}
}
