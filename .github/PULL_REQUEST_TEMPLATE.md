## What does this PR do?

<!-- Brief description of the change -->

## Module(s) affected

<!-- List module paths, e.g., niyam_retail/docker/my_module -->

## Type of change

- [ ] New module
- [ ] Bug fix in existing module
- [ ] Enhancement to existing module
- [ ] Documentation update

## Checklist

- [ ] `app.json` is valid (`node tools/validate.js path/to/app.json`)
- [ ] Health endpoints implemented (`/healthz`, `/readyz`)
- [ ] NATS events follow naming convention (`vertical.module.action.v1`)
- [ ] No hardcoded secrets or credentials
- [ ] README included for new modules
- [ ] Tested locally (`npm start` and endpoints respond)
