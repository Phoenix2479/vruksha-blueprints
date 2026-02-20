#!/bin/bash
# Comprehensive audit script for all accounting lite services
DIR="$(cd "$(dirname "$0")" && pwd)"
PASS=0
FAIL=0
TOTAL=0
ISSUES=""

test_route() {
  local port=$1 path=$2 desc=$3 method=${4:-GET}
  TOTAL=$((TOTAL + 1))
  if [ "$method" = "POST" ]; then
    resp=$(curl -s -w "\n%{http_code}" -X POST -H "Content-Type: application/json" -d '{}' "http://localhost:$port$path" 2>/dev/null)
  else
    resp=$(curl -s -w "\n%{http_code}" "http://localhost:$port$path" 2>/dev/null)
  fi
  code=$(echo "$resp" | tail -1)
  body=$(echo "$resp" | head -1)
  if [ "$code" = "200" ] || [ "$code" = "201" ] || [ "$code" = "400" ]; then
    echo "  PASS [$code] $method $path - $desc"
    PASS=$((PASS + 1))
  else
    echo "  FAIL [$code] $method $path - $desc"
    FAIL=$((FAIL + 1))
    ISSUES="$ISSUES\n  FAIL: Port $port $method $path ($code)"
  fi
}

# Start all services
echo "Starting all services..."
for svc in accounting_chart_of_accounts accounting_general_ledger accounting_journal_entries accounting_bank_reconciliation accounting_tax_engine accounting_accounts_payable accounting_accounts_receivable accounting_financial_reports accounting_fiscal_periods accounting_integration_bridge accounting_voucher_entry; do
  cd "$DIR/$svc"
  node service.js &
done
sleep 20

echo "Checking ports..."
for port in $(seq 8851 8861); do
  pid=$(lsof -ti :$port 2>/dev/null)
  if [ -n "$pid" ]; then echo "  Port $port: UP"; else echo "  Port $port: DOWN"; fi
done

echo ""
echo "========================================="
echo "  ACCOUNTING LITE - FULL AUDIT"
echo "========================================="
echo ""

echo "--- 8851: Chart of Accounts ---"
test_route 8851 "/health" "Health check"
test_route 8851 "/api/accounts" "List accounts"
test_route 8851 "/api/account-types" "List account types"
test_route 8851 "/api/companies" "List companies"
test_route 8851 "/api/currencies" "List currencies"
test_route 8851 "/api/exchange-rates" "Exchange rates"
test_route 8851 "/api/branches" "Branches"
test_route 8851 "/api/forex-gain-loss" "Forex gain/loss"
test_route 8851 "/api/accounts/export/csv" "Export CSV"

echo ""
echo "--- 8852: General Ledger ---"
test_route 8852 "/health" "Health check"
test_route 8852 "/api/balances" "Balances"
test_route 8852 "/api/trial-balance" "Trial balance"
test_route 8852 "/api/audit-log" "Audit log"
test_route 8852 "/api/audit-settings" "Audit settings"
test_route 8852 "/api/users" "Users"
test_route 8852 "/api/roles" "Roles"
test_route 8852 "/api/record-locks" "Record locks (collab)"
test_route 8852 "/api/activity-log" "Activity log (collab)"

echo ""
echo "--- 8853: Journal Entries ---"
test_route 8853 "/health" "Health check"
test_route 8853 "/api/journal-entries" "List journal entries"
test_route 8853 "/api/journal-entries/export/csv" "Export CSV"
test_route 8853 "/api/approval-rules" "Approval rules"
test_route 8853 "/api/pending-approvals" "Pending approvals"

echo ""
echo "--- 8854: Bank Reconciliation ---"
test_route 8854 "/health" "Health check"
test_route 8854 "/api/bank-accounts" "Bank accounts"
test_route 8854 "/api/bank-statements/history" "Statement history"
test_route 8854 "/api/unreconciled" "Unreconciled"

echo ""
echo "--- 8855: Tax Engine ---"
test_route 8855 "/health" "Health check"
test_route 8855 "/api/tax-codes" "Tax codes"
test_route 8855 "/api/tds/sections" "TDS sections"
test_route 8855 "/api/tds/summary" "TDS summary"
test_route 8855 "/api/gst-returns" "GST returns"
test_route 8855 "/api/tax-transactions" "Tax transactions"
test_route 8855 "/api/reports/tax-liability" "Tax liability report"

