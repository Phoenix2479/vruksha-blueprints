#!/bin/bash
DIR="$(cd "$(dirname "$0")" && pwd)"

for svc in accounting_chart_of_accounts accounting_general_ledger accounting_journal_entries accounting_bank_reconciliation accounting_tax_engine accounting_accounts_payable accounting_accounts_receivable accounting_financial_reports accounting_fiscal_periods accounting_integration_bridge accounting_voucher_entry; do
  cd "$DIR/$svc"
  node service.js &
  echo "Started $svc (PID $!)"
done

echo "All services starting..."
wait
