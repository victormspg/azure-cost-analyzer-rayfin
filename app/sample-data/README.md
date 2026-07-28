# Sample dataset + semantic model (demo data)

A committed, **credential-free**, "pretty" synthetic dataset + a notebook that builds the Lakehouse
tables and the Direct Lake semantic model — so a fresh Fabric workspace becomes demo-ready for the
ACA app and the Data Agent. Deployment steps: [../../docs/DEPLOYMENT.md](../../docs/DEPLOYMENT.md) ·
model contract: [../../docs/SEMANTIC-MODEL.md](../../docs/SEMANTIC-MODEL.md).

## Files

| File | What it is |
|---|---|
| **`focus_sample.parquet`** | The committed synthetic **FOCUS** dataset (daily line items, 13 months). This is the source of truth — upload it to your Lakehouse. |
| **`build_lakehouse_and_model.ipynb`** | The Fabric **notebook**: reads the parquet → writes Delta tables → builds the semantic model (`sempy_labs`). Import + edit this file directly. |
| `_generate_focus.py` | Dev-only generator for `focus_sample.parquet`. **Kept local — not published** (git-ignored); only the parquet ships. |

## Deploying this (Lakehouse → notebook → model → app)

The step-by-step to build the Lakehouse tables + semantic model from this dataset and then point the
app at it lives in the **[deployment guide](../../docs/DEPLOYMENT.md)** (Phase A builds the model;
Phase B wires + runs the app). In short: create a schema-enabled Lakehouse `AzureCostAnalyzer_LH`,
upload `focus_sample.parquet` to its `Files/`, import `build_lakehouse_and_model.ipynb`, attach the
Lakehouse as default, and **Run all** — the notebook is **idempotent** (re-running reuses the same
model `itemId`, so refreshing data never re-points the app).

## The committed dataset (`focus_sample.parquet`)

Emitted in the **production `focus_partitioned` (FOCUS 1.0) silver schema**, so every gold table
builds identically — only the data differs.

- **13 months**: 2025-07-01 → 2026-07-20 (last month intentionally **partial**).
- **~30k daily FOCUS rows**, 78 resources, **24 services / 9 categories** (diversified — not
  Analytics-heavy), **3 subscriptions**, **6 projects**, envs **DEV / TEST / PROD**, 7 owners, 6 teams.
- **Tags as a JSON `Tags` column** carrying the **4 standard tag keys** — `project`,
  `environment`, `owner`, `team` — fixed and used by the model, Data Agent, and app (surfaced as
  `tag_project` / `tag_environment` / `tag_owner` / `tag_team` in `gold_cost_by_resource`, locked
  into the hidden `gold_tag_keys` helper). **~50% untagged by cost** — with Fabric, Azure SQL and
  Databricks deliberately left untagged for high-impact Action Center items.
- **Real RI / Savings-Plan coverage + waste**: a share of Production Compute is `PricingCategory =
  'Committed'` (`Used` + `Unused` rows) with `ContractedCost` baselines, so the Reservations page
  (coverage %, waste, idle-commitment detail) is populated.
- The 4 cost bases (Effective / Billed / List / **Contracted**) + `x_*InUsd` extensions.
- Month-over-month growth, **varied anomaly magnitudes** (Z-scores ~1.5×–8×). Deterministic
  (`SEED = 42`). No real customer data.

## Security (production)

The synthetic demo needs no RLS. Hardening a **real** deployment (Service Principal data access,
Build permission, Row-Level Security, and Data-Agent on-behalf-of) is documented in the
**[deployment guide → Harden for production](../../docs/DEPLOYMENT.md#harden-for-production-sp-data-access--build--rls)**.
