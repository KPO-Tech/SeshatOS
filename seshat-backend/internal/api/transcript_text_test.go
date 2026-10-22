package api

import "testing"

func TestCleanTranscriptJoinsSegmentsWithoutBreakingWords(t *testing.T) {
	for in, want := range map[string]string{
		" Alexa, allume la lumière du salon et met de la musique dou\nce.\n": "Alexa, allume la lumière du salon et met de la musique douce.",
		" pour 4 personnes\n demain soir à 20h, près de la fenêtre.\n":       "pour 4 personnes demain soir à 20h, près de la fenêtre.",
		"  already   clean ": "already clean",
		"":                   "",
	} {
		if got := cleanTranscript(in); got != want {
			t.Errorf("cleanTranscript(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestNormalizeSpokenLanguage(t *testing.T) {
	for in, want := range map[string]string{
		"fr": "fr", "fr-CA": "fr-CA", " en ": "en", "auto": "", "AUTO": "", "": "", "french": "", "fr;rm -rf": "", "e": "",
	} {
		if got := normalizeSpokenLanguage(in); got != want {
			t.Errorf("normalizeSpokenLanguage(%q) = %q, want %q", in, got, want)
		}
	}
}
