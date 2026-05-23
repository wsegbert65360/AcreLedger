/** @vitest-environment jsdom */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';

import { ChartStyle } from '../chart';

describe('ChartStyle Security', () => {
    it('should render valid colors and sanitize keys', () => {
        const config = {
            'safe-key': { color: '#ff0000' },
            'unsafe;key}': { color: 'rgb(0, 255, 0)' }
        };
        const { container } = render(<ChartStyle id="test-chart" config={config as any} />);
        const styleText = container.querySelector('style')?.textContent;

        expect(styleText).toContain('--color-safe-key: #ff0000;');
        expect(styleText).toContain('--color-unsafekey: rgb(0, 255, 0);');
        expect(styleText).not.toContain('unsafe;key}');
    });

    it('should filter out malicious color values', () => {
        const config = {
            'bad-color': { color: 'red; background: url(javascript:alert(1))' },
            'good-color': { color: 'hsl(100, 50%, 50%)' }
        };
        const { container } = render(<ChartStyle id="test-chart" config={config as any} />);
        const styleText = container.querySelector('style')?.textContent;

        expect(styleText).toContain('--color-good-color: hsl(100, 50%, 50%);');
        expect(styleText).not.toContain('--color-bad-color');
        expect(styleText).not.toContain('javascript:alert(1)');
    });
    
    it('should allow CSS variables and theme colors', () => {
        const config = {
            'var-color': { color: 'var(--some-var)' },
            'theme-color': { 
                theme: { 
                    light: '#ffffff',
                    dark: '#000000'
                } 
            }
        };
        const { container } = render(<ChartStyle id="test-chart" config={config as any} />);
        const styleText = container.querySelector('style')?.textContent;

        expect(styleText).toContain('--color-var-color: var(--some-var);');
        expect(styleText).toContain('--color-theme-color: #ffffff;'); // Light theme segment
        expect(styleText).toContain('.dark [data-chart=test-chart]');
        expect(styleText).toContain('--color-theme-color: #000000;'); // Dark theme segment
    });
});
