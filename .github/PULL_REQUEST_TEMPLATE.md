## What does this PR do?

<!-- Brief description of the change -->

## Module(s) affected

<!-- List module paths, e.g., niyam_retail/docker/my_module or niyam_retail/lite/my_module -->

## Type of change

- [ ] New module
- [ ] Bug fix in existing module
- [ ] Enhancement to existing module
- [ ] Documentation update

## Module type

- [ ] Docker module (`docker/`)
- [ ] Lite module (`lite/`)

## Checklist

### All modules
- [ ] `app.json` is valid (`node tools/validate.js path/to/app.json`)
- [ ] No hardcoded secrets or credentials
- [ ] README included for new modules
- [ ] Tested locally and endpoints respond

### Docker modules
- [ ] Health endpoints implemented (`/healthz`, `/readyz`)
- [ ] NATS events follow naming convention (`vertical.module.entity.action.v1`)

### Lite modules
- [ ] Health endpoint implemented (`/health`)
- [ ] Uses `shared/db.js` for database (not a custom SQLite setup)
- [ ] Events use local EventBus (not NATS)
