package config

import "strings"

// embedderAPIKey is the key the embedding model is called with: the one saved with it, unless an opt-in link ties embeddings to a
// provider of Config > Providers of the same kind as the model. A link made for another provider (the key of Mistral, left from the days
// the embeddings came from Mistral) is not used to call this one: it would be refused, and it would hand the key of a company to
// another.
func embedderAPIKey(saved, embedderProvider, linkedKind, linkedKey string, linked bool) string {
	if linked && sameProviderKind(linkedKind, embedderProvider) {
		return linkedKey
	}
	return saved
}

func sameProviderKind(a, b string) bool {
	a, b = strings.ToLower(strings.TrimSpace(a)), strings.ToLower(strings.TrimSpace(b))
	if a == b {
		return true
	}
	// Google's models are known as "gemini" in the embedding card and "google" among the providers.
	google := func(kind string) bool { return kind == "gemini" || kind == "google" }
	return google(a) && google(b)
}
