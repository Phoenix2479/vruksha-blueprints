const { spawn } = require('child_process');
const http = require('http');
const path = require('path');

const SERVICES = [
  { name: 'chart_of_accounts', port: 8851, dir: 'accounting_chart_of_accounts' },
  { name: 'general_ledger', port: 8852, dir: 'accounting_general_ledger' },
  { name: 'journal_entries', port: 8853, dir: 'accounting_journal_entries' },
  { name: 'bank_reconciliation', port: 8854, dir: 'accounting_bank_reconciliation' },
  { name: 'tax_engine', port: 8855, dir: 'accounting_tax_engine' },
  { name: 'accounts_payable', port: 8856, dir: 'accounting_accounts_payable' },
  { name: 'accounts_receivable', port: 8857, dir: 'accounting_accounts_receivable' },
  { name: 'financial_reports', port: 8858, dir: 'accounting_financial_reports' },
  { name: 'fiscal_periods', port: 8859, dir: 'accounting_fiscal_periods' },
  { name: 'integration_bridge', port: 8860, dir: 'accounting_integration_bridge' },
  { name: 'voucher_entry', port: 8861, dir: 'accounting_voucher_entry' },
];

const ROUTES = {
  8851: [
    ['/health', 'Health'],
    ['/api/accounts', 'Accounts'],
    ['/api/account-types', 'Account types'],
    ['/api/companies', 'Companies'],
    ['/api/currencies', 'Currencies'],
    ['/api/exchange-rates', 'Exchange rates'],
    ['/api/branches', 'Branches'],
    ['/api/forex-gain-loss', 'Forex gain/loss'],
    ['/api/accounts/export/csv', 'CSV export'],
  ],
  8852: [
    ['/health', 'Health'],
    ['/api/balances', 'Balances'],
    ['/api/trial-balance', 'Trial balance'],
    ['/api/audit-log', 'Audit log'],
    ['/api/audit-settings', 'Audit settings'],
    ['/api/users', 'Users'],
    ['/api/roles', 'Roles'],
    ['/api/record-locks', 'Record locks (collab)'],
    ['/api/activity-log', 'Activity log (collab)'],
  ],
  8853: [
    ['/health', 'Health'],
    ['/api/journal-entries', 'Journal entries'],
    ['/api/journal-entries/export/csv', 'CSV export'],
    ['/api/approval-rules', 'Approval rules'],
    ['/api/pending-approvals', 'Pending approvals'],
  ],
  8854: [
    ['/health', 'Health'],
    ['/api/bank-accounts', 'Bank accounts'],
    ['/api/bank-statements/history', 'Statement import history'],
    ['/api/unreconciled', 'Unreconciled'],
  ],
  8855: [
    ['/health', 'Health'],
    ['/api/tax-codes', 'Tax codes'],
    ['/api/tds/sections', 'TDS sections'],
    ['/api/tds/summary', 'TDS summary'],
    ['/api/gst-returns', 'GST returns'],
    ['/api/tax-transactions', 'Tax transactions'],
    ['/api/reports/tax-liability', 'Tax liability'],
  ],
  8856: [
    ['/health', 'Health'],
    ['/api/vendors', 'Vendors'],
    ['/api/bills', 'Bills'],
    ['/api/aging', 'AP Aging'],
    ['/api/debit-notes', 'Debit notes'],
    ['/api/ewaybills', 'E-Way bills (AP)'],
    ['/api/purchase-orders', 'Purchase orders'],
    ['/api/expense-claims', 'Expense claims'],
    ['/api/expense-categories', 'Expense categories'],
    ['/api/employees', 'Employees (payroll)'],
    ['/api/salary-structures', 'Salary structures'],
    ['/api/payroll/settings', 'Payroll settings'],
    ['/api/payroll/runs', 'Payroll runs'],
  ],
  8857: [
    ['/health', 'Health'],
    ['/api/customers', 'Customers'],
    ['/api/invoices', 'Invoices'],
    ['/api/credit-notes', 'Credit notes'],
    ['/api/aging', 'AR Aging'],
    ['/api/einvoice-settings', 'E-Invoice settings'],
    ['/api/payment-links', 'Payment links'],
    ['/api/ewaybills', 'E-Way bills (AR)'],
  ],
  8858: [
    ['/health', 'Health'],
    ['/api/reports/dashboard', 'Dashboard'],
    ['/api/reports/trial-balance', 'Trial balance'],
    ['/api/reports/profit-loss?start_date=2025-04-01&end_date=2026-03-31', 'P&L'],
    ['/api/reports/balance-sheet', 'Balance sheet'],
    ['/api/reports/cash-flow?start_date=2025-04-01&end_date=2026-03-31', 'Cash flow'],
    ['/api/reports/budget-vs-actual', 'Budget vs actual'],
    ['/api/reports/budget-variance', 'Budget variance'],
    ['/api/dashboard/revenue-trend', 'Revenue trend chart'],
    ['/api/dashboard/expense-breakdown', 'Expense breakdown chart'],
    ['/api/dashboard/cashflow-trend', 'Cashflow trend chart'],
    ['/api/dashboard/ar-aging-chart', 'AR aging chart'],
    ['/api/dashboard/ap-aging-chart', 'AP aging chart'],
    ['/api/backup/list', 'Backup list'],
    ['/api/budget-versions', 'Budget versions (adv)'],
    ['/api/budget-alerts', 'Budget alerts (adv)'],
    ['/api/budget-forecast', 'Budget forecast (adv)'],
    ['/api/saved-reports', 'Saved reports (custom builder)'],
  ],
  8859: [
    ['/health', 'Health'],
    ['/api/fiscal-years', 'Fiscal years'],
    ['/api/periods', 'Periods'],
    ['/api/budgets', 'Budgets'],
    ['/api/cost-centers', 'Cost centers'],
    ['/api/inventory-valuation', 'Inventory valuation'],
    ['/api/inventory-valuation/methods', 'FIFO/LIFO methods'],
    ['/api/projects', 'Projects'],
    ['/api/projects/summary', 'Project summary'],
    ['/api/fixed-assets', 'Fixed assets'],
    ['/api/fixed-assets/register', 'Asset register'],
    ['/api/asset-categories', 'Asset categories'],
    ['/api/depreciation-forecast', 'Depreciation forecast'],
  ],
  8860: [
    ['/health', 'Health'],
    ['/api/events', 'Events'],
    ['/api/mappings', 'Mappings'],
    ['/api/stats', 'Stats'],
  ],
  8861: [
    ['/health', 'Health'],
    ['/api/voucher-types', 'Voucher types'],
    ['/api/vouchers', 'Vouchers'],
    ['/api/recurring', 'Recurring vouchers'],
    ['/api/accounts', 'Accounts list'],
    ['/api/parties', 'Parties'],
  ],
};

