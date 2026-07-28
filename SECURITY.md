# Security & secrets policy

This repository is **credential-free**. No workspace IDs, model IDs, tenant IDs, endpoints, keys,
connection strings, or resource IDs are committed. Reviewers reject any PR that adds them.

## What is a secret / environment-specific value here

| Value | Where it belongs | Committed? |
|---|---|---|
| Fabric workspace ID, semantic model item ID | `app/fabric.yaml` | ❌ git-ignored |
| Tenant ID, app item ID, publishable key | `.env.local` / deploy config | ❌ git-ignored |
| `VITE_DATA_AGENT_URL`, `VITE_DATA_AGENT_KEY` | `.env.local` | ❌ git-ignored |
| `VITE_TAG_WRITER_URL`, `VITE_TAG_WRITER_KEY` | `.env.local` | ❌ git-ignored |
| Function app settings (subscription ID, scopes) | Function app config / `local.settings.json` | ❌ git-ignored |
| RayFin deployment state | `rayfin/.deployments.json`, `fabric.generated.ts` | ❌ git-ignored |

Only the **`*.example`** templates (with placeholders) are committed.

## How config reaches the app without being committed

1. `.env.example` and `fabric.yaml.example` ship with **placeholders only**.
2. `scripts/bootstrap.ps1` copies them to `.env.local` and `fabric.yaml` and prompts for the
   real values (shared via Teams/Key Vault, never pasted into the repo).
3. Vite injects `VITE_*` at build/dev time; `fabric.yaml` drives the `fabric-app-data` connection
   alias. Both files are in `.gitignore`.
4. `fabric.generated.ts` is produced by `fabric-app-data generate` at build time and is git-ignored
   (it embeds workspace/model IDs).

## No secrets in the browser

- The client never holds an ARM token or a Function master key. Backends (Functions) hold identity.
- `VITE_TAG_WRITER_KEY` / `VITE_DATA_AGENT_KEY` are **optional function keys**; prefer Entra auth
  (Easy Auth / managed identity) so no key is needed. If a key is used, it lives only in `.env.local`.
- The Fabric user token is obtained at runtime by the RayFin auth provider; it is never persisted.

## Reporting

Found a leaked value in history or a PR? Do not open a public issue — message the repo owner and
rotate the value (new publishable key via `rayfin`, new function key, etc.).

## Pre-commit hygiene (recommended)

Enable a secret scanner locally:

```powershell
# example: gitleaks
gitleaks protect --staged
```

If you accidentally committed a real value, rotate it first, then scrub history.
