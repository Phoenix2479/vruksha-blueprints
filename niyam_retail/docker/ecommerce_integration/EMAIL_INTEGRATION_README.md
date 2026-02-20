# E-commerce Email Integration

## 🎯 Overview

The E-commerce app now automatically sends **beautiful, personalized emails** to customers when they make purchases. This creates a warm, welcoming experience and builds customer loyalty.

## ✨ Features

### 1. **Welcome Email** 🎉
Sent to **first-time customers** after their very first purchase.

**Includes:**
- Warm welcome message
- Order details with item list
- Member benefits (10% off code: WELCOME10)
- Free shipping info
- Birthday rewards
- Social media links

### 2. **Order Confirmation Email** ✅
Sent to **all customers** immediately after order placement.

**Includes:**
- Order confirmation
- Full order summary
- Estimated delivery time
- Tracking promise

### 3. **Shipping Notification Email** 📦
Sent when the order is shipped.

**Includes:**
- Tracking number (large, easy to copy)
- Carrier information
- Estimated delivery date
- Track package button

## 🚀 How It Works

### Automatic Emails on Order Import

When you import orders from your web store, the system automatically:

1. ✅ Checks if it's the customer's **first order**
2. ✅ Sends **Welcome Email** (if first order) + **Order Confirmation**
3. ✅ Or just **Order Confirmation** (if repeat customer)

**Example API Call:**
```bash
POST http://localhost:8970/orders/import

# Response includes:
{
  "success": true,
  "imported_count": 2,
  "orders": [...],
  "emails_sent": true  ← Confirmation that emails were sent!
}
```

### Manual Shipping Notifications

When you ship an order, send the shipping notification:

```bash
POST http://localhost:8970/orders/ship
Content-Type: application/json

{
  "orderNumber": "WEB-101",
  "customerEmail": "customer@example.com",
  "customerName": "John Doe",
  "trackingNumber": "BD123456789IN",
  "carrier": "Blue Dart",
  "estimatedDelivery": "January 20, 2026"
}
```

## 📧 Email Templates

### Welcome Email Preview
```
┌────────────────────────────────────┐
│     🎉 OUR STORE                   │
├────────────────────────────────────┤
│                                    │
│  Welcome to the Family, John! 🎊   │
│  We're thrilled to have you        │
│                                    │
│  Dear John,                        │
│  Thank you for choosing us...      │
│                                    │
│  📦 Your Order Details             │
│  Order #WEB-101                    │
│  • Premium Widget  ₹59.99          │
│  Total: ₹59.99                     │
│                                    │
│  ✨ Your Member Benefits           │
│  • 10% off next purchase (WELCOME10)│
│  • Free shipping over ₹500         │
│  • Birthday rewards                │
│  • Exclusive deals                 │
│                                    │
│  [Continue Shopping 🛍️]            │
└────────────────────────────────────┘
```

## 🔧 Configuration

### Prerequisites

1. **Email Client Service** must be running (port 8950)
2. At least **one email account** must be connected in Email Client
3. **Environment variable** (optional):
   ```bash
   EMAIL_SERVICE_URL=http://localhost:8950
   ```

### Setup Steps

1. **Start Email Client**
   ```bash
   # Email Client must be running first!
   docker compose up email-client
   ```

2. **Connect Email Account**
   - Open http://localhost:8950
   - Click "Add Account"
   - Configure Gmail, Outlook, or IMAP/SMTP

3. **Start E-commerce App**
   ```bash
   docker compose up retail-ecommerce
   ```

4. **Test It!**
   ```bash
   # Import an order - emails will be sent automatically
   curl -X POST http://localhost:8970/orders/import \
     -H "Content-Type: application/json"
   ```

## 📊 Monitoring

### Check Email Logs

```bash
# In E-commerce service logs, you'll see:
🛒 Processing email notifications for order #WEB-101
   Customer: John Doe (john@example.com)
   First Order: Yes

📧 Sending welcome email to John Doe (john@example.com)
✅ Welcome email sent successfully (Message ID: abc123)

📧 Sending order confirmation to john@example.com
✅ Order confirmation sent (Message ID: def456)

✅ Email notifications completed for order #WEB-101
```

### Email Client Stats

Open http://localhost:8950 to see:
- Total messages sent
- Success rate
- Recent emails

