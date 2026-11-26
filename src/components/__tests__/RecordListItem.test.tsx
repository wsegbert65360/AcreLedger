/**
 * @vitest-environment jsdom
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import RecordListItem from '../RecordListItem';

describe('RecordListItem', () => {
  it('keeps the field name on its own line and moves the date below the details', () => {
    render(
      <RecordListItem
        id="r1"
        title="Grandma's by Road"
        subtitle="Ammonia Sulfate, Xsate Gly"
        details="3 MPH ESE · 88°F"
        date="Aug 8, 2026"
        isSelected={false}
        onToggle={vi.fn()}
        onEdit={vi.fn()}
        type="spray"
      />,
    );

    const title = screen.getByText("Grandma's by Road");
    expect(title.className).toContain('line-clamp-2');
    expect(title.className).not.toContain('truncate');
    expect(screen.getByText('Aug 8, 2026')).toBeTruthy();
  });

  it('lets keyboard and VoiceOver users select a record', () => {
    const onToggle = vi.fn();
    render(
      <RecordListItem id="r1" title="North 40" subtitle="Corn" details="" date="" isSelected={false}
        onToggle={onToggle} onEdit={vi.fn()} type="plant" />,
    );
    const box = screen.getByRole('checkbox', { name: 'Select North 40' });
    expect(box).toHaveAttribute('aria-checked', 'false');
    fireEvent.keyDown(box, { key: ' ' });
    expect(onToggle).toHaveBeenCalledWith('r1', false);
  });
});
