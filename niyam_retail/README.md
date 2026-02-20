# Niyam Retail Ecosystem - Comprehensive Guide

**The Enterprise Operating System for Modern Retail**

Niyam Retail is a modular, event-driven platform designed to handle every aspect of retail operations—from the point of sale to the supply chain, and from customer loyalty to compliance.

---

## 🏗️ System Modules

The system is composed of 15 core modules, each handling a specific domain:

### 1. Store Operations
*   **Point of Sale (POS)**: Advanced checkout with quick sale, split payments, layaways, and offline mode.
*   **Mobile Store Ops**: Staff app for floor operations (picking, cycle counts, task management).
*   **Workforce Management**: Shift scheduling, time clock, commissions, and performance tracking.

### 2. Inventory & Supply Chain
*   **Inventory Management**: Multi-location stock control, bin mapping, dead stock analysis, and lifecycle tracking.
*   **Procurement**: Purchase orders, supplier scorecards, landed cost calculation, and receiving.
*   **Supply Chain**: (Legacy/Shared) Logistics and shipping integration.

### 3. Customer & Growth
*   **CRM**: 360° customer profiles, CLV analysis, and support ticketing.
*   **Customer Loyalty**: Points, tiers, rewards, and referral programs.
*   **Marketing Automation**: Campaign management and segmentation.

### 4. Finance & Compliance
*   **Billing Engine**: Recurring invoices, tax rules, multi-currency, and reconciliation.
*   **Compliance & Audit**: Age verification, hazmat tracking, and immutable audit logs.
*   **Accounting**: (Integration) Sync to QuickBooks/Xero.

### 5. Channels & Intelligence
*   **E-commerce Bridge**: Bi-directional sync with Shopify/WooCommerce; BOPIS workflows.
*   **Reporting & Analytics**: Real-time dashboards, sales heatmaps, and forecasting.
*   **Advanced Pricing**: Dynamic pricing rules and competitor analysis.

---

## 🚀 Getting Started

### Prerequisites
*   Docker & Docker Compose
*   Node.js 18+

### Launch the Full Ecosystem
```bash
cd /path/to/vruksha_server
./scripts/start_retail_system.sh
```

### Access Points
*   **POS Terminal**: `http://localhost:8815`
*   **Admin Dashboard**: `http://localhost:8801` (Store Mgmt)
*   **Inventory Console**: `http://localhost:8811`
*   **Billing Portal**: `http://localhost:8812`
*   **Procurement**: `http://localhost:8840`
*   **Workforce**: `http://localhost:8850`
*   **Mobile API**: `http://localhost:8880`

---

## 💻 Developer Guide

### Documentation
*   [**Architecture**](docs/RETAIL_ARCHITECTURE.md): System design and data flow.
*   [**API Reference v2**](docs/API_REFERENCE_V2.md): New endpoints for Procurement, Workforce, etc.
*   [**UI/UX Guidelines**](docs/UI_UX_GUIDELINES.md): Design principles for frontend apps.

### Adding a New Feature
1.  **Select the Module**: Identify which manifest (JSON) controls the domain.
2.  **Define Intent**: Add a new intent in the JSON (e.g., `"name": "process_refund"`).
3.  **Implement Handler**: Update the corresponding Python/Node.js handler.
4.  **Update UI**: The frontend will auto-generate forms based on the new intent parameters.

### Event-Driven Architecture
Services communicate via NATS JetStream.
*   **Example**: `POS` publishes `sale.completed`.
    *   `Inventory` subscribes -> Deducts stock.
    *   `Loyalty` subscribes -> Adds points.
    *   `Billing` subscribes -> Generates invoice.
    *   `Workforce` subscribes -> Updates commission.

See `RETAIL_ARCHITECTURE.md` for detailed diagrams.

---

## 🎨 UI/UX Guidelines
We follow strict principles for usability:
*   **Progressive Disclosure**: Don't overwhelm the user.
*   **Keyboard First**: Power users rely on hotkeys.
*   **Dark Mode**: Supported out of the box.

See `UI_UX_GUIDELINES.md` for component standards.

---

## 🛡️ Security & Compliance
*   **Audit Logs**: All critical actions are logged immutably.
*   **RBAC**: Fine-grained permissions per role (Cashier, Manager, Admin).
*   **Data Privacy**: GDPR/CCPA compliant data handling.

---

**Niyam Retail**: Empowering retailers with intelligence and scale.
