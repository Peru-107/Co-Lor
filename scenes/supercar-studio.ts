import type { Scene } from '../src/scene/types';

// A hand-written scene using the library: a red supercar in a photo studio with a polished floor.
const scene: Scene = {
  title: 'Supercar in the studio',
  light: { dir: [-0.5, -0.75, 0.6], color: '#fff8ee', ambient: 0.35 },
  focus: [0.5, 0.62],
  elements: [
    { type: 'studio', y: 0.66 },
    { type: 'library', name: 'supercar', x: 0.5, y: 0.8, size: 0.88, facing: 1, options: { paint: '#b01018' } },
    { type: 'reflect', of: 1, y: 0.8, strength: 0.5, length: 0.14 },
  ],
};
export default scene;
