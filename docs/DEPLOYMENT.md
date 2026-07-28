# Deployment guide — stand up the ACA demo end-to-end

This guide takes you **from zero to a published app** in your own Fabric workspace: install tooling,
clone the repo, build the Lakehouse + semantic model from the committed synthetic dataset, provision
RayFin, and wire, run & publish the app. Follow the phases in order.

>  **Credential-free:** nothing environment-specific (workspace/model IDs, tenant, endpoints, keys)
> is committed. Everything below lives only in your workspace and in the git-ignored
> `app/fabric.yaml`. See [SECURITY.md](../SECURITY.md).

---

## Phase 0 — Tooling & prerequisites

Install and verify these once. The repo is **credential-free** — no secrets ever live in tracked files.

| Tool / access | Why | Verify |
|---|---|---|
| **Node.js 20+** + npm | build & run the RayFin app | `node -v` |
| **Git** | clone the repo | `git --version` |
| **Azure CLI** (`az`), signed in | Fabric auth for the local DAX validator | `az version` → `az login` |
| **RayFin CLI** (`npx rayfin`) | provision + publish the Fabric app item | `npx rayfin --version` |
| **Docker Desktop** | local RayFin backend services (this app disables data/storage/functions, so it may be optional — confirm in Phase 3) | `docker version` |
| **VS Code** *(recommended)* | editing + running the notebook | — |
| **Fabric workspace** | on a capacity where you can create items — **Contributor** is enough | — |

You do **not** need to be a workspace admin or a Fabric capacity admin — **except** that a **tenant
admin must enable "Fabric Apps (preview)"** once (Admin portal → Tenant settings → **Fabric Apps**)
before anyone can create a Fabric data app or run `rayfin up`.

---

## Phase 1 — Clone, install & scaffold config

1. **Clone** the repo:

   ```powershell
   git clone <REPO_URL> aca-hackathon
   cd aca-hackathon
   ```

   The clone **includes the app source** (`app/src`, `app/functions`, …) plus the `*.example`
   config templates. No populate step is needed.

2. **Install dependencies:**

   ```powershell
   cd app
   npm install
   ```

3. **Scaffold the local (git-ignored) config** — run `bootstrap.ps1` **from the repo root**:

   ```powershell
   cd ..
   ./scripts/bootstrap.ps1
   ```

   This creates three files from the `*.example` templates — you **fill them in later phases**:

   | File | Filled in | With |
   |---|---|---|
   | `app/.env.local` | Phase 3 (auto) | `VITE_RAYFIN_*` / `VITE_FABRIC_*` |
   | `app/fabric.yaml` | Phase 3 | model `workspaceId` + `itemId` |
   | `app/rayfin/rayfin.yml` | — | leave as-is |

   > ⚠️ `bootstrap.ps1` targets `app/` by default, so run it from the **repo root**. It also
   > auto-detects when run from inside `app/`; older copies need the root (or `-AppDir "."`).

---

## Phase 2 — Build the data + semantic model

