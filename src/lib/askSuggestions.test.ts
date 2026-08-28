import { describe, expect, it } from 'vitest';

import { getSeasonalAskSuggestions, getSuggestionSeason } from '@/lib/askSuggestions';

describe('getSuggestionSeason', () => {
  it('buckets calendar months into the four seasons', () => {
    expect(getSuggestionSeason(new Date(2026, 0, 15))).toBe('winter');
    expect(getSuggestionSeason(new Date(2026, 1, 28))).toBe('winter');
    expect(getSuggestionSeason(new Date(2026, 2, 1))).toBe('spring');
    expect(getSuggestionSeason(new Date(2026, 4, 31))).toBe('spring');
    expect(getSuggestionSeason(new Date(2026, 5, 1))).toBe('summer');
    expect(getSuggestionSeason(new Date(2026, 7, 27))).toBe('summer');
    expect(getSuggestionSeason(new Date(2026, 8, 1))).toBe('fall');
    expect(getSuggestionSeason(new Date(2026, 10, 30))).toBe('fall');
    expect(getSuggestionSeason(new Date(2026, 11, 1))).toBe('winter');
  });
});

describe('getSeasonalAskSuggestions', () => {
  it('returns five non-empty questions for the current season', () => {
    const questions = getSeasonalAskSuggestions(2026, new Date(2026, 7, 27));
    expect(questions).toHaveLength(5);
    expect(questions.every(question => question.trim().length > 0)).toBe(true);
  });

  it('returns different question sets per season', () => {
    const winter = getSeasonalAskSuggestions(2026, new Date(2026, 0, 15));
    const spring = getSeasonalAskSuggestions(2026, new Date(2026, 3, 15));
    const summer = getSeasonalAskSuggestions(2026, new Date(2026, 6, 15));
    const fall = getSeasonalAskSuggestions(2026, new Date(2026, 9, 15));
    const all = [winter, spring, summer, fall].map(questions => questions.join('|'));
    expect(new Set(all).size).toBe(4);
  });

  it('stamps winter recap questions with the viewing season', () => {
    const questions = getSeasonalAskSuggestions(2026, new Date(2026, 0, 15));
    expect(questions.filter(question => question.includes('2026')).length).toBeGreaterThanOrEqual(4);
    expect(questions.some(question => question.includes('2025'))).toBe(false);
  });

  it('recaps the harvest year still on screen in January before rollover', () => {
    const questions = getSeasonalAskSuggestions(2025, new Date(2026, 0, 15));
    expect(questions.filter(question => question.includes('2025')).length).toBeGreaterThanOrEqual(4);
    expect(questions.some(question => question.includes('2024'))).toBe(false);
    expect(questions.some(question => question.includes('2026'))).toBe(false);
  });
});
