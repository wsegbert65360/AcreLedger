/**
 * @vitest-environment jsdom
 */
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import ActivityFeed from '../ActivityFeed';

describe('ActivityFeed', () => {
  it('handles null or empty records without crashing', () => {
    const { rerender } = render(<ActivityFeed records={[]} onEdit={vi.fn()} />);
    expect(screen.getByText(/No activities for 2026/i)).toBeDefined();

    // @ts-ignore - testing null handling
    rerender(<ActivityFeed records={null} onEdit={vi.fn()} />);
    expect(screen.getByText(/No activities for 2026/i)).toBeDefined();
  });

  it('calls onEdit with correct data when clicking a record', () => {
    const onEdit = vi.fn();
    const mockRecord = {
      type: 'spray',
      data: {
        id: 'spray-1',
        fieldName: 'Test Field',
        sprayDate: '2026-03-22',
        products: [{ product: 'Enlist One' }],
        timestamp: Date.now()
      }
    };

    render(<ActivityFeed records={[mockRecord]} onEdit={onEdit} />);
    
    // Use a more flexible way to find the record row
    const editIcon = screen.getByTestId('edit-icon-spray-spray-1');
    fireEvent.click(editIcon.closest('.cursor-pointer')!);
    
    expect(onEdit).toHaveBeenCalledWith('spray', mockRecord.data);
  });

  it('renders correct emoji and details for various record types', () => {
    const records = [
      { type: 'plant', data: { id: 'p1', crop: 'Corn', plantDate: '2026-04-01' } },
      { type: 'hay', data: { id: 'h1', baleCount: 50, cuttingNumber: 1, date: '2026-05-20' } }
    ];

    render(<ActivityFeed records={records} onEdit={vi.fn()} />);
    
    expect(screen.queryAllByText('🌱').length).toBeGreaterThan(0);
    expect(screen.getByText('Corn')).toBeDefined();
    expect(screen.queryAllByText('🚜').length).toBeGreaterThan(0);
    expect(screen.getByText('50 Bales (1 Cut)')).toBeDefined();
  });
});
