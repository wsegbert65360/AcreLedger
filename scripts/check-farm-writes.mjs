import { scanSrcDeletes } from './farm-write-guard.mjs';

const violations = scanSrcDeletes();
if (violations.length === 0) {
  console.log('Farm write guard: no .delete() on farm-owned tables in src/.');
} else {
  for (const hit of violations) {
    console.error(`${hit.file}:${hit.line}: ${hit.message}. Soft-delete with deleted_at, or add \`// farm-write-allowlist: delete\` and a reason on the previous line.`);
  }
  process.exitCode = 1;
}
