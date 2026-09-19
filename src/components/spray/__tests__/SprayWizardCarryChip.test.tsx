/**
 * @vitest-environment jsdom
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SprayWizardCarryChip } from '@/components/spray/SprayWizardCarryChip';
import { trackProductEvent } from '@/lib/productAnalytics';

vi.mock('@/lib/productAnalytics', () => ({
  trackProductEvent: vi.fn(),
}));

describe('SprayWizardCarryChip', () => {
  beforeEach(() => vi.clearAllMocks());

  it('announces the suggestion and emits only enum analytics props', () => {
    const onCarry = vi.fn();
    const onDecline = vi.fn();
    render(
      <SprayWizardCarryChip
        recordType="spray"
        sourceFieldName="North Field"
        sourceTime="8:42 AM"
        carryDescription="Applies products. Area stays specific to this field."
        carried={false}
        onCarry={onCarry}
        onDecline={onDecline}
        onRemove={vi.fn()}
      />
    );

    expect(screen.getByLabelText(/suggestion available: carry spray details from north field, 8:42 am today/i)).toHaveAttribute('aria-live', 'polite');
    expect(trackProductEvent).toHaveBeenCalledWith('carry_suggestion_shown', { recordType: 'spray' });

    fireEvent.click(screen.getByRole('button', { name: /carry details/i }));
    expect(onCarry).toHaveBeenCalledTimes(1);
    expect(trackProductEvent).toHaveBeenCalledWith('carry_suggestion_accepted', { recordType: 'spray' });

    fireEvent.click(screen.getByRole('button', { name: /start fresh/i }));
    expect(onDecline).toHaveBeenCalledTimes(1);
    expect(trackProductEvent).toHaveBeenCalledWith('carry_suggestion_declined', { recordType: 'spray' });
  });

  it('renders a keyboard-operable removable carried tag', () => {
    const onRemove = vi.fn();
    render(
      <SprayWizardCarryChip
        recordType="plant"
        sourceFieldName="A Very Long North Field Name"
        sourceTime="1:15 PM"
        carryDescription="Applies crop and seed variety."
        carried={true}
        onCarry={vi.fn()}
        onDecline={vi.fn()}
        onRemove={onRemove}
      />
    );

    const remove = screen.getByRole('button', { name: /remove details carried from a very long north field name/i });
    expect(remove).toHaveClass('h-11');
    fireEvent.keyDown(remove, { key: 'Enter' });
    fireEvent.click(remove);
    expect(onRemove).toHaveBeenCalledTimes(1);
  });
});
