/**
 * Creatures from the body-plan builder (src/render3d). One library entry per species in SPECIES, so each gets its own
 * words, colour options and placement from the same few lines. To add an animal, add a row to SPECIES.
 */
import { renderModel } from '../render3d/sdf';
import { SPECIES, speciesBuild } from '../render3d/creatures';
import type { LibraryEntry } from './types';
import { readColours } from './util';

function creature(key: string): LibraryEntry {
  const s = SPECIES[key];
  return {
    name: key,
    words: s.words,
    // Words that only describe parts of the animal (or what it is doing) belong to it and never become objects.
    absorbs: ['newspaper', 'paper', 'headline', 'reading', 'reads', 'read', 'scales', 'scaly', 'horns', 'horn', 'wings', 'wing', 'fangs', 'claws', 'mane', 'tail', 'folded', 'spread'],
    extract: (text) => ({
      colours: readColours(text, { horn: ['horn', 'horns'], wing: ['wing', 'wings'], eye: ['eye', 'eyes'], belly: ['belly', 'underbelly', 'chest'] }),
      reading: !!s.upright && /\b(read|reads|reading|newspaper|paper)\b/.test(text),
      spread: !/\bfolded\b/.test(text),
    }),
    defaults: { spread: true },
    placement: { size: s.upright ? 0.72 : 0.6, prefers: ['land', 'studio'], height: s.upright ? 0.75 : 0.5, plural: 2 },
    draw(ref, at, opts) {
      const model = speciesBuild(key, { colours: opts.colours, reading: opts.reading, spread: opts.spread });
      renderModel(ref, model, {
        x: at.x,
        y: at.y,
        ppu: at.size / model.length,
        facing: at.facing,
        az: opts.reading ? 0.55 : 0.45,
        el: 0.1,
        depth: at.depth,
        env: opts.env ?? [150, 170, 200],
      });
    },
  };
}

export const CREATURE_ENTRIES: LibraryEntry[] = Object.keys(SPECIES).map(creature);
