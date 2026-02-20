/**
 * E-commerce Email Notifications
 * Automatically send personalized emails for customer purchases
 */

const axios = require('axios');
const { 
  generateWelcomeEmail, 
  generateOrderConfirmationEmail,
  generateShippingEmail 
} = require('./emailTemplates');

const EMAIL_SERVICE_URL = process.env.EMAIL_SERVICE_URL || 'http://localhost:8950';
const TENANT_ID = process.env.TENANT_ID || 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

// Cache for the sender email account
let cachedSenderEmail = null;

/**
 * Get first available email account to use as sender
 */
async function getSenderAccount() {
  if (cachedSenderEmail) {
    return cachedSenderEmail;
  }

  try {
    const response = await axios.get(
      `${EMAIL_SERVICE_URL}/api/email/accounts`,
      {
        headers: {
          'Content-Type': 'application/json',
          'X-Tenant-ID': TENANT_ID
        },
        timeout: 5000
      }
    );

    const accounts = response.data.accounts || [];
    if (accounts.length > 0) {
      cachedSenderEmail = accounts[0].email;
      console.log(`📧 Using sender account: ${cachedSenderEmail}`);
      return cachedSenderEmail;
    }

    console.warn('⚠️ No email accounts configured in Email Client');
    return null;
  } catch (error) {
    console.error('❌ Failed to get sender account:', error.message);
    return null;
  }
}

/**
 * Send email via Email Client service
 */
async function sendEmail(to, subject, htmlBody) {
  try {
    // Get sender account
    const from = await getSenderAccount();
    
    if (!from) {
      return {
        success: false,
        error: 'No email account configured. Please set up an email account in the Email Client first.'
      };
    }

    const response = await axios.post(
      `${EMAIL_SERVICE_URL}/api/email/messages/send`,
      {
        from,  // Now properly included!
        to,
        subject,
        body: htmlBody
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'X-Tenant-ID': TENANT_ID
        },
        timeout: 10000 // 10 second timeout
      }
    );

    return {
      success: true,
      messageId: response.data.messageId
    };
  } catch (error) {
    console.error('❌ Failed to send email:', error.message);
    
    // Clear cache on error in case account was deleted
    if (error.response?.status === 404) {
      cachedSenderEmail = null;
    }
    
    return {
      success: false,
      error: error.response?.data?.error || error.message
    };
  }
}

/**
 * Send Welcome Email - For first-time customers
 * Call this after a customer's FIRST purchase
 */
async function sendWelcomeEmail(customerEmail, customerName, orderDetails) {
  console.log(`📧 Sending welcome email to ${customerName} (${customerEmail})`);
  
  const subject = `Welcome to the Family, ${customerName}! 🎉`;
  const htmlBody = generateWelcomeEmail(customerName, orderDetails);
  
  const result = await sendEmail(customerEmail, subject, htmlBody);
  
  if (result.success) {
    console.log(`✅ Welcome email sent successfully (Message ID: ${result.messageId})`);
  } else {
    console.error(`❌ Welcome email failed: ${result.error}`);
  }
  
  return result;
}

/**
 * Send Order Confirmation Email
 * Call this immediately after order is placed
 */
async function sendOrderConfirmationEmail(customerEmail, customerName, orderDetails) {
  console.log(`📧 Sending order confirmation to ${customerEmail}`);
  
  const subject = `Order Confirmed! #${orderDetails.orderNumber}`;
  const htmlBody = generateOrderConfirmationEmail(customerName, orderDetails);
  
  const result = await sendEmail(customerEmail, subject, htmlBody);
  
  if (result.success) {
    console.log(`✅ Order confirmation sent (Message ID: ${result.messageId})`);
  }
  
  return result;
}

/**
 * Send Shipping Notification
 * Call this when order is shipped
 */
async function sendShippingNotification(customerEmail, customerName, orderDetails) {
  console.log(`📧 Sending shipping notification to ${customerEmail}`);
  
  const subject = `Your Order is On Its Way! 📦`;
  const htmlBody = generateShippingEmail(customerName, orderDetails);
  
  const result = await sendEmail(customerEmail, subject, htmlBody);
  
  if (result.success) {
    console.log(`✅ Shipping notification sent (Message ID: ${result.messageId})`);
  }
  
  return result;
}

/**
 * Handle New Order - Send appropriate emails
 * This is the main function to call when a new order is placed
 */
async function handleNewOrder(orderData) {
  const {
    customerEmail,
    customerName,
    isFirstOrder = false, // Set to true if this is customer's first purchase
    orderNumber,
    items,
    total,
    storeName = 'Our Store'
  } = orderData;

  console.log(`\n🛒 Processing email notifications for order #${orderNumber}`);
  console.log(`   Customer: ${customerName} (${customerEmail})`);
  console.log(`   First Order: ${isFirstOrder ? 'Yes' : 'No'}`);

  const results = {};

  // 1. If first order, send welcome email
  if (isFirstOrder) {
    const welcomeResult = await sendWelcomeEmail(customerEmail, customerName, {
      orderNumber,
      items,
      total,
      storeName
    });
    results.welcome = welcomeResult;
  }

  // 2. Always send order confirmation
  const confirmationResult = await sendOrderConfirmationEmail(customerEmail, customerName, {
    orderNumber,
    items,
    total,
    estimatedDelivery: '3-5 business days'
  });
  results.confirmation = confirmationResult;

  console.log(`\n✅ Email notifications completed for order #${orderNumber}\n`);
  
  return results;
}

/**
 * Check if customer is new (first order)
 * Query your database to check order history
 */
async function isFirstOrder(customerEmail, pool) {
  try {
    const result = await pool.query(
      'SELECT COUNT(*) as order_count FROM pos_transactions WHERE customer_email = $1',
      [customerEmail]
    );
    
    return parseInt(result.rows[0].order_count) === 0;
  } catch (error) {
    console.error('Error checking first order:', error);
    return false; // Assume not first order if check fails
  }
}

module.exports = {
  sendWelcomeEmail,
  sendOrderConfirmationEmail,
  sendShippingNotification,
  handleNewOrder,
  isFirstOrder
};
