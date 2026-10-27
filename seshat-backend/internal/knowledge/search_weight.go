package knowledge

import (
	"strings"
	"unicode"
)

// hybridWeightFor is how much a search leans on the words of the query, between 0 (the meaning only) and 1 (the words only).
//
// A question in plain words is better served by the meaning alone: measured on 49 questions over 192 documents, mixing in the
// keyword ranking took the share of questions answered at the first place from 0.94 to 0.85, and from 0.62 to 0.12 for the
// questions that share almost no word with their answer, because the keyword ranking of a sentence is dominated by common words
// and by the longest documents. A query that carries an identifier (a number, a code, a CUSIP, a regulation number) is the
// opposite: the meaning cannot tell two codes apart, and the keywords find it at once (0.62 of such questions answered first by the
// meaning alone, 0.88 when the words are mixed in).
func hybridWeightFor(query string) float32 {
	if carriesIdentifier(query) {
		return identifierHybridWeight
	}
	return plainHybridWeight
}

const (
	// identifierHybridWeight keeps the vector similarity dominant while rewarding the literal match of a code.
	identifierHybridWeight float32 = 0.3
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
