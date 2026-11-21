/** Colour helpers for the art generators. All inputs and outputs are #rrggbb strings. */

export function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

export function rgbToHex(r: number, g: number, b: number): string {
  const ch = (v: number): string =>
    Math.round(Math.min(255, Math.max(0, v)))
      .toString(16)
      .padStart(2, '0');
  return `#${ch(r)}${ch(g)}${ch(b)}`;
}

/** Linear mix of two colours: t = 0 gives a, t = 1 gives b. */
export function mix(a: string, b: string, t: number): string {
  const [ar, ag, ab] = hexToRgb(a);
  const [br, bg, bb] = hexToRgb(b);
  const k = Math.min(1, Math.max(0, t));
  return rgbToHex(ar + (br - ar) * k, ag + (bg - ag) * k, ab + (bb - ab) * k);
}

/** Mixes a colour towards white (amount > 0) or black (amount < 0). */
export function shade(hex: string, amount: number): string {
  return amount >= 0 ? mix(hex, '#ffffff', amount) : mix(hex, '#000000', -amount);
}

/** Colour as a 0xrrggbb number for Pixi tints. */
export function hexToNumber(hex: string): number {
  return parseInt(hex.slice(1), 16);
}

/** Colour at position t (0..1) along a list of evenly spaced stops. */
export function ramp(stops: readonly string[], t: number): string {
  if (stops.length === 0) return '#000000';
  const x = Math.min(1, Math.max(0, t)) * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(x));
  if (i < 0) return stops[0]!;
  return mix(stops[i]!, stops[i + 1]!, x - i);
}

/** Linear blend of two 0xrrggbb numbers (tints), t = 0 gives a, 1 gives b. */
export function lerpColor(a: number, b: number, t: number): number {
  const ch = (shift: number): number => Math.round(((a >> shift) & 255) * (1 - t) + ((b >> shift) & 255) * t);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}
