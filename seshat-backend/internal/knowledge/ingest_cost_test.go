package knowledge

import "testing"

func TestIngestCostOrdersByFormatThenSize(t *testing.T) {
	// What is cheap to read goes first: text, then Word, then PDF, then the rest.
	ordered := []struct {
		name string
		size int64
	}{
		{"big.txt", 900 * 1024},
		{"small.docx", 10 * 1024},
		{"big.docx", 800 * 1024},
		{"small.pdf", 50 * 1024},
		{"big.pdf", 5 * 1024 * 1024},
		{"deck.pptx", 10 * 1024},
	}
	for i := 1; i < len(ordered); i++ {
		before, after := ordered[i-1], ordered[i]
		if ingestCost(before.name, before.size) >= ingestCost(after.name, after.size) {
			t.Errorf("%s should run before %s", before.name, after.name)
		}
	}
	if ingestCost("a.MD", 1) != ingestCost("a.md", 1) {
		t.Error("the extension is read without regard to case")
	}
	if ingestCost("a.txt", 1<<60) >= ingestCost("a.docx", 0) {
		t.Error("a huge size must not move a file out of its format")
	}
}
