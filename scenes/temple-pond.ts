import type { Scene } from '../src/scene/types';

// "An old stone temple beside a pond at golden hour, a banyan tree, egrets flying, misty hills behind."
const scene: Scene = {
  title: 'Temple pond at golden hour',
  light: { dir: [0.75, -0.45, 0.5], color: '#ffd9a0', ambient: 0.3 },
  haze: { color: '#e9c9a6', amount: 0.75 },
  focus: [0.6, 0.5],
  elements: [
    { type: 'sky', stops: [[0, '#5d7fa6'], [0.35, '#c9a98f'], [0.55, '#f2c58e']], sun: { x: 0.86, y: 0.42, r: 0.028, glow: '#ffcf86', glowSize: 0.3 } },
    { type: 'clouds', y0: 0.04, y1: 0.36, coverage: 0.45, color: '#fbe7cf', shadow: '#9b8fa5', depth: 0.25 },
    { type: 'terrain', kind: 'mountain', y: 0.5, amp: 0.2, color: '#7d6f86', depth: 0.5, seed: 4, freq: 0.8 },
    { type: 'terrain', kind: 'hill', y: 0.55, amp: 0.08, color: '#6f7a58', depth: 0.55, seed: 9 },
    { type: 'mist', y0: 0.45, y1: 0.62, color: '#efd2b0', amount: 0.45 },
    { type: 'terrain', kind: 'ground', y: 0.6, amp: 0.012, color: '#8c8250', bottom: 0.66, seed: 2 },
    { type: 'forest', x0: 0.0, x1: 0.45, y: 0.6, y1: 0.615, count: 14, size: [0.08, 0.14], kinds: ['broadleaf', 'palm'], depth: 0.35, leaf: '#4f6b3a' },
    { type: 'building', x: 0.55, y: 0.63, w: 0.16, h: 0.12, roof: 'shikhara', color: '#c99a6b', roofColor: '#c4915f', door: true },
    { type: 'building', x: 0.72, y: 0.63, w: 0.1, h: 0.08, roof: 'flat', color: '#bf9168', door: true },
    { type: 'water', y: 0.645, color: '#6d8794', deep: '#3e5866', reflect: 0.75, ripple: 1 },
    { type: 'tree', x: 0.17, y: 0.9, size: 0.62, kind: 'banyan', leaf: '#3f6a34', trunk: '#5c4636' },
    { type: 'terrain', kind: 'ground', y: 0.88, amp: 0.03, color: '#7d7442', seed: 6 },
    { type: 'grass', x0: 0, x1: 0.42, y0: 0.86, y1: 1, height: 0.05, color: '#6f7d3a', color2: '#b59c55', flowers: ['#e07a5f', '#f2cc8f'] },
    { type: 'figure', x: 0.36, y: 0.92, size: 0.12, cloth: '#b5452f', skin: '#8f5e45', pose: 'walk', facing: 1 },
    { type: 'birds', x0: 0.45, y0: 0.18, x1: 0.8, y1: 0.36, count: 9, size: 0.022, color: '#f6f1e6', depth: 0.1 },
    { type: 'birds', x0: 0.2, y0: 0.1, x1: 0.5, y1: 0.25, count: 5, size: 0.012, color: '#4a3c3c', depth: 0.4 },
  ],
};
export default scene;
