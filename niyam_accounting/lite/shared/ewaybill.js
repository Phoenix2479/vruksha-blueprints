/**
 * E-Way Bill Generator
 * Generates e-way bill JSON payload for manual upload or API submission
 */

function generateEWayBillJSON(doc, lines, from, to, transport) {
  const isInvoice = !!doc.invoice_number;
  const docType = isInvoice ? 'INV' : 'BIL';
  const supplyType = isInvoice ? 'O' : 'I';

  const itemList = lines.map((line, idx) => ({
    productName: line.description || line.account_name || 'Goods',
    productDesc: line.description || '',
    hsnCode: parseInt(line.hsn_sac_code) || 0,
    quantity: line.quantity || 1,
    qtyUnit: line.unit || 'NOS',
    cgstRate: line.cgst_rate || 0,
    sgstRate: line.sgst_rate || 0,
    igstRate: line.igst_rate || 0,
    cessRate: 0,
    cessAdvol: 0,
    taxableAmount: line.net_amount || line.amount || 0
  }));

  const totals = lines.reduce((acc, l) => {
    acc.totalValue += (l.net_amount || l.amount || 0);
    acc.cgstValue += (l.cgst_amount || 0);
    acc.sgstValue += (l.sgst_amount || 0);
    acc.igstValue += (l.igst_amount || 0);
    return acc;
  }, { totalValue: 0, cgstValue: 0, sgstValue: 0, igstValue: 0 });

  return {
    supplyType,
    subSupplyType: transport.sub_supply_type || '1',
    subSupplyDesc: '',
    docType,
    docNo: doc.invoice_number || doc.bill_number || '',
    docDate: formatDDMMYYYY(doc.invoice_date || doc.bill_date),
    fromGstin: from.gstin || '',
    fromTrdName: from.name || from.company_name || '',
    fromAddr1: from.address_line1 || '',
    fromAddr2: from.address_line2 || '',
    fromPlace: from.city || '',
    fromPincode: parseInt(from.pincode) || 0,
    fromStateCode: parseInt(from.state_code) || 0,
    toGstin: to.gstin || to.customer_gstin || to.vendor_gstin || '',
    toTrdName: to.name || to.customer_name || to.vendor_name || '',
    toAddr1: to.address_line1 || to.c_addr1 || '',
    toAddr2: to.address_line2 || to.c_addr2 || '',
    toPlace: to.city || to.c_city || '',
    toPincode: parseInt(to.pincode || to.c_pincode) || 0,
    toStateCode: parseInt(to.state_code) || 0,
    totalValue: totals.totalValue,
    cgstValue: totals.cgstValue,
    sgstValue: totals.sgstValue,
    igstValue: totals.igstValue,
    cessValue: 0,
    cessNonAdvolValue: 0,
    otherValue: 0,
    totInvValue: totals.totalValue + totals.cgstValue + totals.sgstValue + totals.igstValue,
    transporterId: transport.transporter_id || '',
    transporterName: transport.transporter_name || '',
    transDocNo: transport.doc_number || '',
    transMode: transport.transport_mode || '1',
    transDistance: transport.distance_km || 0,
    transDocDate: transport.doc_date ? formatDDMMYYYY(transport.doc_date) : '',
    vehicleNo: transport.vehicle_number || '',
    vehicleType: transport.vehicle_type || 'R',
    itemList
  };
}

function formatDDMMYYYY(dateStr) {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length === 3 && parts[0].length === 4) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  return dateStr;
}

module.exports = { generateEWayBillJSON };
