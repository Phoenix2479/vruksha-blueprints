// Journal Entries Service - Business logic and DB queries

const { z } = require('zod');

let db, sdk;
try {
  db = require('../../../../../db/postgres');
  sdk = require('../../../../../platform/sdk/node');
} catch (_) {
  db = require('@vruksha/platform/db/postgres');
  sdk = require('@vruksha/platform/sdk/node');
}

const { query, getClient } = db;
const { publishEnvelope } = sdk;

// ============================================
// VALIDATION SCHEMAS
// ============================================

const JournalLineSchema = z.object({
  account_id: z.string().uuid(),
  description: z.string().optional(),
  debit_amount: z.number().min(0).default(0),
  credit_amount: z.number().min(0).default(0),
  cost_center_id: z.string().uuid().optional(),
  project_id: z.string().uuid().optional(),
  tax_code: z.string().optional(),
  reference: z.string().optional(),
});

const JournalEntrySchema = z.object({
  entry_date: z.string(),
  description: z.string().min(1),
  reference: z.string().optional(),
  lines: z.array(JournalLineSchema).min(2),
  currency: z.string().length(3).default('INR'),
  source_type: z.string().optional(),
  source_id: z.string().uuid().optional(),
  source_number: z.string().optional(),
});

// ============================================
// HELPER FUNCTIONS
// ============================================

function generateEntryNumber() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const random = Math.random().toString(36).substr(2, 6).toUpperCase();
  return `JE-${year}${month}-${random}`;
}

function validateBalanced(lines) {
  const totalDebit = lines.reduce((sum, l) => sum + (parseFloat(l.debit_amount) || 0), 0);
  const totalCredit = lines.reduce((sum, l) => sum + (parseFloat(l.credit_amount) || 0), 0);
  return Math.abs(totalDebit - totalCredit) < 0.01;
}

// ============================================
// CRUD OPERATIONS
// ============================================

async function listEntries(tenantId, { status, from_date, to_date, source_type, limit = 50, offset = 0 }) {
  let conditions = ['je.tenant_id = $1'];
  const params = [tenantId];
  let idx = 2;

  if (status) {
    conditions.push(`je.status = $${idx}`);
    params.push(status);
    idx++;
  }

  if (from_date) {
    conditions.push(`je.entry_date >= $${idx}`);
    params.push(from_date);
    idx++;
  }

  if (to_date) {
    conditions.push(`je.entry_date <= $${idx}`);
    params.push(to_date);
    idx++;
  }

  if (source_type) {
    conditions.push(`je.source_type = $${idx}`);
    params.push(source_type);
    idx++;
  }

  const whereClause = conditions.join(' AND ');

  const result = await query(
    `SELECT je.*,
            (SELECT COUNT(*) FROM acc_journal_lines jl WHERE jl.journal_entry_id = je.id) as line_count
     FROM acc_journal_entries je
     WHERE ${whereClause}
     ORDER BY je.entry_date DESC, je.created_at DESC
     LIMIT $${idx} OFFSET $${idx + 1}`,
    [...params, limit, offset]
  );

  const countResult = await query(
    `SELECT COUNT(*) as total FROM acc_journal_entries je WHERE ${whereClause}`,
    params
  );

  return {
    entries: result.rows,
    total: parseInt(countResult.rows[0].total)
  };
}

async function getEntry(tenantId, entryId) {
  const entryRes = await query(
    `SELECT * FROM acc_journal_entries WHERE tenant_id = $1 AND id = $2`,
    [tenantId, entryId]
  );

  if (entryRes.rows.length === 0) return null;

  const linesRes = await query(
    `SELECT jl.*, a.account_code, a.account_name
     FROM acc_journal_lines jl
     LEFT JOIN acc_accounts a ON jl.account_id = a.id
     WHERE jl.journal_entry_id = $1
     ORDER BY jl.line_number`,
    [entryId]
  );

  const entry = entryRes.rows[0];
  entry.lines = linesRes.rows;
  return entry;
}

