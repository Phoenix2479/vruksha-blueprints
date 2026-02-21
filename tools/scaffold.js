#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const ROOT = path.resolve(__dirname, '..');
const DOCKER_TEMPLATE_DIR = path.join(ROOT, '_templates', 'docker-module');
const LITE_TEMPLATE_DIR = path.join(ROOT, '_templates', 'lite-module');

const VERTICALS = {
  retail: { dir: 'niyam_retail', portRange: '8800-8899' },
  hospitality: { dir: 'niyam_hospitality', portRange: '8900-8999' },
  accounting: { dir: 'niyam_accounting', portRange: '8840-8860' },
  ecommerce: { dir: 'niyam_ecommerce', portRange: '9100-9199' },
};

function ask(rl, question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => resolve(answer.trim()));
  });
}

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function replacePlaceholders(filePath, replacements) {
  let content = fs.readFileSync(filePath, 'utf8');
  for (const [key, value] of Object.entries(replacements)) {
    content = content.replaceAll(key, value);
  }
  fs.writeFileSync(filePath, content);
}

async function main() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  console.log('\n  Vruksha Module Scaffolder');
  console.log('  ========================\n');

  // Module type
  let moduleType = '';
  while (!moduleType) {
    moduleType = await ask(rl, '  Module type (docker/lite): ');
    moduleType = moduleType.toLowerCase();
    if (moduleType !== 'docker' && moduleType !== 'lite') {
      console.log('  Invalid type. Choose: docker or lite');
      moduleType = '';
    }
  }

  const isLite = moduleType === 'lite';

  // Module ID
  let moduleId = '';
  while (!moduleId) {
    moduleId = await ask(rl, '  Module ID (lowercase, underscores only): ');
    if (!/^[a-z0-9][a-z0-9_-]{2,64}$/.test(moduleId)) {
      console.log('  Invalid ID. Use lowercase letters, numbers, underscores. Min 3 chars.');
      moduleId = '';
    }
  }

  // Display name
  let displayName = '';
  while (!displayName) {
    displayName = await ask(rl, '  Display name: ');
  }

  // Vertical
  const verticalNames = Object.keys(VERTICALS);
  let vertical = '';
  while (!vertical) {
    vertical = await ask(rl, `  Vertical (${verticalNames.join('/')}): `);
    if (!VERTICALS[vertical]) {
      console.log(`  Invalid vertical. Choose: ${verticalNames.join(', ')}`);
      vertical = '';
    }
  }

  // Port
  const { portRange } = VERTICALS[vertical];
  let port = 0;
  while (!port) {
    const portStr = await ask(rl, `  Port number (range ${portRange}): `);
    port = parseInt(portStr, 10);
    if (isNaN(port) || port < 1 || port > 65535) {
      console.log('  Invalid port number.');
      port = 0;
    }
  }

  // Description
  const description = await ask(rl, '  Description (one sentence): ') || `${displayName} module`;

  // Owner
  const owner = await ask(rl, '  Your name (for app.json owner field): ') || 'Contributor';

  rl.close();

  // Create module
  const verticalDir = VERTICALS[vertical].dir;
  const templateDir = isLite ? LITE_TEMPLATE_DIR : DOCKER_TEMPLATE_DIR;
  const destDir = path.join(ROOT, verticalDir, moduleType, moduleId);

  if (fs.existsSync(destDir)) {
    console.log(`\n  Error: ${verticalDir}/${moduleType}/${moduleId}/ already exists.`);
    process.exit(1);
  }

  // Copy template
  copyDir(templateDir, destDir);

  // Replace placeholders in all files
  const dashId = moduleId.replace(/_/g, '-');
  const replacements = {
    'your_module_id': moduleId,
    'Your Module Name': displayName,
    'your-module-id': dashId,
    'Brief description of what this module does': description,
    'Your Name': owner,
    '"port": 0': `"port": ${port}`,
    '"vertical": "retail"': `"vertical": "${vertical}"`,
  };

  if (isLite) {
    replacements['@niyam/lite-your-module-id'] = `@niyam/lite-${dashId}`;
    replacements['Niyam Lite - Your Module Name (retail)'] = `Niyam Lite - ${displayName} (${vertical})`;
  }

  const files = ['app.json', 'service.js', 'package.json', 'README.md', 'routes/index.js'];
  for (const file of files) {
    const filePath = path.join(destDir, file);
    if (fs.existsSync(filePath)) {
      replacePlaceholders(filePath, replacements);
    }
  }

  // Update service.js port
  const servicePath = path.join(destDir, 'service.js');
  let serviceContent = fs.readFileSync(servicePath, 'utf8');
  serviceContent = serviceContent.replace(
    'process.env.PORT || 0',
    `process.env.PORT || ${port}`
  );
  fs.writeFileSync(servicePath, serviceContent);

  // Print result
  const relPath = `${verticalDir}/${moduleType}/${moduleId}`;
  console.log(`\n  Created: ${relPath}/`);
  console.log('    ├── app.json');
  console.log('    ├── service.js');
  console.log('    ├── package.json');
  console.log('    ├── routes/index.js');
  console.log('    └── README.md');
  console.log('\n  Next steps:');
  console.log(`    cd ${relPath}`);
  console.log('    npm install');

  if (isLite) {
    console.log('    node service.js');
    console.log(`\n  Note: Lite modules use shared utilities from ${verticalDir}/lite/shared/`);
    console.log('  (db.js, eventBus.js, accounting-hook.js). No Docker required.');
  } else {
    console.log('    npm start');
  }

  console.log(`\n  Validate: node tools/validate.js ${relPath}/app.json\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
