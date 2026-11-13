import { scanSrcWrites } from './farm-write-guard.mjs';

const violations = scanSrcWrites();
const HINTS = {
  delete: 'Soft-delete with deleted_at, or add `// farm-write-allowlist: delete` and a reason on the previous line.',
  upsert: 'Upsert only fsa_tract_imports and field_clu_assignments, or add `// farm-write-allowlist: upsert` and a reason on the previous line.',
  'update-select': 'Check the exact count instead of .select(), or add `// farm-write-allowlist: update-select` and a reason on the previous line.',
};

if (violations.length === 0) {
  console.log('Farm write guard: no banned .delete(), .upsert(), or .update().select() in src/.');
} else {
  for (const hit of violations) {
    console.error(`${hit.file}:${hit.line}: ${hit.message}. ${HINTS[hit.rule]}`);
  }
  process.exitCode = 1;
}
