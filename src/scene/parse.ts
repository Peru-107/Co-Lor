/**
 * Offline text -> scene composer. No AI: a vocabulary of words mapped to scene concepts, plus composition rules
 * (horizon, layering back to front, rule-of-thirds placement, colours keyed to time of day and weather).
 */
import { createRng, Rng } from '../core/rng';
import { mix, rgb, type Color } from './ref';
import type { AnimalKind, Scene, SceneElement, TreeKind } from './types';

type Time = 'dawn' | 'day' | 'golden' | 'dusk' | 'night';
type Weather = 'clear' | 'cloudy' | 'overcast' | 'mist' | 'rain' | 'snow';

type Concept =
  | ['time', Time] | ['weather', Weather] | ['setting', string] | ['building', string] | ['tree', TreeKind | 'tree' | 'bare']
  | ['animal', AnimalKind | 'bull'] | ['bird', string] | ['person', string] | ['pose', 'walk' | 'sit' | 'stand' | 'graze'] | ['boat', string]
  | ['detail', string] | ['medium', string] | ['color', string] | ['size', number] | ['place', string] | ['count', number] | ['season', string] | ['mood', string];

const W = (words: string, c: Concept): Array<[string, Concept]> => words.split(/\s+/).map((w) => [w, c]);
const VOCAB = new Map<string, Concept>([
  ...W('dawn sunrise daybreak morning', ['time', 'dawn']),
  ...W('noon midday day daytime afternoon sunny bright', ['time', 'day']),
  ...W('sunset evening golden', ['time', 'golden']),
  ...W('dusk twilight', ['time', 'dusk']),
  ...W('night midnight moon moonlit moonlight starry stars nocturnal', ['time', 'night']),
  ...W('clear cloudless', ['weather', 'clear']),
  ...W('cloud clouds cloudy', ['weather', 'cloudy']),
  ...W('overcast grey gray gloomy dull', ['weather', 'overcast']),
  ...W('mist misty fog foggy haze hazy', ['weather', 'mist']),
  ...W('rain rainy raining monsoon storm stormy drizzle thunderstorm', ['weather', 'rain']),
  ...W('snow snowy snowing snowfall winter frozen icy', ['weather', 'snow']),
  ...W('mountain peak range himalaya himalayas alps cliff summit', ['setting', 'mountain']),
  ...W('hill hillside slope', ['setting', 'hill']),
  ...W('valley', ['setting', 'valley']),
  ...W('desert dune sand sahara thar', ['setting', 'desert']),
  ...W('beach shore coast seaside', ['setting', 'beach']),
  ...W('sea ocean wave bay', ['setting', 'sea']),
  ...W('lake pond pool tank reservoir', ['setting', 'lake']),
  ...W('river stream ganga ganges canal ghat', ['setting', 'river']),
  ...W('forest jungle wood woods woodland grove', ['setting', 'forest']),
  ...W('field meadow farm paddy grassland countryside', ['setting', 'field']),
  ...W('garden park', ['setting', 'garden']),
  ...W('temple shrine mandir', ['building', 'temple']),
  ...W('palace mosque taj mahal dome tomb', ['building', 'palace']),
  ...W('house home cottage hut cabin farmhouse', ['building', 'house']),
  ...W('village hamlet', ['building', 'village']),
  ...W('city town skyline building tower skyscraper street', ['building', 'city']),
  ...W('fort castle fortress', ['building', 'fort']),
  ...W('tree oak mango neem maple', ['tree', 'tree']),
  ...W('banyan peepal pipal', ['tree', 'banyan']),
  ...W('palm coconut', ['tree', 'palm']),
  ...W('pine fir spruce conifer cedar deodar', ['tree', 'pine']),
  ...W('cypress', ['tree', 'cypress']),
  ...W('dead bare leafless barren', ['tree', 'bare']),
  ...W('elephant', ['animal', 'elephant']),
  ...W('cow calf', ['animal', 'cow']),
  ...W('bull ox buffalo', ['animal', 'bull']),
  ...W('deer stag doe', ['animal', 'deer']),
  ...W('horse pony', ['animal', 'horse']),
  ...W('dog puppy', ['animal', 'dog']),
  ...W('goat sheep lamb', ['animal', 'goat']),
  ...W('bird flock', ['bird', 'dark']),
  ...W('egret heron crane swan gull seagull dove stork', ['bird', 'white']),
  ...W('crow raven eagle hawk kite vulture', ['bird', 'black']),
  ...W('parrot', ['bird', 'green']),
  ...W('man woman person boy girl child kid people monk sage saint farmer traveller traveler wanderer figure pilgrim fisherman lady king queen priest villager shepherd', ['person', 'person']),
  ...W('crowd', ['person', 'crowd']),
  ...W('walking walk walks wandering strolling', ['pose', 'walk']),
  ...W('sitting sits meditating resting praying seated', ['pose', 'sit']),
  ...W('standing stands', ['pose', 'stand']),
  ...W('grazing eating drinking', ['pose', 'graze']),
  ...W('under beneath below', ['place', 'under']),
  ...W('boat canoe', ['boat', 'boat']),
  ...W('ship sailboat sail sailing dhow yacht', ['boat', 'sail']),
  ...W('flower blossom wildflower', ['detail', 'flowers']),
  ...W('grass', ['detail', 'grass']),
  ...W('lotus lily', ['detail', 'lotus']),
  ...W('lamp lantern diya diwali candle', ['detail', 'lamps']),
  ...W('pastel chalk', ['medium', 'pastel']),
  ...W('charcoal sketch drawing pencil', ['medium', 'charcoal']),
  ...W('gouache poster illustration', ['medium', 'gouache']),
  ...W('impressionist impressionism monet oil', ['medium', 'impressionist']),
  ...W('red crimson', ['color', '#b5452f']), ...W('orange saffron', ['color', '#d9782d']), ...W('yellow', ['color', '#e3b23c']),
  ...W('green', ['color', '#4f7a3a']), ...W('blue', ['color', '#3f6ea8']), ...W('purple violet', ['color', '#6d4f8f']),
  ...W('pink', ['color', '#e58aa6']), ...W('white', ['color', '#efe9df']), ...W('black dark', ['color', '#2b2626']),
  ...W('brown', ['color', '#6b4a32']), ...W('gold', ['color', '#d4a24c']),
  ...W('big large huge giant tall massive great', ['size', 1.3]), ...W('small tiny little', ['size', 0.7]),
  ...W('left', ['place', 'left']), ...W('right', ['place', 'right']), ...W('center centre middle', ['place', 'center']),
  ...W('background distance distant far faraway horizon', ['place', 'far']), ...W('foreground front near', ['place', 'near']),
  ...W('autumn fall', ['season', 'autumn']), ...W('spring', ['season', 'spring']), ...W('summer', ['season', 'summer']),
  ...W('calm peaceful quiet serene tranquil still lonely dramatic moody', ['mood', 'mood']),
  ...W('ancient old ruined weathered', ['mood', 'old']),
]);
const NUM: Record<string, number> = { a: 1, an: 1, one: 1, lone: 1, single: 1, solitary: 1, two: 2, couple: 2, pair: 2, three: 3, few: 3, four: 4, five: 5, some: 4, six: 6, several: 5, seven: 7, eight: 8, nine: 9, many: 9, ten: 10, dozen: 12 };
const STOP = new Set('the of in on at by with and near beside over behind its is are it to from into across through along between among while as very there their his her its this that these those against around above below beneath next under up down out for or into onto upon who which where while being has have had'.split(' '));

