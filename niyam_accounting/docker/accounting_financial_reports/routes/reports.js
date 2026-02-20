// Financial Reports route handlers

const express = require('express');
const router = express.Router();
const { getTenantId } = require('../middleware/auth');
const reportsService = require('../services/reportsService');

// =============================================================================
// TRIAL BALANCE
// =============================================================================

router.get('/trial-balance', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { as_of_date } = req.query;

    const rows = await reportsService.getTrialBalance(tenantId, { as_of_date });

    // Calculate totals
    let totalDebits = 0, totalCredits = 0;
    for (const row of rows) {
      totalDebits += parseFloat(row.total_debits);
      totalCredits += parseFloat(row.total_credits);
    }

    const isBalanced = Math.abs(totalDebits - totalCredits) < 0.01;

    res.json({
      success: true,
      data: {
        as_of_date: as_of_date || new Date().toISOString().split('T')[0],
        accounts: rows,
        totals: {
          total_debits: totalDebits,
          total_credits: totalCredits,
          difference: totalDebits - totalCredits,
          is_balanced: isBalanced
        }
      }
    });
  } catch (error) {
    next(error);
  }
});

// =============================================================================
// BALANCE SHEET
// =============================================================================

router.get('/balance-sheet', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { as_of_date = new Date().toISOString().split('T')[0] } = req.query;

    const data = await reportsService.getBalanceSheetData(tenantId, as_of_date);

    const totalAssets = data.assets.reduce((sum, a) => sum + parseFloat(a.balance), 0);
    const totalLiabilities = data.liabilities.reduce((sum, a) => sum + parseFloat(a.balance), 0);
    const totalEquity = data.equity.reduce((sum, a) => sum + parseFloat(a.balance), 0);
    const retainedEarningsAmount = data.retainedEarnings;

    res.json({
      success: true,
      data: {
        as_of_date,
        assets: {
          accounts: data.assets,
          total: totalAssets
        },
        liabilities: {
          accounts: data.liabilities,
          total: totalLiabilities
        },
        equity: {
          accounts: data.equity,
          retained_earnings: retainedEarningsAmount,
          total: totalEquity + retainedEarningsAmount
        },
        totals: {
          total_assets: totalAssets,
          total_liabilities_equity: totalLiabilities + totalEquity + retainedEarningsAmount,
          is_balanced: Math.abs(totalAssets - (totalLiabilities + totalEquity + retainedEarningsAmount)) < 0.01
        }
      }
    });
  } catch (error) {
    next(error);
  }
});

// =============================================================================
// PROFIT & LOSS STATEMENT
// =============================================================================

router.get('/profit-loss', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { start_date, end_date, compare_period } = req.query;

    if (!start_date || !end_date) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_DATES', message: 'start_date and end_date are required' }
      });
    }

    const data = await reportsService.getProfitLossData(tenantId, start_date, end_date);

    const totalRevenue = data.revenue.reduce((sum, a) => sum + parseFloat(a.balance), 0);
    const totalExpenses = data.expenses.reduce((sum, a) => sum + parseFloat(a.balance), 0);
    const netIncome = totalRevenue - totalExpenses;

    // Comparison period if requested
    let comparison = null;
    if (compare_period === 'previous_period') {
      const periodLength = (new Date(end_date) - new Date(start_date)) / (1000 * 60 * 60 * 24);
      const prevEndDate = new Date(start_date);
      prevEndDate.setDate(prevEndDate.getDate() - 1);
      const prevStartDate = new Date(prevEndDate);
      prevStartDate.setDate(prevStartDate.getDate() - periodLength);

      const prevTotals = await reportsService.getPreviousPeriodTotals(
        tenantId,
        prevStartDate.toISOString().split('T')[0],
        prevEndDate.toISOString().split('T')[0]
      );

      comparison = {
        period: {
          start_date: prevStartDate.toISOString().split('T')[0],
          end_date: prevEndDate.toISOString().split('T')[0]
        },
        total_revenue: prevTotals.revenue,
        total_expenses: prevTotals.expenses,
        net_income: prevTotals.revenue - prevTotals.expenses,
        revenue_change_percent: prevTotals.revenue ? ((totalRevenue - prevTotals.revenue) / prevTotals.revenue * 100) : null,
        expense_change_percent: prevTotals.expenses ? ((totalExpenses - prevTotals.expenses) / prevTotals.expenses * 100) : null
      };
    }

    res.json({
      success: true,
      data: {
        period: { start_date, end_date },
        revenue: {
          accounts: data.revenue,
          total: totalRevenue
        },
        expenses: {
          accounts: data.expenses,
          total: totalExpenses
        },
        net_income: netIncome,
        gross_margin_percent: totalRevenue ? (netIncome / totalRevenue * 100) : 0,
        comparison
      }
    });
  } catch (error) {
    next(error);
  }
});

