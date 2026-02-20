/**
 * Example: Email Receipt Integration in POS
 * This hook makes it easy to email receipts to customers
 */

import { useState } from 'react';
import { emailClient } from '@shared/api/emailClient';

interface Transaction {
  id: string;
  transactionNumber: string;
  customerEmail?: string;
  total: number;
  items: Array<{
    name: string;
    quantity: number;
    price: number;
  }>;
  date: string;
}

export function useEmailReceipt() {
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const sendReceipt = async (transaction: Transaction, customerEmail?: string) => {
    const email = customerEmail || transaction.customerEmail;
    
    if (!email) {
      setError('Customer email is required');
      return { success: false, error: 'Customer email is required' };
    }

    try {
      setSending(true);
      setError(null);
      setSuccess(false);

      // Generate receipt HTML
      const receiptHtml = generateReceiptHtml(transaction);

      // Send via email client
      const result = await emailClient.sendReceipt(
        email,
        receiptHtml,
        transaction.transactionNumber
      );

      if (result.success) {
        setSuccess(true);
        // Auto-reset success after 3 seconds
        setTimeout(() => setSuccess(false), 3000);
        return { success: true, messageId: result.messageId };
      } else {
        setError(result.error || 'Failed to send receipt');
        return { success: false, error: result.error };
      }
    } catch (err: any) {
      const errorMsg = err.message || 'Failed to send receipt';
      setError(errorMsg);
      return { success: false, error: errorMsg };
    } finally {
      setSending(false);
    }
  };

  return {
    sendReceipt,
    sending,
    error,
    success,
  };
}

// Helper function to generate receipt HTML
function generateReceiptHtml(transaction: Transaction): string {
  const { transactionNumber, items, total, date } = transaction;

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { text-align: center; border-bottom: 2px solid #333; padding-bottom: 20px; margin-bottom: 20px; }
        .receipt-info { margin-bottom: 20px; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
        th, td { padding: 10px; text-align: left; border-bottom: 1px solid #ddd; }
        th { background-color: #f5f5f5; font-weight: bold; }
        .total { font-size: 1.2em; font-weight: bold; text-align: right; padding: 20px 0; border-top: 2px solid #333; }
        .footer { text-align: center; color: #666; font-size: 0.9em; margin-top: 30px; }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>Receipt</h1>
        <p>Thank you for your purchase!</p>
      </div>
      
      <div class="receipt-info">
        <p><strong>Transaction #:</strong> ${transactionNumber}</p>
        <p><strong>Date:</strong> ${new Date(date).toLocaleString()}</p>
      </div>

      <table>
        <thead>
          <tr>
            <th>Item</th>
            <th>Quantity</th>
            <th>Price</th>
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          ${items.map(item => `
            <tr>
              <td>${item.name}</td>
              <td>${item.quantity}</td>
              <td>₹${item.price.toFixed(2)}</td>
              <td>₹${(item.quantity * item.price).toFixed(2)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>

      <div class="total">
        Total: ₹${total.toFixed(2)}
      </div>

      <div class="footer">
        <p>This is an electronic receipt. Please save for your records.</p>
        <p>If you have any questions, please contact our support team.</p>
      </div>
    </body>
    </html>
  `;
}

// Example usage in POSMainPage.tsx:
/*
import { useEmailReceipt } from '../hooks/useEmailReceipt';

function CheckoutComponent() {
  const { sendReceipt, sending, error, success } = useEmailReceipt();

  const handleCheckout = async (transaction) => {
    // ... existing checkout logic ...
    
    // Ask if customer wants email receipt
    const customerEmail = prompt('Enter email for receipt (optional):');
    
    if (customerEmail) {
      await sendReceipt(transaction, customerEmail);
    }
  };

  return (
    <div>
      {sending && <p>Sending receipt...</p>}
      {success && <p className="text-green-600">Receipt sent successfully!</p>}
      {error && <p className="text-red-600">{error}</p>}
      
      <Button onClick={handleCheckout}>Complete Sale</Button>
    </div>
  );
}
*/
