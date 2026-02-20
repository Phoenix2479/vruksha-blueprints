# Niyam Hospitality Ecosystem

**The comprehensive operating system for hotels, resorts, and restaurant chains.**

---

## 🌍 System Overview

Niyam Hospitality provides a unified platform to manage the entire guest journey—from reservation to check-out—integrated with back-of-house operations like kitchen production, inventory, and workforce management.

### Key Domains

1.  **Front Office & Reservations**: Check-in/out, room assignment, waitlist management.
2.  **Restaurant & Bar POS**: Table service, coursing, split checks, voice ordering.
3.  **Kitchen & Inventory**: Smart prep lists, waste tracking, predictive restocking.
4.  **Guest Experience**: Concierge ticketing, room service, loyalty & CRM.
5.  **Corporate Management**: Revenue optimization, multi-property analytics, compliance.

---

## 🚀 Services & Ports

| Service | Port | Description |
| :--- | :--- | :--- |
| **Property Mgmt** | `:8910` | Room inventory, rate plans, property config |
| **Front Office** | `:8911` | Reservations, check-in, guest folio |
| **Housekeeping** | `:8912` | Room status, cleaning schedules, maintenance |
| **Restaurant POS** | `:8918` | Table orders, KOTs, billing |
| **Kitchen Ops** | `:8913` | KDS, prep lists, waste logs |
| **Concierge** | `:8928` | Guest requests, bookings, transport |
| **Smart Inventory** | `:8921` | Real-time stock tracking, auto-refill |
| **Marketing** | `:8929` | Campaigns, upsells, guest segments |
| **Revenue Mgmt** | `:8923` | Dynamic pricing, forecasting |
| **Supplier Compliance** | `:8924` | Vendor scoring, audit tracking |
| **Partner Hub** | `:8930` | OTA integrations, 3rd-party APIs (Phase 3) |
| **Guest DNA** | `:8931` | AI-driven affinity scores & personalization (Phase 3) |
| **Ops AI** | `:8932` | Autonomous staffing & energy control (Phase 3) |

---

## 🛠️ Getting Started

### Prerequisites
*   Docker & Docker Compose
*   Node.js 18+

### Launch the Ecosystem
```bash
cd /path/to/vruksha_server
docker-compose -f docker-compose.hospitality.yml up -d --build
```

### Access Points
*   **Front Desk**: `http://localhost:8911`
*   **Restaurant POS**: `http://localhost:8918`
*   **Kitchen Display**: `http://localhost:8913`
*   **Concierge Console**: `http://localhost:8928`
*   **Guest DNA Engine**: `http://localhost:8931`

---

## 📚 Documentation

*   [**Architecture**](docs/HOSPITALITY_ARCHITECTURE.md): System design and data flow.
*   [**API Reference**](docs/API_REFERENCE.md): detailed endpoints.
*   [**Manifests**](modules/): JSON definitions for all 47 modules.