function httpGet(port, path) {
  return new Promise((resolve) => {
    const req = http.get({ hostname: '127.0.0.1', port, path, timeout: 3000 }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', () => resolve({ status: 0, body: '' }));
    req.on('timeout', () => { req.destroy(); resolve({ status: 0, body: 'timeout' }); });
  });
}

async function main() {
  const baseDir = __dirname;
  const procs = [];

  console.log('Starting all 11 services (staggered)...');
  for (const svc of SERVICES) {
    const svcDir = path.join(baseDir, svc.dir);
    const child = spawn('node', ['service.js'], { cwd: svcDir, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stderr.on('data', d => {
      const msg = d.toString().trim();
      if (msg) console.log(`  [${svc.name}] ERR: ${msg.substring(0, 200)}`);
    });
    child.on('exit', (code) => { if (code) console.log(`  ${svc.name} exited with code ${code}`); });
    procs.push(child);
    await new Promise(r => setTimeout(r, 500));
  }

  // Wait for all services to be up
  console.log('Waiting for services to start...');
  for (let i = 0; i < 40; i++) {
    await new Promise(r => setTimeout(r, 1000));
    const checks = await Promise.all(SERVICES.map(svc => httpGet(svc.port, '/health')));
    const up = checks.filter(r => r.status === 200).length;
    if (up === 11) { console.log(`All 11 services up after ${i + 1}s`); break; }
    if (i % 5 === 4) console.log(`  ${up}/11 up after ${i + 1}s...`);
    if (i === 39) console.log(`Warning: only ${up}/11 services up after 40s`);
  }

  let pass = 0, fail = 0, total = 0;
  const failures = [];

  console.log('\n=========================================');
  console.log('  ACCOUNTING LITE - FULL AUDIT');
  console.log('=========================================\n');

  for (const svc of SERVICES) {
    const routes = ROUTES[svc.port] || [];
    console.log(`--- ${svc.port}: ${svc.name} (${routes.length} routes) ---`);
    for (const [routePath, desc] of routes) {
      total++;
      const r = await httpGet(svc.port, routePath);
      const isJson = r.body.startsWith('{') || r.body.startsWith('[');
      const isCsv = routePath.includes('/csv') || routePath.includes('/export/csv') || routePath.includes('/bank-file');
      const ok = (r.status === 200 || r.status === 201) && (isJson || isCsv);
      if (ok) {
        pass++;
        let extra = '';
        try {
          const d = JSON.parse(r.body);
          if (d.data && Array.isArray(d.data)) extra = ` (${d.data.length} items)`;
        } catch {}
        console.log(`  PASS [${r.status}] ${routePath} - ${desc}${extra}`);
      } else {
        fail++;
        const hint = isJson ? '' : ' [SPA fallback?]';
        console.log(`  FAIL [${r.status}] ${routePath} - ${desc}${hint}`);
        failures.push(`  ${svc.port} ${routePath} (${r.status})${hint}`);
      }
    }
    console.log('');
  }

  console.log('=========================================');
  console.log(`  RESULTS: ${pass} PASS / ${fail} FAIL / ${total} TOTAL`);
  console.log('=========================================');

  if (failures.length) {
    console.log('\nFAILURES:');
    failures.forEach(f => console.log(f));
  }

  // Check frontend UIs
  console.log('\n=========================================');
  console.log('  FRONTEND UI AUDIT');
  console.log('=========================================\n');

  const fs = require('fs');
  for (const svc of SERVICES) {
    const uiDir = path.join(baseDir, svc.dir, 'ui');
    const hasSrc = fs.existsSync(path.join(uiDir, 'src'));
    const hasDist = fs.existsSync(path.join(uiDir, 'dist'));
    const hasIndex = fs.existsSync(path.join(uiDir, 'index.html'));
    const hasPkg = fs.existsSync(path.join(uiDir, 'package.json'));
    const hasVite = fs.existsSync(path.join(uiDir, 'vite.config.ts'));

    if (svc.name === 'integration_bridge') {
      console.log(`  ${svc.name}: No UI (bridge service) - OK`);
      continue;
    }

    let status = 'OK';
    const issues = [];
    if (!hasIndex) issues.push('missing index.html');
    if (!hasPkg) issues.push('missing package.json');
    if (!hasVite) issues.push('missing vite.config.ts');
    if (!hasSrc) issues.push('missing src/');

    if (issues.length) status = 'ISSUES: ' + issues.join(', ');

    // Check src files
    let srcFiles = 0;
    if (hasSrc) {
      const countFiles = (dir) => {
        let count = 0;
        try {
          for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            if (entry.isDirectory()) count += countFiles(path.join(dir, entry.name));
            else if (entry.name.match(/\.(tsx|jsx|ts|js|css)$/)) count++;
          }
        } catch {}
        return count;
      };
      srcFiles = countFiles(path.join(uiDir, 'src'));
    }

    // Check vite config for port
    let uiPort = '';
    if (hasVite) {
      const viteContent = fs.readFileSync(path.join(uiDir, 'vite.config.ts'), 'utf-8');
      const portMatch = viteContent.match(/port:\s*(\d+)/);
      if (portMatch) uiPort = ` (dev port: ${portMatch[1]})`;

      const proxyMatch = viteContent.match(/proxy:\s*\{[^}]*target:\s*['"]([^'"]+)['"]/s);
      if (proxyMatch) {
        const targetPort = proxyMatch[1].match(/:(\d+)/)?.[1];
        if (targetPort && parseInt(targetPort) !== svc.port) {
          status = `PROXY MISMATCH: UI proxies to ${targetPort}, backend on ${svc.port}`;
        }
      }
    }

    console.log(`  ${svc.name}: ${status}${uiPort} | ${srcFiles} src files | dist: ${hasDist ? 'YES' : 'NO'}`);
  }

  // Cleanup
  console.log('\nStopping services...');
  for (const p of procs) p.kill('SIGTERM');
  setTimeout(() => process.exit(0), 1000);
}

main().catch(e => { console.error(e); process.exit(1); });
