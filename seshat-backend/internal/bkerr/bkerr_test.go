package bkerr

import (
	"errors"
	"fmt"
	"testing"
)

// Each constructor is one line that names its kind, so a copy that forgets to change the kind gives a wrong status code to every caller
// without any compiler complaint. One table keeps them apart.
func TestEachConstructorGivesItsOwnKind(t *testing.T) {
	cases := []struct {
		name string
		make func(string, error) error
		want ErrorKind
	}{
		{"InvalidInput", InvalidInput, ErrorKindInvalidInput},
		{"Unauthorized", Unauthorized, ErrorKindUnauthorized},
		{"Forbidden", Forbidden, ErrorKindForbidden},
		{"NotFound", NotFound, ErrorKindNotFound},
		{"Conflict", Conflict, ErrorKindConflict},
		{"TooLarge", TooLarge, ErrorKindTooLarge},
		{"RateLimit", RateLimit, ErrorKindRateLimit},
		{"BadGateway", BadGateway, ErrorKindBadGateway},
		{"Unavailable", Unavailable, ErrorKindUnavailable},
		{"Internal", Internal, ErrorKindInternal},
	}
	seen := map[ErrorKind]string{}
	for _, c := range cases {
		if got := KindOf(c.make("m", nil)); got != c.want {
			t.Errorf("%s gives kind %q, want %q", c.name, got, c.want)
		}
		if other, dup := seen[c.want]; dup {
			t.Errorf("%s and %s share the kind %q", c.name, other, c.want)
		}
		seen[c.want] = c.name
	}
}

func TestAnErrorSaysItsMessageThenItsCauseThenItsKind(t *testing.T) {
	cause := errors.New("disk full")
	if got := NotFound("no such file", cause).Error(); got != "no such file" {
		t.Errorf("the message comes first, got %q", got)
	}
	if got := (&Error{Kind: ErrorKindInternal, Err: cause}).Error(); got != "disk full" {
		t.Errorf("without a message the cause is said, got %q", got)
	}
	if got := (&Error{Kind: ErrorKindConflict}).Error(); got != "conflict" {
		t.Errorf("with neither, the kind is said, got %q", got)
	}
	var none *Error
	if none.Error() != "" || none.Unwrap() != nil {
		t.Error("a nil error says nothing and wraps nothing")
	}
}

func TestTheCauseCanBeFoundThroughTheTypedError(t *testing.T) {
	cause := errors.New("root cause")
	err := fmt.Errorf("while saving: %w", Internal("could not save", cause))
	if !errors.Is(err, cause) {
		t.Error("errors.Is must reach the cause through the typed error")
	}
	if KindOf(err) != ErrorKindInternal {
		t.Error("the kind is found through a wrapping error")
	}
}

func TestWrapOrInternalKeepsAKindThatWasChosen(t *testing.T) {
	busy := Conflict("session busy", nil)
	if got := WrapOrInternal(busy); got != busy {
		t.Error("a typed error must come back as it was: a Conflict must not turn into an Internal on its way up")
	}
	plain := errors.New("plain")
	wrapped := WrapOrInternal(plain)
	if KindOf(wrapped) != ErrorKindInternal || !errors.Is(wrapped, plain) {
		t.Errorf("a plain error becomes an Internal that keeps it, got %v", wrapped)
	}
	if WrapOrInternal(nil) != nil {
		t.Error("no error stays no error")
	}
}

func TestAnErrorThatIsNotTypedCountsAsInternalAndKeepsItsText(t *testing.T) {
	plain := errors.New("something broke")
	if KindOf(plain) != ErrorKindInternal || KindOf(nil) != ErrorKindInternal {
		t.Error("an untyped error is internal")
	}
	if Message(plain) != "something broke" || Message(nil) != "" {
		t.Errorf("message of an untyped error, got %q", Message(plain))
	}
	if Message(Forbidden("not yours", plain)) != "not yours" {
		t.Error("a typed error says its own message, not the cause")
	}
}
