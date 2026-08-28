export type AskSuggestionSeason = 'spring' | 'summer' | 'fall' | 'winter';

export function getSuggestionSeason(now: Date): AskSuggestionSeason {
  const month = now.getMonth();
  if (month >= 2 && month <= 4) return 'spring';
  if (month >= 5 && month <= 7) return 'summer';
  if (month >= 8 && month <= 10) return 'fall';
  return 'winter';
}

// Questions must stay answerable by the allowlisted assistant read tools
// (server/ai-assistant-tools.ts): season/date/field-filtered queries,
// aggregations, and the named tools (bin inventory, seed library, timeline).
// No negation ("which fields were NOT planted") or cost questions.
const SUGGESTIONS_BY_SEASON: Record<Exclude<AskSuggestionSeason, 'winter'>, string[]> = {
  spring: [
    'How many acres have I planted so far this season?',
    'What did I plant on each field this year?',
    'When did I first get in the field this spring?',
    'How much rain did the farm get this week?',
    'What is in my seed library?',
  ],
  summer: [
    'Which fields have I sprayed in the last 30 days?',
    'How much rain has each field gotten this month?',
    'How many acres have I sprayed this season?',
    'What did I spray on the corn this year?',
    'What have I done in the last two weeks?',
  ],
  fall: [
    'How many bushels of corn have I harvested so far this season?',
    'What is my average corn yield per acre this year?',
    'Which field is yielding the best?',
    'How much grain is in each bin?',
    'How many bushels did each field yield this season?',
  ],
};

function winterSuggestions(viewingSeason: number): string[] {
  return [
    'How much grain is still in my bins?',
    `How many bushels of corn did we harvest in ${viewingSeason}?`,
    `What did each field grow in ${viewingSeason}?`,
    `How much rain did we get in ${viewingSeason}?`,
    `What soybean varieties did I plant in ${viewingSeason}?`,
  ];
}

export function getSeasonalAskSuggestions(
  viewingSeason: number,
  now: Date = new Date(),
): string[] {
  const season = getSuggestionSeason(now);
  if (season === 'winter') return winterSuggestions(viewingSeason);
  return SUGGESTIONS_BY_SEASON[season];
}