// =============================================================================
// CASH FLOW STATEMENT
// =============================================================================

router.get('/cash-flow', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { start_date, end_date } = req.query;

    if (!start_date || !end_date) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_DATES', message: 'start_date and end_date are required' }
      });
    }

    const data = await reportsService.getCashFlowData(tenantId, start_date, end_date);
    const netOperating = data.operatingInflows - data.operatingOutflows;

    res.json({
      success: true,
      data: {
        period: { start_date, end_date },
        operating_activities: {
          inflows: [{ description: 'Customer receipts', amount: data.operatingInflows }],
          outflows: [{ description: 'Payments to suppliers', amount: data.operatingOutflows }],
          net: netOperating
        },
        investing_activities: {
          inflows: [],
          outflows: [],
          net: 0
        },
        financing_activities: {
          inflows: [],
          outflows: [],
          net: 0
        },
        bank_summary: {
          total_inflows: data.bankInflows,
          total_outflows: data.bankOutflows
        },
        opening_cash_balance: data.openingBalance,
        net_change_in_cash: netOperating,
        closing_cash_balance: data.closingBalance
      }
    });
  } catch (error) {
    next(error);
  }
});

// =============================================================================
// ACCOUNT ACTIVITY REPORT
// =============================================================================

router.get('/account-activity', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { account_id, start_date, end_date } = req.query;

    if (!account_id || !start_date || !end_date) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_PARAMS', message: 'account_id, start_date, and end_date are required' }
      });
    }

    // Get account info
    const account = await reportsService.getAccountInfo(tenantId, account_id);
    if (!account) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Account not found' } });
    }

    // Get activity data
    const data = await reportsService.getAccountActivityData(tenantId, account_id, start_date, end_date);

    // Calculate running balance
    let runningBalance = data.openingBalance;
    const transactionsWithBalance = data.transactions.map(t => {
      runningBalance += parseFloat(t.debit_amount) - parseFloat(t.credit_amount);
      return { ...t, running_balance: runningBalance };
    });

    // Get period totals
    const periodDebits = data.transactions.reduce((sum, t) => sum + parseFloat(t.debit_amount), 0);
    const periodCredits = data.transactions.reduce((sum, t) => sum + parseFloat(t.credit_amount), 0);

    res.json({
      success: true,
      data: {
        account,
        period: { start_date, end_date },
        opening_balance: data.openingBalance,
        transactions: transactionsWithBalance,
        summary: {
          total_debits: periodDebits,
          total_credits: periodCredits,
          net_movement: periodDebits - periodCredits
        },
        closing_balance: runningBalance
      }
    });
  } catch (error) {
    next(error);
  }
});

// =============================================================================
// EXPENSE ANALYSIS
// =============================================================================

