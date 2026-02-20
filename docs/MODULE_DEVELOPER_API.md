# Module Developer API Reference

This document covers the Vruksha Server API endpoints relevant to module developers and contributors. For the full admin API, see the private dev repository.

> **Base URL:** `http://localhost:8700` (default development port)

---

## Table of Contents

- [Response Format](#response-format)
- [Health & Version](#health--version)
- [Authentication](#authentication)
- [Module Discovery](#module-discovery)
- [App Catalog](#app-catalog)
- [Catalog Browsing](#catalog-browsing)
- [WebSocket Events](#websocket-events)
- [Docker vs Lite: Integration Differences](#docker-vs-lite-integration-differences)
- [Port Ranges](#port-ranges)
- [Health Check Requirements](#health-check-requirements)
- [NATS Event Conventions](#nats-event-conventions)

---

## Response Format

All API responses follow one of these formats:

### Success

```json
{
  "success": true,
  "data": { ... }
}
```

### Error

```json
{
  "success": false,
  "error": {
    "code": "ERR_CODE",
    "message": "Human readable description"
  }
}
```

### Paginated

```json
{
  "success": true,
  "data": [ ... ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 150
  }
}
```

---

## Health & Version

These endpoints require no authentication and are used by clients to check server availability.

### `GET /ping`

Simple liveness check.

```
Response: { "status": "ok", "timestamp": "..." }
```

### `GET /health`

Server health with feature flags.

```
Response: { "status": "healthy", "features": [...], "uptime": 12345 }
```

### `GET /api/version`

Server version and build information.

```
Response: {
  "success": true,
  "data": {
    "version": "1.0.0",
    "build": "abc1234",
    "node": "v18.17.0"
  }
}
```

### `GET /api/version/check`

Check if a client version needs updating.

```
Query: ?version=1.0.0
Response: {
  "success": true,
  "data": {
    "current": "1.2.0",
    "minimum": "1.0.0",
    "updateAvailable": true
  }
}
```

---

## Authentication

Vruksha uses Ed25519 instance-based authentication. Each Niyam client generates a keypair and registers its public key.

### `POST /auth/register`

Register a new Niyam instance.

```json
// Request
{
  "instanceId": "unique-instance-id",
  "publicKey": "base64-encoded-ed25519-public-key",
  "hostname": "user-machine-name"
}

// Response
{
  "success": true,
  "data": {
    "instanceId": "unique-instance-id",
    "registered": true
  }
}
```

### `POST /auth`

Authenticate with a signed challenge.

```json
// Request
{
  "instanceId": "unique-instance-id",
  "signature": "base64-encoded-signature",
  "timestamp": "2026-01-15T10:30:00.000Z"
}

// Response
{
  "success": true,
  "data": {
    "token": "session-token",
    "expiresIn": 86400
  }
}
```

---

## Module Discovery

### `GET /modules`

Public module catalog for Niyam Lite clients. No authentication required.

```
Response: {
  "status": "success",
  "modules": [
    {
      "id": "billing_engine",
      "name": "Billing Engine",
      "version": "1.0.0",
      "vertical": "retail",
      "description": "...",
      "tags": [...]
    }
  ]
}
```

### `GET /api/modules/catalog`

Deduplicated module catalog with metadata.

```
Query: ?vertical=retail&tag=billing
Response: {
  "success": true,
  "data": {
    "modules": [...],
    "total": 42
  }
}
```

### `GET /api/modules/{id}/manifest`

Get a specific module's manifest (app.json contract). Supports ETag caching.

```
Response: {
  "success": true,
  "data": {
    "id": "billing_engine",
    "name": "Billing Engine",
    "version": "1.0.0",
    "runtime": { ... },
    "events": { ... }
  }
}
```

### `GET /api/modules/{id}/download`

Download a module as a tarball. Returns `application/gzip`.

```
Response: Binary (tar.gz)
Headers: Content-Disposition: attachment; filename="billing_engine-1.0.0.tar.gz"
```

### `POST /api/modules/install`

Batch install modules by ID.

```json
// Request
{
  "modules": ["billing_engine", "inventory_management"],
  "vertical": "retail"
}

// Response
{
  "success": true,
  "data": {
    "installed": ["billing_engine", "inventory_management"],
    "failed": []
  }
}
```

---

## App Catalog

### `GET /api/apps`

List all registered apps.

```
Response: {
  "status": "success",
  "apps": [...],
  "count": 180
}
```

### `GET /api/apps/catalog`

Modules with blueprint context and richer metadata.

```
Query: ?vertical=retail
Response: {
  "success": true,
  "data": { "apps": [...] }
}
```

### `GET /api/apps/registry`

Full app registry (mirrors `blueprints.lock.json`).

```
Response: {
  "success": true,
  "data": { "apps": {...}, "generated": "..." }
}
```

### `GET /api/apps/recommend`

App recommendations based on business type.

```
Query: ?businessType=restaurant&vertical=hospitality
Response: {
  "success": true,
  "data": {
    "recommended": [...],
    "starterKit": "hospitality_starter"
  }
}
```

### `GET /api/apps/{appId}/contract`

Get an app's full contract (app.json).

```
Response: {
  "success": true,
  "data": { ... }  // Full app.json content
}
```

### `GET /api/apps/{appId}/download`

Download an app tarball.

```
Response: Binary (tar.gz or zip)
```

---

## Catalog Browsing

These endpoints provide structured catalog navigation.

### `GET /api/catalog`

Browse the catalog with filters.

```
Query: ?vertical=retail&category=billing&page=1&limit=20
Response: {
  "success": true,
  "data": [...],
  "pagination": { "page": 1, "limit": 20, "total": 42 }
}
```

### `GET /api/catalog/verticals`

List all available verticals.

```
Response: {
  "success": true,
  "data": ["retail", "hospitality", "accounting", "ecommerce"]
}
```

### `GET /api/catalog/categories`

List all available categories.

```
Response: {
  "success": true,
  "data": ["billing", "inventory", "pos", "crm", ...]
}
```

### `GET /api/catalog/app/{appId}`

Get detailed information about a single app.

```
Response: {
  "success": true,
  "data": {
    "id": "billing_engine",
    "name": "Billing Engine",
    "vertical": "retail",
    "version": "1.0.0",
    "description": "...",
    "runtime": { ... }
  }
}
```

### `GET /api/catalog/bundles`

List app bundles (curated groups).

```
Response: {
  "success": true,
  "data": [
    { "id": "retail_starter", "name": "Retail Starter Kit", "apps": [...] }
  ]
}
```

---

## WebSocket Events

Vruksha supports real-time updates via WebSocket.

### Connection

```
ws://localhost:8700/ws?token=<auth_token>
```

Or use the `Authorization: Bearer <token>` header.

### Event Types

**`connection_established`** — Sent on successful connection.

```json
{ "type": "connection_established", "timestamp": "..." }
```

**`module_event`** — Module lifecycle events:

```json
{
  "type": "module_event",
  "data": {
    "event": "download_progress",  // download_started | download_progress | download_complete | module_installed
    "moduleId": "billing_engine",
    "progress": 75
  },
  "timestamp": "..."
}
```

**`execution_update`** — Blueprint execution progress:

```json
{
  "type": "execution_update",
  "data": {
    "executionId": "...",
    "step": 3,
    "totalSteps": 5,
    "status": "running"
  },
  "timestamp": "..."
}
```

### Heartbeat

The server sends a ping every 30 seconds. Clients must respond with pong to maintain the connection.

---

## Docker vs Lite: Integration Differences

When building modules, the architecture you choose affects how your module integrates with the platform:

| Aspect | Docker Module | Lite Module |
|--------|--------------|-------------|
| **Event bus** | NATS (`bus: "nats"`) | Local EventEmitter (`bus: "local"`) |
| **Database** | PostgreSQL (via connection string) | SQLite via `shared/db.js` |
| **UI delivery** | Module Federation (remote entry) | Static build (`/ui/dist`) |
| **Health endpoints** | `/healthz` + `/readyz` | `/health` (single endpoint) |
| **Dependencies** | pg, nats, jsonwebtoken | express, cors, uuid, sql.js |
| **Requires Docker** | Yes | No |
| **Shared utilities** | None (self-contained) | `shared/db.js`, `shared/eventBus.js`, `shared/accounting-hook.js` |
| **Package naming** | `your-module-id` | `@niyam/lite-your-module-id` |
| **NATS_URL env** | Required | Not used |

### Event Publishing

**Docker (NATS):**
```javascript
const nats = require('nats');
const nc = await nats.connect({ servers: process.env.NATS_URL });
nc.publish('retail.billing.invoice.created.v1', JSON.stringify(data));
```

**Lite (EventBus):**
```javascript
const { getEventBus } = require('../shared/eventBus');
const bus = getEventBus();
await bus.publish('retail.billing.invoice.created', data);
```

---

## Port Ranges

Each vertical has a reserved port range. Pick an unused port within your vertical's range:

| Vertical | Port Range |
|----------|-----------|
| Retail | 8800 - 8899 |
| Hospitality | 8900 - 8999 |
| Accounting | 8840 - 8860 |
| E-commerce | 9100 - 9199 |

The Vruksha server itself runs on port **8700**.

---

## Health Check Requirements

### Docker Modules

Implement two endpoints:

```javascript
app.get('/healthz', (req, res) => res.json({ status: 'ok' }));
app.get('/readyz', (req, res) => res.json({ status: 'ready' }));
```

### Lite Modules

Implement a single endpoint:

```javascript
app.get('/health', (req, res) => res.json({ status: 'ok', service: 'your_module_id', mode: 'lite' }));
```

---

## NATS Event Conventions

Events follow a dot-delimited naming pattern:

```
<vertical>.<module_id>.<entity>.<action>.v<version>
```

Examples:
- `retail.billing_engine.invoice.created.v1`
- `hospitality.front_office.checkin.completed.v1`
- `accounting.general_ledger.entry.posted.v1`
- `ecommerce.shopping_cart.item.added.v1`

Lite modules using the local EventBus follow the same naming convention (without the version suffix).
