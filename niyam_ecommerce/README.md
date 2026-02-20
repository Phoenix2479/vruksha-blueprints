# Niyam E-commerce

Complete e-commerce suite covering storefront, operations, payments, marketing, customer experience, and analytics. Built for the Vruksha app platform.

## Module Catalog

| Module | Port (Docker) | Port (Lite) | Description |
|--------|:---:|:---:|-------------|
| Product Catalog | 9101 | 9151 | Products, categories, variants, search |
| Shopping Cart | 9102 | 9152 | Cart management, persistence |
| Checkout Flow | 9103 | 9153 | Multi-step checkout process |
| Order Processing | 9104 | 9154 | Order lifecycle, fulfillments, refunds |
| Customer Accounts | 9105 | 9155 | Profiles, addresses, wishlists, loyalty |
| Payment Gateway | 9106 | 9156 | Payment processing, multi-provider |
| Inventory Sync | 9107 | 9157 | Stock levels, reservations, alerts |
| Shipping Integration | 9108 | 9158 | Carriers, shipments, tracking, rates |
| Discount Coupons | 9109 | 9159 | Coupon management and validation |
| Abandoned Cart Recovery | 9110 | 9160 | Cart detection, recovery templates |
| Product Reviews | 9111 | 9161 | Reviews, ratings, moderation |
| Sales Analytics | 9112 | 9162 | KPIs, trends, product performance |
| Returns Management | 9113 | 9163 | Returns, refunds, exchanges |

## Architecture

```
Docker Tier (Production)          Lite Tier (Offline/Desktop)
═══════════════════════           ══════════════════════════
PostgreSQL + NATS                 SQLite (embedded)
13 microservices                  13 single-file modules
Event-driven (NATS pub/sub)      Local event bus
Prometheus + Grafana              Lightweight logging
```

## Quick Start

### Docker (Production)
```bash
cd docker/ecommerce
cp .env.example .env  # Set DB_PASSWORD, JWT_SECRET
docker compose up -d
```

### Lite (Development)
```bash
cd blueprints/niyam_ecommerce/lite
node product_catalog/service.js
```

## NATS Event Flow

See [docker/EVENTS.md](docker/EVENTS.md) for the complete event catalog.

Key flows:
```
checkout.completed ──> order_processing (creates order)
                   ──> order.created ──> inventory_sync (reserves stock)
                                     ──> customer_accounts (updates stats)
                                     ──> sales_analytics (updates KPIs)
                                     ──> accounting bridge (journal entry)

order.fulfilled ──> shipping_integration (creates shipment)

cart.abandoned ──> abandoned_cart_recovery (tracks cart)

payment.captured ──> sales_analytics (updates revenue)
                 ──> accounting bridge (journal entry)

return.completed ──> accounting bridge (refund entry)
```

## API Reference

Each module exposes RESTful APIs under `/api/`:

| Module | Key Endpoints |
|--------|---------------|
| Product Catalog | `GET/POST /api/products`, `GET/POST /api/categories` |
| Shopping Cart | `GET/POST /api/cart`, `POST /api/cart/items` |
| Checkout Flow | `POST /api/checkout`, `POST /api/checkout/:id/complete` |
| Order Processing | `GET/POST /api/orders`, `PATCH /api/orders/:id/status` |
| Customer Accounts | `GET/POST /api/customers`, `GET/POST /api/customers/:id/addresses` |
| Payment Gateway | `POST /api/payments/create`, `POST /api/payments/:id/capture` |
| Inventory Sync | `GET/PUT /api/stock`, `POST /api/reservations` |
| Shipping Integration | `GET/POST /api/shipments`, `POST /api/rates/calculate` |
| Discount Coupons | `GET/POST /api/coupons`, `POST /api/coupons/validate` |
| Abandoned Cart Recovery | `GET /api/abandoned`, `POST /api/recovery/trigger` |
| Product Reviews | `GET/POST /api/reviews`, `POST /api/reviews/:id/moderate` |
| Sales Analytics | `GET /api/dashboard/kpis`, `GET /api/analytics/trends` |
| Returns Management | `GET/POST /api/returns`, `POST /api/returns/:id/exchange` |

All endpoints support `X-Tenant-ID` header for multi-tenancy. Health checks at `/healthz` and `/readyz`.
