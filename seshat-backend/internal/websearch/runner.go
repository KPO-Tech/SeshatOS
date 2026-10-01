package websearch

import (
	"context"
	"fmt"
	"strings"

	searchcore "github.com/KPO-Tech/seshat/pkg/web/search"
	searchproviders "github.com/KPO-Tech/seshat/pkg/web/search/providers"
)

type DefaultRunner struct {
	envService *searchcore.Service
}

func NewDefaultRunner() *DefaultRunner {
	return &DefaultRunner{
		envService: searchcore.NewService(),
	}
}

func (r *DefaultRunner) Search(ctx context.Context, request SearchRunRequest) (*SearchRunResult, error) {
	input := searchcore.Input{
		Query:          request.Query,
		AllowedDomains: append([]string(nil), request.AllowedDomains...),
		BlockedDomains: append([]string(nil), request.BlockedDomains...),
	}
	if err := input.Validate(); err != nil {
		return nil, err
	}

	var lastErr error
	for _, candidate := range request.Providers {
		provider, err := providerFromRunConfig(candidate)
		if err != nil {
			lastErr = err
			continue
		}
		output, err := provider.Search(searchproviders.SearchInput{
			Query:          input.Query,
			AllowedDomains: input.AllowedDomains,
			BlockedDomains: input.BlockedDomains,
		})
		if err != nil {
			lastErr = err
			continue
		}
		final := searchcore.FinalizeOutput(input, output)
		return &SearchRunResult{
			Provider:          final.Provider,
			ProviderSettingID: candidate.SettingID,
			Results:           final.Results,
			DurationSeconds:   final.DurationSeconds,
		}, nil
	}

	if request.AllowEnvFallback && r != nil && r.envService != nil {
		output, err := r.envService.Search(ctx, input.Request())
		if err == nil {
			return &SearchRunResult{
				Provider:        output.Provider,
				Results:         output.Results,
				DurationSeconds: output.DurationSeconds,
			}, nil
		}
		lastErr = err
	}

	if lastErr != nil {
		return nil, lastErr
	}
	return nil, fmt.Errorf("no usable web search providers configured")
}

func providerFromRunConfig(cfg SearchRunProvider) (searchproviders.SearchProvider, error) {
	switch normalizeSearchProvider(cfg.Provider) {
	case "tavily":
		return searchproviders.NewTavilyProviderWithAPIKey(cfg.Secret), nil
	case "exa":
		return searchproviders.NewExaProviderWithAPIKey(cfg.Secret), nil
	case "jina":
		return searchproviders.NewJinaProviderWithAPIKey(cfg.Secret), nil
	case "langsearch":
		return searchproviders.NewLangSearchProviderWithAPIKey(cfg.Secret), nil
	case "searxng":
		return searchproviders.NewSearXNGProviderWithConfig(cfg.BaseURL, cfg.AuthUsername, cfg.Secret), nil
	default:
		return nil, fmt.Errorf("unsupported web search provider %q", cfg.Provider)
	}
}

func normalizeSearchProvider(provider string) string {
	return strings.TrimSpace(strings.ToLower(provider))
}
