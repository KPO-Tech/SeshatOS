package settings

import (
	"fmt"
	"regexp"
	"strings"
)

// Titles are one short line generated while the answer is still streaming, so
// the title model must answer immediately. Reasoning models spend their output
// budget on a hidden chain of thought and return nothing usable, so they are
// refused rather than allowed to silently produce no title.
var reasoningModelPattern = regexp.MustCompile(`think|reason|magistral|gpt-oss|deepseek-r|(^|[^a-z0-9])(r1|qwq|o1|o3|o4)([^a-z0-9]|$)`)

// ValidateTitleModel rejects model names known to be reasoning models. Qwen3
// answers with a thinking phase by default, except for its 2507 instruct builds.
func ValidateTitleModel(model string) error {
	name := strings.ToLower(strings.TrimSpace(model))
	if name == "" {
		return fmt.Errorf("a title model is required")
	}
	if reasoningModelPattern.MatchString(name) || (strings.Contains(name, "qwen3") && !strings.Contains(name, "instruct-2507")) {
		return fmt.Errorf("%q looks like a reasoning model; title generation needs a fast non-thinking or specialised model", model)
	}
	return nil
}
