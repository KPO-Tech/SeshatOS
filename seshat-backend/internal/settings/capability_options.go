package settings

import (
	"fmt"
	"regexp"
	"sort"
	"strings"
)

// CapabilityOptionNames lists the choices a person can make for each capability besides its provider. The names are what the API accepts
// and what the engine media tools are configured with (see internal/config).
var CapabilityOptionNames = map[Capability][]string{
	CapabilityImage: {"model", "size", "quality", "aspect_ratio"},
	CapabilityAudio: {"stt_model", "tts_model", "tts_voice", "tts_format"},
}

var (
	optionValuePattern = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9._:/+-]{0,99}$`)
	speechFormats      = map[string]bool{"mp3": true, "wav": true, "opus": true, "aac": true, "flac": true, "pcm": true}
	imageSizePattern   = regexp.MustCompile(`^(auto|[0-9]{3,4}x[0-9]{3,4})$`)
	imageRatioPattern  = regexp.MustCompile(`^[0-9]{1,2}:[0-9]{1,2}$`)
	imageQualities     = map[string]bool{"auto": true, "low": true, "medium": true, "high": true, "xhigh": true, "max": true, "standard": true, "hd": true}
)

// ValidateCapabilityOptions checks the choices sent for a capability: only known names, each value a plain model or voice name (a speech
// format one of the formats the providers produce). Empty values are kept: they clear a choice. The result holds only trimmed values.
func ValidateCapabilityOptions(capability Capability, input map[string]string) (map[string]string, error) {
	allowed := CapabilityOptionNames[capability]
	if len(allowed) == 0 {
		return nil, fmt.Errorf("%s has no options", capability)
	}
	known := make(map[string]bool, len(allowed))
	for _, name := range allowed {
		known[name] = true
	}
	cleaned := make(map[string]string, len(input))
	for name, value := range input {
		if !known[name] {
			names := append([]string(nil), allowed...)
			sort.Strings(names)
			return nil, fmt.Errorf("unknown option %q (expected one of %s)", name, strings.Join(names, ", "))
		}
		value = strings.TrimSpace(value)
		switch {
		case value == "":
		case name == "tts_format" && !speechFormats[strings.ToLower(value)]:
			return nil, fmt.Errorf("tts_format must be mp3, wav, opus, aac, flac or pcm")
		case name == "size" && !imageSizePattern.MatchString(strings.ToLower(value)):
			return nil, fmt.Errorf("size must be auto or a width and height such as 1024x1024")
		case name == "aspect_ratio" && !imageRatioPattern.MatchString(value):
			return nil, fmt.Errorf("aspect_ratio must look like 16:9")
		case name == "quality" && !imageQualities[strings.ToLower(value)]:
			return nil, fmt.Errorf("quality must be auto, low, medium, high, xhigh, max, standard or hd")
		case name != "tts_format" && name != "size" && name != "aspect_ratio" && name != "quality" && !optionValuePattern.MatchString(value):
			return nil, fmt.Errorf("%s is not a valid name", name)
		}
		if name == "tts_format" || name == "size" || name == "quality" {
			value = strings.ToLower(value)
		}
		cleaned[name] = value
	}
	return cleaned, nil
}
