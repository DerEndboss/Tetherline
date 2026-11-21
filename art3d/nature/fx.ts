import { at, group, hull, rand, rock, sprite, surface, type V } from '../kit';

/** Debris: four grey rock chunks and a leaf. Neutral grey with real light and shade; the game tints them. */
const GREY = surface('#cfcfd2', { rough: 0.7, flat: true });
const LEAF = surface('#d8d8da', { rough: 0.5, coat: 0.3 });

for (let i = 0; i < 4; i++) {
  sprite({
    id: `fx-shard-${i}`,
    ground: 'none',
    box: { w: 16, h: 16 },
    build: () => {
      const r = rand(300 + i * 11);
      const m = rock(r, 0.5, 0.5, GREY, 10 + i, 0.55);
      m.position.y = -0.2;
      m.rotation.set(0.5 + i, i * 1.3, 0.3);
      return group(m);
    },
  });
}

sprite({
  id: 'fx-leaf',
  ground: 'none',
  box: { w: 16, h: 16 },
  build: () => {
    const prof = (t: number): number => Math.sin(Math.PI * t) ** 0.8 * 0.22;
    const pts: V[] = [];
    for (let i = 0; i <= 6; i++) {
      const t = i / 6;
      const y = Math.sin(t * 2.2) * 0.1;
      pts.push([t * 1.0 - 0.5, y + 0.012, prof(t)], [t * 1.0 - 0.5, y + 0.012, -prof(t)], [t * 1.0 - 0.5, y - 0.012, 0]);
    }
    const leaf = hull(pts, LEAF);
    leaf.rotation.set(0.9, 0.6, 0.2);
    return group(at(leaf, 0, 0.2, 0));
  },
});
