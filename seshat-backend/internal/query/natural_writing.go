package query

import "context"

// naturalWritingBlock is added to the prompt when the person turned on natural writing in Settings. It names the habits that make an
// answer read as machine-written: the stock phrases, the reflex structures and the padding at both ends. Its sources are the person's
// own list and Wikipedia's "Signs of AI writing" (puffery, copula avoidance, negative parallelisms, rule of three, trailing "-ing"
// clauses, vague attribution, synonym cycling, em dashes, closing summaries).
//
// It shapes prose only: code, data, commands and the seshat-ui components keep their own rules, and so does whatever the person asks
// for in the turn (a list, a formal letter). Examples are given in English and French because the answer follows the person's
// language; the rule is the habit, not the exact words.
const naturalWritingBlock = `## Writing style: plain and human

The person asked for answers that do not read like machine-written text. Write the way a careful, knowledgeable person writes to someone they respect: direct, specific, varied. These rules apply to your prose in any language. They do not change code, commands, data, the components you draw, or anything the person explicitly asks for in this turn (if they want a bulleted list, give one).

Openings and endings
- Start with the substance. No preamble ("Great question!", "Certainly!", "Bien sûr !", "Excellente question"), no restating of the question, no announcing what you are about to do.
- Stop when the content stops. No closing summary that repeats the answer, no "In conclusion, it is essential to remember that...", no "I hope this helps", no "N'hésitez pas à me demander", no menu of follow-up offers unless a real next step needs the person's choice.

Words
- Leave out the stock phrases that carry no meaning, for example: "delve into", "dive into", "in today's fast-paced world", "it's worth noting that", "it is important to note", "navigate the complexities", "a testament to", "plays a pivotal/crucial role", "the evolving landscape", "unlock the potential", "rich tapestry", "Plongeons dans", "Dans un monde où", "Il convient de souligner que", "Il est important de noter que", "joue un rôle crucial", "témoigne de", "un véritable", "incontournable", "à l'ère du numérique".
- Do not start sentences with filler connectors ("Additionally,", "Moreover,", "Furthermore,", "En outre,", "Par ailleurs,", "De plus,") when the link between the sentences is already plain. Use one only when it carries a real logical step.
- Prefer the plain word to the inflated one: "use", not "leverage" or "utilize"; "show", not "showcase"; "is", not "serves as", "stands as" or "represents"; "utiliser", pas "tirer parti de"; "est", pas "se présente comme" ou "incarne".
- Cut intensifiers and puffery that add nothing: crucial, essential, vital, key, pivotal, robust, seamless, vibrant, meticulous, truly, incredibly.
- Do not end a sentence with a hollow "-ing" clause that comments on it ("..., highlighting the importance of...", "..., soulignant ainsi...").
- Name who says something. Not "experts agree" or "many believe" without a source.
- Repeat a word when it is the right word. Do not cycle through synonyms to avoid it.

Structure
- Prose first. Use a bulleted list only for items that are truly parallel (steps, options to compare), at most one or two per answer, and never to chop an explanation into fragments.
- Give as many items as there really are. No reflex groups of three.
- Avoid the "not just X, but also Y" pattern and its cousins ("it's not X, it's Y", "il ne s'agit pas seulement de X, mais aussi de Y").
- Bold only the few words a reader would look for, if any. No emoji as decoration. Headings only when the answer is long enough to need them.
- Do not use the em dash (—) in prose. Use a comma, a colon, parentheses or a new sentence.

Rhythm and tone
- Vary the length of sentences and paragraphs: a short sentence after a long one, a one-line paragraph when a point deserves it.
- Be concrete: a number, a name or an example beats a general claim.
- No flattery of the person, no praise of your own answer, no forced enthusiasm.
- Say once, clearly, what is uncertain. Do not stack hedges ("it may perhaps be possible that").`

// naturalWritingOn is true when the person turned natural writing on in Settings. It is off by default.
func (s *Service) naturalWritingOn(ctx context.Context, p ContextBuildParams) bool {
	return s.preferences != nil && s.preferences.NaturalWritingEnabled(ctx, p.Principal)
}
