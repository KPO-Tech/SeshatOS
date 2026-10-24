package documentreading

import (
	"errors"
	"strings"
	"testing"
)

func TestUnreadableReasonForAScannedPDF(t *testing.T) {
	cases := []struct {
		name string
		caps Capabilities
		want string
	}{
		{"ocr ready", Capabilities{NativeDocCompiled: true, NativeDocModelsAvailable: true, NativeDocReady: true}, "local OCR found none"},
		{"not compiled", Capabilities{}, "no local OCR"},
		{"models missing", Capabilities{NativeDocCompiled: true}, "Download the OCR models"},
		{"not initialized", Capabilities{NativeDocCompiled: true, NativeDocModelsAvailable: true}, "Initialize the native OCR"},
	}
	for _, tc := range cases {
		got := unreadableReason("contract.PDF", nil, tc.caps)
		if !strings.Contains(got, "looks like a scan") || !strings.Contains(got, tc.want) {
			t.Errorf("%s: %q should mention a scan and %q", tc.name, got, tc.want)
		}
	}
}

func TestUnreadableReasonKeepsTheReaderError(t *testing.T) {
	got := unreadableReason("a.pdf", errors.New("render page: pdfium not found"), Capabilities{NativeDocCompiled: true, NativeDocModelsAvailable: true, NativeDocReady: true})
	if !strings.Contains(got, "render page: pdfium not found") {
		t.Fatalf("the reader error must reach the person: %q", got)
	}
}

func TestUnreadableReasonForOtherFiles(t *testing.T) {
	if got := unreadableReason("notes.docx", nil, Capabilities{}); got != "file has no extractable text content" {
		t.Fatalf("unexpected message for a non-PDF: %q", got)
	}
	if got := unreadableReason("notes.docx", errors.New("zip: not a valid zip file"), Capabilities{}); !strings.Contains(got, "zip: not a valid zip file") {
		t.Fatalf("the reader error must be kept: %q", got)
	}
}
