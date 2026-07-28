# Semantic model contract

This is the **conceptual model the ACA app AND the Data Agent require**. It is built by the
**[sample dataset notebook](../app/sample-data/README.md)** (dataset + model — see the
**[deployment guide](DEPLOYMENT.md)**) and it grounds the FinOps Assistant. Any environment's model must
expose these tables/measures. Everything here is derived from the DAX the app actually issues
(`src/queries/cfo/builders.ts`).

> **Storage mode:** Direct Lake on SQL. **Currency:** single currency (demo = USD).
> **Additive rule:** you may add tables/columns/measures, but do not rename/remove these.

---

## Fact tables

### `gold_cost_by_resource` — resource × month (primary explore/chargeback grain)
The workhorse table for Explorer, Chargeback, Action Center, governance.

| Column | Type | Notes |
|---|---|---|
| `YearMonth` | text `YYYY-MM` | relates to `dim_month` |
| `ResourceId` | text | full ARM id (hidden); dedupe key |
| `ResourceName` | text | |
| `ResourceType` | text | e.g. `microsoft.fabric/capacities` |
| `ResourceGroupName` | text | |
| `SubAccountName` | text | subscription display name |
| `ServiceName` | text | e.g. `Microsoft.Fabric` |
| `ServiceCategory` | text | e.g. `Analytics`, `Storage`, `Compute` |
| `RegionName` | text | e.g. `West US 3` |
| `EffectiveCost` | decimal | amortized/effective |
| `BilledCost` | decimal | |
| `ListCost` | decimal | pre-discount |
| `SavingsAmount` | decimal | `ListCost − EffectiveCost` |
| `Project`, `Environment` | text | **tag columns**; empty → surfaced as `Untagged` |
| `TagCount` | int (hidden) | how many of the mandatory tags are present |

> Tag columns are **data-dependent**. The demo has `Project` and `Environment`; a customer tenant
> may surface others. The generator (sample dataset notebook) locks the tag set.

### `gold_cost_summary_monthly` — month × service (KPI/trend grain)
Home table for the headline cost measures.

| Column | Type | Notes |
|---|---|---|
| `YearMonth` | text `YYYY-MM` | relates to `dim_month` |
| `ServiceName` | text | for service focus/trend |
| `EffectiveCost`, `BilledCost`, `ListCost`, `SavingsAmount` | decimal | |

### `focus_partitioned` — FOCUS line items (usage vs rate, daily)
Used by Explorer "what changed" and Unusual Spend deep-dive. Relates to `dim_date`.

| Column | Type | Notes |
|---|---|---|
| `Date` | date | relates to `dim_date[Date]` |
| `YearMonth` | text | convenience |
| `ServiceName`, `ServiceCategory`, `SubAccountName`, `RegionName` | text | |
| `ResourceName`, `ResourceType`, `ResourceGroupName` | text | |
| `SkuMeterName` | text | meter |
| `PricingCategory`, `PricingSubcategory`, `ChargeCategory` | text | FOCUS |
| `EffectiveCost` | decimal | |
| `ConsumedQuantity` | decimal | drives usage-vs-rate split |

### `gold_cost_anomalies` — service × region × date (Unusual Spend)

| Column | Type | Notes |
|---|---|---|
| `Date` | date | relates to `dim_date[Date]` |
| `ServiceName`, `RegionName` | text | |
| `EffectiveCost` | decimal | that day's cost |
| `RollingMean`, `RollingStdDev` | decimal | 7-day baseline |
| `ZScore` | decimal | `(cost − mean) / stddev` |
| `IsAnomaly` | boolean | crossed the formal threshold |

---

## Dimension tables

### `dim_month`
| Column | Notes |
|---|---|
| `YearMonth` (`YYYY-MM`) | key; used by every monthly visual and `TREATAS` |

### `dim_date`
| Column | Notes |
|---|---|
| `Date` | key; daily grain |
| `YearMonth` | for month equality filters in time-intel |
| (calendar attrs: Year, Month, MonthName, Day…) | optional but recommended |

---

## Relationships

| From | To | Cardinality |
|---|---|---|
| `gold_cost_by_resource[YearMonth]` | `dim_month[YearMonth]` | many-to-one |
| `gold_cost_summary_monthly[YearMonth]` | `dim_month[YearMonth]` | many-to-one |
| `focus_partitioned[Date]` | `dim_date[Date]` | many-to-one |
| `gold_cost_anomalies[Date]` | `dim_date[Date]` | many-to-one |
| `dim_date[YearMonth]` | `dim_month[YearMonth]` | many-to-one (optional roll-up) |

> Monthly visuals filter on `dim_month`; daily/time-intel (usage-vs-rate, anomaly windows) filter on
> `dim_date`. Keep both grains consistent (every `focus_partitioned` date rolls into a `dim_month`).

---

## Measures (exact names the app calls)

| Measure | Home table | Definition (intent) |
|---|---|---|
| `Resource Effective Cost` | `gold_cost_by_resource` | `SUM(EffectiveCost)` |
| `Total Effective Cost` | `gold_cost_summary_monthly` | `SUM(EffectiveCost)` |
| `Total Billed Cost` | `gold_cost_summary_monthly` | `SUM(BilledCost)` |
| `Total List Cost` | `gold_cost_summary_monthly` | `SUM(ListCost)` |
| `Total Savings` | `gold_cost_summary_monthly` | `SUM(SavingsAmount)` |
| `Savings %` | `gold_cost_summary_monthly` | `DIVIDE([Total Savings],[Total List Cost])` |
| `Untagged %` | `gold_cost_by_resource` | share of `EffectiveCost` where a mandatory tag is empty |
| `FX Effective Cost` | `focus_partitioned` | `SUM(EffectiveCost)` (FOCUS grain) |
| `FX Consumed Quantity` | `focus_partitioned` | `SUM(ConsumedQuantity)` |

> The app also derives a **resource count** and monthly untagged/savings via `SUMMARIZECOLUMNS`; a
> `Resource Count = DISTINCTCOUNT(gold_cost_by_resource[ResourceId])` measure is recommended.

### Usage-vs-rate split (client-side, powered by the two FX measures)
For a service between month _p_ and _c_:
```
prevPrice = FX Effective Cost@p / FX Consumed Quantity@p
currPrice = FX Effective Cost@c / FX Consumed Quantity@c
usageΔ = (Qty@c − Qty@p) * prevPrice
rateΔ  = (currPrice − prevPrice) * Qty@c
```
So `focus_partitioned` must carry **both** `EffectiveCost` and `ConsumedQuantity` at the same grain.

---

## Minimal validation set

After building a model/dataset, these must return non-empty, sensible results:

```dax
EVALUATE SUMMARIZECOLUMNS ( dim_month[YearMonth], "Cost", [Total Effective Cost] )
EVALUATE ROW ( "Untagged", [Untagged %] )
EVALUATE TOPN ( 5, SUMMARIZECOLUMNS ( focus_partitioned[ServiceName], "c", [FX Effective Cost], "q", [FX Consumed Quantity] ), [c], DESC )
EVALUATE TOPN ( 5, gold_cost_anomalies )
EVALUATE TOPN ( 5, gold_cost_by_resource, gold_cost_by_resource[EffectiveCost], DESC )
```
The app ships these and more under `src/queries/_discovery/*.dax`.
