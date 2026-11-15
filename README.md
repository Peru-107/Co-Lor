# Dry-Media Painter

Type a sentence, get a painting. **No AI, no internet, no image models.** Plain TypeScript reads your words,
composes a scene out of procedural shapes, and paints it stroke by stroke with simulated pastel, charcoal or
gouache on cold-pressed cotton paper. It also repaints photos.

```
"an ancient temple beside a lotus pond at sunset with egrets and a huge banyan tree on the left"
```

![Temple pond at sunset](examples/example.jpg)

## Run it

**No install:** open `docs/index.html` in any browser (double-click it). It works offline.

**Command line** (Node 18+):

```bash
npm install
npm run paint -- --text "two fishing boats on a misty lake at dawn, mountains behind" out.png
npm run paint -- scenes/temple-pond.ts out.png --medium charcoal     # a hand-written scene file
npm run photo -- photo.jpg out.png --preset pastel                   # repaint a photo
npm run build                                                         # rebuild docs/index.html
```

Every render also writes `out.under.png` (the code-drawn scene before the brushes) and, for text, `out.scene.json`.

## How it works

```
words ──► parser ──► scene (JSON) ──► shapes in code ──► underpainting ──► brush engine ──► painting
          src/scene/parse.ts   src/scene/elements.ts         src/paint.ts + src/core/*
```

1. **Words → scene** (`src/scene/parse.ts`). A ~300-word vocabulary maps words to ideas: time of day, weather,
   places, buildings, trees, animals, people, boats, counts ("three boats"), colours ("red boat"), sizes
   ("huge banyan"), positions ("on the left", "under a tree") and medium ("charcoal"). Composition rules set the
   horizon, layer things back to front, keep the subject on a third, push trees to the edges, and tint every
   colour to the light (golden hour, dusk, night, rain…). Unknown words are listed as skipped.
2. **Scene → underpainting** (`src/scene/elements.ts`). Each element draws itself with lighting: solids are
   unions of capsules and ellipses shaded from a fake 3D normal; terrain uses noise heightfields; water mirrors
   what's above it; mist and haze fade distance. Every element also says which way brush strokes should run
   (water across, grass up, leaves around each clump) and can hand fine linework (grass, birds, fronds, roots)
   straight to the brushes.
3. **Underpainting → painting** (`src/paint.ts`). A toned wash, then brushes from big to small. Each pass only
   places strokes where the canvas still differs from the target, and each stroke grows along the flow field
   until its colour stops matching. The brush lays pigment on the paper's raised tooth first and leaves bristle
   streaks. Then linework, charcoal contours on real edges, optional hatching, and a light-and-colour grade.

## Scene files

A scene is plain data, so you can write one by hand (`scenes/temple-pond.ts`) or edit the `.scene.json` the
parser saved. Positions: `x` is a fraction of width, `y` of height; sizes are fractions of height; `depth`
0 = near, 1 = far. Elements: `sky`, `clouds`, `terrain` (mountain, hill, dune, ground), `water`, `mist`, `tree`
(broadleaf, banyan, pine, cypress, palm, bare), `forest`, `grass`, `building` (flat, gable, dome, shikhara),
`figure`, `animal` (elephant, cow, deer, horse, dog, goat), `boat`, `birds`, `lotus`, `lamps`, `rain`,
`snowfall`, `glow`, `polygon`, `blob` (sculpt anything from capsules and ellipses), and `custom` (your own code).

## Media

`pastel` (default), `charcoal`, `gouache`, `impressionist`. Each is a set of numbers in `src/presets.ts`:
brush sizes per pass, how faithful each pass is, grain, streaks, taper, wobble, contours, hatching, grade.

## Teach it new words

Add an entry to `VOCAB` in `src/scene/parse.ts` and, if it's a new kind of thing, an element in
`src/scene/elements.ts`. That's the whole extension model.

## Credits

Inspired by [Jatayu-Javascript](https://github.com/ytsav/Jatayu-Javascript), a single hand-coded dry-media
artwork. This project contains no code from it. Stroke placement follows Aaron Hertzmann, *Painterly Rendering
with Curved Brush Strokes of Multiple Sizes* (SIGGRAPH 1998).
