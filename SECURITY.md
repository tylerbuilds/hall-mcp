# Security

HALL is designed to be local-first and boringly safe.

## Threat model (v0.1)

Assume:

- Agents can be buggy, overconfident, or adversarial.
- Your repo may contain secrets by accident.
- Local network may include untrusted devices.

Protect:

- Repo contents and credentials
- Local services and tokens
- Your ability to understand what changed and why

## Defaults

- Binds to `127.0.0.1` by default (no LAN exposure)
- Rate limiting enabled
- Helmet headers enabled
- Strict input validation for all mutating endpoints
- No auto-execution of shell commands

## Operator checklist

- Keep HALL behind localhost unless you add auth
- Do not store API keys in the repo
- Consider running in a dedicated user account
- If you expose HALL, add:
  - Authentication
  - CSRF protections for browser clients
  - mTLS or a reverse proxy with access controls

## Reporting

If you open-source HALL later, add a SECURITY policy (CVE process, response time).
