import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import DetailsStep from './DetailsStep';
import { buildInitialDraft } from './useWorkRequestForm';

describe('work request details', () => {
  it('defaults a new request to the current farm name', () => {
    const draft = buildInitialDraft(null, 'new', 2026, [], 'Grandma Bins/Hwy');

    expect(draft.customerName).toBe('Grandma Bins/Hwy');
    expect(draft.workType).toBe('other');
    expect(draft.requestedCompletionDate).toBeUndefined();
    expect(draft.products).toEqual([]);
  });

  it('only asks for the farm name and requested-work description', () => {
    const draft = buildInitialDraft(null, 'new', 2026, [], 'Grandma Bins/Hwy');
    const patchDraft = vi.fn();

    render(<DetailsStep draft={draft} patchDraft={patchDraft} />);

    expect(screen.getByLabelText('Farm name *')).toHaveValue('Grandma Bins/Hwy');
    expect(screen.getByLabelText('What needs to be done? *')).toBeInTheDocument();
    expect(screen.queryByLabelText('Provider / applicator name *')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Provider email address *')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Requested completion date *')).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('What needs to be done? *'), {
      target: { value: 'Spray the soybean field.' },
    });
    expect(patchDraft).toHaveBeenCalledWith({ notes: 'Spray the soybean field.' });
  });
});
