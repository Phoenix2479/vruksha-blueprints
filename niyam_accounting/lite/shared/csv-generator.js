/**
 * CSV Generator Utility
 * Converts arrays of objects to CSV format for download
 */

function escapeCSV(val) {
  if (val === null || val === undefined) return '';
  const str = String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

function generateCSV(data, columns) {
  if (!data || data.length === 0) return '';

  const cols = columns || Object.keys(data[0]).map(key => ({ key, label: key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) }));
  const header = cols.map(c => escapeCSV(c.label)).join(',');
  const rows = data.map(row =>
    cols.map(c => escapeCSV(c.formatter ? c.formatter(row[c.key], row) : row[c.key])).join(',')
  );
  return header + '\n' + rows.join('\n');
}

function sendCSV(res, data, columns, filename) {
  const csv = generateCSV(data, columns);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(csv);
}

module.exports = { generateCSV, sendCSV, escapeCSV };
