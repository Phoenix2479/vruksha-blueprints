/**
 * Bank Statement Parser
 * Supports CSV, OFX, MT940 formats
 */

function parseCSV(content, mapping = {}) {
  const lines = content.trim().split('\n');
  if (lines.length < 2) return [];

  const headerLine = lines[0];
  const separator = headerLine.includes('\t') ? '\t' : ',';
  const headers = headerLine.split(separator).map(h => h.trim().replace(/^"|"$/g, ''));

  const dateCol = mapping.date || findColumn(headers, ['date', 'transaction date', 'txn date', 'value date', 'posting date']);
  const descCol = mapping.description || findColumn(headers, ['description', 'narration', 'particulars', 'remarks', 'memo', 'details']);
  const amountCol = mapping.amount || findColumn(headers, ['amount', 'txn amount', 'transaction amount']);
  const debitCol = mapping.debit || findColumn(headers, ['debit', 'withdrawal', 'dr', 'debit amount']);
  const creditCol = mapping.credit || findColumn(headers, ['credit', 'deposit', 'cr', 'credit amount']);
  const refCol = mapping.reference || findColumn(headers, ['reference', 'ref', 'ref no', 'cheque no', 'utr', 'transaction id']);
  const balCol = mapping.balance || findColumn(headers, ['balance', 'closing balance', 'running balance']);

  const transactions = [];
  for (let i = 1; i < lines.length; i++) {
    const vals = parseCSVLine(lines[i], separator);
    if (vals.length < 2) continue;

    const row = {};
    headers.forEach((h, idx) => { row[h] = (vals[idx] || '').trim().replace(/^"|"$/g, ''); });

    let amount = 0;
    if (amountCol !== null) {
      amount = parseAmount(row[headers[amountCol]]);
    } else {
      const debit = debitCol !== null ? parseAmount(row[headers[debitCol]]) : 0;
      const credit = creditCol !== null ? parseAmount(row[headers[creditCol]]) : 0;
      amount = credit - debit;
    }

    transactions.push({
      date: parseDate(dateCol !== null ? row[headers[dateCol]] : ''),
      description: descCol !== null ? row[headers[descCol]] : '',
      amount,
      type: amount >= 0 ? 'credit' : 'debit',
      reference: refCol !== null ? row[headers[refCol]] : '',
      balance: balCol !== null ? parseAmount(row[headers[balCol]]) : null,
      raw: row
    });
  }
  return transactions;
}

function parseOFX(content) {
  const transactions = [];
  const stmtTrns = content.match(/<STMTTRN>([\s\S]*?)<\/STMTTRN>/gi) || [];

  stmtTrns.forEach(trn => {
    const getTag = (tag) => {
      const m = trn.match(new RegExp(`<${tag}>([^<\\n]+)`, 'i'));
      return m ? m[1].trim() : '';
    };

    const trnType = getTag('TRNTYPE');
    const amount = parseFloat(getTag('TRNAMT')) || 0;
    const dtPosted = getTag('DTPOSTED');
    const name = getTag('NAME') || getTag('MEMO');
    const fitId = getTag('FITID');
    const checkNum = getTag('CHECKNUM');

    transactions.push({
      date: parseOFXDate(dtPosted),
      description: name,
      amount,
      type: amount >= 0 ? 'credit' : 'debit',
      reference: fitId || checkNum || '',
      balance: null,
      raw: { trnType, fitId, checkNum }
    });
  });
  return transactions;
}

function parseMT940(content) {
  const transactions = [];
  const blocks = content.split(/\r?\n:61:/);

  for (let i = 1; i < blocks.length; i++) {
    const block = blocks[i];
    const lines = block.split(/\r?\n/);
    const firstLine = lines[0] || '';

    // :61: format: YYMMDD[MMDD]CD[amount]S[type]//[ref]
    const m = firstLine.match(/^(\d{6})(\d{4})?([CDR]{1,2})([\d,\.]+)([A-Z]\d{3})(.*)$/);
    if (!m) continue;

    const dateStr = m[1];
    const dcMark = m[3];
    const amountStr = m[4].replace(',', '.');
    const amount = parseFloat(amountStr) * (dcMark.startsWith('D') ? -1 : 1);
    const ref = m[6] ? m[6].replace(/^\/\//, '') : '';

    // :86: information field follows
    let desc = '';
    const descLine = lines.find(l => l.startsWith(':86:'));
    if (descLine) desc = descLine.substring(4);

    transactions.push({
      date: parseMT940Date(dateStr),
      description: desc || ref,
      amount,
      type: amount >= 0 ? 'credit' : 'debit',
      reference: ref,
      balance: null,
      raw: { line: firstLine }
    });
  }
  return transactions;
}

// Helpers
function findColumn(headers, candidates) {
  for (const c of candidates) {
    const idx = headers.findIndex(h => h.toLowerCase().replace(/[_\s]/g, '') === c.replace(/[_\s]/g, ''));
    if (idx !== -1) return idx;
  }
  return null;
}

function parseCSVLine(line, sep) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { inQuotes = !inQuotes; continue; }
    if (ch === sep && !inQuotes) { result.push(current); current = ''; continue; }
    current += ch;
  }
  result.push(current);
  return result;
}

function parseAmount(str) {
  if (!str) return 0;
  const cleaned = str.replace(/[^0-9.\-,]/g, '').replace(/,(\d{2})$/, '.$1').replace(/,/g, '');
  return parseFloat(cleaned) || 0;
}

function parseDate(str) {
  if (!str) return new Date().toISOString().split('T')[0];
  // Try common formats: DD/MM/YYYY, MM/DD/YYYY, YYYY-MM-DD, DD-MM-YYYY
  const parts = str.split(/[-\/\.]/);
  if (parts.length === 3) {
    if (parts[0].length === 4) return `${parts[0]}-${parts[1].padStart(2,'0')}-${parts[2].padStart(2,'0')}`;
    if (parseInt(parts[2]) > 31) return `${parts[2]}-${parts[1].padStart(2,'0')}-${parts[0].padStart(2,'0')}`;
    if (parseInt(parts[0]) > 12) return `20${parts[2].length === 2 ? parts[2] : parts[2]}-${parts[1].padStart(2,'0')}-${parts[0].padStart(2,'0')}`;
  }
  const d = new Date(str);
  return isNaN(d.getTime()) ? new Date().toISOString().split('T')[0] : d.toISOString().split('T')[0];
}

function parseOFXDate(str) {
  if (!str || str.length < 8) return new Date().toISOString().split('T')[0];
  return `${str.substring(0,4)}-${str.substring(4,6)}-${str.substring(6,8)}`;
}

function parseMT940Date(str) {
  if (!str || str.length < 6) return new Date().toISOString().split('T')[0];
  const yr = parseInt(str.substring(0,2));
  const year = yr > 50 ? 1900 + yr : 2000 + yr;
  return `${year}-${str.substring(2,4)}-${str.substring(4,6)}`;
}

function detectFormat(content) {
  if (content.includes('<OFX>') || content.includes('OFXHEADER')) return 'ofx';
  if (content.includes(':20:') && content.includes(':60F:')) return 'mt940';
  return 'csv';
}

function parse(content, format, mapping) {
  switch (format || detectFormat(content)) {
    case 'ofx': return parseOFX(content);
    case 'mt940': return parseMT940(content);
    default: return parseCSV(content, mapping);
  }
}

module.exports = { parse, parseCSV, parseOFX, parseMT940, detectFormat };
