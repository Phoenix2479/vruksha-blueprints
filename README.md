# Vruksha Blueprints

[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![Validate Contracts](https://img.shields.io/badge/contracts-validated-green.svg)](.github/workflows/validate.yml)

**Open-source app modules for the Vruksha ecosystem.**

Vruksha is an App Store for the [Niyam](https://github.com/niyam) desktop client. This repository contains the **blueprints** (app modules) that power businesses across retail, hospitality, accounting, and e-commerce verticals.

## How It Works

```
Vruksha Server (private)          This Repo (public)
========================          ==================
- Distributes apps                - 145+ app modules
- Analytics & recommendations     - App contracts (app.json)
- Module Federation host          - Business logic & UI
                    ↓                       ↑
              Niyam Client           Community builds
              ============           new modules here
              - Runs apps LOCALLY
              - Offline-first
              - Data stays on device
```

Apps are downloaded from Vruksha Server and **run locally** on the user's machine via the Niyam desktop client. No cloud dependency required.

## Verticals

| Vertical | Apps | Description |
|----------|------|-------------|
| [niyam_retail](./niyam_retail/) | 56 | POS, inventory, billing, CRM, analytics, workforce |
| [niyam_hospitality](./niyam_hospitality/) | 56 | Front office, restaurant POS, kitchen ops, housekeeping, events |
| [niyam_accounting](./niyam_accounting/) | 18 | Double-entry ledger, AP/AR, tax (GST/TDS), payroll, budgeting |
| [niyam_ecommerce](./niyam_ecommerce/) | 13 | Product catalog, cart, checkout, shipping, analytics |

## What is a Blueprint?

A blueprint is a self-contained app module with a standardized contract. Each module has:

```
your_module/
├── app.json        # App contract (REQUIRED) - defines metadata, runtime, events
├── service.js      # Backend entrypoint (REQUIRED)
├── package.json    # Dependencies
├── routes/         # Express API routes
├── services/       # Business logic
├── db/             # Database migrations & seeds
└── ui/             # Optional frontend (React + Vite + Tailwind)
```

The `app.json` contract defines everything the Vruksha server needs to know about your module: what it does, what port it runs on, what events it produces/consumes, and what it depends on.

## Quick Start

### Explore existing modules

```bash
git clone https://github.com/<your-username>/vruksha-blueprints.git
cd vruksha-blueprints

# Browse a vertical
ls niyam_retail/docker/

# Look at a module's contract
cat niyam_retail/docker/billing_engine/app.json
```

### Create a new module

```bash
# Use the scaffold tool
node tools/scaffold.js

# Or manually copy a template
cp -r _templates/docker-module/ niyam_retail/docker/my_new_module/
# Edit app.json with your module's details
```

### Validate your module

```bash
cd tools && npm install
node validate.js ../niyam_retail/docker/my_new_module/app.json

# Or validate everything
node validate.js --all
```

### Submit your contribution

1. Fork this repo
2. Create a branch: `git checkout -b feat/my-new-module`
3. Build your module
4. Validate: `node tools/validate.js --all`
5. Open a Pull Request

See [CONTRIBUTING.md](./CONTRIBUTING.md) for the full guide.

## App Contract Schema

The `app.json` contract follows the [Vruksha App Contract Schema](./schema/app_contract.schema.json). Key sections:

| Section | Required | Purpose |
|---------|----------|---------|
| `metadata` | Yes | id, name, version, description, tags, vertical |
| `runtime` | Yes | language (node/python/rust), entrypoints, port |
| `events` | Recommended | NATS event bus - produces/consumes |
| `permissions` | Optional | Resource access declarations |
| `health` | Optional | Liveness/readiness endpoints (default: `/healthz`, `/readyz`) |
| `depends_on` | Optional | Other modules this one requires |
| `ai` | Optional | AI/LLM integration configuration |

## Community

- **Questions?** Open a [Discussion](../../discussions) or [Issue](../../issues)
- **Found a bug?** File a [Bug Report](../../issues/new?template=bug_report.md)
- **Want to build a module?** Check the [New Module template](../../issues/new?template=new_module.md)
- **Security issues?** See [SECURITY.md](./SECURITY.md) (do NOT open public issues)

## License

This project is licensed under the [Apache License 2.0](./LICENSE).

```
Copyright 2026 Vruksha Contributors
```
