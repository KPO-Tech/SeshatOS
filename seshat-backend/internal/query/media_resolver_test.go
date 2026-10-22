package query

import (
	"context"
	"testing"

	"github.com/KPO-Tech/seshat-runtime/pkg/sdk"
)

// A provider linked to image or audio in the settings must reach the next turn, and a client built without the link must not be reused for it.
func TestMediaResolverIsReadOnEachTurnAndKeysTheClient(t *testing.T) {
	runtime := &SDKRuntime{baseConfig: sdk.DefaultClientConfig()}
	before := runtime.buildBaseClientConfig(context.Background())
	if before.ImageGeneration != nil {
		t.Fatalf("the base configuration has no image generation, got %+v", before.ImageGeneration)
	}

	linked := MediaConfigs{}
	runtime.SetMediaResolver(func(context.Context) MediaConfigs { return linked })
	if got := runtime.buildBaseClientConfig(context.Background()); got.ImageGeneration != nil {
		t.Fatalf("nothing is linked yet, got %+v", got.ImageGeneration)
	}

	linked = MediaConfigs{Image: &sdk.ImageGenerationConfig{Provider: "openai", APIKey: "k", BaseURL: "http://127.0.0.1:1/v1"}}
	after := runtime.buildBaseClientConfig(context.Background())
	if after.ImageGeneration == nil || after.ImageGeneration.BaseURL != "http://127.0.0.1:1/v1" {
		t.Fatalf("the link made after the start must reach the next turn, got %+v", after.ImageGeneration)
	}
	if mediaKey(before) == mediaKey(after) {
		t.Fatal("a client built without the link must not be reused once it is made")
	}
}
