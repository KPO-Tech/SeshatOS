# 0006 - Architecture drawings in chat: nested panels with icons, and measured arrows

Status: proposed, 2026-10-29. Builds on [0005](0005-chat-ui-catalog.md).

## Context

0005 reserved a `Diagram` component (nodes and edges, automatic layout with dagre or ELK). It suits a graph. It does not
suit what people draw when they describe an architecture: layers of coloured panels, each holding a row of cards with an
icon and a short caption, a dashed group holding six columns, and a handful of arrows between panels, often in both
directions. That drawing is a nested layout with few links, not a graph to lay out.

A model is bad at coordinates and at hand-written SVG (misaligned boxes, text that overflows, arrows through boxes), and an
SVG costs thousands of tokens. A model is good at composing named blocks. So the layout comes from the client, and the model
only chooses the structure, the colours, the icons and which blocks are linked.

## Decision (proposed)

1. **Containers, not coordinates.** Three new components in the catalog:
   - `Panel(children, title?, tone?, icon?, dashed?, direction?)`: a coloured box with a header (icon and title) that holds
     Items or other Panels, in a column or in a row that wraps. `tone` is a hue: neutral, blue, violet, green, orange, red,
     teal, yellow.
   - `Item(label, icon?, caption?, boxed?)`: one line with an icon and a caption; `boxed` draws it as a card, for a row of
     cards in a Panel.
   - `Architecture(children, flows?, title?)`: the frame of a drawing. It lays its children out like a Stack and draws the
     arrows over them.
2. **Arrows by name.** `Flow(from, to, label?, both?, style?)` links two boxes by the name of the statement that defines
   them (`Flow("api", "storage")`; a bare name is accepted too). The client gives every Panel and Item reached through a name
   that name as its id, measures where each one sits once drawn, and routes an orthogonal arrow between them: straight when
   the two overlap on one axis, with one elbow otherwise, and none when one box holds the other. The measure runs again when
   the size changes, so the arrows follow the window, the streaming and the theme. A `Flow` is valid only in the `flows` of
   an `Architecture`, and only Panels and Items can be linked.
3. **Icons from sets the app already ships.** No new dependency.
   - Generic icons come from IconPark (`@icon-park/react`, already used by the app), through a fixed vocabulary of about 90
     short names (`database`, `server`, `cloud`, `key`, `shield`, `workflow`...) with a few aliases. Each name is an explicit
     import, so the bundle ships only these.
   - Technology logos come from Simple Icons (`simple-icons`, already used for connectors), written `si:sqlite`, `si:go`,
     `si:postgresql`... about 60 of them, again explicit imports. A logo too dark or too light for the current theme is drawn in
     the text colour.
   - An unknown name draws no icon rather than a wrong one, and is reported by the parser.
   - The prompt lists the vocabulary, generated from the same tables, so the model never has to guess a name.
4. **The model is taught the shape.** The prompt block gains the architecture case in its list of shapes, the icon vocabulary,
   the rule that a linked box is written as its own named statement, and one worked example. A test checks that every icon the
   examples use exists.
5. **No raw SVG or HTML from the agent here.** Free-form SVG, animation and 3D remain the `Widget` of a later record.

## Not decided here

- Export of a drawing as PNG or SVG, zoom and pan for large drawings, animated arrows that show the direction of the data.
- Clicking a box to ask about it (`@Ask` already exists in the language; the action bridge in the chat does not yet).
- Patching a drawing in place ("add a cache between the API and the storage") by sending only the changed statements: it
  needs a drawing that persists, which is the artifact panel of the artifacts plan.
- `Diagram` (graph with automatic layout), sequence and ER diagrams: complementary, for later.
- Whether `Flow` may also link a Panel to a box in another `Architecture`.

## Update: arrows that avoid the boxes (2026-10-29)

The first routing only looked at the two boxes of an arrow, so it crossed the title of a panel or an item in between, drew two
arrows on top of each other, and put a label over the text of a box. The arrows are now routed against what is drawn:

- **Obstacles.** The items and the titles (the icon and the text, not the whole width of the panel) are measured with the
  boxes. For each arrow the router tries the plain route, elbows and steps, and detours that clear what stands in their band,
  and keeps the one that goes through the fewest obstacles; the plain route wins when nothing beats it.
- **Climbing.** An arrow may start or end on a panel around its item, up to the last one that does not hold the other end, when
  that avoids crossing the title of the panel its item sits in. Going up costs more than a longer path, so it is the last resort.
- **No overlap.** A route that runs along an arrow already drawn is penalised, so two flows between the same panels take
  different paths.
- **Labels.** A label is at most 150 px wide (it wraps onto a second line). It goes on its arrow at the first spot that covers no
  box, no other arrow and no other label; failing that beside the arrow, a little further each time; failing that where it
  covers least. The prompt asks for a few words.

## Limits

An arrow is routed from the two boxes only. It can cross a third box standing between them; the answer is to put the boxes in
an order where that does not happen, which the model can do because it controls the structure. The result is a clean, themed,
cheap drawing, but not as free in its composition as an illustration made by an image model.

## Build order

1. Icon vocabulary and the `RichIcon` component.
2. `Panel`, `Item`, `Architecture` without arrows.
3. Node ids and the `target` argument; `Flow` routing as a pure function, then the drawing of the arrows.
4. Catalog, generated spec, prompt, example.
5. Check on screen with the shape of the reference drawing, light and dark.
