# Niyam Hospitality - Architecture

## System Topology

The Niyam Hospitality ecosystem is a distributed microservices architecture designed for high availability and real-time operations in hotels and restaurants.

```
[ Guest App ]   [ Kiosk ]   [ POS Terminals ]   [ OTA Channels ]
      |             |              |                  |
      v             v              v                  v
[ API Gateway (Load Balancer / Ingress) ]
      |
      v
-------------------------------------------------------------------
 CORE OPERATIONS LAYER
-------------------------------------------------------------------
| Front Office (:8911)      | Restaurant POS (:8918)      |
| Property Mgmt (:8916)     | Kitchen Ops (:8920)         |
| Housekeeping (:8922)      | Billing & Payments (:8812)  |
-------------------------------------------------------------------
      |
      v
-------------------------------------------------------------------
 GUEST EXPERIENCE & SERVICES
-------------------------------------------------------------------
| Concierge (:8920)         | Room Service (:89xx)        |
| Guest Portal (:8926)      | Loyalty & CRM (:8951)       |
-------------------------------------------------------------------
      |
      v
-------------------------------------------------------------------
 INTELLIGENCE & AUTOMATION (PHASE 3)
-------------------------------------------------------------------
| Partner Hub (:8930)       | Guest DNA (:8931)           |
| Revenue Mgmt (:8923)      | Ops AI (:8932)              |
| Marketing (:8922)         | Smart Inventory (:8921)     |
-------------------------------------------------------------------
      |
      v
[ NATS JetStream Message Bus ] <----> [ PostgreSQL Cluster ]
```

## Key Data Flows

1.  **Guest Journey**:
    *   Reservation (Front Office) -> Guest DNA (Profile Scoring) -> Marketing (Pre-arrival offer).
    *   Check-in -> Room Service (Welcome amenity) -> Housekeeping (Room status).

2.  **F&B Operations**:
    *   POS Order -> Kitchen Ops (KDS) -> Smart Inventory (Deduction).
    *   Ops AI -> Revenue Mgmt (Dynamic Pricing update) -> POS (Menu update).

3.  **Integration**:
    *   OTA Booking -> Partner Hub -> Front Office.
    *   Supplier Delivery -> Supplier Compliance -> Inventory.

## Service Port Map

| Service | Port | Phase |
| :--- | :--- | :--- |
| **Front Office** | 8911 | 1 |
| **Restaurant POS** | 8918 | 1 |
| **Kitchen Ops** | 8920 | 1 |
| **Housekeeping** | 8922 | 1 |
| **Guest Portal** | 8926 | 1 |
| **Concierge** | 8920 | 2 |
| **Smart Inventory** | 8921 | 2 |
| **Marketing** | 8922 | 2 |
| **Revenue Mgmt** | 8923 | 2 |
| **Supplier Compliance** | 8924 | 2 |
| **Partner Hub** | 8930 | 3 |
| **Guest DNA** | 8931 | 3 |
| **Ops AI** | 8932 | 3 |