function lookup(w: string): Concept | undefined {
  if (VOCAB.has(w)) return VOCAB.get(w);
  if (w.endsWith('ies') && VOCAB.has(w.slice(0, -3) + 'y')) return VOCAB.get(w.slice(0, -3) + 'y');
  if (w.endsWith('es') && VOCAB.has(w.slice(0, -2))) return VOCAB.get(w.slice(0, -2));
  if (w.endsWith('s') && VOCAB.has(w.slice(0, -1))) return VOCAB.get(w.slice(0, -1));
  if (w === 'men' || w === 'women' || w === 'children') return ['person', 'person'];
  return undefined;
}

interface Mention { kind: Concept[0]; value: any; count: number; plural: boolean; color?: string; size: number; place?: string; pose?: string; word: string; order: number; anchor?: Mention }

export interface ParsedScene extends Scene { understood: string[]; ignored: string[] }

export function textToScene(text: string, seed = 7): ParsedScene {
  const rng = createRng(seed * 7919 + text.length);
  const lower = text.toLowerCase().replace(/golden hour/g, 'golden').replace(/blue hour/g, 'dusk').replace(/fishing boat/g, 'boat');
  const clauses = lower.split(/[,.;!]|\band\b|\bwith\b|\bwhile\b/).map((c) => c.split(/[^a-z]+/).filter(Boolean));
  const understood = new Set<string>();
  const ignored = new Set<string>();
  const mentions: Mention[] = [];
  const flags = { time: undefined as Time | undefined, weather: new Set<Weather>(), settings: new Set<string>(), details: new Set<string>(), medium: undefined as string | undefined, season: undefined as string | undefined, old: false };
  let order = 0;

  for (const words of clauses) {
    let pendingCount: number | undefined, pendingColor: string | undefined, pendingSize = 1;
    let clausePlace: string | undefined, clausePose: string | undefined;
    const clauseMentions: Mention[] = [];
    for (const w of words) {
      if (w in NUM) { pendingCount = NUM[w]; if (w !== 'a' && w !== 'an') understood.add(w); continue; }
      if (/^\d+$/.test(w)) { pendingCount = Math.min(30, Number(w)); understood.add(w); continue; }
      const c = lookup(w);
      if (!c) { if (!STOP.has(w) && w.length > 2) ignored.add(w); continue; }
      understood.add(w);
      const [k, v] = c;
      if (k === 'time') flags.time = flags.time ?? v as Time;
      else if (k === 'weather') flags.weather.add(v as Weather);
      else if (k === 'setting') { flags.settings.add(v as string); }
      else if (k === 'detail') { flags.details.add(v as string); if (v === 'lotus') flags.settings.add(flags.settings.has('river') ? 'river' : 'lake'); }
      else if (k === 'medium') flags.medium = v as string;
      else if (k === 'season') flags.season = v as string;
      else if (k === 'mood') { if (v === 'old') flags.old = true; }
      else if (k === 'color') pendingColor = v as string;
      else if (k === 'size') pendingSize = v as number;
      else if (k === 'place') clausePlace = v as string;
      else if (k === 'pose') clausePose = v as string;
      else if (k === 'tree' && v === 'tree' && clauseMentions.length && clauseMentions[clauseMentions.length - 1].kind === 'tree' && clauseMentions[clauseMentions.length - 1].order === order - 1) {
        continue;
      }
      else {
        const plural = /s$/.test(w) && !/ss$/.test(w) || ['people', 'men', 'women', 'children', 'crowd', 'flock', 'sheep', 'deer'].includes(w);
        const count = pendingCount ?? (plural ? (k === 'bird' ? 9 : k === 'person' ? 3 : 3) : 1);
        const m: Mention = { kind: k, value: v, count: v === 'crowd' ? Math.max(count, 7) : count, plural, color: pendingColor, size: pendingSize, word: w, order: order++ };
        mentions.push(m); clauseMentions.push(m);
        pendingCount = undefined; pendingColor = undefined; pendingSize = 1;
      }
    }
    const anchorTree = clauseMentions.find((m) => m.kind === 'tree');
    for (const m of clauseMentions) {
      if ((m.kind === 'person' || m.kind === 'animal') && anchorTree && (clausePlace === 'under' || words.includes('beside') || words.includes('near') || words.includes('by'))) m.anchor = anchorTree;
      else m.place = m.place ?? (clausePlace === 'under' ? undefined : clausePlace);
      if (m.kind === 'person' || m.kind === 'animal') m.pose = clausePose;
    }
  }

  // Merge a "dead/bare" mention into the tree it describes.
  const trees = mentions.filter((m) => m.kind === 'tree');
  if (trees.some((t) => t.value === 'bare')) {
    for (const t of trees) if (t.value === 'tree') t.value = 'bare';
    if (trees.length > 1) mentions.splice(mentions.findIndex((m) => m.kind === 'tree' && m.value === 'bare' && m.word !== 'tree'), 1);
  }
  if (mentions.some((m) => m.kind === 'boat')) flags.settings.add(flags.settings.has('sea') || flags.settings.has('beach') ? 'sea' : flags.settings.has('river') ? 'river' : 'lake');
  if (flags.settings.has('beach')) flags.settings.add('sea');
  if (flags.weather.has('snow') && !flags.time) flags.time = 'day';

  return compose({ mentions, ...flags }, rng, [...understood], [...ignored], seed);
}

