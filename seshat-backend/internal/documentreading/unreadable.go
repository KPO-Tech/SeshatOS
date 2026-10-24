package documentreading

import (
	"path/filepath"
	"strings"
)

// UnreadableReason says, for a person, why no text came out of a file and what they can do about it. readErr is what the
// reader returned, nil when it only found nothing.
func UnreadableReason(filename string, readErr error) string {
	return unreadableReason(filename, readErr, DetectCapabilities())
}

func unreadableReason(filename string, readErr error, caps Capabilities) string {
	detail := ""
	if readErr != nil {
		detail = " (" + readErr.Error() + ")"
	}
	if strings.ToLower(filepath.Ext(filename)) != ".pdf" {
		return "file has no extractable text content" + detail
	}
	const scan = "this PDF has no readable text, it looks like a scan"
	switch {
	case caps.NativeDocReady:
		return scan + ", and the local OCR found none either (the pages may be blank or too blurry to read)" + detail
	case !caps.NativeDocCompiled:
		return scan + ", and this build has no local OCR. Connect a document reader in Settings > Knowledge, or use a build with native OCR" + detail
	case !caps.NativeDocModelsAvailable:
		return scan + ". Download the OCR models in Settings > Knowledge > Document reader, then add the file again" + detail
	default:
		return scan + ". Initialize the native OCR in Settings > Knowledge > Document reader, then add the file again" + detail
	}
}