## 🎨 Customization

### Customize Email Templates

Edit `/utils/emailTemplates.js`:

```javascript
// Change store name, colors, benefits, etc.
function generateWelcomeEmail(customerName, orderDetails) {
  const { storeName = 'YOUR STORE NAME' } = orderDetails;
  
  // Customize the HTML template here
  return `...`;
}
```

### Customize Welcome Benefits

```javascript
// In emailTemplates.js, find the benefits section:
<li><strong>10% off</strong> - Use code: <strong>WELCOME10</strong></li>
<li><strong>Free shipping</strong> on orders over ₹500</li>
// Add more benefits here!
```

### Change Email Subject Lines

Edit `/utils/emailNotifications.js`:

```javascript
// Welcome email subject
const subject = `Welcome to the Family, ${customerName}! 🎉`;

// Confirmation email subject
const subject = `Order Confirmed! #${orderDetails.orderNumber}`;

// Shipping email subject
const subject = `Your Order is On Its Way! 📦`;
```

## 🧪 Testing

### Test Welcome Email

```bash
# Simulate a first-time customer order
curl -X POST http://localhost:8970/orders/import \
  -H "Content-Type: application/json" \
  -d '{
    "orders": [{
      "id": "TEST-001",
      "customerEmail": "test@example.com",
      "customerName": "Test Customer",
      "total": 99.99,
      "items": [
        {
          "name": "Test Product",
          "quantity": 1,
          "price": 99.99
        }
      ],
      "isFirstOrder": true
    }]
  }'
```

### Test Shipping Notification

```bash
curl -X POST http://localhost:8970/orders/ship \
  -H "Content-Type: application/json" \
  -d '{
    "orderNumber": "WEB-101",
    "customerEmail": "customer@example.com",
    "customerName": "John Doe",
    "trackingNumber": "BD123456789IN",
    "carrier": "Blue Dart"
  }'
```

## 🔍 Troubleshooting

### "Failed to send email"

**Check:**
1. Is Email Client running? `curl http://localhost:8950/health`
2. Are email accounts connected? `curl http://localhost:8950/api/email/accounts`
3. Check E-commerce logs for detailed error

### "No emails sent"

**Possible causes:**
- Email service URL incorrect
- Email Client not running
- No email accounts configured

**Fix:**
```bash
# Check Email Client
curl http://localhost:8950/health

# Check connected accounts
curl http://localhost:8950/api/email/accounts

# If empty, open http://localhost:8950 and add an account
```

### Emails look broken

**Fix:**
- Most email clients support HTML
- Test in Gmail, Outlook, Apple Mail
- Inline styles are used for compatibility

## 💡 Best Practices

### 1. **Timing**
- **Welcome Email:** Send immediately after first order
- **Confirmation:** Send within 5 minutes of order
- **Shipping:** Send within 1 hour of package handoff

### 2. **Personalization**
- Always use customer's name
- Include specific order details
- Reference their purchase history

### 3. **Mobile-Friendly**
- All templates are responsive
- Large text for readability
- Buttons easy to tap

### 4. **Clear CTAs**
- "Track Your Package" button
- "Continue Shopping" link
- "Contact Support" options

## 📈 Business Impact

### Expected Results

✅ **Increased Customer Satisfaction**
- Customers feel welcomed and valued
- Clear communication builds trust

✅ **Repeat Purchases**
- Welcome discount (WELCOME10) drives second purchase
- Member benefits encourage loyalty

✅ **Reduced Support Tickets**
- Proactive shipping updates
- Clear order confirmations

✅ **Brand Building**
- Professional email design
- Consistent brand voice
- Personal touch

## 🎯 Future Enhancements

Coming soon:
- [ ] Abandoned cart recovery emails
- [ ] Product recommendation emails
- [ ] Review request emails (7 days after delivery)
- [ ] Reorder reminders
- [ ] Birthday emails with special offers
- [ ] Loyalty milestone emails

## 📚 Related Documentation

- [Email Client README](../../../apps/email_client/README.md)
- [Email Integration Guide](../../../apps/email_client/INTEGRATION_GUIDE.md)
- [E-commerce API Documentation](./API_DOCS.md)

---

**Questions?** Check the logs or contact the development team!

**Made with ❤️ for customer delight**
