# Dry-Media Painter: briefing for Claude Code

Text in, painting out, **pure code**. No AI or image models at run time, no network. Inspired by
github.com/ytsav/Jatayu-Javascript (one hand-coded artwork); this repo contains none of its code.
Owner: Peru (GitHub `Peru-107`). Style: informal, iterative, show renders early.

## Commands
- `npm install`
- `npm run paint -- --text "a temple by a lake at sunset" out.png` (also writes out.under.png + out.scene.json)
- `npm run paint -- scenes/temple-pond.ts out.png --medium charcoal`
- `npm run paint -- --text-file notes/ferrari-spec.txt out.png` (long descriptions)
- `npm run photo -- photo.jpg out.png --preset pastel`
- `npm run build` → `docs/index.html` (single-file offline app; also the GitHub Pages site)
- `npm run check` → TypeScript type-check
Always look at both the `.under.png` (code-drawn scene) and the painting after a change.

## Architecture
words → `src/scene/parse.ts` (vocabulary + composition rules) → Scene JSON → `src/scene/elements.ts`
(shapes drawn into `Ref`, the underpainting: RGB + stroke-direction hints + linework + owner map) →
`src/paint.ts` (paper, toned wash, Hertzmann coarse-to-fine strokes, linework, contours, hatching) →
`src/grade.ts`. Core: `src/core/{rng,paper,brush}.ts`. Media presets: `src/presets.ts`.
Web app: `web/{app,worker}.ts` + `web/template.html`, bundled by `build.mjs`.

Conventions: x = fraction of width, y = fraction of height (0 top), sizes = fraction of height,
depth 0 near → 1 far. One scene light (`light.dir` = where light comes FROM). Solids = unions of capsules and
ellipses shaded from distance-to-axis normals (`sculpt`). Fine detail via `ref.mark()` (repainted as real
strokes, auto-occluded). No trademark logos or copyrighted characters.

## The object LIBRARY (done) and what's next
Every drawable thing with structure is a `LibraryEntry` in `src/library/` (trigger words, phrases, absorbed part-words,
`extract()` for options, placement, `draw()`), registered in `src/library/index.ts`. Scene element
`{type:'library', name, x, y, size, facing, options}` is dispatched through `ELEMENTS`; the parser adds every entry's
words to `VOCAB`, replaces phrases ("sports car") with the first word, and lets an entry absorb part-words so
"prancing horse" never becomes a horse. Shared helpers: `src/library/util.ts` (`readColours`, `frame`, `profile`,
`groundShadow`). Staging elements in `src/scene/staging.ts`: `studio`, `road`, `reflect` (mirrors only one element's
pixels via the owner map). Entries so far: supercar, lighthouse, windmill. Test with
`npm run paint -- --text-file notes/ferrari-spec.txt out/ferrari.png`.

Next:
1. Move the existing objects (temple, banyan, elephant, boat, ...) into library entries.
2. More entries (wind turbine, bicycle, house, ...); front and rear views of the supercar.
3. Parser: facing words ("facing left"), per-object positions beyond left/right/centre.

## Publishing
Repo `Peru-107/Co-Lor` (public). Push `main`, then Settings → Pages → Deploy from branch → `main` /docs.
Commits end with the attribution lines the session asks for.
