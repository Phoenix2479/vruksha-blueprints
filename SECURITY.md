# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in any Vruksha blueprint module, **please do NOT open a public issue**.

Instead, report it through one of these channels:

1. **GitHub Security Advisories** (preferred): Use the "Report a vulnerability" button on the Security tab of this repository
2. **Email**: Contact the maintainers at reddishfirebird@gmail.com

### What to Include

- Description of the vulnerability
- Steps to reproduce
- Which module(s) are affected
- Potential impact

### Response Timeline

- **Acknowledgement**: Within 48 hours
- **Initial assessment**: Within 5 business days
- **Fix or mitigation**: Depends on severity, but we aim for:
  - Critical: 72 hours
  - High: 1 week
  - Medium: 2 weeks
  - Low: Next release

## What Counts as a Security Vulnerability

- Hardcoded secrets, API keys, or tokens in source code
- SQL injection vulnerabilities
- Authentication or authorization bypass
- Path traversal or directory traversal
- Cross-site scripting (XSS) in UI components
- Insecure deserialization
- Dependency vulnerabilities (critical/high severity)

## Security Best Practices for Contributors

When building modules, follow these practices:

1. **Never hardcode secrets** - Use `process.env` for all credentials
2. **Validate all input** - Sanitize user input at API boundaries
3. **Use parameterized queries** - Never concatenate SQL strings
4. **Keep dependencies updated** - Run `npm audit` regularly
5. **Follow least privilege** - Only request permissions your module needs

## Supported Versions

| Version | Supported |
|---------|-----------|
| Latest (main branch) | Yes |
| Older releases | Best effort |
