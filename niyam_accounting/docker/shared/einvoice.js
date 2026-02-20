/**
 * E-Invoice (IRN) Generator
 * Generates NIC e-invoice JSON payload and handles API integration
 * Ref: GST e-invoice schema v1.1
 */
const crypto = require('crypto');
const https = require('https');

function generateEInvoiceJSON(invoice, lines, seller, buyer) {
  const isInterstate = invoice.is_interstate;
  const supTyp = isInterstate ? 'INTER' : 'INTRA';

  const itemList = lines.map((line, idx) => {
    const item = {
      SlNo: String(idx + 1),
      PrdDesc: line.description || line.account_name || 'Service',
      IsServc: line.hsn_sac_code && line.hsn_sac_code.startsWith('99') ? 'Y' : 'N',
      HsnCd: line.hsn_sac_code || '999999',
      Qty: line.quantity || 1,
      Unit: line.unit || 'NOS',
      UnitPrice: line.unit_price || line.amount || 0,
      TotAmt: line.net_amount || line.amount || 0,
      Discount: line.discount || 0,
      AssAmt: line.net_amount || line.amount || 0,
      GstRt: line.gst_rate || 0,
      CgstAmt: line.cgst_amount || 0,
      SgstAmt: line.sgst_amount || 0,
      IgstAmt: line.igst_amount || 0,
      CesRt: 0,
      CesAmt: 0,
      CesNonAdvlAmt: 0,
      StateCesRt: 0,
      StateCesAmt: 0,
      StateCesNonAdvlAmt: 0,
      OthChrg: 0,
      TotItemVal: (line.net_amount || line.amount || 0) + (line.cgst_amount || 0) + (line.sgst_amount || 0) + (line.igst_amount || 0)
    };
    return item;
  });

  const totals = itemList.reduce((acc, item) => {
    acc.AssVal += item.AssAmt;
    acc.CgstVal += item.CgstAmt;
    acc.SgstVal += item.SgstAmt;
    acc.IgstVal += item.IgstAmt;
    acc.TotInvVal += item.TotItemVal;
    return acc;
  }, { AssVal: 0, CgstVal: 0, SgstVal: 0, IgstVal: 0, CesVal: 0, StCesVal: 0, Discount: 0, OthChrg: 0, RndOffAmt: 0, TotInvVal: 0 });

  const payload = {
    Version: '1.1',
    TranDtls: {
      TaxSch: 'GST',
      SupTyp: supTyp,
      RegRev: 'N',
      EcmGstin: null,
      IgstOnIntra: 'N'
    },
    DocDtls: {
      Typ: 'INV',
      No: invoice.invoice_number,
      Dt: formatDDMMYYYY(invoice.invoice_date)
    },
    SellerDtls: {
      Gstin: seller.gstin || '',
      LglNm: seller.company_name || seller.name || '',
      TrdNm: seller.trade_name || seller.company_name || '',
      Addr1: seller.address_line1 || '',
      Addr2: seller.address_line2 || '',
      Loc: seller.city || '',
      Pin: parseInt(seller.pincode) || 0,
      Stcd: seller.state_code || '',
      Ph: seller.phone || '',
      Em: seller.email || ''
    },
    BuyerDtls: {
      Gstin: buyer.gstin || buyer.customer_gstin || 'URP',
      LglNm: buyer.name || buyer.customer_name || '',
      TrdNm: buyer.trade_name || buyer.name || buyer.customer_name || '',
      Pos: invoice.place_of_supply || seller.state_code || '',
      Addr1: buyer.address_line1 || buyer.c_addr1 || '',
      Addr2: buyer.address_line2 || buyer.c_addr2 || '',
      Loc: buyer.city || buyer.c_city || '',
      Pin: parseInt(buyer.pincode || buyer.c_pincode) || 0,
      Stcd: buyer.state_code || '',
      Ph: buyer.phone || '',
      Em: buyer.email || ''
    },
    ItemList: itemList,
    ValDtls: totals
  };

  return payload;
}

function formatDDMMYYYY(dateStr) {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length === 3 && parts[0].length === 4) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  return dateStr;
}

// NIC API client (for API mode)
async function submitToNIC(payload, settings) {
  if (!settings || !settings.api_base_url || !settings.auth_token) {
    return { success: false, error: 'NIC API credentials not configured' };
  }

  return new Promise((resolve) => {
    const data = JSON.stringify(payload);
    const url = new URL(settings.api_base_url + '/eicore/v1.03/Invoice');

    const options = {
      hostname: url.hostname,
      port: url.port || 443,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
        'client_id': settings.gsp_username || '',
        'client_secret': settings.gsp_password_enc || '',
        'gstin': payload.SellerDtls.Gstin,
        'AuthToken': settings.auth_token
      }
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const result = JSON.parse(body);
          if (result.Status === 1) {
            resolve({
              success: true,
              data: {
                irn: result.Irn,
                ack_number: result.AckNo,
                ack_date: result.AckDt,
                signed_qr: result.SignedQRCode,
                signed_invoice: result.SignedInvoice
              }
            });
          } else {
            resolve({ success: false, error: result.ErrorDetails || result.error || 'NIC API error' });
          }
        } catch (e) {
          resolve({ success: false, error: 'Invalid NIC API response' });
        }
      });
    });

    req.on('error', (e) => resolve({ success: false, error: e.message }));
    req.write(data);
    req.end();
  });
}

async function cancelEInvoice(irn, reason, settings) {
  if (!settings || !settings.api_base_url || !settings.auth_token) {
    return { success: false, error: 'NIC API credentials not configured' };
  }

  return new Promise((resolve) => {
    const data = JSON.stringify({ Irn: irn, CnlRsn: reason || '1', CnlRem: 'Cancelled' });
    const url = new URL(settings.api_base_url + '/eicore/v1.03/Invoice/Cancel');

    const options = {
      hostname: url.hostname,
      port: url.port || 443,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
        'gstin': settings.gsp_username || '',
        'AuthToken': settings.auth_token
      }
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const result = JSON.parse(body);
          resolve(result.Status === 1 ? { success: true } : { success: false, error: result.ErrorDetails || 'Cancel failed' });
        } catch (e) {
          resolve({ success: false, error: 'Invalid response' });
        }
      });
    });

    req.on('error', (e) => resolve({ success: false, error: e.message }));
    req.write(data);
    req.end();
  });
}

module.exports = { generateEInvoiceJSON, submitToNIC, cancelEInvoice };
