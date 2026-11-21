/**
 * Icons of this area (tools, drones, sound), drawn like components/Icon.tsx (24 grid, 1.75 stroke, currentColor).
 * They live here because the shared Icon set belongs to the UI foundation.
 */
const PATHS = {
  undo: 'M9 14 4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11',
  redo: 'M15 14l5-5-5-5M20 9H9.5a5.5 5.5 0 0 0 0 11H13',
  copy: 'M4 9V5a1 1 0 0 1 1-1h4M15 4h4a1 1 0 0 1 1 1v4M20 15v4a1 1 0 0 1-1 1h-4M9 20H5a1 1 0 0 1-1-1v-4M9 9h6v6H9V9Z',
  paste: 'M9 4h6v3H9V4ZM7 5.5H6a1 1 0 0 0-1 1V20a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V6.5a1 1 0 0 0-1-1h-1M9 12h6M9 16h4',
  blueprint: 'M5 4h14v16H5V4Zm0 5.5h14M5 14.5h14M10 4v16',
  tools: 'M5 6h14M5 12h14M5 18h14M9 4v4m6 2v4m-4 2v4',
  done: 'M5 12.5l4.5 4.5L19 7.5',
  close: 'M6 6l12 12M18 6 6 18',
  trash: 'M5 7h14M10 7V4.5h4V7m-7 0 1 13h8l1-13M10 11v6m4-6v6',
  servo: 'M15.5 4a4.5 4.5 0 0 0-4.2 6L4 17.3 6.7 20l7.3-7.3a4.5 4.5 0 0 0 6-4.2l-2.6 2.6-2.4-.5-.5-2.4L17.1 5.6A4.5 4.5 0 0 0 15.5 4Z',
  cargo: 'M4 9h16v10H4V9Zm2-4h12l2 4H4l2-4Zm4 7h4',
  note: 'M9 18V6l10-2v12M9 18a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0Zm10-2a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0Z',
  skip: 'M5 5.5v13l9-6.5-9-6.5Zm12 0v13',
  pointer: 'M5 4l6.5 15 2.3-6.2L20 10.5 5 4Z',
  rotor: 'M9 9l6 6m0-6-6 6M7 3.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Zm10 0a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Zm-10 10a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Zm10 0a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z',
  reach: 'M4 20 13 11m3.5-7.5 1.1 2.9 2.9 1.1-2.9 1.1-1.1 2.9-1.1-2.9-2.9-1.1 2.9-1.1 1.1-2.9Z',
  drone: 'M9 11.5a3 3 0 0 1 6 0v1.5a3 3 0 0 1-6 0v-1.5Zm3 6.5v2M9 12H5.5m9.5 0h3.5M3 9.5h5M16 9.5h5M12 14.2h.01',
  plus: 'M12 5v14M5 12h14',
} as const;

export type ToolIconName = keyof typeof PATHS;

export function ToolIcon({ name, size = 20 }: { name: ToolIconName; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d={PATHS[name]} />
    </svg>
  );
}
