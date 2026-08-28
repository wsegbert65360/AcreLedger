/**
 * @vitest-environment jsdom
 */
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import FieldBoundaryThumbnail from '../FieldBoundaryThumbnail';

describe('FieldBoundaryThumbnail', () => {
  it('draws the boundary in foreground color so crop-tinted cards stay readable', () => {
    const { container } = render(
      <FieldBoundaryThumbnail
        geometry={{
          type: 'Polygon',
          coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]],
        }}
      />,
    );

    const path = container.querySelector('path');
    expect(path).toBeTruthy();
    expect(path?.getAttribute('fill')).toContain('--foreground');
    expect(path?.getAttribute('stroke')).toContain('--foreground');
    expect(path?.getAttribute('fill')).not.toBe('currentColor');
  });
});
