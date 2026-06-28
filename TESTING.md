# Testing Procedures

This document outlines the testing protocols for the AcreLedger project.

## Automated Logic Tests

We use **Vitest** for unit testing core logic, mappers, and compliance report generation.

```bash
# Run all tests once
npm test

# Run specific service/utility tests
npm test src/services/__tests__/RainService.test.ts
npm test src/utils/utils.test.ts
```

## Automated Smoke Testing (Bot)

For end-to-end verification and UI smoke testing, use the following bot credentials:

**Bot Credentials:**
Credentials are in `.env.test.local` — see `.env.example` for required keys.

### Verification Checklist (v3.6.0+)
1. **Login**: Verify successful authentication with bot credentials.
2. **Fields**: Ensure "Test Plot A" is visible (or create it if the account is reset).
3. **Fertilizer Recipes**:
   - Open Fertilizer Modal.
   - Create a new recipe using the "Save as Recipe" toggle.
   - Verify the recipe appears in the "Use Recipe" dropdown.
   - Delete the recipe using the Trash icon.
   - Verify the confirmation dialog appears and the recipe is removed upon confirmation.
4. **Tillage Records**:
   - Create a tillage record.
   - Verify the "Activity Item" displays the field name alongside the implement type.
5. **Rainfall Resilience**:
   - Rapidly refresh field details.
   - Verify that `RainService` deduplicates calls (monitored via DevTools Network tab — only 2 RPCs per field per refresh).
6. **Wait-and-Verify**: Ensure that application saves are not blocked by recipe save failures.

## Architectural Standards
All tests must adhere to the "Wait-and-Verify" and "OpResult" patterns defined in the [BLUEPRINT.md](file:///c:/Projects/AcreLedger/BLUEPRINT.md).
