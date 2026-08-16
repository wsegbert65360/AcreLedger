/**
 * @vitest-environment jsdom
 */
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import BinSiloThumb from '../BinSiloThumb';

describe('BinSiloThumb', () => {
  it('renders a unique silo mark for the bin fill level', () => {
    const { container } = render(<BinSiloThumb id="bin-42" percentFull={67} />);
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(container.querySelector('#silo-bin-42-grain')).not.toBeNull();
    expect(container.querySelector('#silo-bin-42-clip')).not.toBeNull();
  });

  it('sanitizes ids so SVG paint servers stay valid', () => {
    const { container } = render(<BinSiloThumb id="bin 3#west" percentFull={20} />);
    expect(container.querySelector('#silo-bin3west-grain')).not.toBeNull();
    expect(container.querySelector('#silo-bin3west-clip')).not.toBeNull();
  });

  it('falls back to a stable id when the bin id has no safe characters', () => {
    const { container } = render(<BinSiloThumb id="@@@" percentFull={10} />);
    expect(container.querySelector('#silo-bin-grain')).not.toBeNull();
  });

  it('omits grain fill when the bin is empty', () => {
    const { container } = render(<BinSiloThumb id="empty" percentFull={0} />);
    expect(container.querySelector('#silo-empty-clip')).not.toBeNull();
    expect(container.querySelectorAll('ellipse')).toHaveLength(1);
  });

  it('clamps non-finite fill to empty instead of emitting invalid SVG geometry', () => {
    const { container } = render(<BinSiloThumb id="nan-bin" percentFull={Number.NaN} />);
    const clip = container.querySelector('#silo-nan-bin-clip rect');
    expect(clip?.getAttribute('y')).toBe('118');
    expect(container.querySelectorAll('ellipse')).toHaveLength(1);
  });
});
