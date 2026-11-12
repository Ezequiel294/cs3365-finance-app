import { describe, expect, it } from 'vitest';
import { bandPositions, linear, niceTicks, topRoundedRect } from './scale';

describe('scale', () => {
  it('linear maps the domain onto the range', () => {
    const s = linear(200, 100);
    expect(s(0)).toBe(0);
    expect(s(100)).toBe(50);
    expect(s(200)).toBe(100);
    expect(s(-5)).toBe(0);
    expect(linear(0, 100)(5)).toBe(0);
  });

  it('niceTicks picks a round step that covers the maximum', () => {
    expect(niceTicks(3600, 4)).toEqual([0, 1000, 2000, 3000, 4000]);
    expect(niceTicks(950, 4)).toEqual([0, 250, 500, 750, 1000]);
    expect(niceTicks(130000, 4)).toEqual([0, 50000, 100000, 150000, 200000]);
    expect(niceTicks(0, 4)).toHaveLength(5);
  });

  it('bandPositions splits the width evenly', () => {
    expect(bandPositions(4, 400)).toEqual([0, 100, 200, 300]);
    expect(bandPositions(0, 400)).toEqual([]);
  });

  it('topRoundedRect rounds only the top', () => {
    expect(topRoundedRect(0, 10, 20, 30)).toBe('M0,40V14Q0,10 4,10H16Q20,10 20,14V40Z');
  });
});
