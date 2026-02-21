# Contributing to Vruksha Blueprints

Thank you for your interest in contributing! Vruksha blueprints power businesses across retail, hospitality, accounting, and e-commerce. Every module you build helps small and medium businesses run better.

## Prerequisites

- **Node.js** 18+ (required)
- **Bun** (optional, faster alternative to npm)
- **Docker** (required for docker modules only)
- **Git**

## Getting Started

```bash
# 1. Fork and clone
git clone https://github.com/<your-username>/vruksha-blueprints.git
cd vruksha-blueprints

# 2. Install validation tools
cd tools && npm install && cd ..

# 3. Explore existing modules
ls niyam_retail/docker/
ls niyam_retail/lite/

# 4. Validate everything works
cd tools && node validate.js --all
```

## Lite vs Docker: Which Should I Build?

Vruksha supports two module architectures. Choose based on your use case:

| | Docker Module | Lite Module |
|---|---|---|
| **Best for** | Cloud/server deployments, microservices | Desktop/offline-first, single-machine |
| **Database** | PostgreSQL | SQLite (via `shared/db.js`) |
| **Event bus** | NATS | Local EventEmitter (via `shared/eventBus.js`) |
| **UI delivery** | Module Federation (remote entry) | Static build (`/ui/dist`) |
| **Requires Docker** | Yes | No |
| **Complexity** | Higher (infra setup) | Lower (just Node.js) |
| **Dependencies** | pg, nats, jsonwebtoken | express, cors, uuid, sql.js |

**Not sure?** Start with **lite** — it's simpler to develop and test, needs no infrastructure, and can be upgraded to docker later.

## Module Structure

### Docker Module Structure

Every docker module lives under a vertical's `docker/` directory:

```
niyam_retail/docker/your_module/
├── app.json          # REQUIRED - App contract (see below)
├── service.js        # REQUIRED - Backend entrypoint
├── package.json      # Dependencies
├── routes/
│   └── index.js      # Express routes
├── services/
│   └── your_service.js  # Business logic
├── middleware/
│   └── auth.js       # Authentication middleware
├── db/
│   ├── migrations/   # Database schema changes
│   └── seeds/        # Sample data
└── ui/               # Optional frontend
    ├── src/
    ├── package.json
    └── vite.config.ts
```

### Lite Module Structure

Lite modules live under a vertical's `lite/` directory and share utilities:

```
niyam_retail/lite/your_module/
├── app.json          # REQUIRED - App contract (lite conventions)
├── service.js        # REQUIRED - Backend with SQLite + static UI
├── package.json      # @niyam/lite-* naming, minimal deps
├── routes/
│   └── index.js      # Express routes using shared/db
└── ui/               # Optional frontend (static build)
    └── dist/         # Built UI served by service.js
```

Lite modules rely on a `shared/` directory at the vertical level:

```
niyam_retail/lite/shared/
├── db.js               # SQLite database (initDb, query, run, get)
├── eventBus.js         # Local event bus (publish/subscribe)
├── accounting-hook.js  # Fire-and-forget accounting notifications
└── ...                 # Other vertical-specific utilities
```

## The app.json Contract

This is the most important file. It tells the Vruksha server everything about your module.

### Required Fields

```json
{
  "metadata": {
    "id": "your_module_id",
    "name": "Your Module Name",
    "version": "0.1.0",
    "owner": "Your Name",
    "description": "What this module does in one sentence",
    "tags": ["relevant", "tags"],
    "vertical": "retail"
  },
  "runtime": {
    "language": "node",
    "entrypoints": {
      "service": "service.js"
    },
    "port": 8899
  }
}
```

### Recommended Fields (Docker)

```json
{
  "events": {
    "bus": "nats",
    "produces": [
      {
        "name": "order.created",
        "version": "1",
        "subject": "retail.your_module.order.created.v1"
      }
    ],
    "consumes": [
      {
        "name": "payment.completed",
        "version": "1",
        "subject": "retail.billing_engine.payment.completed.v1"
      }
    ]
  },
  "health": {
    "liveness": "/healthz",
    "readiness": "/readyz"
  },
  "depends_on": ["billing_engine"]
}
```

### Lite Module Contract Differences

Lite modules differ from docker in these `app.json` fields:

