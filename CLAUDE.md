# Dry-Media Painter: briefing for Claude Code

Text in, painting out, **pure code**. No AI or image models at run time, no network. Inspired by
github.com/ytsav/Jatayu-Javascript (one hand-coded artwork); this repo contains none of its code.
Owner: Peru (GitHub `Peru-107`). Style: informal, iterative, show renders early.

## Commands
- `npm install`
- `npm run paint -- --text "a temple by a lake at sunset" out.png` (also writes out.under.png + out.scene.json)
- `npm run paint -- scenes/temple-pond.ts out.png --medium charcoal`
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

## In progress: the object LIBRARY
Goal: every drawable thing becomes one library entry (trigger words, option extraction, placement, draw()),
so new objects never touch the engine. Started: `src/library/types.ts` (the `LibraryEntry` interface).
Next steps:
1. `src/library/index.ts` registry; scene element `{type:'library', name, x, y, size, facing, options}`
   dispatched in `ELEMENTS`; parser adds every entry's words/phrases to `VOCAB` and calls `extract()`.
2. First entry `src/library/supercar.ts` from `notes/ferrari-spec.txt` (Peru's paragraph): side-view wedge
   profile in (u,v) units of car length, wheel arches cut from the body polygon, gloss paint as tone bands
   (sky reflection on top, sharp shoulder highlight, darker crimson lower body, fender-arc highlights),
   dark glass with a reflection streak, side intake behind the door, mirror, narrow headlight, circular taillight,
   black splitter/skirts/diffuser with fins, multi-spoke dark wheels, ventilated discs, yellow calipers, small
   plain yellow centre caps (NO prancing-horse badge). Words: car, supercar, ferrari, lamborghini, porsche,
   mclaren, coupe, "sports car". Options: paint colour (dominant colour word not attached to a part;
   "rosso corsa" = red), caliper colour, wheel finish.
3. New settings: `studio` (backdrop + floor + softbox glow + `reflect` element mirroring only the car's pixels
   via the owner map) and `road` (asphalt band). Words: studio, showroom, road, highway, track, racetrack.
4. Test with the full text of `notes/ferrari-spec.txt`; then move existing objects (temple, banyan,
   elephant, boat…) into library entries.
5. UI: cap the "Skipped" list (~30 + "N more"), keep chips spaced.

## Publishing
Repo `Peru-107/dry-media-painter` (public). Push `main`, then Settings → Pages → Deploy from branch → `main` /docs.
Commits end with the attribution lines the session asks for.