async function createEntry(tenantId, body) {
  const parsed = JournalEntrySchema.safeParse(body);
  if (!parsed.success) {
    return { error: 'Invalid payload', details: parsed.error.errors, status: 400 };
  }

  const data = parsed.data;

  // Validate balanced
  if (!validateBalanced(data.lines)) {
    return { error: 'Journal entry must be balanced (debits = credits)', status: 400 };
  }

  // Validate each line has either debit or credit (not both, not neither)
  for (const line of data.lines) {
    const hasDebit = (line.debit_amount || 0) > 0;
    const hasCredit = (line.credit_amount || 0) > 0;
    if (hasDebit && hasCredit) {
      return { error: 'A line cannot have both debit and credit amounts', status: 400 };
    }
    if (!hasDebit && !hasCredit) {
      return { error: 'Each line must have either debit or credit amount', status: 400 };
    }
  }

  const client = await getClient();

  try {
    await client.query('BEGIN');

    const totalDebit = data.lines.reduce((sum, l) => sum + (parseFloat(l.debit_amount) || 0), 0);
    const totalCredit = data.lines.reduce((sum, l) => sum + (parseFloat(l.credit_amount) || 0), 0);

    // Create journal entry header
    const entryNumber = generateEntryNumber();
    const entryRes = await client.query(
      `INSERT INTO acc_journal_entries
       (tenant_id, entry_number, entry_date, entry_type, description, reference,
        total_debit, total_credit, currency, status, source_type, source_id, source_number)
       VALUES ($1, $2, $3, 'manual', $4, $5, $6, $7, $8, 'draft', $9, $10, $11)
       RETURNING *`,
      [
        tenantId,
        entryNumber,
        data.entry_date,
        data.description,
        data.reference,
        totalDebit,
        totalCredit,
        data.currency,
        data.source_type,
        data.source_id,
        data.source_number
      ]
    );

    const entry = entryRes.rows[0];

    // Create journal lines
    const lines = [];
    for (let i = 0; i < data.lines.length; i++) {
      const line = data.lines[i];
      const lineRes = await client.query(
        `INSERT INTO acc_journal_lines
         (tenant_id, journal_entry_id, line_number, account_id, description,
          debit_amount, credit_amount, currency, cost_center_id, project_id, tax_code, reference)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         RETURNING *`,
        [
          tenantId,
          entry.id,
          i + 1,
          line.account_id,
          line.description,
          line.debit_amount || 0,
          line.credit_amount || 0,
          data.currency,
          line.cost_center_id,
          line.project_id,
          line.tax_code,
          line.reference
        ]
      );
      lines.push(lineRes.rows[0]);
    }

    await client.query('COMMIT');

    entry.lines = lines;

    await publishEnvelope('accounting.journal_entries.created.v1', 1, {
      entry_id: entry.id,
      entry_number: entryNumber,
      total_amount: totalDebit
    });

    return { success: true, entry };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function updateEntry(tenantId, entryId, body) {
  // Check if entry exists and is draft
  const existingRes = await query(
    `SELECT status FROM acc_journal_entries WHERE tenant_id = $1 AND id = $2`,
    [tenantId, entryId]
  );

  if (existingRes.rows.length === 0) {
    return { error: 'Journal entry not found', status: 404 };
  }

  if (existingRes.rows[0].status !== 'draft') {
    return { error: 'Can only update draft entries', status: 400 };
  }

  const parsed = JournalEntrySchema.safeParse(body);
  if (!parsed.success) {
    return { error: 'Invalid payload', details: parsed.error.errors, status: 400 };
  }

  const data = parsed.data;

  if (!validateBalanced(data.lines)) {
    return { error: 'Journal entry must be balanced', status: 400 };
  }

  const client = await getClient();

  try {
    await client.query('BEGIN');

    const totalDebit = data.lines.reduce((sum, l) => sum + (parseFloat(l.debit_amount) || 0), 0);
    const totalCredit = data.lines.reduce((sum, l) => sum + (parseFloat(l.credit_amount) || 0), 0);

    // Update header
    await client.query(
      `UPDATE acc_journal_entries
       SET entry_date = $3, description = $4, reference = $5,
           total_debit = $6, total_credit = $7, updated_at = NOW()
       WHERE tenant_id = $1 AND id = $2`,
      [tenantId, entryId, data.entry_date, data.description, data.reference, totalDebit, totalCredit]
    );

    // Delete existing lines
    await client.query(
      `DELETE FROM acc_journal_lines WHERE journal_entry_id = $1`,
      [entryId]
    );

    // Create new lines
    for (let i = 0; i < data.lines.length; i++) {
      const line = data.lines[i];
      await client.query(
        `INSERT INTO acc_journal_lines
         (tenant_id, journal_entry_id, line_number, account_id, description,
          debit_amount, credit_amount, currency, cost_center_id, project_id, tax_code, reference)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [
          tenantId, entryId, i + 1, line.account_id, line.description,
          line.debit_amount || 0, line.credit_amount || 0, data.currency,
          line.cost_center_id, line.project_id, line.tax_code, line.reference
        ]
      );
    }

    await client.query('COMMIT');

    // Fetch updated entry
    const updatedRes = await query(
      `SELECT * FROM acc_journal_entries WHERE id = $1`,
      [entryId]
    );
    const linesRes = await query(
      `SELECT jl.*, a.account_code, a.account_name
       FROM acc_journal_lines jl
       LEFT JOIN acc_accounts a ON jl.account_id = a.id
       WHERE jl.journal_entry_id = $1 ORDER BY jl.line_number`,
      [entryId]
    );

    const entry = updatedRes.rows[0];
    entry.lines = linesRes.rows;

    return { success: true, entry };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function deleteEntry(tenantId, entryId) {
  const existingRes = await query(
    `SELECT status FROM acc_journal_entries WHERE tenant_id = $1 AND id = $2`,
    [tenantId, entryId]
  );

  if (existingRes.rows.length === 0) {
    return { error: 'Journal entry not found', status: 404 };
  }

  if (existingRes.rows[0].status !== 'draft') {
    return { error: 'Can only delete draft entries', status: 400 };
  }

  const client = await getClient();

  try {
    await client.query('BEGIN');
    await client.query(`DELETE FROM acc_journal_lines WHERE journal_entry_id = $1`, [entryId]);
    await client.query(`DELETE FROM acc_journal_entries WHERE id = $1`, [entryId]);
    await client.query('COMMIT');

    return { success: true, message: 'Journal entry deleted' };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// ============================================
// POSTING & STATUS
// ============================================

async function postEntry(tenantId, entryId) {
  // Get entry
  const entryRes = await query(
    `SELECT * FROM acc_journal_entries WHERE tenant_id = $1 AND id = $2`,
    [tenantId, entryId]
  );

  if (entryRes.rows.length === 0) {
    return { error: 'Journal entry not found', status: 404 };
  }

  const entry = entryRes.rows[0];

  if (entry.status !== 'draft') {
    return { error: 'Entry is not in draft status', status: 400 };
  }

  // Verify balanced
  if (Math.abs(parseFloat(entry.total_debit) - parseFloat(entry.total_credit)) > 0.01) {
    return { error: 'Entry is not balanced', status: 400 };
  }

  // Check fiscal period is open
  const periodRes = await query(
    `SELECT id, status FROM acc_fiscal_periods
     WHERE tenant_id = $1 AND start_date <= $2 AND end_date >= $2`,
    [tenantId, entry.entry_date]
  );

  if (periodRes.rows.length > 0 && periodRes.rows[0].status !== 'open') {
    return { error: 'Fiscal period is closed', status: 400 };
  }

  const fiscalPeriodId = periodRes.rows.length > 0 ? periodRes.rows[0].id : null;

  const client = await getClient();

  try {
    await client.query('BEGIN');

    // Get lines
    const linesRes = await client.query(
      `SELECT * FROM acc_journal_lines WHERE journal_entry_id = $1`,
      [entryId]
    );

    // Create ledger entries
    for (const line of linesRes.rows) {
      await client.query(
        `INSERT INTO acc_ledger_entries
         (tenant_id, account_id, journal_line_id, fiscal_period_id, entry_date,
          debit_amount, credit_amount, description, reference, source_type, source_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          tenantId, line.account_id, line.id, fiscalPeriodId, entry.entry_date,
          line.debit_amount, line.credit_amount, line.description || entry.description,
          entry.entry_number, entry.source_type, entry.source_id
        ]
      );

      // Update account balance
      const balanceChange = parseFloat(line.debit_amount) - parseFloat(line.credit_amount);
      await client.query(
        `UPDATE acc_accounts SET current_balance = current_balance + $1, updated_at = NOW() WHERE id = $2`,
        [balanceChange, line.account_id]
      );
    }

    // Update entry status
    await client.query(
      `UPDATE acc_journal_entries
       SET status = 'posted', posted_at = NOW(), fiscal_period_id = $2
       WHERE id = $1`,
      [entryId, fiscalPeriodId]
    );

    await client.query('COMMIT');

    await publishEnvelope('accounting.journal_entries.posted.v1', 1, {
      entry_id: entryId,
      entry_number: entry.entry_number,
      entry_date: entry.entry_date,
      total_amount: entry.total_debit
    });

    return { success: true, message: 'Journal entry posted successfully' };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function voidEntry(tenantId, entryId, reason) {
  const entryRes = await query(
    `SELECT * FROM acc_journal_entries WHERE tenant_id = $1 AND id = $2`,
    [tenantId, entryId]
  );

  if (entryRes.rows.length === 0) {
    return { error: 'Journal entry not found', status: 404 };
  }

  const entry = entryRes.rows[0];

  if (entry.status !== 'posted') {
    return { error: 'Can only void posted entries', status: 400 };
  }

  const client = await getClient();

  try {
    await client.query('BEGIN');

    // Reverse the ledger entries' effect on account balances
    const linesRes = await client.query(
      `SELECT * FROM acc_journal_lines WHERE journal_entry_id = $1`,
      [entryId]
    );

    for (const line of linesRes.rows) {
      const balanceChange = parseFloat(line.credit_amount) - parseFloat(line.debit_amount);  // Reverse
      await client.query(
        `UPDATE acc_accounts SET current_balance = current_balance + $1, updated_at = NOW() WHERE id = $2`,
        [balanceChange, line.account_id]
      );
    }

    // Delete ledger entries
    await client.query(
      `DELETE FROM acc_ledger_entries WHERE journal_line_id IN
       (SELECT id FROM acc_journal_lines WHERE journal_entry_id = $1)`,
      [entryId]
    );

    // Update entry status
    await client.query(
      `UPDATE acc_journal_entries SET status = 'voided', description = description || ' [VOIDED: ' || $2 || ']' WHERE id = $1`,
      [entryId, reason || 'No reason provided']
    );

    await client.query('COMMIT');

    return { success: true, message: 'Journal entry voided' };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// ============================================
// AUTO-GENERATE FROM SOURCE
// ============================================

async function createFromSource(tenantId, { source_type, source_id, source_number, entry_date, description, lines }) {
  if (!source_type || !lines || lines.length < 2) {
    return { error: 'source_type and lines (min 2) are required', status: 400 };
  }

  if (!validateBalanced(lines)) {
    return { error: 'Entry must be balanced', status: 400 };
  }

  const client = await getClient();

  try {
    await client.query('BEGIN');

    const totalDebit = lines.reduce((sum, l) => sum + (parseFloat(l.debit_amount) || 0), 0);
    const totalCredit = lines.reduce((sum, l) => sum + (parseFloat(l.credit_amount) || 0), 0);

    const entryNumber = generateEntryNumber();

    const entryRes = await client.query(
      `INSERT INTO acc_journal_entries
       (tenant_id, entry_number, entry_date, entry_type, description,
        total_debit, total_credit, currency, status, source_type, source_id, source_number)
       VALUES ($1, $2, $3, 'auto', $4, $5, $6, 'INR', 'draft', $7, $8, $9)
       RETURNING *`,
      [tenantId, entryNumber, entry_date || new Date().toISOString().split('T')[0],
       description, totalDebit, totalCredit, source_type, source_id, source_number]
    );

    const entry = entryRes.rows[0];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      await client.query(
        `INSERT INTO acc_journal_lines
         (tenant_id, journal_entry_id, line_number, account_id, description,
          debit_amount, credit_amount, currency)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'INR')`,
        [tenantId, entry.id, i + 1, line.account_id, line.description,
         line.debit_amount || 0, line.credit_amount || 0]
      );
    }

    await client.query('COMMIT');

    return { success: true, entry };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// ============================================
// VALIDATION
// ============================================

async function validateEntry(tenantId, lines) {
  const errors = [];
  const warnings = [];

  if (!lines || lines.length < 2) {
    errors.push('Minimum 2 lines required');
  }

  if (lines) {
    // Check balanced
    const totalDebit = lines.reduce((sum, l) => sum + (parseFloat(l.debit_amount) || 0), 0);
    const totalCredit = lines.reduce((sum, l) => sum + (parseFloat(l.credit_amount) || 0), 0);

    if (Math.abs(totalDebit - totalCredit) > 0.01) {
      errors.push(`Entry not balanced: Debits=${totalDebit}, Credits=${totalCredit}`);
    }

    // Check accounts exist
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.account_id) {
        const accRes = await query(
          `SELECT id, is_active, is_header FROM acc_accounts WHERE tenant_id = $1 AND id = $2`,
          [tenantId, line.account_id]
        );
        if (accRes.rows.length === 0) {
          errors.push(`Line ${i + 1}: Account not found`);
        } else if (!accRes.rows[0].is_active) {
          warnings.push(`Line ${i + 1}: Account is inactive`);
        } else if (accRes.rows[0].is_header) {
          errors.push(`Line ${i + 1}: Cannot post to header account`);
        }
      }

      // Check debit/credit
      const hasDebit = (line.debit_amount || 0) > 0;
      const hasCredit = (line.credit_amount || 0) > 0;
      if (hasDebit && hasCredit) {
        errors.push(`Line ${i + 1}: Cannot have both debit and credit`);
      }
      if (!hasDebit && !hasCredit) {
        errors.push(`Line ${i + 1}: Must have debit or credit amount`);
      }
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

// ============================================
// CSV/PDF EXPORT DATA
// ============================================

async function getEntriesCSVData(tenantId) {
  const result = await query(
    'SELECT entry_number, entry_date, description, status, total_debit, total_credit, source FROM acc_journal_entries WHERE tenant_id = $1 ORDER BY entry_date DESC',
    [tenantId]
  );
  return result.rows;
}

async function getEntriesPDFData(tenantId) {
  const result = await query(
    'SELECT entry_number, entry_date, description, status, total_debit, total_credit FROM acc_journal_entries WHERE tenant_id = $1 ORDER BY entry_date DESC',
    [tenantId]
  );
  return result.rows;
}

module.exports = {
  listEntries,
  getEntry,
  createEntry,
  updateEntry,
  deleteEntry,
  postEntry,
  voidEntry,
  createFromSource,
  validateEntry,
  getEntriesCSVData,
  getEntriesPDFData
};
