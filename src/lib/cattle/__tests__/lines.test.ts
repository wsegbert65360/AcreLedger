import { describe, expect, it } from 'vitest';

import { calvesBornBySex, emptyClassText, parseClassLines, weaningSplitDefaults } from '../lines';

const counts = { cows: 30, heifers: 5, bulls: 2, calves: 25, steers: 24, stockers: 0 };

describe('class lines', () => {
  it('parses several classes in one load', () => {
    const text = { ...emptyClassText(), steers: '24', cows: '3' };
    expect(parseClassLines(text, counts, 'Herd')).toEqual({ lines: [{ cls: 'cows', head: 3 }, { cls: 'steers', head: 24 }] });
  });

  it('needs at least one class and rejects too many head', () => {
    expect(parseClassLines(emptyClassText(), counts, 'Herd').error).toMatch(/at least one class/);
    expect(parseClassLines({ ...emptyClassText(), bulls: '3' }, counts, 'Herd').error).toBe('Herd only has 2 bulls.');
    expect(parseClassLines({ ...emptyClassText(), cows: 'x' }, counts, 'Herd').error).toMatch(/whole number/);
  });

  it('counts calves born by sex for the year, ignoring deleted and other herds', () => {
    const events = [
      { groupId: 'g', eventType: 'calving', eventDate: '2026-03-01', headDelta: 3, calfSex: 'heifer' },
      { groupId: 'g', eventType: 'calving', eventDate: '2026-03-02', headDelta: 2, calfSex: 'steer' },
      { groupId: 'g', eventType: 'calving', eventDate: '2026-03-03', headDelta: 1 },
      { groupId: 'g', eventType: 'calving', eventDate: '2025-03-03', headDelta: 9, calfSex: 'heifer' },
      { groupId: 'x', eventType: 'calving', eventDate: '2026-03-03', headDelta: 9, calfSex: 'heifer' },
      { groupId: 'g', eventType: 'calving', eventDate: '2026-03-04', headDelta: 4, calfSex: 'heifer', deleted_at: '2026-04-01' },
    ] as Parameters<typeof calvesBornBySex>[0];
    expect(calvesBornBySex(events, 'g', '2026')).toEqual({ heifer: 3, steer: 2, bull: 0, unknown: 1 });
  });

  it('suggests a heifer / steer split only when sex was recorded', () => {
    expect(weaningSplitDefaults({ heifer: 10, steer: 8, bull: 0, unknown: 0 }, 18)).toEqual({ heifers: 10, steers: 8 });
    expect(weaningSplitDefaults({ heifer: 10, steer: 8, bull: 0, unknown: 0 }, 6)).toEqual({ heifers: 6, steers: 0 });
    expect(weaningSplitDefaults({ heifer: 0, steer: 0, bull: 0, unknown: 5 }, 5)).toBeNull();
  });
});
