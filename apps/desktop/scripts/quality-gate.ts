#!/usr/bin/env ts-node
/**
 * Quality gate script — runs all verification checks and emits a structured
 * pass/fail report. Exits with code 1 if any gate fails.
 *
 * Usage: npx ts-node scripts/quality-gate.ts
 */
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

interface GateResult {
  name: string;
  passed: boolean;
  detail: string;
}

const results: GateResult[] = [];
const reportPath = path.join(__dirname, '..', 'quality-gate-report.json');

function run(name: string, cmd: string): GateResult {
  try {
    const output = execSync(cmd, { encoding: 'utf8', cwd: path.join(__dirname, '..') });
    return { name, passed: true, detail: output.slice(0, 300) };
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; message?: string };
    return {
      name,
      passed: false,
      detail: (e.stdout ?? '') + (e.stderr ?? '') || e.message ?? 'unknown error',
    };
  }
}

function checkCoverage(): GateResult {
  const summaryPath = path.join(__dirname, '..', 'coverage', 'coverage-summary.json');
  if (!fs.existsSync(summaryPath)) {
    return { name: 'Coverage Thresholds', passed: false, detail: 'coverage-summary.json not found. Run tests first.' };
  }
  const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
  const total = summary.total;
  const lines = total.lines.pct;
  const branches = total.branches.pct;
  const passed = lines >= 90 && branches >= 85;
  return {
    name: 'Coverage Thresholds',
    passed,
    detail: `Lines: ${lines}% (need ≥90%), Branches: ${branches}% (need ≥85%)`,
  };
}

function checkModelPresent(): GateResult {
  const modelPath = path.join(__dirname, '..', 'models', 'ggml-base.en.bin');
  const exists = fs.existsSync(modelPath);
  return {
    name: 'Whisper Model Present',
    passed: exists,
    detail: exists ? `Found at ${modelPath}` : `Missing: ${modelPath}. Run: npm run download-model`,
  };
}

console.log('\n=== QA Nola Quality Gate ===\n');

results.push(run('TypeScript Typecheck', 'npx tsc --noEmit'));
results.push(run('ESLint', 'npx eslint src electron --ext .ts,.tsx --max-warnings 0'));
results.push(run('Unit Tests', 'npx jest --testPathPattern=tests/unit --coverage --coverageReporters=json-summary'));
results.push(checkCoverage());
results.push(run('Integration Tests', 'npx jest --testPathPattern=tests/integration'));
results.push(checkModelPresent());

const allPassed = results.every(r => r.passed);

console.log('\n--- Results ---');
for (const r of results) {
  const icon = r.passed ? '✅' : '❌';
  console.log(`${icon} ${r.name}`);
  if (!r.passed) {
    console.log(`   ${r.detail.split('\n').slice(0, 3).join('\n   ')}`);
  }
}

const report = {
  timestamp: new Date().toISOString(),
  passed: allPassed,
  gates: results,
};

fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
console.log(`\nReport written to ${reportPath}`);
console.log(`\n=== ${allPassed ? 'PASS' : 'FAIL'} ===\n`);

process.exit(allPassed ? 0 : 1);
