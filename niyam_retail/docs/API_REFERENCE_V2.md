# Niyam Retail API Reference (v2.0)

This document details the new endpoints implemented in Phase 2 of the Niyam Retail ecosystem expansion.

---

## 1. Procurement Service (`:8840`)
**Base URL**: `http://localhost:8840`

### **Create Purchase Order**
`POST /purchase-orders`
Creates a new PO, calculating total costs and verifying supplier.
```json
{
  "supplier_id": "uuid",
  "location_id": "uuid",
  "expected_date": "YYYY-MM-DD",
  "items": [
    { "product_id": "uuid", "quantity": 100, "unit_cost": 12.50 }
  ]
}
```

### **Receive Shipment**
`POST /purchase-orders/:id/receive`
Marks PO as received and triggers `retail.procurement.shipment.received` event to update inventory.
```json
{
  "items_received": [
    { "product_id": "uuid", "quantity": 100, "condition": "good" }
  ]
}
```

### **Calculate Landed Cost**
`POST /purchase-orders/:id/landed-cost`
Distributes freight and duty costs across items to determine true unit cost.
```json
{
  "freight": 500.00,
  "duties": 120.00,
  "handling": 50.00
}
```

---

## 2. Workforce Management (`:8850`)
**Base URL**: `http://localhost:8850`

### **Create Shift**
`POST /shifts`
Schedules an employee for a specific location and time block.
```json
{
  "employee_id": "uuid",
  "location_id": "uuid",
  "start_time": "ISO8601",
  "end_time": "ISO8601"
}
```

### **Time Clock**
`POST /time-clock`
Logs employee attendance events.
```json
{
  "employee_id": "uuid",
  "action": "clock_in", // or "clock_out"
  "location_id": "uuid"
}
```

### **Calculate Commission**
`POST /commissions/calculate`
Computes earnings based on POS sales data linked to the employee.
```json
{
  "employee_id": "uuid",
  "period_start": "YYYY-MM-DD",
  "period_end": "YYYY-MM-DD"
}
```

---

## 3. E-commerce Integration (`:8970`)
**Base URL**: `http://localhost:8970`

### **Sync Products**
`POST /sync/products`
Pushes local product catalog to external platforms (Shopify/WooCommerce).
```json
{
  "platform": "shopify",
  "direction": "push_to_web"
}
```

### **Import Orders**
`POST /orders/import`
Pulls recent orders from the web platform into the local transaction system.
```json
{
  "since_date": "ISO8601",
  "status": "paid"
}
```

---

## 4. Compliance & Audit (`:8870`)
**Base URL**: `http://localhost:8870`

### **Verify Age**
`POST /verify-age`
Calculates customer age from DOB and logs the check for regulatory compliance.
```json
{
  "transaction_id": "string",
  "dob": "YYYY-MM-DD"
}
```

### **Track Hazmat**
`POST /hazmat/track`
Updates status of hazardous materials storage.
```json
{
  "item_id": "uuid",
  "location_id": "uuid",
  "status": "stored_safe"
}
```

---

## 5. Mobile Store Ops (`:8880`)
**Base URL**: `http://localhost:8880`

### **Scan Product**
`GET /products/scan/:barcode`
Returns rich product details including current stock and bin location.

### **Cycle Count**
`POST /inventory/count`
Updates physical inventory quantity from the shop floor.
```json
{
  "product_id": "uuid",
  "counted_qty": 45,
  "location_id": "uuid"
}
```

---

## 6. Enhanced Core Services

### **Inventory Management (`:8811`)**
*   `POST /bundles`: Create product kits.
*   `POST /inventory/map-bin`: Assign warehouse locations.
*   `GET /inventory/dead-stock`: Identify slow-moving items.

### **Point of Sale (`:8815`)**
*   `POST /sales/quick`: Fast checkout for non-inventory items.
*   `POST /transactions/:id/pay-split`: Record multiple tender types.
*   `POST /layaways`: Create hold orders with deposits.

### **Billing Engine (`:8812`)**
*   `POST /invoices/recurring`: Setup subscription profiles.
*   `GET /customers/:id/credit-check`: Verify B2B credit limits.

### **CRM (`:8952`)**
*   `GET /customers/:id/clv`: Retrieve Customer Lifetime Value metrics.
*   `POST /tickets`: Create support tickets.
