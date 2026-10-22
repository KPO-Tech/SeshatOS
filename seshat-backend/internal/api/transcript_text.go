package api

import (
	"regexp"
	"strings"
)

var spokenLanguagePattern = regexp.MustCompile(`^[a-z]{2,3}(-[A-Za-z]{2,4})?$`)

// normalizeSpokenLanguage returns the language tag a client asked for, or empty for "detect it" (nothing, auto, or anything that is not a
// language tag).
func normalizeSpokenLanguage(raw string) string {
	tag := strings.TrimSpace(raw)
	if strings.EqualFold(tag, "auto") || !spokenLanguagePattern.MatchString(tag) {
		return ""
	}
	return tag
}

var repeatedSpaces = regexp.MustCompile(` {2,}`)

// cleanTranscript joins the segments of a transcript. whisper.cpp ends each segment with a line break, sometimes inside a word, and the
// next segment starts with a space when it starts a new word: dropping the breaks and keeping the spaces restores the sentence.
func cleanTranscript(text string) string {
	text = strings.ReplaceAll(text, "\r", "")
	text = strings.ReplaceAll(text, "\n", "")
	return strings.TrimSpace(repeatedSpaces.ReplaceAllString(text, " "))
}
