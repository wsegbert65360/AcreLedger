import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// iOS zooms into any focused field whose text is under 16px.
describe('iOS input zoom guard', () => {
  const css = readFileSync(resolve(__dirname, '../index.css'), 'utf8');

  it('forces 16px text on iOS text fields, textareas and selects', () => {
    const block = css.slice(css.indexOf('@supports (-webkit-touch-callout: none)'));
    expect(block).toMatch(/input:not\(\[type="checkbox"\]\)/);
    expect(block).toMatch(/textarea,\s*\n\s*select\s*\{\s*\n\s*font-size: 16px !important;/);
  });
});
