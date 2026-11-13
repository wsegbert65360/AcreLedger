import { scanSrcWrites } from './farm-write-guard.mjs';

const violations = scanSrcWrites();
if (violations.length === 0) {
  console.log('Farm write guard: no banned .delete() or .upsert() in src/.');
} else {
  for (const hit of violations) {
    const hint = hit.rule === 'delete'
      ? 'Soft-delete with deleted_at, or add `// farm-write-allowlist: delete` and a reason on the previous line.'
      : 'Upsert only fsa_tract_imports and field_clu_assignments, or add `// farm-write-allowlist: upsert` and a reason on the previous line.';
    console.error(`${hit.file}:${hit.line}: ${hit.message}. ${hint}`);
  }
  process.exitCode = 1;
}
