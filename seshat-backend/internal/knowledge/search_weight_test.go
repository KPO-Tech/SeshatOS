package knowledge

import "testing"

func TestAQueryInPlainWordsLeansOnMeaningAndACodeOnWords(t *testing.T) {
	cases := []struct {
		query string
		code  bool
	}{
		{"What should a company do after discovering that intruders got into its computers?", false},
		{"Which institutions started as lenders to kings and now watch over banks?", false},
		{"Sveriges Riksbank founded 1668 Bank of England chartered 1694", false}, // years are not identifiers
		{"How many significant banks does the ECB supervise directly in 2025?", false},
		{"決算短信 連結業績 2024年", false},
		{"CUSIP 172967424", true},
		{"ISIN JP3197600004", true},
		{"LEI 6SHGI4ZSSLCXXQSBB395", true},
		{"29 CFR 1910.133 eye and face protection", true},
		{"claim 33-49C2-65Q01", true},
		{"", false},
	}
	for _, c := range cases {
		want := plainHybridWeight
		if c.code {
			want = identifierHybridWeight
		}
		if got := hybridWeightFor(c.query); got != want {
			t.Errorf("hybridWeightFor(%q) = %v, want %v", c.query, got, want)
		}
	}
}
