# Update for Niyam Foundational App – 13 Oct

## Newly Published Hospitality Modules
- `qsr_drivethrough_queue` – Dual-lane drive-through orchestration (queueing, station routing, promise times).
- `aggregator_order_gateway` – Marketplace/delivery ingress with status synchronisation and platform health telemetry.
- `beverage_tab_manager` – Bar tab lifecycle (open/close tabs, pour tracking, ID checks, settlements).

Each module ships with manifests, controllers, strings, and JSON datastores; available immediately through the existing module download API. Hospitality suite now totals **45 modules** (`config/niyam_hospitality_modules.json`).

## Documentation & Coverage
- Hospitality README now includes a service coverage matrix mapping full-service dining, QSR, cloud kitchens, cafés, and bars to corresponding module bundles.
- `modules/QUICK_REFERENCE.md` lists the three new modules for provisioning workflows.

## Security & Distribution Notes
- Modules continue to be SHA-256 signed; ModuleManager enforces signature/expiry checks and references the trusted signer registry.
- CLI utilities (`scripts/sign_module.js`, `scripts/verify_module.js`, `scripts/create_module.js`, `scripts/run_tests.js`) all support the new modules without additional configuration.

## Observability & Operations
- Existing Prometheus metrics, alert service (`/api/alerts`), and diagnostics endpoint (`/api/diagnostics`) capture drive-through, aggregator, and bar module activity.
- Ops scripts (`ops/backup.sh`, `ops/snapshot.sh`, `ops/signature_log_report.js`) require no changes.

## Base App Action Items
1. Refresh the module catalogue so the new IDs surface in the Niyam marketplace UI.
2. Validate the new intents (drive-through queue, marketplace status, bar tab workflows) in staging.
3. Coordinate UI updates for drive-through boards, aggregator dashboards, and bar tab management if exposing the new capabilities.

## Optional Next Steps
- Provide scripted module pulls for automated testing environments.
- Supply frontend mock data samples for drive-through and bar workflows on request.
