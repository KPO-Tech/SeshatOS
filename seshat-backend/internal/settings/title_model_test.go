package settings

import "testing"

func TestValidateTitleModel(t *testing.T) {
	ok := []string{"qwen2.5-0.5b-instruct", "gemma-3-270m-it", "smollm2-360m-instruct", "Qwen3-4B-Instruct-2507", "llama-3.2-1b-instruct", "phi-3-mini"}
	for _, name := range ok {
		if err := ValidateTitleModel(name); err != nil {
			t.Errorf("ValidateTitleModel(%q) = %v, want nil", name, err)
		}
	}
	bad := []string{"", "DeepSeek-R1-Distill-Qwen-1.5B", "qwq-32b", "Qwen3-0.6B", "Qwen3-4B-Thinking-2507", "gpt-oss-20b", "o3-mini", "magistral-small", "phi-4-reasoning"}
	for _, name := range bad {
		if err := ValidateTitleModel(name); err == nil {
			t.Errorf("ValidateTitleModel(%q) = nil, want error", name)
		}
	}
}