```json
{
  "runtime": {
    "entrypoints": {
      "service": "service.js",
      "ui": "/ui/dist"
    }
  },
  "events": {
    "bus": "local"
  },
  "health": {
    "liveness": "/health",
    "readiness": "/health"
  },
  "config": {
    "secrets": []
  }
}
```

Key differences:
- **`runtime.entrypoints.ui`**: Points to static build path (`/ui/dist`), not a Module Federation remote
- **`events.bus`**: Set to `"local"` instead of `"nats"`
- **`health`**: Single `/health` endpoint instead of separate `/healthz` and `/readyz`
- **No `NATS_URL`** in `runtime.env` — lite modules don't use NATS
- **No DB secrets** — SQLite is local, no connection strings needed

### Field Reference

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `metadata.id` | string | Yes | Lowercase, underscores only. Must be unique. |
| `metadata.name` | string | Yes | Human-readable display name |
| `metadata.version` | string | Yes | Semantic versioning (e.g., `0.1.0`) |
| `metadata.vertical` | string | Yes | `retail`, `hospitality`, `accounting`, or `ecommerce` |
| `runtime.language` | string | Yes | `node`, `python`, or `rust` |
| `runtime.entrypoints.service` | string | Yes | Path to backend entrypoint |
| `runtime.entrypoints.ui` | string | No | UI path — `/ui/dist` for lite, remote entry for docker |
| `runtime.port` | integer | Yes | See port ranges below |
| `events.bus` | string | No | `nats` (docker) or `local` (lite) |
| `events.produces` | array | No | Events this module emits |
| `events.consumes` | array | No | Events this module listens to |
| `health.liveness` | string | No | Health check endpoint (`/healthz` docker, `/health` lite) |
| `health.readiness` | string | No | Ready check endpoint (`/readyz` docker, `/health` lite) |
| `depends_on` | array | No | Module IDs this module requires |

Full schema: [`schema/app_contract.schema.json`](./schema/app_contract.schema.json)

## NATS Events (Docker)

Docker modules communicate via NATS events. Follow this naming convention:

```
<vertical>.<module_id>.<entity>.<action>.v<version>
```

Examples:
- `retail.billing_engine.invoice.created.v1`
- `hospitality.front_office.checkin.completed.v1`
- `accounting.general_ledger.entry.posted.v1`
- `ecommerce.shopping_cart.item.added.v1`

### Producing Events

```javascript
// In your service
const nats = require('nats');
const nc = await nats.connect({ servers: process.env.NATS_URL });

nc.publish('retail.your_module.order.created.v1', JSON.stringify({
  orderId: '12345',
  timestamp: new Date().toISOString()
}));
```

### Consuming Events

```javascript
const sub = nc.subscribe('retail.billing_engine.payment.completed.v1');
for await (const msg of sub) {
  const data = JSON.parse(msg.data);
  // Handle the event
}
```

## Shared Directory (Lite)

Lite modules share utilities from a `shared/` directory at the vertical level (e.g., `niyam_retail/lite/shared/`). These are imported via relative paths.

### `shared/db.js` — SQLite Database

Provides a shared SQLite database for all lite modules in a vertical.

```javascript
const { initDb, query, run, get } = require('../shared/db');

// Initialize on startup (required before any queries)
await initDb();

// Query rows
const items = query('SELECT * FROM items WHERE status = ?', ['active']);

// Insert/update/delete
run('INSERT INTO items (id, name) VALUES (?, ?)', [id, name]);

// Get single row
const item = get('SELECT * FROM items WHERE id = ?', [id]);
```

Data is stored at `~/.niyam/data/{vertical}/{vertical}.db`.

### `shared/eventBus.js` — Local Event Bus

Provides publish/subscribe without NATS. Events are also logged to SQLite for replay.

```javascript
const { getEventBus } = require('../shared/eventBus');
const bus = getEventBus();

// Publish
await bus.publish('inventory.updated', { productId: '123', quantity: 50 });

// Subscribe
await bus.subscribe('inventory.updated', (event) => {
  console.log('Inventory changed:', event.message);
});
```

### `shared/accounting-hook.js` — Accounting Notifications

Fire-and-forget HTTP hook that notifies the accounting bridge of financial events. Never throws or blocks the caller.

