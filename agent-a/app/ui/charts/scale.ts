/** The only chart arithmetic, as pure functions (class diagram section 2c). */

/** Maps 0..domainMax onto 0..rangePx. A zero domain maps everything to 0. */
export function linear(domainMax: number, rangePx: number): (value: number) => number {
  return (value: number) => (domainMax > 0 ? (Math.max(0, value) / domainMax) * rangePx : 0);
}

/** `count` evenly spaced ticks from 0 with a "nice" step (1, 2, 2.5, 5 × 10^n) covering max. */
export function niceTicks(max: number, count = 4): number[] {
  if (!(max > 0)) return Array.from({ length: count + 1 }, (_, i) => i * 100);
  const raw = max / count;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s * count >= max) ?? 10 * magnitude;
  return Array.from({ length: count + 1 }, (_, i) => Math.round(i * step * 100) / 100);
}

/** Left edge of each of `count` equal bands across widthPx. */
export function bandPositions(count: number, widthPx: number): number[] {
  if (count <= 0) return [];
  const band = widthPx / count;
  return Array.from({ length: count }, (_, i) => i * band);
}

/** A rectangle with 4 px rounded corners on its top (data end) and a square base. */
export function topRoundedRect(x: number, y: number, w: number, h: number, r = 4): string {
  const rr = Math.min(r, w / 2, h);
  return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`;
}
