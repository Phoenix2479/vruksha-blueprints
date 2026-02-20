# E-commerce NATS Event Catalog

All events use the Vruksha envelope format via `publishEnvelope(subject, version, payload)`.

## Event Map

| Subject | Producer | Consumers |
|---------|----------|-----------|
| `ecommerce.product.created.v1` | product_catalog | - |
| `ecommerce.product.updated.v1` | product_catalog | - |
| `ecommerce.product.deleted.v1` | product_catalog | - |
| `ecommerce.cart.updated.v1` | shopping_cart | - |
| `ecommerce.cart.abandoned.v1` | shopping_cart | abandoned_cart_recovery |
| `ecommerce.checkout.completed.v1` | checkout_flow | order_processing |
| `ecommerce.order.created.v1` | order_processing | inventory_sync, customer_accounts, sales_analytics, accounting_bridge |
| `ecommerce.order.fulfilled.v1` | order_processing | shipping_integration |
| `ecommerce.order.refunded.v1` | order_processing | returns_management |
| `ecommerce.payment.captured.v1` | payment_gateway | sales_analytics, accounting_bridge |
| `ecommerce.stock.updated.v1` | inventory_sync | - |
| `ecommerce.stock.alert.v1` | inventory_sync | - |
| `ecommerce.shipment.created.v1` | shipping_integration | - |
| `ecommerce.coupon.redeemed.v1` | discount_coupons | - |
| `ecommerce.review.created.v1` | product_reviews | - |
| `ecommerce.return.created.v1` | returns_management | - |
| `ecommerce.return.approved.v1` | returns_management | - |
| `ecommerce.return.completed.v1` | returns_management | accounting_bridge |

## Flow Diagrams

### Order Flow
```
checkout_flow
    │ publishes: ecommerce.checkout.completed.v1
    ▼
order_processing (consumes checkout.completed)
    │ publishes: ecommerce.order.created.v1
    ├──▶ inventory_sync     (reserves stock)
    ├──▶ customer_accounts  (updates lifetime stats)
    ├──▶ sales_analytics    (updates daily orders)
    └──▶ accounting_bridge  (creates AR + revenue journal entry)
```

### Payment Flow
```
payment_gateway
    │ publishes: ecommerce.payment.captured.v1
    ├──▶ sales_analytics    (updates daily revenue)
    └──▶ accounting_bridge  (creates bank + AR journal entry)
```

### Returns Flow
```
returns_management
    │ publishes: ecommerce.return.completed.v1
    └──▶ accounting_bridge  (creates refund journal entry)

order_processing
    │ publishes: ecommerce.order.refunded.v1
    └──▶ returns_management (marks return as completed)
```

### Cart Recovery Flow
```
shopping_cart
    │ publishes: ecommerce.cart.abandoned.v1
    └──▶ abandoned_cart_recovery (inserts into abandoned_carts table)
```

### Fulfillment Flow
```
order_processing
    │ publishes: ecommerce.order.fulfilled.v1
    └──▶ shipping_integration (auto-creates shipment record)
```
