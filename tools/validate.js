#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

let Ajv;
try { Ajv = require('ajv/dist/2020'); } catch (_) { Ajv = require('ajv'); }

const ROOT = path.resolve(__dirname, '..');
const SCHEMA_PATH = path.join(ROOT, 'schema', 'app_contract.schema.json');
const SKIP_DIRS = new Set(['_archived', '_archive', '_templates', 'node_modules', '.git', 'dist', 'build']);

// Colors for terminal output
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const red = (s) => `\x1b[31m${s}\x1b[0m`;
const yellow = (s) => `\x1b[33m${s}\x1b[0m`;
const bold = (s) => `\x1b[1m${s}\x1b[0m`;

function findAppJsonFiles(dir) {
  const results = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    if (SKIP_DIRS.has(entry.name)) continue;

    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findAppJsonFiles(fullPath));
    } else if (entry.name === 'app.json') {
      results.push(fullPath);
    }
  }

  return results;
}

function validateFile(filePath, ajvValidate) {
  const relPath = path.relative(ROOT, filePath);

  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const contract = JSON.parse(content);
    const ok = ajvValidate(contract);

    if (ok) {
      console.log(`  ${green('PASS')} ${relPath}`);
      return true;
    } else {
      console.log(`  ${red('FAIL')} ${relPath}`);
      for (const err of ajvValidate.errors) {
        console.log(`       ${red('>')} ${err.instancePath || '/'}: ${err.message}`);
      }
      return false;
    }
  } catch (err) {
    console.log(`  ${red('ERR ')} ${relPath}: ${err.message}`);
    return false;
  }
}

function main() {
  const args = process.argv.slice(2);
  const isAll = args.includes('--all');
  const filePaths = args.filter(a => !a.startsWith('--'));

  // Load schema
  if (!fs.existsSync(SCHEMA_PATH)) {
    console.error(red(`Schema not found: ${SCHEMA_PATH}`));
    process.exit(2);
  }

  const schema = JSON.parse(fs.readFileSync(SCHEMA_PATH, 'utf8'));
  const ajv = new Ajv({ allErrors: true, strict: false });
  const validate = ajv.compile(schema);

  if (isAll) {
    // Validate all app.json files in the repo
    console.log(bold('\nValidating all app contracts...\n'));

    const files = findAppJsonFiles(ROOT);

    if (files.length === 0) {
      console.log(yellow('No app.json files found.'));
      process.exit(0);
    }

    let passed = 0;
    let failed = 0;

    for (const f of files) {
      if (validateFile(f, validate)) {
        passed++;
      } else {
        failed++;
      }
    }

    console.log(`\n${bold('Results:')} ${green(`${passed} passed`)}, ${failed > 0 ? red(`${failed} failed`) : `${failed} failed`}`);
    console.log(`Total: ${files.length} contracts\n`);

    process.exit(failed > 0 ? 1 : 0);

  } else if (filePaths.length > 0) {
    // Validate specific files
    let allPassed = true;

    for (const fp of filePaths) {
      const resolved = path.resolve(fp);
      if (!fs.existsSync(resolved)) {
        console.error(red(`File not found: ${fp}`));
        allPassed = false;
        continue;
      }
      if (!validateFile(resolved, validate)) {
        allPassed = false;
      }
    }

    process.exit(allPassed ? 0 : 1);

  } else {
    console.log(`
${bold('Vruksha Blueprint Validator')}

Usage:
  node validate.js --all                    Validate all app.json contracts
  node validate.js <path/to/app.json>       Validate a specific contract
  node validate.js file1.json file2.json    Validate multiple contracts
`);
    process.exit(0);
  }
}

main();
