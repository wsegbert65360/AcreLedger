/**
 * @vitest-environment jsdom
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ThemeProvider } from '@/components/ThemeProvider';
import DisplayManager from '../DisplayManager';

vi.mock('@/lib/native', () => ({
  native: {
    statusBar: {
      setDark: vi.fn(),
      setLight: vi.fn(),
    },
  },
}));

describe('DisplayManager', () => {
  const storageKey = 'al-ui-theme-display-test';

  beforeEach(() => {
    localStorage.clear();
    document.documentElement.className = '';
  });

  afterEach(() => {
    localStorage.clear();
    document.documentElement.className = '';
  });

  it('offers Color next to Light, Dark, and System', () => {
    render(
      <ThemeProvider defaultTheme="dark" storageKey={storageKey}>
        <DisplayManager />
      </ThemeProvider>
    );

    expect(screen.getByRole('button', { name: 'Light' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Dark' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Color' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'System' })).toBeInTheDocument();
  });

  it('applies color mode when Color is selected', () => {
    render(
      <ThemeProvider defaultTheme="dark" storageKey={storageKey}>
        <DisplayManager />
      </ThemeProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Color' }));

    expect(document.documentElement.classList.contains('color')).toBe(true);
    expect(localStorage.getItem(storageKey)).toBe('color');
  });
});
