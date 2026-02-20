# Niyam Accounting

Complete accounting system with Indian GST/TDS compliance, double-entry bookkeeping, and financial reporting. Designed for the Vruksha app platform.

## Module Catalog

### Core Modules (Phase 1)

| Module | Port (Docker) | Port (Lite) | Description |
|--------|:---:|:---:|-------------|
| Chart of Accounts | 8841 | 8851 | Account hierarchy, types, trial balance |
| General Ledger | 8842 | 8852 | Double-entry postings and balance queries |
| Journal Entries | 8843 | 8853 | Create, post, and reverse journal entries |
| Bank Reconciliation | 8840 | 8854 | Transaction import, matching, reconciliation |
| Tax Engine | 8844 | 8855 | GST, TDS, tax codes, return filing |
| Accounts Payable | 8845 | 8856 | Vendors, bills, payments, AP aging |
| Accounts Receivable | 8846 | 8857 | Customers, invoices, receipts, AR aging |
| Financial Reports | 8847 | 8858 | Balance sheet, P&L, cash flow |
| Fiscal Periods | 8848 | 8859 | Fiscal years, periods, cost centers |
| Integration Bridge | 8849 | 8860 | Cross-stack event bridge (retail/hospitality/ecommerce) |

### Extended Modules (Phase 2/3)

| Module | Port (Docker) | Port (Lite) | Description |
|--------|:---:|:---:|-------------|
| Voucher Entry | 8850 | 8861 | Multi-type voucher creation |
| Purchase Orders | 8851 | 8901 | PO creation and approval workflows |
| Expense Claims | 8852 | 8902 | Employee expense submission and reimbursement |
| Payroll | 8853 | 8903 | Salary processing and statutory deductions |
| Inventory Valuation | 8854 | 8904 | FIFO, LIFO, weighted average valuation |
| Project Costing | 8855 | 8905 | Cost tracking and allocation |
| Fixed Assets | 8856 | 8906 | Asset register and depreciation |
| Budgeting | 8857 | 8907 | Budget planning and variance analysis |

## India Compliance

- **GST**: CGST/SGST/IGST calculation, HSN codes, e-invoice generation, GSTR filing
- **TDS**: Section-wise TDS rates, challan generation, Form 26Q
- **e-Way Bill**: Auto-generation for inter-state movement
- **Indian CoA**: Pre-loaded chart of accounts following Indian standards

## Architecture

```
Docker Tier (Production)          Lite Tier (Offline/Desktop)
═══════════════════════           ══════════════════════════
PostgreSQL + NATS                 SQLite (embedded)
18 microservices                  18 single-file modules
Event-driven (NATS pub/sub)      Local event bus
Prometheus metrics                Lightweight logging
Integration bridge                accounting-hook.js
```

## Quick Start

### Docker (Production)
```bash
cd docker/accounting
cp .env.example .env  # Set DB_PASSWORD, JWT_SECRET
docker compose up -d
```

### Lite (Development)
```bash
cd blueprints/niyam_accounting/lite
node accounting_chart_of_accounts/service.js
```

## Integration Bridge

The integration bridge connects accounting to other Vruksha verticals via NATS events:

| Source | Event | Accounting Action |
|--------|-------|-------------------|
| Retail Billing | `retail.billing.invoice.created.v1` | Create AR + Revenue journal entry |
| Retail Billing | `retail.billing.payment.received.v1` | Create Cash/Bank + AR journal entry |
| Retail POS | `retail.pos.sale.completed.v1` | Create Cash + Revenue + COGS entries |
| Hospitality | `hospitality.billing.payment_received.v1` | Create Cash/Bank payment entry |
| Hospitality | `hospitality.front_office.checked_out.v1` | Create folio AR entry |
| Restaurant | `restaurant.order.paid.v1` | Create F&B revenue entry |
| Ecommerce | `ecommerce.order.created.v1` | Create AR + Revenue entry |
| Ecommerce | `ecommerce.payment.captured.v1` | Create Bank + AR entry |
| Ecommerce | `ecommerce.return.completed.v1` | Create Refund + Bank entry |

## Shared Utilities

Located in `docker/shared/` and `lite/shared/`:
- `csv-generator.js` - CSV export for all modules
- `pdf-generator.js` - PDF report generation
- `auth.js` - JWT authentication middleware
- `db.js` (lite) - SQLite database wrapper
- `accounting-hook.js` (lite) - Local accounting event bus
