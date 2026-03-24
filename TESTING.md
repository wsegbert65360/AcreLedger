# Testing Procedures

This document outlines the testing protocols for the AcreLedger project.

## Automated Logic Tests

We use **Vitest** for unit testing core logic, mappers, and compliance report generation.

```bash
# Run all tests once
npm test

# Run tests in watch mode
npm run test:watch
```

## Automated Smoke Testing (Bot)

For end-to-end verification and UI smoke testing, use the following bot credentials:

**Bot Credentials:**
- **Email**: `acreledger_bot@yahoo.com`
- **Password**: `Acre-Bot-2026-Secure!`

### Verification Checklist (v3.2.0+)
1. **Login**: Verify successful authentication with bot credentials.
2. **Fields**: Ensure "Test Plot A" is visible (or create it if the account is reset).
3. **Fertilizer Recipes**:
   - Open Fertilizer Modal.
   - Create a new recipe using the "Save as Recipe" toggle.
   - Verify the recipe appears in the "Use Recipe" dropdown.
   - Delete the recipe using the Trash icon.
   - Verify the confirmation dialog appears and the recipe is removed upon confirmation.
4. **Wait-and-Verify**: Ensure that application saves are not blocked by recipe save failures.

## Architectural Standards
All tests must adhere to the "Wait-and-Verify" and "OpResult" patterns defined in the [BLUEPRINT.md](file:///c:/Projects/AcreLedger/BLUEPRINT.md).
