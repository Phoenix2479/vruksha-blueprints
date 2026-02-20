/**
 * E-commerce Email Templates
 * Beautiful, personalized emails for customer purchases
 */

/**
 * Welcome Email - Sent after first purchase
 */
function generateWelcomeEmail(customerName, orderDetails) {
  const { orderNumber, items, total, storeName = 'Our Store' } = orderDetails;

  return `
<!DOCTYPE html>
<html>
<head>
  <style>
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      line-height: 1.6;
      color: #333;
      max-width: 600px;
      margin: 0 auto;
      padding: 20px;
      background-color: #f9f9f9;
    }
    .container {
      background: white;
      border-radius: 12px;
      padding: 40px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    }
    .header {
      text-align: center;
      margin-bottom: 30px;
      padding-bottom: 20px;
      border-bottom: 3px solid #4F46E5;
    }
    .header h1 {
      color: #4F46E5;
      margin: 0;
      font-size: 28px;
    }
    .welcome-message {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 30px;
      border-radius: 8px;
      text-align: center;
      margin-bottom: 30px;
    }
    .welcome-message h2 {
      margin: 0 0 10px 0;
      font-size: 24px;
    }
    .welcome-message p {
      margin: 0;
      font-size: 16px;
      opacity: 0.95;
    }
    .order-details {
      background: #f8f9fa;
      padding: 20px;
      border-radius: 8px;
      margin-bottom: 25px;
    }
    .order-details h3 {
      margin-top: 0;
      color: #4F46E5;
      font-size: 18px;
    }
    .items-list {
      margin: 15px 0;
    }
    .item {
      display: flex;
      justify-content: space-between;
      padding: 12px 0;
      border-bottom: 1px solid #e5e7eb;
    }
    .item:last-child {
      border-bottom: none;
    }
    .item-name {
      font-weight: 500;
      color: #1f2937;
    }
    .item-details {
      color: #6b7280;
      font-size: 14px;
    }
    .total {
      font-size: 20px;
      font-weight: bold;
      color: #4F46E5;
      text-align: right;
      margin-top: 15px;
      padding-top: 15px;
      border-top: 2px solid #e5e7eb;
    }
    .benefits {
      background: #fef3c7;
      border-left: 4px solid #f59e0b;
      padding: 20px;
      margin: 25px 0;
      border-radius: 4px;
    }
    .benefits h3 {
      margin-top: 0;
      color: #92400e;
      font-size: 16px;
    }
    .benefits ul {
      margin: 10px 0 0 0;
      padding-left: 20px;
    }
    .benefits li {
      color: #78350f;
      margin: 8px 0;
    }
    .cta-button {
      display: inline-block;
      background: #4F46E5;
      color: white;
      padding: 14px 30px;
      text-decoration: none;
      border-radius: 6px;
      font-weight: 600;
      margin: 20px 0;
      text-align: center;
    }
    .cta-button:hover {
      background: #4338ca;
    }
    .footer {
      text-align: center;
      margin-top: 40px;
      padding-top: 20px;
      border-top: 1px solid #e5e7eb;
      color: #6b7280;
      font-size: 14px;
    }
    .social-links {
      margin: 20px 0;
    }
    .social-links a {
      display: inline-block;
      margin: 0 10px;
      color: #4F46E5;
      text-decoration: none;
    }
  </style>
</head>
<body>
  <div class="container">
    <!-- Header -->
    <div class="header">
      <h1>🎉 ${storeName}</h1>
    </div>

    <!-- Welcome Message -->
    <div class="welcome-message">
      <h2>Welcome to the Family, ${customerName}! 🎊</h2>
      <p>We're thrilled to have you as part of our community</p>
    </div>

    <!-- Personal Message -->
    <p style="font-size: 16px; line-height: 1.8;">
      Dear <strong>${customerName}</strong>,
    </p>
    <p style="font-size: 16px; line-height: 1.8;">
      Thank you for choosing us for your first purchase! We're honored to be part of your shopping journey. 
      Your trust means everything to us, and we're committed to making every experience with us exceptional.
    </p>

    <!-- Order Details -->
    <div class="order-details">
      <h3>📦 Your Order Details</h3>
      <p><strong>Order Number:</strong> #${orderNumber}</p>
      
      <div class="items-list">
        ${items.map(item => `
          <div class="item">
            <div>
              <div class="item-name">${item.name}</div>
              <div class="item-details">Qty: ${item.quantity} × ₹${item.price.toFixed(2)}</div>
            </div>
            <div style="font-weight: 600;">₹${(item.quantity * item.price).toFixed(2)}</div>
          </div>
        `).join('')}
      </div>

      <div class="total">
        Total: ₹${total.toFixed(2)}
      </div>
    </div>

    <!-- Member Benefits -->
    <div class="benefits">
      <h3>✨ Your Member Benefits</h3>
      <ul>
        <li><strong>10% off</strong> on your next purchase - Use code: <strong>WELCOME10</strong></li>
        <li><strong>Free shipping</strong> on orders over ₹500</li>
        <li><strong>Early access</strong> to sales and new arrivals</li>
        <li><strong>Birthday rewards</strong> - Special gift on your birthday month</li>
        <li><strong>Exclusive deals</strong> just for our family members</li>
      </ul>
    </div>

    <!-- CTA -->
    <div style="text-align: center;">
      <a href="https://yourstore.com/shop" class="cta-button">
        Continue Shopping 🛍️
      </a>
    </div>

    <!-- What's Next -->
    <p style="margin-top: 30px; font-size: 16px; line-height: 1.8;">
      <strong>What happens next?</strong>
    </p>
    <p style="font-size: 15px; line-height: 1.8; color: #6b7280;">
      📧 You'll receive a shipping confirmation email once your order is on its way<br>
      📱 Track your order anytime from your account dashboard<br>
      💬 Our support team is here if you need anything - just reply to this email!
    </p>

    <!-- Footer -->
    <div class="footer">
      <p><strong>Need help?</strong> We're here for you!</p>
      <p>Email: support@yourstore.com | Phone: +91-XXXX-XXXX</p>
      
      <div class="social-links">
        <a href="#">Facebook</a> |
        <a href="#">Instagram</a> |
        <a href="#">Twitter</a>
      </div>

      <p style="margin-top: 20px; font-size: 12px;">
        You're receiving this because you made a purchase at ${storeName}.<br>
        If you have questions, contact us at support@yourstore.com
      </p>
    </div>
  </div>
</body>
</html>
  `;
}

