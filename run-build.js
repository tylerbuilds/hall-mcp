#!/usr/bin/env node
const { execSync } = require('child_process');
const path = require('path');

process.chdir(__dirname);

console.log('=== Running TypeScript Compiler ===');
try {
  const buildOutput = execSync('npx tsc -p tsconfig.json 2>&1', { encoding: 'utf-8' });
  console.log(buildOutput || 'Build successful (no output)');
} catch (err) {
  console.log('Build errors:');
  console.log(err.stdout || err.message);
  process.exit(1);
}

console.log('\n=== Running Tests ===');
try {
  const testOutput = execSync('npx vitest run 2>&1', { encoding: 'utf-8' });
  console.log(testOutput);
} catch (err) {
  console.log('Test output:');
  console.log(err.stdout || err.message);
  process.exit(1);
}

console.log('\n=== All Done ===');
