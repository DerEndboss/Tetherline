/**
 * progression's own stroke icons (24 x 24, `currentColor`), for the places the shared set (components/Icon.tsx) has
 * no picture for: the menu's rows, the radio, the victory stats. Same drawing rules as the shared icons.
 */
const PATHS = {
  'chevron-down': 'M6 9.5l6 6 6-6',
  dice: 'M6.5 4.5h11a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2h-11a2 2 0 0 1-2-2v-11a2 2 0 0 1 2-2Zm2.5 4.5h.01M15 9h.01M12 12h.01M9 15h.01M15 15h.01',
  import: 'M12 4v11m-4.5-4.5L12 15l4.5-4.5M5 19.5h14',
  export: 'M12 15V4m-4.5 4.5L12 4l4.5 4.5M5 19.5h14',
  trash: 'M5 7h14M9.5 7V4.5h5V7M7 7l.8 12.5h8.4L17 7M10.5 11v5m3-5v5',
  signal: 'M12 13a1.6 1.6 0 1 0 0-3.2 1.6 1.6 0 0 0 0 3.2Zm0 0v7.5M7.9 8.4a5.8 5.8 0 0 0 0 7.2M16.1 8.4a5.8 5.8 0 0 1 0 7.2M4.9 5.4a10 10 0 0 0 0 13.2M19.1 5.4a10 10 0 0 1 0 13.2',
  trophy: 'M8 4.5h8v5a4 4 0 0 1-8 0v-5Zm0 1.5H5v1.5a3 3 0 0 0 3 3m8-4.5h3v1.5a3 3 0 0 1-3 3M12 13.5V17m-3.5 3.5h7M10 17h4',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-13v4.5l3 2',
  box: 'M4 8l8-4 8 4v9l-8 4-8-4V8Zm0 0 8 4 8-4M12 12v9',
  deliver: 'M12 3.5v8m-3.5-3.5L12 12l3.5-3.5M4 14h4.5l1.5 2.5h4l1.5-2.5H20v4.5a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5V14Z',
  star: 'M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.9L12 16.8l-5.2 2.9 1-5.9-4.3-4.1 5.9-.8L12 3.5Z',
  list: 'M9 7h10M9 12h10M9 17h10M5 7h.01M5 12h.01M5 17h.01',
} as const;

export type ProgIconName = keyof typeof PATHS;

export function PIcon({ name, size = 20 }: { name: ProgIconName; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d={PATHS[name]} />
    </svg>
  );
}

/** The game's mark: a lit hex plaque, a drill arrow breaking the ground line. Drawn, not an emoji. */
export function Emblem({ size = 56 }: { size?: number }) {
  return (
    <svg className="emblem" width={size} height={size} viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <path className="emblem-hex" d="M24 3.5 41.5 13.5v21L24 44.5 6.5 34.5v-21L24 3.5Z" />
      <path className="emblem-rim" d="M24 3.5 41.5 13.5v21L24 44.5 6.5 34.5v-21L24 3.5Z" />
      <path className="emblem-mark" d="M24 13v14.5m-6.5-6.5 6.5 6.5 6.5-6.5M15 34h18" />
    </svg>
  );
}
