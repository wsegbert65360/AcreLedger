# Recurring docs audit

Plan only. No code in this change. Phase 2 (moving rules into `docs/agents/`) has not been done. This audit starts after that directory exists.

## Goal

Each run reads one file in `docs/agents/`, checks the claims against the code, and updates that file's "Verified against code" note with the date, commit, and files inspected. Navigation-only edits do not count as verification. Leave the other files alone.

## Files

- `scripts/audit-agent-doc.mjs` (new). Pick the `docs/agents/*.md` file whose note is missing or oldest. Print the file and the headings. Do not rewrite prose in the script.
- `package.json` script, for example `npm run audit:docs`, not part of `npm test` until it is read-only and deterministic.
- The chosen `docs/agents/*.md` file, edited by the person or agent running the audit.
- `scripts/verify-docs.mjs` already will need to know `docs/agents/` once Phase 2 lands. The audit does not replace that link check.

## How a run works

1. If `docs/agents/` is missing, stop and say Phase 2 has not landed.
2. Choose one file.
3. For each rule, open the source it names. If the code still depends on the rule, keep it. If the code contradicts it, fix the doc, not the behavior, unless the owner asked for a code change.
4. Set the note to the date, `git rev-parse HEAD`, and the files opened. Rules that were not checked stay unmarked.

## Risks

- A script that rewrites docs will drift wording. The script only selects the file.
- Verifying BLUEPRINT and AGENTS in the same run recreates the document this audit is meant to shrink. One file.
- Marking a file verified after reading only the note hides stale rules. The note must list the files inspected.

## Size

Small script. Each audit run is one file and whatever doc corrections that file needs.
