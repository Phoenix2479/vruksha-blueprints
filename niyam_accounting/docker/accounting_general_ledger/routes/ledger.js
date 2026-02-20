// General Ledger route handlers

const express = require('express');
const router = express.Router();
const { getTenantId } = require('../middleware/auth');
const ledgerService = require('../services/ledgerService');

// ============================================
// LEDGER ENTRIES
// ============================================

// Get ledger entries for an account
router.get('/accounts/:account_id/ledger', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { account_id } = req.params;
    const { from_date, to_date, limit = 100, offset = 0 } = req.query;

    // Get account info
    const account = await ledgerService.getAccountInfo(tenantId, account_id);
    if (!account) {
      return res.status(404).json({ error: 'Account not found' });
    }

    // Get ledger entries
    const rows = await ledgerService.getLedgerEntries(tenantId, account_id, { from_date, to_date, limit, offset });

    // Calculate running balance
    let runningBalance = parseFloat(account.opening_balance) || 0;

    // Get opening balance from prior entries if from_date specified
    if (from_date) {
      const prior = await ledgerService.getPriorBalanceTotals(tenantId, account_id, from_date);
      if (account.normal_balance === 'debit') {
        runningBalance += parseFloat(prior.debits) - parseFloat(prior.credits);
      } else {
        runningBalance += parseFloat(prior.credits) - parseFloat(prior.debits);
      }
    }

    const entries = rows.map(row => {
      const debit = parseFloat(row.debit_amount) || 0;
      const credit = parseFloat(row.credit_amount) || 0;

      if (account.normal_balance === 'debit') {
        runningBalance += debit - credit;
      } else {
        runningBalance += credit - debit;
      }

      return {
        ...row,
        debit_amount: debit,
        credit_amount: credit,
        running_balance: runningBalance
      };
    });

    res.json({
      success: true,
      account: {
        id: account_id,
        account_code: account.account_code,
        account_name: account.account_name,
        normal_balance: account.normal_balance
      },
      entries,
      count: entries.length
    });
  } catch (error) {
    next(error);
  }
});

// Get account statement (formatted for printing)
router.get('/accounts/:account_id/statement', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { account_id } = req.params;
    const { from_date, to_date } = req.query;

    if (!from_date || !to_date) {
      return res.status(400).json({ error: 'from_date and to_date are required' });
    }

    // Get account info
    const account = await ledgerService.getAccountFullInfo(tenantId, account_id);
    if (!account) {
      return res.status(404).json({ error: 'Account not found' });
    }

    // Get opening balance (sum of all entries before from_date)
    const openingTotals = await ledgerService.getOpeningBalanceTotals(tenantId, account_id, from_date);

    const openingDebits = parseFloat(openingTotals.total_debits) || 0;
    const openingCredits = parseFloat(openingTotals.total_credits) || 0;
    let openingBalance = parseFloat(account.opening_balance) || 0;

    if (account.normal_balance === 'debit') {
      openingBalance += openingDebits - openingCredits;
    } else {
      openingBalance += openingCredits - openingDebits;
    }

    // Get entries in period
    const rows = await ledgerService.getStatementEntries(tenantId, account_id, from_date, to_date);

    let runningBalance = openingBalance;
    let totalDebits = 0;
    let totalCredits = 0;

    const entries = rows.map(row => {
      const debit = parseFloat(row.debit_amount) || 0;
      const credit = parseFloat(row.credit_amount) || 0;

      totalDebits += debit;
      totalCredits += credit;

      if (account.normal_balance === 'debit') {
        runningBalance += debit - credit;
      } else {
        runningBalance += credit - debit;
      }

      return {
        date: row.entry_date,
        reference: row.reference || row.entry_number,
        description: row.description || row.journal_description,
        debit: debit,
        credit: credit,
        balance: runningBalance
      };
    });

    res.json({
      success: true,
      statement: {
        account_code: account.account_code,
        account_name: account.account_name,
        currency: account.currency,
        period: { from: from_date, to: to_date },
        opening_balance: openingBalance,
        entries,
        totals: {
          debits: totalDebits,
          credits: totalCredits
        },
        closing_balance: runningBalance,
        generated_at: new Date().toISOString()
      }
    });
  } catch (error) {
    next(error);
  }
});

// ============================================
// PERIOD BALANCES
// ============================================

