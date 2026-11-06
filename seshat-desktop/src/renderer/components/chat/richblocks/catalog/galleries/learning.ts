import type { Gallery } from './types'

export const LEARNING: Gallery = {
  id: 'learning',
  title: 'Learn and practise',
  description: 'Quizzes, cards, writing exercises and revision plans, to answer in the conversation.',
  tone: 'green',
  icon: 'book',
  examples: [
    {
      title: 'A Go concurrency quiz',
      about: 'Five questions, each explained, a score at the end.',
      code: `root = Quiz([q1, q2, q3, q4, q5], "Go concurrency", "My Go quiz: {{score}} out of {{total}}. I missed:\\n{{missed}}\\nExplain what I got wrong.")
q1 = Question("Which keyword starts a goroutine?", ["go", "async", "spawn", "thread"], 0, "go f() runs f concurrently with the caller.")
q2 = Question("What happens when you write to a nil map?", ["It creates the key", "It panics", "It is ignored"], 1, "Reading a nil map is fine; writing panics.")
q3 = Question("What does an unbuffered channel do on send?", ["Returns at once", "Waits for a receiver", "Drops the value"], 1, "A send blocks until another goroutine receives.")
q4 = Question("Which tool waits for a group of goroutines?", ["sync.WaitGroup", "time.Sleep", "context.Done"], 0, "Add, Done and Wait count the goroutines still running.")
q5 = Question("What does select do?", ["Picks a ready case at random", "Runs every case", "Always the first case"], 0, "When several cases are ready, one is chosen at random.")`
    },
    {
      title: 'The solar system',
      about: 'A short quiz for a curious mind.',
      code: `root = Quiz([q1, q2, q3, q4], "The solar system", "Space quiz: {{score}}/{{total}}. Missed: {{missed}}")
q1 = Question("Which planet is the largest?", ["Saturn", "Jupiter", "Neptune"], 1, "Jupiter holds more than twice the mass of all other planets together.")
q2 = Question("How long does light from the Sun take to reach Earth?", ["About 8 minutes", "About 8 seconds", "About 8 hours"], 0, "Around 500 seconds for 150 million km.")
q3 = Question("Which planet has the most moons?", ["Mars", "Saturn", "Venus"], 1, "Saturn has well over a hundred confirmed moons.")
q4 = Question("What is the Sun mostly made of?", ["Iron", "Hydrogen", "Oxygen"], 1, "About three quarters hydrogen, one quarter helium.")`
    },
    {
      title: 'Travel vocabulary',
      about: 'Cards with a category and a pronunciation.',
      code: `root = Flashcards([c1, c2, c3, c4, c5, c6], "English for travel", "I know {{known}} of {{total}} cards. To review: {{again}}. Quiz me on those.")
c1 = Flash("boarding pass", "carte d'embarquement", "Airport", "/ˈbɔːdɪŋ pɑːs/")
c2 = Flash("layover", "escale", "Airport", "/ˈleɪoʊvər/")
c3 = Flash("customs", "douane", "Airport", "/ˈkʌstəmz/")
c4 = Flash("check-in", "enregistrement", "Hotel", "/ˈtʃek ɪn/")
c5 = Flash("fully booked", "complet", "Hotel", "/ˈfʊli bʊkt/")
c6 = Flash("itinerary", "itinéraire", "Trip", "/aɪˈtɪnəreri/")`
    },
    {
      title: 'A writing exercise',
      about: 'A subject, a counter, a button that sends the text.',
      code: `root = Stack([plan, exercise])
plan = SegmentBar([Segment("Read the subject", 3, "blue"), Segment("Write 120 to 160 words", 10, "green"), Segment("Correct and rewrite", 7, "orange")], "min", "A session of 20 minutes")
exercise = Form([subject, essay, count], send, "Day 3: describe")
subject = Markdown("**Subject:** describe a place you love, in the present tense. Use at least three adjectives and one comparison.")
essay = TextArea("essay", "The place I love most is...", 7)
count = Counter("essay", "words", 120, 160)
send = Submit("Correct my text", "Here is my text. Correct it like a teacher: a mark out of 20, the mistakes explained, then ask me to rewrite the weak passages.\\n\\n{{essay}}")`
    },
    {
      title: 'A revision plan and a score',
      about: 'Progress, a checklist and a note on what to work on.',
      code: `root = Card([progress, parts, todo, advice], "Revision, week 2")
progress = ProgressBar(14, 20, "Mark of the mock exam", "green")
parts = SegmentBar([Segment("Algebra", 6, "blue"), Segment("Geometry", 4, "violet"), Segment("Probability", 4, "orange")], "pts", "Where the points came from")
todo = Checklist([CheckItem("Redo the probability exercises", false), CheckItem("Read the geometry summary", true), CheckItem("Time a full paper", false)])
advice = Callout("info", "To work on", "Probability cost the most points: practise tree diagrams and conditional probability.")`
    }
  ]
}
