package bkerr

import "errors"

type ErrorKind string

const (
	ErrorKindInvalidInput ErrorKind = "invalid_input"
	ErrorKindUnauthorized ErrorKind = "unauthorized"
	ErrorKindForbidden    ErrorKind = "forbidden"
	ErrorKindNotFound     ErrorKind = "not_found"
	ErrorKindConflict     ErrorKind = "conflict"
	ErrorKindTooLarge     ErrorKind = "too_large"
	ErrorKindRateLimit    ErrorKind = "rate_limit"
	ErrorKindBadGateway   ErrorKind = "bad_gateway"
	ErrorKindUnavailable  ErrorKind = "unavailable"
	ErrorKindInternal     ErrorKind = "internal"
)

type Error struct {
	Kind    ErrorKind
	Message string
	Err     error
}

func (e *Error) Error() string {
	if e == nil {
		return ""
	}
	if e.Message != "" {
		return e.Message
	}
	if e.Err != nil {
		return e.Err.Error()
	}
	return string(e.Kind)
}

func (e *Error) Unwrap() error {
	if e == nil {
		return nil
	}
	return e.Err
}

func newError(kind ErrorKind, message string, err error) error {
	return &Error{Kind: kind, Message: message, Err: err}
}

func InvalidInput(message string, err error) error {
	return newError(ErrorKindInvalidInput, message, err)
}

func Unauthorized(message string, err error) error {
	return newError(ErrorKindUnauthorized, message, err)
}

func Forbidden(message string, err error) error {
	return newError(ErrorKindForbidden, message, err)
}

func NotFound(message string, err error) error {
	return newError(ErrorKindNotFound, message, err)
}

func Conflict(message string, err error) error {
	return newError(ErrorKindConflict, message, err)
}

func TooLarge(message string, err error) error {
	return newError(ErrorKindTooLarge, message, err)
}

func RateLimit(message string, err error) error {
	return newError(ErrorKindRateLimit, message, err)
}

// BadGateway reports a failure from an upstream service this backend depends
// on (document reader, whisper-server, a cloud control-plane call, ...) — distinct
// from Unavailable, which means this backend itself can't serve the request.
func BadGateway(message string, err error) error {
	return newError(ErrorKindBadGateway, message, err)
}

func Unavailable(message string, err error) error {
	return newError(ErrorKindUnavailable, message, err)
}

func Internal(message string, err error) error {
	return newError(ErrorKindInternal, message, err)
}

// WrapOrInternal returns err unchanged if it's already a typed *Error (so a
// deliberately-classified error - e.g. Conflict for "session busy" -
// survives a caller that would otherwise blanket-wrap every error from a
// lower layer into Internal), or Internal(err.Error(), err) otherwise.
func WrapOrInternal(err error) error {
	if err == nil {
		return nil
	}
	var target *Error
	if errors.As(err, &target) {
		return err
	}
	return Internal(err.Error(), err)
}

func KindOf(err error) ErrorKind {
	var target *Error
	if errors.As(err, &target) {
		return target.Kind
	}
	return ErrorKindInternal
}

func Message(err error) string {
	if err == nil {
		return ""
	}
	var target *Error
	if errors.As(err, &target) && target.Message != "" {
		return target.Message
	}
	return err.Error()
}