// Get balances for all accounts in a period
router.get('/period-balances', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { fiscal_period_id, as_of_date, category } = req.query;

    const rows = await ledgerService.getPeriodBalances(tenantId, { fiscal_period_id, as_of_date, category });

    const balances = rows.map(row => {
      const opening = parseFloat(row.opening_balance) || 0;
      const debits = parseFloat(row.period_debits) || 0;
      const credits = parseFloat(row.period_credits) || 0;

      let closingBalance;
      if (row.normal_balance === 'debit') {
        closingBalance = opening + debits - credits;
      } else {
        closingBalance = opening + credits - debits;
      }

      return {
        account_id: row.id,
        account_code: row.account_code,
        account_name: row.account_name,
        category: row.category,
        opening_balance: opening,
        period_debits: debits,
        period_credits: credits,
        closing_balance: closingBalance
      };
    });

    // Group by category
    const byCategory = balances.reduce((acc, bal) => {
      if (!acc[bal.category]) {
        acc[bal.category] = { accounts: [], total: 0 };
      }
      acc[bal.category].accounts.push(bal);
      acc[bal.category].total += bal.closing_balance;
      return acc;
    }, {});

    res.json({
      success: true,
      balances,
      by_category: byCategory
    });
  } catch (error) {
    next(error);
  }
});

// ============================================
// POSTING FROM JOURNAL
// ============================================

// Post journal entry to ledger (called by journal_entries service)
router.post('/post-journal/:journal_entry_id', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { journal_entry_id } = req.params;

    const result = await ledgerService.postJournalToLedger(tenantId, journal_entry_id);

    if (result.error) {
      return res.status(result.status).json({ error: result.error });
    }

    res.json(result);
  } catch (error) {
    next(error);
  }
});

// Reverse a posted journal entry
router.post('/reverse-journal/:journal_entry_id', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { journal_entry_id } = req.params;
    const { reversal_date, description } = req.body;

    const result = await ledgerService.reverseJournalEntry(tenantId, journal_entry_id, { reversal_date, description });

    if (result.error) {
      return res.status(result.status).json({ error: result.error });
    }

    res.json({
      success: true,
      reversal_entry: result.reversal_entry,
      message: 'Reversal entry created. Post it to complete the reversal.'
    });
  } catch (error) {
    next(error);
  }
});

// ============================================
// REPORTS
// ============================================

// Trial Balance
router.get('/reports/trial-balance', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { as_of_date } = req.query;

    const rows = await ledgerService.getTrialBalance(tenantId, { as_of_date });

    let totalDebit = 0;
    let totalCredit = 0;

    const accounts = rows.map(row => {
      const opening = parseFloat(row.opening_balance) || 0;
      const debits = parseFloat(row.total_debits) || 0;
      const credits = parseFloat(row.total_credits) || 0;

      let balance;
      if (row.normal_balance === 'debit') {
        balance = opening + debits - credits;
      } else {
        balance = opening + credits - debits;
      }

      const debitBalance = balance > 0 && row.normal_balance === 'debit' ? balance : (balance < 0 ? Math.abs(balance) : 0);
      const creditBalance = balance > 0 && row.normal_balance === 'credit' ? balance : 0;

      totalDebit += debitBalance;
      totalCredit += creditBalance;

      return {
        account_code: row.account_code,
        account_name: row.account_name,
        category: row.category,
        debit_balance: debitBalance,
        credit_balance: creditBalance
      };
    });

    res.json({
      success: true,
      trial_balance: {
        as_of_date: as_of_date || new Date().toISOString().split('T')[0],
        accounts,
        totals: { debit: totalDebit, credit: totalCredit },
        is_balanced: Math.abs(totalDebit - totalCredit) < 0.01
      }
    });
  } catch (error) {
    next(error);
  }
});

// Account Activity Summary
router.get('/reports/activity-summary', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { from_date, to_date } = req.query;

    if (!from_date || !to_date) {
      return res.status(400).json({ error: 'from_date and to_date are required' });
    }

    const rows = await ledgerService.getActivitySummary(tenantId, from_date, to_date);

    res.json({
      success: true,
      summary: {
        period: { from: from_date, to: to_date },
        by_category: rows,
        totals: rows.reduce((acc, row) => {
          acc.debits += parseFloat(row.total_debits) || 0;
          acc.credits += parseFloat(row.total_credits) || 0;
          acc.transactions += parseInt(row.transaction_count) || 0;
          return acc;
        }, { debits: 0, credits: 0, transactions: 0 })
      }
    });
  } catch (error) {
    next(error);
  }
});

// ============================================
// CSV EXPORT ENDPOINTS
// ============================================

router.get('/accounts/:account_id/ledger/csv', async (req, res, next) => {
  try {
    const csvGen = require('../../shared/csv-generator');
    const tenantId = getTenantId(req);
    const rows = await ledgerService.getLedgerCSVData(tenantId, req.params.account_id);
    csvGen.sendCSV(res, rows, null, 'ledger.csv');
  } catch (e) { next(e); }
});

router.get('/reports/trial-balance/csv', async (req, res, next) => {
  try {
    const csvGen = require('../../shared/csv-generator');
    const tenantId = getTenantId(req);
    const rows = await ledgerService.getTrialBalanceCSVData(tenantId);
    csvGen.sendCSV(res, rows, null, 'trial-balance.csv');
  } catch (e) { next(e); }
});

module.exports = router;