router.get('/expense-analysis', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { start_date, end_date, group_by = 'account' } = req.query;

    if (!start_date || !end_date) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_DATES', message: 'start_date and end_date are required' }
      });
    }

    const rows = await reportsService.getExpenseAnalysis(tenantId, start_date, end_date, group_by);
    const total = rows.reduce((sum, r) => sum + parseFloat(r.total), 0);

    res.json({
      success: true,
      data: {
        period: { start_date, end_date },
        group_by,
        breakdown: rows.map(r => ({
          ...r,
          total: parseFloat(r.total),
          percentage: total ? (parseFloat(r.total) / total * 100) : 0
        })),
        total
      }
    });
  } catch (error) {
    next(error);
  }
});

// =============================================================================
// REVENUE ANALYSIS
// =============================================================================

router.get('/revenue-analysis', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { start_date, end_date, group_by = 'account' } = req.query;

    if (!start_date || !end_date) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_DATES', message: 'start_date and end_date are required' }
      });
    }

    const rows = await reportsService.getRevenueAnalysis(tenantId, start_date, end_date, group_by);
    const total = rows.reduce((sum, r) => sum + parseFloat(r.total), 0);

    res.json({
      success: true,
      data: {
        period: { start_date, end_date },
        group_by,
        breakdown: rows.map(r => ({
          ...r,
          total: parseFloat(r.total),
          percentage: total ? (parseFloat(r.total) / total * 100) : 0
        })),
        total
      }
    });
  } catch (error) {
    next(error);
  }
});

// =============================================================================
// BUDGET VS ACTUAL
// =============================================================================

router.get('/budget-vs-actual', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { budget_id } = req.query;

    if (!budget_id) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_BUDGET', message: 'budget_id is required' }
      });
    }

    // Get budget info
    const budgetData = await reportsService.getBudgetInfo(tenantId, budget_id);
    if (!budgetData) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Budget not found' } });
    }

    // Get comparison data
    const rows = await reportsService.getBudgetVsActualData(tenantId, budget_id, budgetData.start_date, budgetData.end_date);

    const results = rows.map(row => {
      const budgetAmount = parseFloat(row.budget_amount);
      const actualAmount = parseFloat(row.actual_amount);
      const variance = actualAmount - budgetAmount;
      const variancePercent = budgetAmount ? (variance / budgetAmount * 100) : 0;

      return {
        ...row,
        budget_amount: budgetAmount,
        actual_amount: actualAmount,
        variance,
        variance_percent: variancePercent,
        status: variance > 0 ? 'over_budget' : variance < 0 ? 'under_budget' : 'on_budget'
      };
    });

    const totals = results.reduce((acc, r) => ({
      budget_total: acc.budget_total + r.budget_amount,
      actual_total: acc.actual_total + r.actual_amount
    }), { budget_total: 0, actual_total: 0 });

    res.json({
      success: true,
      data: {
        budget: {
          id: budgetData.id,
          name: budgetData.name,
          fiscal_year: { start_date: budgetData.start_date, end_date: budgetData.end_date }
        },
        accounts: results,
        totals: {
          ...totals,
          variance: totals.actual_total - totals.budget_total,
          variance_percent: totals.budget_total ? ((totals.actual_total - totals.budget_total) / totals.budget_total * 100) : 0
        }
      }
    });
  } catch (error) {
    next(error);
  }
});

// =============================================================================
// CSV EXPORT ENDPOINTS
// =============================================================================

router.get('/trial-balance/csv', async (req, res, next) => {
  try {
    const csvGen = require('../../shared/csv-generator');
    const tenantId = getTenantId(req);
    const rows = await reportsService.getTrialBalanceCSVData(tenantId);
    csvGen.sendCSV(res, rows, null, 'trial-balance.csv');
  } catch (e) { next(e); }
});

router.get('/profit-loss/csv', async (req, res, next) => {
  try {
    const csvGen = require('../../shared/csv-generator');
    const tenantId = getTenantId(req);
    const rows = await reportsService.getProfitLossCSVData(tenantId);
    csvGen.sendCSV(res, rows, null, 'profit-loss.csv');
  } catch (e) { next(e); }
});

module.exports = router;
