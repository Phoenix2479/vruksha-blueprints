# Your Module Name (Lite)

Brief description of what this module does.

## Setup

```bash
npm install
node service.js
```

No Docker required. Lite modules run directly with Node.js and store data in SQLite.

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | /health | Health check |
| GET | /items | List items |
| POST | /items | Create item |

## Shared Dependencies

Lite modules share utilities from the `shared/` directory in their vertical:

| File | Purpose |
|------|---------|
| `shared/db.js` | SQLite database (init, query, run, get) |
| `shared/eventBus.js` | Local event bus (publish/subscribe without NATS) |
| `shared/accounting-hook.js` | Fire-and-forget accounting event notifications |

These are imported via relative paths (e.g., `require('../shared/db')`).

## Events

### Produces
- (none yet)

### Consumes
- (none yet)

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| PORT | No | Server port (default: from app.json) |
| DISABLE_ACCOUNTING_HOOK | No | Set to `true` to disable accounting notifications |
