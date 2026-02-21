# Contributing to Vruksha Blueprints

Thank you for your interest in contributing! Vruksha blueprints power businesses across retail, hospitality, accounting, and e-commerce. Every module you build helps small and medium businesses run better.

## Prerequisites

- **Node.js** 18+ (required)
- **Bun** (optional, faster alternative to npm)
- **Docker** (required for docker modules)
- **Git**

## Getting Started

```bash
# 1. Fork and clone
git clone https://github.com/Phoenix2479/vruksha-blueprints.git
cd vruksha-blueprints

# 2. Install validation tools
cd tools && npm install && cd ..

# 3. Explore existing modules
ls niyam_retail/docker/
cat niyam_retail/docker/billing_engine/app.json

# 4. Validate everything works
cd tools && node validate.js --all
```

## Module Structure

Every module lives under a vertical's `docker/` or `lite/` directory:

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

### Recommended Fields

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

### Field Reference

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `metadata.id` | string | Yes | Lowercase, underscores only. Must be unique. |
| `metadata.name` | string | Yes | Human-readable display name |
| `metadata.version` | string | Yes | Semantic versioning (e.g., `0.1.0`) |
| `metadata.vertical` | string | Yes | `retail`, `hospitality`, `accounting`, or `ecommerce` |
| `runtime.language` | string | Yes | `node`, `python`, or `rust` |
| `runtime.entrypoints.service` | string | Yes | Path to backend entrypoint |
| `runtime.port` | integer | Yes | See port ranges below |
| `events.bus` | string | No | `nats` (docker) or `local` (lite) |
| `events.produces` | array | No | Events this module emits |
| `events.consumes` | array | No | Events this module listens to |
| `health.liveness` | string | No | Health check endpoint (default: `/healthz`) |
| `health.readiness` | string | No | Ready check endpoint (default: `/readyz`) |
| `depends_on` | array | No | Module IDs this module requires |

Full schema: [`schema/app_contract.schema.json`](./schema/app_contract.schema.json)

## NATS Events

Modules communicate via NATS events. Follow this naming convention:

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

Every module should implement these two endpoints:

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

## Local Development

You can run a module standalone without the Vruksha server:

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

## Validation

Always validate before submitting a PR:

```bash
# Validate a single module
node tools/validate.js niyam_retail/docker/your_module/app.json

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
# Module ID: my_cool_module
# Display name: My Cool Module
# Vertical: retail
# Port: 8890

# This creates niyam_retail/docker/my_cool_module/ with all required files
```

## Code of Conduct

This project follows the [Contributor Covenant Code of Conduct](./CODE_OF_CONDUCT.md). By participating, you agree to uphold this code.

## Security

If you discover a security vulnerability, please see [SECURITY.md](./SECURITY.md). Do NOT open a public issue.

## Questions?

- Open an [Issue](../../issues) for bugs or feature requests
- Start a [Discussion](../../discussions) for questions
