# data-agent — Fabric Data Agent proxy for FinOps Assistant

This Azure Function is the bridge that lets **FinOps Assistant** (the in-app chat) answer
questions grounded on the ACA semantic model, by proxying to the published **Fabric Data
Agent**. The browser never sees Data Agent credentials or endpoints.

```
Browser (FinOps Assistant)  --POST /api/data-agent {userQuestion}-->  Function
                                                                       |
                                                                       v
                          Fabric Data Agent MCP endpoint: initialize session ->
                          discover its single tool -> call it with the question
                                                                       |
                                                                       v
                          <-- { "answer": "..." } -----------------------
```

## Auth: fixed-identity Service Principal

The Function calls the Data Agent with a **Service Principal** (`ClientSecretCredential`) -- a
single fixed identity, so **any app user** gets answers without needing their own Data Agent
permissions. Credentials come from app settings / `local.settings.json` (`AAD_TENANT_ID`,
`AAD_CLIENT_ID`, `AAD_CLIENT_SECRET`) -- never hardcode the secret. The SP needs
**Member/Contributor** on the Data Agent's workspace + **read** on its data sources, and the
tenant setting *Service principals can use Fabric APIs* enabled.

> RLS caveat: because the SP is a shared identity, Data Agent answers reflect the SP's access,
> not the caller's. Per-user (OBO) auth would require the app to pass the signed-in user's token
> to this Function.

## What it does

- Accepts `{ "userQuestion": "..." }` and returns `{ "answer": "..." }` (see
  `src/lib/data-agent-client.ts` -- contract is unchanged by this scaffold).
- Queries the Fabric Data Agent through its native **MCP** endpoint (commented in
  `invoker.py` as `INVOKER_MCP`), replacing the OpenAI Assistants-style REST surface
  (create thread -> add message -> create run -> poll), which is on Microsoft's
  deprecation path (retiring **August 2026**) and had an unresolved bug where `tools`
  came back empty.
- Wraps the whole MCP call (initialize -> list tools -> call tool) in an overall timeout
  and returns a friendly error instead of the Data Agent's raw error text.
- A simple **global** rate limit (not per-user yet -- see Phase 1 note in `handler.py`)
  guards against runaway retries.

## Structure

```
data-agent/
├── function_app.py   # Functions v2 entry point -- registers handler.py's Blueprint
├── handler.py         # HTTP endpoint: validates input, calls invoker.ask(), formats response
├── invoker.py         # ask(question: str) -> str -- isolates the Data Agent call
├── requirements.txt
└── README.md
```

## Environment variables

```
# Fabric workspace and Data Agent (AI Skill) item that answers questions.
DATA_AGENT_WORKSPACE_ID=
DATA_AGENT_ARTIFACT_ID=

# Entra app registration used by DefaultAzureCredential in Phase 1 (only needed
# for local dev via client secret/cert; in Azure the Function's Managed Identity
# is used instead and these can be left unset).
AAD_CLIENT_ID=
AAD_CLIENT_SECRET=

# Tenant that owns the Fabric workspace/Data Agent. DefaultAzureCredential has
# no `tenant_id` parameter -- it only mints tokens for the identity's home
# tenant unless the target tenant is allow-listed via
# `additionally_allowed_tenants`. Set this whenever the identity running the
# Function (Managed Identity or your local `az login`/VS Code account) lives
# in a different tenant than the Fabric workspace, otherwise calls fail with
# a 404 EntityNotFound instead of a clear auth error.
AAD_TENANT_ID=

# Token scope requested via DefaultAzureCredential.get_token(...).
DATA_AGENT_SCOPE=https://api.fabric.microsoft.com/.default

# Overall timeout (seconds) for the MCP initialize -> list tools -> call tool flow.
DATA_AGENT_TIMEOUT_SECONDS=30
```

## Run locally

```powershell
cd functions/data-agent
pip install -r requirements.txt
func start          # uses your `az login` identity to call the Data Agent
# then set VITE_DATA_AGENT_URL=http://localhost:7071/api/data-agent
```

## Hardening (production)

- Replace `Access-Control-Allow-Origin: *` with the app's exact hosting origin.
- Prefer **Easy Auth** (App Service authentication) in front of this Function over the
  optional `x-functions-key`, same recommendation as tag-writer.
- Move the rate limit from global to per-user (keyed on the OBO token's `sub`/`oid`, never
  the raw token) once Phase 2 lands.
- Grant the Function's Managed Identity (or the `AAD_CLIENT_ID` app registration) only the
  minimum Fabric permissions needed to call this specific Data Agent item.
