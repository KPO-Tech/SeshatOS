package settings

import "testing"

func TestValidateCapabilityOptions(t *testing.T) {
	cleaned, err := ValidateCapabilityOptions(CapabilityAudio, map[string]string{
		"tts_model":  " gpt-4o-mini-tts ",
		"tts_voice":  "coral",
		"tts_format": "WAV",
		"stt_model":  "",
	})
	if err != nil {
		t.Fatal(err)
	}
	if cleaned["tts_model"] != "gpt-4o-mini-tts" || cleaned["tts_voice"] != "coral" || cleaned["tts_format"] != "wav" || cleaned["stt_model"] != "" {
		t.Fatalf("values are trimmed, the format is lower case and an empty value is kept to clear a choice, got %v", cleaned)
	}

	for name, tc := range map[string]struct {
		capability Capability
		input      map[string]string
	}{
		"unknown name":        {CapabilityAudio, map[string]string{"temperature": "1"}},
		"image has no voice":  {CapabilityImage, map[string]string{"tts_voice": "coral"}},
		"embeddings":          {CapabilityEmbeddings, map[string]string{"model": "x"}},
		"bad format":          {CapabilityAudio, map[string]string{"tts_format": "exe"}},
		"injection in model":  {CapabilityImage, map[string]string{"model": "gpt-image-1; rm -rf /"}},
		"leading punctuation": {CapabilityImage, map[string]string{"model": "-flag"}},
		"too long":            {CapabilityImage, map[string]string{"model": string(make([]byte, 101))}},
	} {
		if _, err := ValidateCapabilityOptions(tc.capability, tc.input); err == nil {
			t.Errorf("%s must be refused", name)
		}
	}
}