```javascript
const { notifyAccounting } = require('../shared/accounting-hook');

// Fire and forget — safe to call even if accounting bridge is down
notifyAccounting('retail', 'retail.billing.invoice.created', {
  invoice_id: id,
  total_amount: total
});
```

Set `DISABLE_ACCOUNTING_HOOK=true` to disable during development.

## Port Ranges

Each vertical has a reserved port range. Pick an unused port in your vertical's range:

| Vertical | Port Range | Example |
|----------|-----------|---------|
| Retail | 8800 - 8899 | `billing_engine: 8812` |
| Hospitality | 8900 - 8999 | `front_office: 8911` |
| Accounting | 8840 - 8860 | `general_ledger: 8842` |
| E-commerce | 9100 - 9199 | `shopping_cart: 9103` |

Check existing modules in your vertical to find an unused port.

## Health Endpoints

### Docker Modules

Implement two endpoints:

```javascript
// Liveness - "is the process running?"
app.get('/healthz', (req, res) => {
  res.json({ status: 'ok' });
});

// Readiness - "can the process accept requests?"
app.get('/readyz', (req, res) => {
  // Check database, NATS, etc.
  res.json({ status: 'ready' });
});
```

### Lite Modules

Implement a single `/health` endpoint:

```javascript
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'your_module_id', mode: 'lite' });
});
```

## Local Development

### Running a Docker Module

```bash
cd niyam_retail/docker/your_module
npm install
node service.js

# Test health
curl http://localhost:YOUR_PORT/healthz
```

For modules that need a database:

```bash
# Start PostgreSQL locally
docker run -d --name postgres -p 5432:5432 \
  -e POSTGRES_PASSWORD=devpass \
  postgres:16

# Set env and run
DB_PASSWORD=devpass node service.js
```

### Running a Lite Module

No Docker required. Just Node.js:

```bash
cd niyam_retail/lite/your_module
npm install
node service.js

# Test health
curl http://localhost:YOUR_PORT/health
```

Data is stored locally in SQLite at `~/.niyam/data/{vertical}/`. The shared utilities are loaded automatically via relative imports.

## Validation

Always validate before submitting a PR:

```bash
# Validate a single module
node tools/validate.js niyam_retail/docker/your_module/app.json
node tools/validate.js niyam_retail/lite/your_module/app.json

# Validate all modules
cd tools && node validate.js --all
```

The validator checks:
- JSON syntax
- Required fields present
- Semantic version format
- Valid port range
- Event naming conventions
- Schema compliance

## Submitting a Pull Request

1. **Fork** this repository
2. **Create a branch**: `git checkout -b feat/my-new-module`
3. **Build** your module following the structure above
4. **Validate**: `cd tools && node validate.js --all`
5. **Commit**: `git commit -m "feat(retail): add my_new_module"`
6. **Push**: `git push origin feat/my-new-module`
7. **Open a PR** using the PR template

### Commit Message Convention

```
feat(vertical): add module_name
fix(vertical): fix issue in module_name
docs(vertical): update module_name documentation
refactor(vertical): refactor module_name
```

### PR Review Process

1. Automated validation runs on every PR
2. A maintainer reviews the contract and code
3. Feedback is given inline on the PR
4. Once approved, your module is merged

## Creating a New Module (Quick Path)

```bash
# Use the scaffold tool
node tools/scaffold.js

# Follow the prompts:
# Module type: docker (or lite)
# Module ID: my_cool_module
# Display name: My Cool Module
# Vertical: retail
# Port: 8890

# Docker creates: niyam_retail/docker/my_cool_module/
# Lite creates:   niyam_retail/lite/my_cool_module/
```

## API Reference

For details on the Vruksha Server API endpoints relevant to module developers (health, auth, module discovery, catalog browsing, WebSocket events, and more), see the [Module Developer API Reference](./docs/MODULE_DEVELOPER_API.md).

## Code of Conduct

This project follows the [Contributor Covenant Code of Conduct](./CODE_OF_CONDUCT.md). By participating, you agree to uphold this code.

## Security

If you discover a security vulnerability, please see [SECURITY.md](./SECURITY.md). Do NOT open a public issue.

## Questions?

- Open an [Issue](../../issues) for bugs or feature requests
- Start a [Discussion](../../discussions) for questions
