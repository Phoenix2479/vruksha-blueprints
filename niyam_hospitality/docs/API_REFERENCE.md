# Niyam Hospitality - API Reference

## Phase 2: Advanced Modules

### **Smart Inventory Tracker (`:8921`)**
*   `POST /inventory/usage`: Log item consumption.
*   `POST /inventory/alerts/refill`: Trigger low-stock alerts.

### **Concierge Services (`:8920`)**
*   `POST /requests`: Create a new guest request.
*   `POST /requests/:id/assign`: Route request to staff.
*   `POST /requests/:id/complete`: Close a request.

### **Hospitality Marketing (`:8922`)**
*   `POST /campaigns`: Create a targeted campaign.
*   `GET /campaigns/:id/metrics`: View ROI and engagement.

### **Revenue Management (`:8923`)**
*   `POST /rates/strategy`: Apply dynamic pricing rules.
*   `GET /forecast/demand`: View occupancy predictions.

### **Supplier Compliance (`:8924`)**
*   `POST /suppliers`: Register a new vendor.
*   `PATCH /suppliers/:id/status`: Update compliance status.

---

## Phase 3: Intelligence & Integration

### **Partner Integration Hub (`:8930`)**
*   `POST /integrations`: Onboard an OTA or loyalty partner.
*   `POST /webhooks/:partner_id`: Ingest external events.

### **Guest DNA Engine (`:8931`)**
*   `GET /dna/:guest_id/affinity`: Get AI-scored menu recommendations.

### **Autonomous Ops AI (`:8932`)**
*   `GET /staffing/predict`: AI-driven shift planning.
*   `POST /pricing/optimize`: Real-time menu price adjustments.
*   `POST /energy/control`: IoT-based HVAC/lighting automation.

---

## Core Enhancements (POS)
*   `POST /tickets/:id/split`: Split check logic.
*   `POST /tickets/:id/fire`: Course sequencing (fire appetizer/main).
*   `POST /menu/items/:id/86`: Mark item as sold out.
*   `POST /orders/voice`: Voice-to-order processing.