1. **Create a Lakehouse** in your workspace — official name **`AzureCostAnalyzer_LH`**.
   Keep the default **schema-enabled** option (tables land under the `dbo` schema; the notebook
   qualifies the model's source tables as `dbo.<table>` accordingly).
2. **Upload** [`app/sample-data/focus_sample.parquet`](../app/sample-data/focus_sample.parquet) into
   that Lakehouse's **`Files/`** (drag & drop in the portal).
3. **Import** [`app/sample-data/build_lakehouse_and_model.ipynb`](../app/sample-data/build_lakehouse_and_model.ipynb)
   as a **Notebook** (portal → *Import notebook*), and **attach the Lakehouse as its default**
   (Explorer → add Lakehouse → set as default).
4. In the notebook's **Parameters** cell, confirm `lakehouse_name = "AzureCostAnalyzer_LH"`
   (and `parquet_file`, `model_name`). **Run all.** The first cell installs `semantic-link-labs`
   (this can restart the Python session — that's expected; the run continues).

The notebook then:

- writes the **silver** `focus_partitioned` (partitioned by Year/Month) and the **gold** tables the
  accelerator uses — identical schema/logic to the production notebooks: `dim_date`, `dim_month`,
  `gold_cost_summary_daily`, `gold_cost_summary_monthly`, `gold_cost_focus_monthly`,
  `gold_chargeback_by_tag`, `gold_reservations_coverage`, `gold_reservations_waste`,
  `gold_reservations_detail`, `gold_cost_anomalies`, `gold_cost_by_resource` (+ hidden `gold_tag_keys`);
- creates the **Direct Lake (on SQL endpoint)** model `AzureCostAnalyzer_SM` binding those tables
  with the production relationship graph + measure set (Cost, Savings, Time Intelligence, Anomalies,
  Reservations, Governance, Resource Detail). Because the tables match production exactly, the
  accelerator's own semantic model / report can also be **repointed** to this Lakehouse unchanged.

> **Re-running is safe (idempotent).** If `AzureCostAnalyzer_SM` already exists, the notebook
> **reuses it** (same `itemId`) and only syncs schema/measures — so you can refresh the data anytime
> (re-upload the parquet + **Run all**) **without** re-pointing the app.

The final (optional) notebook cell prints the two values you need next:

```
aca workspaceId: <your-workspace-guid>
aca itemId:      <your-model-guid>
```

5. **(Optional) Create a Data Agent** for the FinOps Assistant view — you can skip this and the app
   stays in demo mode (canned answers). To enable grounded chat: create a Fabric **Data Agent** in
   the workspace, add **`AzureCostAnalyzer_SM`** as its data source, and give it grounding
   instructions. For the setup steps and canonical grounding prompt, reference the
   **[Azure Cost Analyzer accelerator](https://github.com/victormspg/azure-cost-analyzer)** repo's
   deployment guide (Data Agent section).

---

## Phase 3 — Deploy the app (`fabric.yaml` → `rayfin up` → validate)

The app is a **Fabric data app (RayFin)** that runs inside the Fabric portal under the signed-in
user's identity via **brokered Fabric auth**. One `rayfin up` **creates the Fabric app item,
auto-generates the env vars, builds, and deploys** the app — you don't hand-enter any RayFin/Fabric
config.

1. **Sign in** with your Entra account (opens a browser):

   ```powershell
   cd app
   npx rayfin login
   npx rayfin login status   # verify the right account + tenant
   ```

2. **Update `app/fabric.yaml`** (scaffolded in Phase 1) so the `aca` alias targets your model — paste
   the two IDs from the notebook output (Phase 2):

   ```yaml
   profiles:
     default:
       semanticModels:
         aca:
           workspaceId: <your-workspace-guid>   # from the notebook output
           itemId:      <your-model-guid>        # from the notebook output
   ```

3. **Deploy** — one command creates the app item, generates `app/.env.local`, builds, and deploys the
   static bundle:

   ```powershell
   npx rayfin up -w "<your-workspace-name>"
   ```

   It reads `app/rayfin/rayfin.yml`, runs `npm run build:fabric` (regenerates
   `src/fabric.generated.ts` from `fabric.yaml`), auto-generates `app/.env.local` (`VITE_RAYFIN_*` /
   `VITE_FABRIC_*`), and prints the **Portal** URL + publishable key.

4. **Validate in the Fabric portal** — open the printed **Portal** URL; the app should render with
   **live data** from the model (Direct Lake).

   > 🔑 **Golden rule — one profile everywhere.** The app item (+ publishable key) in `.env.local`,
   > the model in `fabric.yaml`, and the `appbackends/<item>` in the portal URL must all belong to the
   > **same** deployment, or you get **401 / "Can't open this app outside Fabric"**.

   > 💡 **Local dev loop (optional):** for hot-reload while coding, run `npm run dev` and open the
   > Portal URL with `&devUri=http://localhost:5173` appended (loads your local Vite server).

> Because the app references the model only through the `aca` **alias** (never a hard-coded ID), the
> same source works against any workspace/model — you just change `app/fabric.yaml`.

---

## Validation checklist

- [ ] `git status` is credential-free (no `.env.local` / `fabric.yaml` / `fabric.generated.ts`).
- [ ] Lakehouse holds `focus_sample.parquet`; the notebook **Run all** is green; gold tables populated.
- [ ] The notebook printed `workspaceId` + model `itemId` → both set in `app/fabric.yaml`.
- [ ] `npx rayfin up` prints a **Portal** URL; opening it loads the app with **live** data (Direct Lake).
- [ ] *(Optional dev loop)* `npm run dev` opened via the portal `&devUri` URL hot-reloads local code.
- [ ] Queries hit **Direct Lake** (VertiPaq), not DirectQuery fallback (Performance Analyzer).

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| `Config file 'fabric.yaml' not found` | Copy `fabric.yaml.example` → `fabric.yaml` at the **app root** (Phase 1 `bootstrap.ps1`; set the IDs in Phase 3). |
| Blank/blocked screen on `localhost:5173` | Open via the **portal `devUri` URL**, not a bare localhost tab. |
| App item shows **"Coming soon / This app isn't available yet"** | The static bundle isn't deployed (expected after `rayfin up --exclude-services staticHosting`). For local dev, open the portal URL with `&devUri=http://localhost:5173` (loads your Vite server). To serve the hosted bundle instead, run a full `npx rayfin up -w "<workspace-name>"` (no `--exclude-services`). |
| Notebook: `timestampNtz` / Delta feature error | Re-run — the notebook casts the 4 FOCUS timestamp columns to `timestamp` before writing. |
| Model created but visuals are empty | Re-run the notebook's **refresh** cell to reframe Direct Lake; confirm the Lakehouse SQL endpoint finished syncing. |
| Direct Lake / "permission to view" errors | Consumers need **Build** on the model. |
| `Fabric API returned 429` | Capacity throttling — wait the seconds the message states, then retry. |
| *"Missing required env vars for creating rayfin client"* | `.env.local` lacks `VITE_RAYFIN_API_URL` / `VITE_RAYFIN_PUBLISHABLE_KEY` — re-run `rayfin up` (Phase 3), which auto-generates them. |
| `rayfin login` picks the wrong account/tenant | `npx rayfin logout`, then `npx rayfin login --select --tenant <tenant-id>` (`--select` forces the account picker); verify with `npx rayfin login status`. |
| `rayfin up` fails — Fabric data app / app item **not enabled** on the tenant | A tenant admin must enable **"Fabric Apps (preview)"** (Admin portal → Tenant settings → Fabric Apps), then wait a few minutes for the setting to propagate before re-running `rayfin up`. |

---

## (Optional) FinOps Assistant — Data Agent proxy Function

The **FinOps Assistant** chat is grounded by a published **Fabric Data Agent**, reached through a
small **Data Agent proxy Function** ([`app/functions/data-agent/`](../app/functions/data-agent/README.md)).
Until you wire it up, the assistant runs in **demo mode** (canned answers).

- **What it does:** the browser POSTs `{ userQuestion }`; the Function calls the Data Agent over its
  **MCP endpoint** using a fixed-identity **Service Principal** and returns `{ answer }`. Any app
  user gets answers under that one identity — no per-user token needed.
- **Run it locally:** `cd app/functions/data-agent`, create a Python 3.11 venv, `pip install -r
  requirements.txt`, put the SP creds + Data Agent IDs in `local.settings.json`, `func start`, then
  set `VITE_DATA_AGENT_URL=http://localhost:7071/api/data-agent` in `app/.env`.
- **Deploy to Azure:** publish to a Function App with the SP creds in **App Settings**
  (`AAD_TENANT_ID`, `AAD_CLIENT_ID`, `AAD_CLIENT_SECRET`, `DATA_AGENT_WORKSPACE_ID`,
  `DATA_AGENT_ARTIFACT_ID`), then point `VITE_DATA_AGENT_URL` at it.
- **SP prereqs:** **Member/Contributor** on the Data Agent's workspace + **read** on its data
  sources, and tenant setting *Service principals can use Fabric APIs*. Detail in
  [../app/functions/data-agent/README.md](../app/functions/data-agent/README.md).

---

## Related docs

- [SEMANTIC-MODEL.md](SEMANTIC-MODEL.md) — the tables / measures / relationships the app requires.
- [ARCHITECTURE.md](ARCHITECTURE.md) — end-to-end system design.
- [app/sample-data/README.md](../app/sample-data/README.md) — the synthetic dataset + notebook detail.
