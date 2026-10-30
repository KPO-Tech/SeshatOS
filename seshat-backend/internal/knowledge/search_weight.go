package knowledge

import (
	"strings"
	"unicode"
)

// hybridWeightFor is how much a search leans on the words of the query: 0 is the meaning only, 1 is the words only.
//
// A question in plain words is served by the meaning alone: the keyword ranking of a sentence is dominated by common words and by
// the longest documents, and mixing it in took the questions that share almost no word with their answer from 0.62 answered first
// to 0.12-0.25 (a fixed share of 0.3, or a reciprocal rank fusion), and the ordinary ones from 0.91 to 0.85. A query that carries an
// identifier (a number, a code, a CUSIP, a regulation number) is the opposite: the meaning cannot tell two codes apart (0.62 of
// them answered first), the words find them at once (1.00), and a share of 0.3 of the meaning only gets in the way (0.75 to 0.88).
// So the two are not mixed: a query with a code is searched by its words alone, which also spares the embedding call.
// Measured on 57 questions over 192 documents with mistral-embed; the sample is small and the same questions chose the rule.
func hybridWeightFor(query string) float32 {
	if carriesIdentifier(query) {
		return identifierHybridWeight
	}
	return plainHybridWeight
}

const (
	// identifierHybridWeight is the words only: the embedding of the query is not even asked for.
	identifierHybridWeight float32 = 1
	plainHybridWeight      float32 = 0

	// minIdentifierLength is the number of letters and digits from which a token that holds a digit is taken for an identifier: a
	// year or a page number is not one, a CUSIP, an ISIN or `1910.133` is.
	minIdentifierLength = 6
)

// carriesIdentifier reports whether a word of the query holds a digit and is at least minIdentifierLength letters and digits long.
func carriesIdentifier(query string) bool {
	for _, word := range strings.Fields(query) {
		letters, digits := 0, 0
		for _, r := range word {
			switch {
			case unicode.IsDigit(r):
				digits++
			case unicode.IsLetter(r):
				letters++
			}
		}
		if digits > 0 && letters+digits >= minIdentifierLength {
			return true
		}
	}
	return false
}