/**
 * Order Confirmation Email
 */
function generateOrderConfirmationEmail(customerName, orderDetails) {
  const { orderNumber, items, total, estimatedDelivery } = orderDetails;

  return `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #4F46E5; color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
    .content { background: white; padding: 30px; border: 1px solid #e5e7eb; }
    .order-summary { background: #f9fafb; padding: 20px; border-radius: 6px; margin: 20px 0; }
    .item { padding: 10px 0; border-bottom: 1px solid #e5e7eb; }
    .total { font-size: 20px; font-weight: bold; text-align: right; margin-top: 15px; color: #4F46E5; }
    .tracking { background: #ecfdf5; border: 1px solid #10b981; padding: 15px; border-radius: 6px; margin: 20px 0; }
  </style>
</head>
<body>
  <div class="header">
    <h1>✅ Order Confirmed!</h1>
    <p>Order #${orderNumber}</p>
  </div>
  
  <div class="content">
    <p>Hi ${customerName},</p>
    <p>Great news! Your order has been confirmed and we're getting it ready for shipment.</p>
    
    <div class="order-summary">
      <h3>Order Summary</h3>
      ${items.map(item => `
        <div class="item">
          <strong>${item.name}</strong> - Qty: ${item.quantity}<br>
          <span style="color: #6b7280;">₹${item.price.toFixed(2)} each</span>
        </div>
      `).join('')}
      <div class="total">Total: ₹${total.toFixed(2)}</div>
    </div>

    <div class="tracking">
      <strong>📅 Estimated Delivery:</strong> ${estimatedDelivery || '3-5 business days'}
    </div>

    <p>We'll send you another email with tracking details once your package ships.</p>
    
    <p>Thank you for shopping with us!</p>
  </div>
</body>
</html>
  `;
}

/**
 * Shipping Notification Email
 */
function generateShippingEmail(customerName, orderDetails) {
  const { orderNumber, trackingNumber, carrier, estimatedDelivery } = orderDetails;

  return `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #10b981; color: white; padding: 30px; text-align: center; }
    .tracking-box { background: #f0fdf4; border: 2px solid #10b981; padding: 20px; margin: 20px 0; text-align: center; border-radius: 8px; }
    .tracking-number { font-size: 24px; font-weight: bold; color: #065f46; margin: 10px 0; letter-spacing: 2px; }
    .track-button { display: inline-block; background: #10b981; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; margin-top: 15px; }
  </style>
</head>
<body>
  <div class="header">
    <h1>📦 Your Order is On Its Way!</h1>
  </div>
  
  <div style="padding: 20px;">
    <p>Hi ${customerName},</p>
    <p>Exciting news! Your order #${orderNumber} has been shipped and is on its way to you.</p>
    
    <div class="tracking-box">
      <p style="margin: 0; color: #065f46;"><strong>Tracking Number</strong></p>
      <div class="tracking-number">${trackingNumber}</div>
      <p style="margin: 10px 0 0 0; color: #047857;">Carrier: ${carrier}</p>
      <p style="margin: 5px 0 0 0; color: #047857;">Estimated Delivery: ${estimatedDelivery}</p>
      
      <a href="https://tracking.example.com/${trackingNumber}" class="track-button">
        Track Your Package
      </a>
    </div>

    <p>You can track your package anytime using the tracking number above.</p>
    <p>Questions? Just reply to this email - we're here to help!</p>
  </div>
</body>
</html>
  `;
}

module.exports = {
  generateWelcomeEmail,
  generateOrderConfirmationEmail,
  generateShippingEmail,
};