// ---------------------------------------------------------------- composition

interface Plan { mentions: Mention[]; time?: Time; weather: Set<Weather>; settings: Set<string>; details: Set<string>; medium?: string; season?: string; old: boolean }

const SKY: Record<Time, Array<[number, string]>> = {
  dawn: [[0, '#6d7fa8'], [0.6, '#d3a9aa'], [1, '#f6d5a8']],
  day: [[0, '#3f78bf'], [0.6, '#93bde3'], [1, '#dbe9f0']],
  golden: [[0, '#5d7fa6'], [0.6, '#c9a98f'], [1, '#f2c58e']],
  dusk: [[0, '#253661'], [0.55, '#7a5f8f'], [1, '#ec9a76']],
  night: [[0, '#0b1430'], [0.6, '#1c2a50'], [1, '#3a466e']],
};

function compose(p: Plan, rng: Rng, understood: string[], ignored: string[], seed: number): ParsedScene {
  const time: Time = p.time ?? 'golden';
  const wx = p.weather;
  const rainy = wx.has('rain'), snowy = wx.has('snow'), misty = wx.has('mist') || p.settings.has('valley');
  const grey = rainy || wx.has('overcast');
  const S = p.settings;
  const sea = S.has('sea'), lake = S.has('lake'), river = S.has('river'), desert = S.has('desert');
  const water = sea || lake || river;
  const mountains = S.has('mountain') || S.has('valley') || (snowy && !sea && rng() < 0.7);
  const hills = S.has('hill') || S.has('valley') || (!mountains && !sea && !desert && !S.has('city'));
  const forest = S.has('forest');
  const H = sea ? 0.56 : water ? 0.6 : 0.62;

  const tintTo: Record<Time, [string, number]> = { night: ['#1b2442', 0.62], dusk: ['#5b4a6e', 0.28], golden: ['#f0a060', 0.12], dawn: ['#e8a0a0', 0.1], day: ['#ffffff', 0] };
  const tint = (c: Color): Color => {
    let x = mix(rgb(c), rgb(tintTo[time][0]), tintTo[time][1]);
    if (grey) x = mix(x, rgb(rainy ? '#5d6670' : '#8a8f96'), rainy ? 0.35 : 0.22);
    return [Math.round(x[0]), Math.round(x[1]), Math.round(x[2])];
  };
  const greyTo = time === 'night' ? '#20242e' : rainy ? '#6b737d' : '#9aa0a8';
  const skyStops = SKY[time].map(([y, c]) => [y * H, grey ? mix(rgb(c), rgb(greyTo), rainy ? 0.7 : 0.55) : rgb(c)] as [number, Color]);

  const sunRight = rng() < 0.6;
  const sideSign = sunRight ? 1 : -1;
  const sunX = time === 'day' ? (sunRight ? 0.78 : 0.22) : sunRight ? 0.8 : 0.2;
  const sunY = time === 'day' ? 0.13 : time === 'dusk' ? H + 0.03 : H - (time === 'dawn' ? 0.08 : 0.12);
  const els: SceneElement[] = [];
  const sky: Extract<SceneElement, { type: 'sky' }> = { type: 'sky', stops: skyStops };
  if (!grey && (time === 'golden' || time === 'dawn' || time === 'day')) sky.sun = { x: sunX, y: sunY, r: time === 'day' ? 0.03 : 0.035, glow: time === 'day' ? '#fff4d6' : time === 'dawn' ? '#ffd2b0' : '#ffcf86', glowSize: time === 'day' ? 0.18 : 0.3 };
  if (time === 'night') { sky.moon = { x: sunRight ? 0.76 : 0.24, y: 0.17, r: 0.035 }; if (!grey) sky.stars = 420; }
  els.push(sky);
  if (time === 'dusk' && !grey) els.push({ type: 'glow', x: sunX, y: H, r: 0.35, color: '#ffb27a', strength: 0.45 });

  const coverage = rainy ? 0.95 : wx.has('overcast') ? 0.85 : wx.has('cloudy') ? 0.62 : wx.has('clear') ? 0.12 : 0.38;
  const cloudC = time === 'night' ? '#46507a' : time === 'dusk' ? '#e9b3a4' : time === 'golden' ? '#fbe7cf' : grey ? '#c3c6cc' : '#fbf6ee';
  const cloudS = time === 'night' ? '#1a2240' : grey ? '#5f6670' : time === 'day' ? '#9fb0c8' : '#9b8fa5';
  els.push({ type: 'clouds', y0: 0.03, y1: H - 0.1, coverage, color: cloudC, shadow: cloudS, depth: 0.25, seed: Math.floor(rng() * 100) });

  if (mountains) {
    const mc = time === 'day' ? '#6f7f99' : '#7d6f86';
    els.push({ type: 'terrain', kind: 'mountain', y: H - 0.05, amp: 0.22 + rng() * 0.1, color: tint(mc), depth: 0.5, snow: snowy || S.has('mountain') && rng() < 0.5 ? 0.12 : 0, seed: Math.floor(rng() * 100), freq: 0.7 + rng() * 0.5 });
  }
  if (desert) {
    els.push({ type: 'terrain', kind: 'dune', y: H - 0.02, amp: 0.05, color: tint('#d6a96b'), depth: 0.4, seed: 3 });
  } else if (hills && !sea) {
    els.push({ type: 'terrain', kind: 'hill', y: H - 0.015, amp: 0.05 + rng() * 0.04, color: tint(snowy ? '#cfd6de' : '#6f7a58'), depth: 0.4, seed: Math.floor(rng() * 100) });
  }
  if (misty || time === 'dawn') els.push({ type: 'mist', y0: H - 0.14, y1: H + 0.03, color: time === 'night' ? '#4a5478' : time === 'golden' ? '#efd2b0' : '#e6e3dd', amount: misty ? 0.6 : 0.35 });

  const groundBase = snowy ? '#e6eaf0' : desert ? '#d8ae74' : S.has('city') ? '#8a8378' : p.season === 'autumn' ? '#9a8a4a' : '#7d8a46';
  const leaf = p.season === 'autumn' ? '#c0682c' : snowy ? '#2f4f3e' : p.season === 'spring' ? '#6f9a45' : '#4d7a3c';
  if (!sea) els.push({ type: 'terrain', kind: 'ground', y: H, amp: 0.012, color: tint(groundBase), bottom: water ? H + 0.04 : 1, seed: 2 });

  // --- far band: forest, buildings on the horizon
  const subject = p.mentions.filter((m) => m.kind !== 'bird').sort((a, b) => a.order - b.order)[0];
  const usedFar: Array<[number, number]> = [];
  const pickX = (pref: string | undefined, width: number, used: Array<[number, number]>, def: number) => {
    const target = pref === 'left' ? 0.2 : pref === 'right' ? 0.75 : pref === 'center' ? 0.5 - width / 2 : def;
    let best = target, bestCost = Infinity;
    for (let k = 0; k < 40; k++) {
      const x = k === 0 ? target : Math.max(0.02, Math.min(0.98 - width, target + (rng() - 0.5) * 0.9));
      const overlap = used.reduce((s, [a, b]) => s + Math.max(0, Math.min(b, x + width) - Math.max(a, x)), 0);
      const cost = overlap * 10 + Math.abs(x - target);
      if (cost < bestCost) { bestCost = cost; best = x; }
    }
    used.push([best, best + width]);
    return best;
  };

  const lit = time === 'night' || time === 'dusk';
  const farY = water && !sea ? H + 0.012 : H + 0.1;
  const buildingEls: SceneElement[] = [];
  const thirds = sunRight ? 0.55 : 0.3;
  for (const m of p.mentions.filter((x) => x.kind === 'building')) {
    const k = m.size;
    const wallC = tint(m.color ?? (p.old ? '#b89a78' : '#d2b089'));
    const near = m.place === 'near';
    const by = near ? 0.9 : farY;
    const sc = near ? 2.2 : water && !sea ? 1 : 1.5;
    if (m.value === 'temple') {
      const w = 0.15 * k * sc;
      const x = pickX(m.place, w / 0.5625 * 0.56, usedFar, m === subject ? thirds : 0.6);
      for (let c = 0; c < m.count; c++) buildingEls.push({ type: 'building', x: x + c * w * 1.4 / 1.78, y: by, w, h: w * 0.75, roof: 'shikhara', color: wallC, roofColor: tint(m.color ?? (p.old ? '#b48a5f' : '#c4915f')), door: true });
      if (m.count === 1 && rng() < 0.6) buildingEls.push({ type: 'building', x: x + w / 1.78 * 1.25, y: by, w: w * 0.6, h: w * 0.5, roof: 'flat', color: wallC, door: true });
    } else if (m.value === 'palace') {
      const w = 0.32 * k * sc;
      const x = pickX(m.place, w / 1.78 + 0.04, usedFar, m === subject ? 0.5 - w / 3.56 : 0.6);
      const wc = tint(m.color ?? '#ece4d6');
      buildingEls.push({ type: 'building', x: x + 0.02, y: by, w, h: w * 0.35, roof: 'flat', color: wc, door: true, windows: { rows: 1, cols: 5, lit } });
      buildingEls.push({ type: 'building', x: x + 0.02 + w / 1.78 * 0.33, y: by - w * 0.35, w: w * 0.34, h: w * 0.08, roof: 'dome', color: wc, roofColor: wc });
      for (const side of [0, 1]) buildingEls.push({ type: 'building', x: x + side * (w / 1.78 + 0.02), y: by, w: w * 0.06, h: w * 0.75, roof: 'dome', color: wc, roofColor: wc });
    } else if (m.value === 'house' || m.value === 'village') {
      const n = m.value === 'village' ? Math.max(4, m.count) : m.count;
      for (let c = 0; c < n; c++) {
        const w = (0.07 + rng() * 0.04) * k * sc;
        const x = pickX(c === 0 ? m.place : undefined, w / 1.78 * 1.3, usedFar, m === subject && c === 0 ? thirds : 0.15 + rng() * 0.7);
        buildingEls.push({ type: 'building', x, y: by + rng() * 0.01, w, h: w * (0.6 + rng() * 0.2), roof: 'gable', color: tint(m.color ?? (rng() < 0.5 ? '#d8c3a0' : '#c9a982')), roofColor: tint(rng() < 0.5 ? '#9a4b33' : '#7a5a3a'), door: true, windows: { rows: 1, cols: 2, lit } });
      }
    } else if (m.value === 'city') {
      let x = pickX(m.place, 0.55, usedFar, 0.2);
      const end = x + 0.55;
      while (x < end) {
        const w = 0.05 + rng() * 0.07, h = 0.12 + rng() * 0.25;
        buildingEls.push({ type: 'building', x, y: by, w, h, roof: rng() < 0.15 ? 'dome' : 'flat', color: tint(m.color ?? (rng() < 0.5 ? '#b8afa3' : '#9c958c')), roofColor: tint('#8a8278'), windows: { rows: Math.round(h * 30), cols: Math.max(2, Math.round(w * 40)), lit } });
        x += w / 1.78 + 0.008;
      }
    } else if (m.value === 'fort') {
      const w = 0.4 * k * sc;
      const x = pickX(m.place, w / 1.78, usedFar, 0.4);
      buildingEls.push({ type: 'building', x, y: by, w, h: w * 0.3, roof: 'flat', color: tint(m.color ?? '#b07a52'), door: true, windows: { rows: 1, cols: 6, lit } });
      buildingEls.push({ type: 'building', x: x - 0.01, y: by, w: w * 0.12, h: w * 0.42, roof: 'flat', color: tint(m.color ?? '#a8724c') });
      buildingEls.push({ type: 'building', x: x + w / 1.78 - 0.02, y: by, w: w * 0.12, h: w * 0.42, roof: 'flat', color: tint(m.color ?? '#a8724c') });
    }
  }

  const treeMentions = p.mentions.filter((m) => m.kind === 'tree');
  const farKinds: TreeKind[] = snowy || mountains ? ['pine', 'pine', 'broadleaf'] : sea || desert ? ['palm'] : forest ? ['broadleaf', 'broadleaf', 'palm', 'cypress'] : ['broadleaf', 'palm'];
  if (!sea && !desert && (forest || buildingEls.length || rng() < 0.6)) {
    els.push({ type: 'forest', x0: 0, x1: 1, y: water ? H + 0.002 : H + 0.005, y1: water ? H + 0.012 : H + 0.04, count: forest ? 40 : 14, size: forest ? [0.1, 0.2] : [0.06, 0.12], kinds: farKinds, leaf: tint(leaf), trunk: tint('#5a4232'), depth: 0.35, seed: Math.floor(rng() * 1000) });
  }
  if (water && !sea) els.push(...buildingEls.filter((b) => (b as any).y < 0.85));

  // --- water
  if (water) {
    const wy = sea ? H : H + 0.035;
    const wc = sea ? (time === 'night' ? '#1d2a48' : '#41708c') : time === 'night' ? '#26304e' : '#6d8794';
    els.push({ type: 'water', y: wy, color: tint(wc), deep: tint(sea ? '#22445e' : '#3e5866'), reflect: sea ? 0.45 : 0.75, ripple: sea ? 1.8 : 1, bottom: 1 });
    if (p.details.has('lotus')) els.push({ type: 'lotus', x0: 0.05, x1: 0.95, y0: wy + 0.06, y1: 0.86, count: 26, color: tint('#e58aa6'), pad: tint('#4d6e3a'), seed: 3 });
    for (const m of p.mentions.filter((x) => x.kind === 'boat')) {
      for (let c = 0; c < m.count; c++) {
        const by = wy + 0.05 + rng() * (0.86 - wy - 0.08) * (c === 0 ? 0.6 : 1);
        const persp = 0.5 + (by - wy) * 4;
        els.push({ type: 'boat', x: m.place === 'left' ? 0.25 : m.place === 'right' ? 0.72 : 0.3 + rng() * 0.45, y: by, size: 0.2 * m.size * persp, color: tint(m.color ?? '#5b3b2a'), sail: m.value === 'sail' || sea ? tint('#efe5d0') : undefined, facing: rng() < 0.5 ? 1 : -1 });
      }
    }
  }
  if (!water || sea) els.push(...buildingEls);

  // --- foreground ground
  const fgY = water ? (sea ? 0.86 : 0.87) : 0.86;
  if (water && (!sea || S.has('beach'))) els.push({ type: 'terrain', kind: 'ground', y: fgY, amp: 0.025, color: tint(sea ? '#d9c49a' : desert ? '#d8ae74' : snowy ? '#e6eaf0' : '#7d7442'), seed: 6 });
  const hasFg = !sea || S.has('beach');

  // --- trees, animals, people in the foreground
  const usedFg: Array<[number, number]> = [];
  const fgItems: Array<{ y: number; el: SceneElement }> = [];
  for (const m of treeMentions) {
    const kind: TreeKind = m.value === 'tree' ? (snowy ? 'pine' : 'broadleaf') : m.value;
    for (let c = 0; c < Math.min(m.count, 6); c++) {
      const size = Math.min(0.66, (kind === 'banyan' ? 0.5 : kind === 'palm' ? 0.6 : kind === 'pine' ? 0.55 : 0.5) * m.size * (c ? 0.75 + rng() * 0.3 : 1));
      const width = kind === 'banyan' ? 0.75 : 0.35;
      const half = (size * width) / 1.78 / 2;
      const subjSide = subject && subject !== m ? (thirds > 0.45 ? 'left' : 'right') : undefined;
      const side = (c === 0 ? m.place : undefined) ?? subjSide ?? (c % 2 ? 'right' : 'left');
      const cx = subject === m && !m.place ? thirds + 0.05 : side === 'right' ? 0.95 - half * 0.6 - c * 0.04 : side === 'center' ? 0.5 : 0.05 + half * 0.6 + c * 0.04;
      usedFg.push([cx - half * 0.5, cx + half * 0.5]);
      if (c === 0) (m as any).x = cx;
      fgItems.push({ y: 0.93 + c * 0.005, el: { type: 'tree', x: cx, y: hasFg ? 0.93 : 0.99, size, kind, leaf: tint(m.color ?? leaf), trunk: tint('#5a4232'), seed: Math.floor(rng() * 1e6) } });
    }
  }
  if (!treeMentions.length && hasFg && !S.has('city') && !desert && rng() < 0.55) {
    const kind: TreeKind = snowy || mountains ? 'pine' : S.has('beach') ? 'palm' : 'broadleaf';
    const x = pickX(sunRight ? 'left' : 'right', 0.18, usedFg, 0.05);
    fgItems.push({ y: 0.94, el: { type: 'tree', x: x + 0.09, y: 0.94, size: 0.55, kind, leaf: tint(leaf), trunk: tint('#5a4232'), seed: Math.floor(rng() * 1e6) } });
  }
  for (const m of p.mentions.filter((x) => x.kind === 'animal')) {
    for (let c = 0; c < Math.min(m.count, 6); c++) {
      const kind: AnimalKind = m.value === 'bull' ? 'cow' : m.value;
      const size = (kind === 'elephant' ? 0.22 : kind === 'horse' ? 0.16 : kind === 'dog' || kind === 'goat' ? 0.09 : 0.14) * m.size * (c ? 0.85 : 1);
      const y = hasFg ? 0.9 + rng() * 0.05 : 0.9;
      const ax = m.anchor && (m.anchor as any).x !== undefined ? (m.anchor as any).x + (c + 1) * 0.09 * (((m.anchor as any).x < 0.5) ? 1 : -1) : undefined;
      const x = ax !== undefined ? ax - size * 0.45 : pickX(c === 0 ? m.place : undefined, size * 0.9, usedFg, subject === m ? thirds : 0.3 + rng() * 0.4);
      fgItems.push({ y, el: { type: 'animal', kind, x: x + size * 0.45, y, size, graze: m.pose === 'graze' || (m.pose === undefined && rng() < 0.4 && kind !== 'elephant'), color: m.color ? tint(m.color) : m.value === 'bull' ? tint('#4a403a') : undefined, facing: rng() < 0.5 ? 1 : -1 } });
    }
  }
  const clothes = ['#b5452f', '#d9782d', '#e3b23c', '#3f6ea8', '#efe9df', '#6d4f8f'];
  for (const m of p.mentions.filter((x) => x.kind === 'person')) {
    const n = Math.min(m.count, 9);
    const ax = m.anchor && (m.anchor as any).x !== undefined ? (m.anchor as any).x + 0.02 : undefined;
    const groupX = ax ?? pickX(m.place, 0.04 * n, usedFg, subject === m ? thirds : 0.4 + rng() * 0.3);
    for (let c = 0; c < n; c++) {
      const y = 0.9 + rng() * 0.06;
      const pose = (m.pose === 'graze' ? 'stand' : m.pose as any) ?? (rng() < 0.5 ? 'walk' : 'stand');
      fgItems.push({ y, el: { type: 'figure', x: groupX + c * 0.04 + rng() * 0.01, y, size: 0.12 * m.size * (0.85 + (y - 0.9) * 3), pose, facing: rng() < 0.5 ? 1 : -1, cloth: tint(m.color ?? clothes[Math.floor(rng() * clothes.length)]), skin: tint('#9a6a50') } });
    }
  }
  fgItems.sort((a, b) => a.y - b.y);

  if (hasFg && !desert && !snowy && !S.has('city') && !(sea && !S.has('beach'))) {
    const flowers = p.details.has('flowers') || p.season === 'spring' || S.has('garden') ? ['#e07a5f', '#f2cc8f', '#e58aa6', '#f4f1de'] : ['#e07a5f', '#f2cc8f'];
    els.push(...fgItems.filter((f) => f.el.type === 'tree').map((f) => f.el));
    els.push({ type: 'grass', x0: 0, x1: 1, y0: fgY - 0.01, y1: 1, height: 0.05, density: p.details.has('grass') || S.has('field') ? 1.4 : 0.8, color: tint(p.season === 'autumn' ? '#a08a3a' : '#6f7d3a'), color2: tint('#b59c55'), flowers, seed: 9 });
    els.push(...fgItems.filter((f) => f.el.type !== 'tree').map((f) => f.el));
  } else {
    els.push(...fgItems.map((f) => f.el));
  }

  // --- sky life, lights, weather
  for (const m of p.mentions.filter((x) => x.kind === 'bird')) {
    const col = m.color ?? (m.value === 'white' ? '#f6f1e6' : m.value === 'green' ? '#5f9a46' : m.value === 'black' ? '#2b2626' : time === 'night' ? '#cfd6ea' : '#3e3434');
    const n = m.count === 1 && m.plural ? 9 : m.count;
    els.push({ type: 'birds', x0: sunRight ? 0.35 : 0.2, x1: sunRight ? 0.8 : 0.65, y0: 0.12, y1: H - 0.18, count: n, size: n === 1 ? 0.04 * m.size : 0.022 * m.size, color: col, depth: 0.1, seed: Math.floor(rng() * 100) });
  }
  if (p.details.has('lamps') || (lit && buildingEls.length)) {
    const pts: Array<[number, number]> = [];
    if (p.details.has('lamps')) for (let k = 0; k < 9; k++) pts.push([0.1 + k * 0.1 + (rng() - 0.5) * 0.03, 0.93 + rng() * 0.03]);
    for (const b of buildingEls as any[]) if (b.door && lit) pts.push([b.x + b.w / 1.78 / 2, b.y - 0.012]);
    els.push({ type: 'lamps', points: pts, size: 0.05 });
  }
  if (rainy) els.push({ type: 'rain', density: 1, color: time === 'night' ? '#8a96b8' : '#d3dae2' });
  if (snowy && wx.has('snow') && rng() < 0.7) els.push({ type: 'snowfall', density: 0.6 });

  const focusM = subject;
  const light: Scene['light'] =
    grey ? { dir: [0.2 * sideSign, -1, 0.8], color: '#e8eaee', ambient: 0.5 }
      : time === 'night' ? { dir: [0.5 * sideSign, -0.6, 0.6], color: '#b9c7ff', ambient: 0.3 }
        : time === 'day' ? { dir: [0.4 * sideSign, -0.8, 0.6], color: '#fff6e8', ambient: 0.32 }
          : time === 'dusk' ? { dir: [0.8 * sideSign, -0.2, 0.5], color: '#ffb38a', ambient: 0.32 }
            : { dir: [0.75 * sideSign, -0.45, 0.5], color: time === 'dawn' ? '#ffd2c0' : '#ffd9a0', ambient: 0.3 };
  const hazeC = time === 'night' ? '#2a3558' : time === 'day' ? '#c9d8e6' : time === 'dusk' ? '#8c6f8e' : time === 'dawn' ? '#e7cfc4' : '#e9c9a6';
  const focusX = focusM ? (fgItems.find((f) => true) && focusM.kind !== 'building' ? (fgItems[0]?.el as any).x ?? 0.5 : ((buildingEls[0] as any)?.x ?? 0.5) + 0.05) : 0.5;
  return {
    title: understood.join(' '),
    seed,
    medium: p.medium,
    light,
    haze: { color: grey ? '#9aa0a8' : hazeC, amount: grey ? 0.85 : 0.75 },
    focus: [Math.max(0.15, Math.min(0.85, focusX)), H],
    elements: els,
    understood,
    ignored,
  };
}
