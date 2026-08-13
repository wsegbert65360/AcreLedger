/**
 * @vitest-environment jsdom
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ThemeProvider, useTheme } from '../ThemeProvider';

const setDark = vi.fn();
const setLight = vi.fn();

vi.mock('@/lib/native', () => ({
  native: {
    statusBar: {
      setDark: (...args: unknown[]) => setDark(...args),
      setLight: (...args: unknown[]) => setLight(...args),
    },
  },
}));

function ThemeProbe() {
  const { theme, setTheme } = useTheme();
  return (
    <div>
      <span data-testid="theme">{theme}</span>
      <button type="button" onClick={() => setTheme('color')}>Use color</button>
      <button type="button" onClick={() => setTheme('light')}>Use light</button>
      <button type="button" onClick={() => setTheme('dark')}>Use dark</button>
    </div>
  );
}

describe('ThemeProvider', () => {
  const storageKey = 'al-ui-theme-test';

  beforeEach(() => {
    localStorage.clear();
    document.documentElement.className = '';
    setDark.mockClear();
    setLight.mockClear();

    let meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.setAttribute('name', 'theme-color');
      document.head.appendChild(meta);
    }
    meta.setAttribute('content', '#22c55e');
  });

  afterEach(() => {
    localStorage.clear();
    document.documentElement.className = '';
  });

  it('applies the color theme class and a bright theme-color', () => {
    render(
      <ThemeProvider defaultTheme="dark" storageKey={storageKey}>
        <ThemeProbe />
      </ThemeProvider>
    );

    setDark.mockClear();
    setLight.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'Use color' }));

    expect(screen.getByTestId('theme')).toHaveTextContent('color');
    expect(document.documentElement.classList.contains('color')).toBe(true);
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(document.querySelector('meta[name="theme-color"]')?.getAttribute('content')).toBe('#faf8ef');
    expect(localStorage.getItem(storageKey)).toBe('color');
    expect(setDark).toHaveBeenCalled();
    expect(setLight).not.toHaveBeenCalled();
  });

  it('ignores unknown stored theme values', () => {
    localStorage.setItem(storageKey, 'rainbow');

    render(
      <ThemeProvider defaultTheme="light" storageKey={storageKey}>
        <ThemeProbe />
      </ThemeProvider>
    );

    expect(screen.getByTestId('theme')).toHaveTextContent('light');
    expect(document.documentElement.classList.contains('light')).toBe(true);
  });

  it('removes the color class when switching back to light', () => {
    render(
      <ThemeProvider defaultTheme="color" storageKey={storageKey}>
        <ThemeProbe />
      </ThemeProvider>
    );

    expect(document.documentElement.classList.contains('color')).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Use light' }));

    expect(document.documentElement.classList.contains('color')).toBe(false);
    expect(document.documentElement.classList.contains('light')).toBe(true);
  });
});