echo ""
echo "--- 8856: Accounts Payable ---"
test_route 8856 "/health" "Health check"
test_route 8856 "/api/vendors" "Vendors"
test_route 8856 "/api/bills" "Bills"
test_route 8856 "/api/aging" "AP Aging"
test_route 8856 "/api/debit-notes" "Debit notes"
test_route 8856 "/api/ewaybills" "E-Way bills"
test_route 8856 "/api/purchase-orders" "Purchase orders"
test_route 8856 "/api/expense-claims" "Expense claims"
test_route 8856 "/api/expense-categories" "Expense categories"
test_route 8856 "/api/employees" "Employees (payroll)"
test_route 8856 "/api/salary-structures" "Salary structures"
test_route 8856 "/api/payroll/settings" "Payroll settings"
test_route 8856 "/api/payroll/runs" "Payroll runs"

echo ""
echo "--- 8857: Accounts Receivable ---"
test_route 8857 "/health" "Health check"
test_route 8857 "/api/customers" "Customers"
test_route 8857 "/api/invoices" "Invoices"
test_route 8857 "/api/credit-notes" "Credit notes"
test_route 8857 "/api/aging" "AR Aging"
test_route 8857 "/api/einvoice-settings" "E-Invoice settings"
test_route 8857 "/api/payment-links" "Payment links"
test_route 8857 "/api/ewaybills" "E-Way bills"

echo ""
echo "--- 8858: Financial Reports ---"
test_route 8858 "/health" "Health check"
test_route 8858 "/api/reports/dashboard" "Dashboard"
test_route 8858 "/api/reports/trial-balance" "Trial balance"
test_route 8858 "/api/reports/profit-loss" "P&L"
test_route 8858 "/api/reports/balance-sheet" "Balance sheet"
test_route 8858 "/api/reports/cash-flow" "Cash flow"
test_route 8858 "/api/reports/budget-vs-actual" "Budget vs actual"
test_route 8858 "/api/dashboard/revenue-trend" "Revenue trend chart"
test_route 8858 "/api/dashboard/expense-breakdown" "Expense breakdown"
test_route 8858 "/api/dashboard/cashflow-trend" "Cashflow trend"
test_route 8858 "/api/backup/list" "Backup list"
test_route 8858 "/api/budget-versions" "Budget versions"
test_route 8858 "/api/budget-alerts" "Budget alerts"
test_route 8858 "/api/budget-forecast" "Budget forecast"
test_route 8858 "/api/saved-reports" "Saved reports"

echo ""
echo "--- 8859: Fiscal Periods ---"
test_route 8859 "/health" "Health check"
test_route 8859 "/api/fiscal-years" "Fiscal years"
test_route 8859 "/api/periods" "Periods"
test_route 8859 "/api/budgets" "Budgets"
test_route 8859 "/api/cost-centers" "Cost centers"
test_route 8859 "/api/inventory-valuation" "Inventory valuation"
test_route 8859 "/api/inventory-valuation/methods" "Valuation methods (FIFO/LIFO)"
test_route 8859 "/api/projects" "Projects"
test_route 8859 "/api/projects/summary" "Project summary"
test_route 8859 "/api/fixed-assets" "Fixed assets"
test_route 8859 "/api/fixed-assets/register" "Asset register"
test_route 8859 "/api/asset-categories" "Asset categories"
test_route 8859 "/api/depreciation-forecast" "Depreciation forecast"

echo ""
echo "--- 8860: Integration Bridge ---"
test_route 8860 "/health" "Health check"
test_route 8860 "/api/events" "Events"
test_route 8860 "/api/mappings" "Mappings"
test_route 8860 "/api/stats" "Stats"

echo ""
echo "--- 8861: Voucher Entry ---"
test_route 8861 "/health" "Health check"
test_route 8861 "/api/voucher-types" "Voucher types"
test_route 8861 "/api/vouchers" "Vouchers"
test_route 8861 "/api/recurring" "Recurring vouchers"
test_route 8861 "/api/accounts" "Account list"
test_route 8861 "/api/parties" "Parties"

echo ""
echo "========================================="
echo "  RESULTS: $PASS PASS / $FAIL FAIL / $TOTAL TOTAL"
echo "========================================="
if [ $FAIL -gt 0 ]; then
  echo ""
  echo "FAILURES:"
  echo -e "$ISSUES"
fi

# Clean up
kill $(jobs -p) 2>/dev/null
