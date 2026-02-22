# Vruksha Blueprints

[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![Validate Contracts](https://img.shields.io/badge/contracts-validated-green.svg)](.github/workflows/validate.yml)

**Open-source app modules for the Vruksha ecosystem.**

This repository contains **145+ blueprints** (app modules) that run inside the [Niyam](https://github.com/niyam) desktop platform — powering businesses across retail, hospitality, accounting, and e-commerce.

---

## About the Platform

### Niyam

**Niyam** is a desktop ERP platform for small and medium businesses. It runs on your machine, works offline, and keeps all business data local — no cloud subscriptions, no vendor lock-in, no data leaving your device without your say-so.

Users interact with Niyam through a natural language interface — they can ask things like "How many canvas bags do I have?" or "Show me today's check-ins" and the platform routes the request to the right module. If the module isn't installed yet, Niyam guides the user to find and install it.

### Vruksha

**Vruksha** is Niyam's app catalog — think of it as the app store. It manages the full lifecycle of modules: discovery, distribution, installation, and updates. Modules in this repo get picked up by the Vruksha server and made available to Niyam users.

### How It Fits Together

```
This Repo (public)              Vruksha Server              Niyam Client
==================              ==============              ============
You build a module    ──→    Catalog & distribution   ──→   User installs
Community contributes        Signed & verified               Runs LOCALLY
145+ app modules             Module discovery                Offline-first
                                                             Data on device
```

Modules are signed before distribution and verified on install. Users see what permissions a module needs before installing it — nothing runs without explicit consent.

### Two Editions

Niyam ships in two editions, and modules can target either or both:

| | **Niyam Pro Max** | **Niyam Max Lite** |
|---|---|---|
| **Target users** | Technical teams, server deployments | Non-technical users, single machine |
| **Module type** | Docker (`niyam_*/docker/`) | Lite (`niyam_*/lite/`) |
| **Database** | PostgreSQL | SQLite |
| **Event bus** | NATS | Local EventEmitter |
| **Infrastructure** | Docker required | Nothing — just download and run |

**For contributors:** Start with **lite** — simpler to develop, no infrastructure needed. Both share the same `app.json` contract, so a lite module can be adapted to docker later.

---

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
└── ui/             # Optional frontend (React + Vite + Tailwind)
```

The `app.json` contract defines everything the Vruksha server needs to know about your module: what it does, what port it runs on, what events it produces/consumes, and what it depends on.

## Quick Start

### Explore existing modules

```bash
git clone https://github.com/<your-username>/vruksha-blueprints.git
cd vruksha-blueprints

# Browse docker modules
ls niyam_retail/docker/

# Browse lite modules
ls niyam_retail/lite/

# Look at a module's contract
cat niyam_retail/docker/billing_engine/app.json
cat niyam_retail/lite/billing_engine/app.json
```

### Create a new module

```bash
# Use the scaffold tool (supports both docker and lite)
node tools/scaffold.js

# Or manually copy a template
cp -r _templates/docker-module/ niyam_retail/docker/my_new_module/
cp -r _templates/lite-module/ niyam_retail/lite/my_new_module/
# Edit app.json with your module's details
```

### Validate your module

```bash
cd tools && npm install
node validate.js ../niyam_retail/docker/my_new_module/app.json
node validate.js ../niyam_retail/lite/my_new_module/app.json

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
| `events` | Recommended | Event bus — `nats` (docker) or `local` (lite) |
| `permissions` | Optional | Resource access declarations |
| `health` | Optional | Health endpoints — `/healthz`+`/readyz` (docker) or `/health` (lite) |
| `depends_on` | Optional | Other modules this one requires |
| `ai` | Optional | AI/LLM integration configuration |

## API Reference

For details on the Vruksha Server API endpoints relevant to module developers, see the [Module Developer API Reference](./docs/MODULE_DEVELOPER_API.md).

## Community

- **Questions?** Open a [Discussion](../../discussions) or [Issue](../../issues)
- **Found a bug?** File a [Bug Report](../../issues/new?template=bug_report.md)
- **Want to build a module?** Check the [New Module template](../../issues/new?template=new_module.md)
- **Security issues?** See [SECURITY.md](./SECURITY.md) (do NOT open public issues)

## License

This project is licensed under the [Apache License 2.0](./LICENSE).

```
Copyright 2026 Dinki ( reddishfirebird@gmail.com )
```
