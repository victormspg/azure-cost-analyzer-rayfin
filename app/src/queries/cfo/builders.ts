import { monthBounds } from "@/lib/period";

function esc(s: string): string {
  return s.replace(/"/g, '""');
}

function periodVars(prevYm: string, currYm: string): string {
  const p = monthBounds(prevYm);
  const c = monthBounds(currYm);
  return `    VAR _prevStart = ${p.start}
    VAR _prevEnd = ${p.end}
    VAR _curStart = ${c.start}
    VAR _curEnd = ${c.end}`;
}

/** Category-level bridge: prev/curr Effective Cost by ServiceCategory. */
export function bridgeDax(prevYm: string, currYm: string): string {
  return `DEFINE
${periodVars(prevYm, currYm)}
EVALUATE
SUMMARIZECOLUMNS (
    focus_partitioned[ServiceCategory],
    "PrevCost", CALCULATE ( [FX Effective Cost], DATESBETWEEN ( dim_date[Date], _prevStart, _prevEnd ) ),
    "CurrCost", CALCULATE ( [FX Effective Cost], DATESBETWEEN ( dim_date[Date], _curStart, _curEnd ) )
)
ORDER BY [CurrCost] DESC`;
}

/** Category-level price x volume: adds Consumed Quantity for usage/rate decomposition. */
export function priceVolumeDax(prevYm: string, currYm: string): string {
  return `DEFINE
${periodVars(prevYm, currYm)}
EVALUATE
SUMMARIZECOLUMNS (
    focus_partitioned[ServiceCategory],
    "PrevCost", CALCULATE ( [FX Effective Cost], DATESBETWEEN ( dim_date[Date], _prevStart, _prevEnd ) ),
    "CurrCost", CALCULATE ( [FX Effective Cost], DATESBETWEEN ( dim_date[Date], _curStart, _curEnd ) ),
    "PrevQty", CALCULATE ( [FX Consumed Quantity], DATESBETWEEN ( dim_date[Date], _prevStart, _prevEnd ) ),
    "CurrQty", CALCULATE ( [FX Consumed Quantity], DATESBETWEEN ( dim_date[Date], _curStart, _curEnd ) )
)
ORDER BY [CurrCost] DESC`;
}

/** Drill one ServiceCategory into its ServiceName rows (with quantity for usage/rate). */
export function drillDax(prevYm: string, currYm: string, category: string): string {
  return `DEFINE
${periodVars(prevYm, currYm)}
EVALUATE
SUMMARIZECOLUMNS (
    focus_partitioned[ServiceName],
    FILTER ( ALL ( focus_partitioned[ServiceCategory] ), focus_partitioned[ServiceCategory] = "${esc(category)}" ),
    "PrevCost", CALCULATE ( [FX Effective Cost], DATESBETWEEN ( dim_date[Date], _prevStart, _prevEnd ) ),
    "CurrCost", CALCULATE ( [FX Effective Cost], DATESBETWEEN ( dim_date[Date], _curStart, _curEnd ) ),
    "PrevQty", CALCULATE ( [FX Consumed Quantity], DATESBETWEEN ( dim_date[Date], _prevStart, _prevEnd ) ),
    "CurrQty", CALCULATE ( [FX Consumed Quantity], DATESBETWEEN ( dim_date[Date], _curStart, _curEnd ) )
)
ORDER BY [CurrCost] DESC`;
}

/** Drill one ServiceName down to individual resources, with subscription / RG / tags. */
export function resourceDrillDax(prevYm: string, currYm: string, service: string): string {
  return `DEFINE
    VAR _prev = "${prevYm}"
    VAR _curr = "${currYm}"
EVALUATE
TOPN (
    12,
    SUMMARIZECOLUMNS (
        gold_cost_by_resource[ResourceName],
        gold_cost_by_resource[ResourceGroupName],
        gold_cost_by_resource[SubAccountName],
        gold_cost_by_resource[Project],
        gold_cost_by_resource[Environment],
        FILTER ( ALL ( gold_cost_by_resource[ServiceName] ), gold_cost_by_resource[ServiceName] = "${esc(service)}" ),
        "PrevCost", CALCULATE ( [Resource Effective Cost], dim_month[YearMonth] = _prev ),
        "CurrCost", CALCULATE ( [Resource Effective Cost], dim_month[YearMonth] = _curr )
    ),
    [CurrCost], DESC
)
ORDER BY [CurrCost] DESC`;
}

/** Untagged resources ranked by cost — the governance backlog for Tag Studio. */
export function untaggedResourcesDax(n = 40): string {
  return `EVALUATE
TOPN (
    ${n},
    SUMMARIZECOLUMNS (
        gold_cost_by_resource[ResourceId],
        gold_cost_by_resource[ResourceName],
        gold_cost_by_resource[ResourceType],
        gold_cost_by_resource[ResourceGroupName],
        gold_cost_by_resource[SubAccountName],
        gold_cost_by_resource[ServiceName],
        FILTER ( ALL ( gold_cost_by_resource[Project] ), gold_cost_by_resource[Project] = "Untagged" ),
        "Cost", [Resource Effective Cost]
    ),
    [Cost], DESC
)
ORDER BY [Cost] DESC`;
}

/** Tag universe (dynamic): every discovered tag key + its WIDE column + friendly display, ranked by cost.
 *  The app reads this to know which tag columns exist and to build its dynamic GROUP BY. */
export function tagSchemaDax(): string {
  return `EVALUATE
SELECTCOLUMNS (
    dim_tag_key,
    "TagKey", dim_tag_key[TagKey],
    "TagKeyDisplay", dim_tag_key[TagKeyDisplay],
    "ColumnName", dim_tag_key[ColumnName],
    "Rank", dim_tag_key[Rank]
)
ORDER BY [Rank] ASC`;
}

/** Governance backlog for the current month: resources with their (dynamic) tag values + cost.
 *  A tag whose value is "Untagged" is missing on that resource. Source = gold_chargeback_by_tag (WIDE),
 *  one row per resource-month, so cost is exact. Feeds the Action Center. */
export function governanceResourcesDax(currYm: string, tagColumns: string[], n = 60): string {
  const tagSel = tagColumns.map((c) => `        gold_chargeback_by_tag[${c}]`).join(",\n");
  return `DEFINE
    VAR _curr = "${currYm}"
EVALUATE
TOPN (
    ${n},
    SUMMARIZECOLUMNS (
        gold_chargeback_by_tag[ResourceId],
        gold_chargeback_by_tag[ResourceName],
        gold_chargeback_by_tag[ResourceType],
        gold_chargeback_by_tag[ResourceGroupName],
        gold_chargeback_by_tag[SubAccountName],
        gold_chargeback_by_tag[ServiceName],
${tagSel ? tagSel + ",\n" : ""}        FILTER ( ALL ( gold_chargeback_by_tag[YearMonth] ), gold_chargeback_by_tag[YearMonth] = _curr ),
        "Cost", [Tag Effective Cost]
    ),
    [Cost], DESC
)
ORDER BY [Cost] DESC`;
}

/** Daily cost events ranked by absolute deviation vs the rolling mean (anomaly scan). */
export function anomalyScanDax(n = 24): string {
  return `EVALUATE
TOPN (
    ${n},
    ADDCOLUMNS (
        FILTER ( gold_cost_anomalies, gold_cost_anomalies[EffectiveCost] > 0.1 ),
        "Dev", gold_cost_anomalies[EffectiveCost] - gold_cost_anomalies[RollingMean]
    ),
    [Dev], DESC
)
ORDER BY [Dev] DESC`;
}

/** Top resources driving a service+region over the 7-day rolling window ending on `dateYmd`. */
export function anomalyWindowDax(service: string, region: string, dateYmd: string): string {
  const [y, m, d] = dateYmd.split("-").map(Number);
  return `DEFINE
    VAR _end = DATE ( ${y}, ${m}, ${d} )
    VAR _start = _end - 6
EVALUATE
TOPN (
    8,
    SUMMARIZECOLUMNS (
        focus_partitioned[ResourceId],
        focus_partitioned[ResourceName],
        focus_partitioned[ResourceType],
        focus_partitioned[ResourceGroupName],
        focus_partitioned[SubAccountName],
        FILTER ( ALL ( focus_partitioned[ServiceName] ), focus_partitioned[ServiceName] = "${esc(service)}" ),
        FILTER ( ALL ( focus_partitioned[RegionName] ), focus_partitioned[RegionName] = "${esc(region)}" ),
        "Cost", CALCULATE ( [FX Effective Cost], DATESBETWEEN ( dim_date[Date], _start, _end ) ),
        "Qty", CALCULATE ( [FX Consumed Quantity], DATESBETWEEN ( dim_date[Date], _start, _end ) )
    ),
    [Cost], DESC
)
ORDER BY [Cost] DESC`;
}

/** Resource-level cost + all (dynamic) tag values for chargeback grouping.
 *  Source = gold_chargeback_by_tag (WIDE): one row per resource-month, so grouping/filtering by
 *  several tag columns at once does NOT double count. `tagColumns` come from `tagSchemaDax`. */
export function chargebackResourcesDax(tagColumns: string[], n = 300): string {
  const tagSel = tagColumns.map((c) => `        gold_chargeback_by_tag[${c}]`).join(",\n");
  return `EVALUATE
TOPN (
    ${n},
    SUMMARIZECOLUMNS (
        gold_chargeback_by_tag[ResourceId],
        gold_chargeback_by_tag[ResourceName],
        gold_chargeback_by_tag[ResourceType],
        gold_chargeback_by_tag[ResourceGroupName],
        gold_chargeback_by_tag[SubAccountName],
        gold_chargeback_by_tag[ServiceName],
${tagSel ? tagSel + ",\n" : ""}        "Cost", [Tag Effective Cost]
    ),
    [Cost], DESC
)
ORDER BY [Cost] DESC`;
}

/** Distinct values present for each (dynamic) tag column — powers the tag editor dropdowns. */
export function tagValuesDax(tagColumns: string[]): string {
  if (!tagColumns.length) return `EVALUATE ROW ( "Dim", "", "Val", "" )`;
  const one = (col: string) =>
    `SELECTCOLUMNS ( VALUES ( gold_chargeback_by_tag[${col}] ), "Dim", "${col}", "Val", gold_chargeback_by_tag[${col}] )`;
  const parts = tagColumns.map(one);
  const body = parts.length === 1 ? parts[0] : `UNION (\n    ${parts.join(",\n    ")}\n)`;
  return `EVALUATE
${body}`;
}

// ---------------------------------------------------------------------------
// Executive Summary — period-aware KPIs and top services (month multi-select)
// ---------------------------------------------------------------------------

function monthSet(months: string[]): string {
  return "{ " + months.map((m) => `"${m}"`).join(", ") + " }";
}

/** Compose a measure with optional month + service filters (service scoped to its home table). */
function scoped(
  measure: string,
  months: string[],
  serviceTable: string | null,
  service?: string | null
): string {
  const filters: string[] = [];
  if (months.length) filters.push(`TREATAS ( ${monthSet(months)}, dim_month[YearMonth] )`);
  if (service && serviceTable)
    filters.push(
      `FILTER ( ALL ( ${serviceTable}[ServiceName] ), ${serviceTable}[ServiceName] = "${esc(service)}" )`
    );
  if (filters.length === 0) return measure;
  return `CALCULATE ( ${measure}, ${filters.join(", ")} )`;
}

/** KPI ROW filtered to the selected months and (optionally) a single service. */
export function execKpiMonthsDax(months: string[], service?: string | null): string {
  return `EVALUATE
ROW (
    "TotalEffectiveCost", ${scoped("[Total Effective Cost]", months, "gold_cost_summary_monthly", service)},
    "UntaggedPct", ${scoped("[Untagged %]", months, "gold_cost_by_resource", service)},
    "SavingsPct", ${scoped("[Savings %]", months, "gold_cost_summary_monthly", service)}
)`;
}

/** Monthly trend of Effective Cost, optionally scoped to a single service. */
export function monthlyTrendDax(service?: string | null): string {
  const measure = scoped("[Total Effective Cost]", [], "gold_cost_summary_monthly", service);
  return `EVALUATE
SUMMARIZECOLUMNS ( dim_month[YearMonth], "Cost", ${measure} )
ORDER BY dim_month[YearMonth] ASC`;
}

/** Top services by Effective Cost for the selected months (empty = all periods). */
export function topServicesMonthsDax(months: string[], n = 6): string {
  const measure = months.length
    ? `CALCULATE ( [Total Effective Cost], TREATAS ( ${monthSet(months)}, dim_month[YearMonth] ) )`
    : `[Total Effective Cost]`;
  return `EVALUATE
TOPN (
    ${n},
    SUMMARIZECOLUMNS ( gold_cost_summary_monthly[ServiceName], "Cost", ${measure} ),
    [Cost], DESC
)
ORDER BY [Cost] DESC`;
}

/** Cost by service category for the selected months. */
export function topCategoriesMonthsDax(months: string[], n = 6): string {
  const measure = months.length
    ? `CALCULATE ( [Total Effective Cost], TREATAS ( ${monthSet(months)}, dim_month[YearMonth] ) )`
    : `[Total Effective Cost]`;
  return `EVALUATE
TOPN (
    ${n},
    SUMMARIZECOLUMNS ( gold_cost_summary_monthly[ServiceCategory], "Cost", ${measure} ),
    [Cost], DESC
)
ORDER BY [Cost] DESC`;
}

/** Cost by region for the selected months. */
export function topRegionsMonthsDax(months: string[], n = 6): string {
  const measure = months.length
    ? `CALCULATE ( [Resource Effective Cost], TREATAS ( ${monthSet(months)}, dim_month[YearMonth] ) )`
    : `[Resource Effective Cost]`;
  return `EVALUATE
TOPN (
    ${n},
    SUMMARIZECOLUMNS ( gold_cost_by_resource[RegionName], "Cost", ${measure} ),
    [Cost], DESC
)
ORDER BY [Cost] DESC`;
}

/** Per-month KPIs (Cost, Untagged %, Savings %, Savings $, Resource count) for Executive Summary v2. */
export function monthlyKpisDax(): string {
  return `EVALUATE
SUMMARIZECOLUMNS (
    dim_month[YearMonth],
    "Cost", [Total Effective Cost],
    "Untagged", [Untagged %],
    "Savings", [Savings %],
    "SavingsAmt", [Total Savings],
    "Resources", [Resource Count]
)
ORDER BY dim_month[YearMonth] ASC`;
}

// ---------------------------------------------------------------------------
// Explorer — unified cross-filter over gold_cost_by_resource
// (months + ServiceCategory + ServiceName + SubAccountName + RegionName + resources)
// ---------------------------------------------------------------------------

export type ExpDim = "category" | "service" | "sub" | "region";
export interface ExpSel {
  months: string[];
  category?: string[];
  service?: string[];
  sub?: string[];
  region?: string[];
}

const EXP_COL: Record<ExpDim, string> = {
  category: "gold_cost_by_resource[ServiceCategory]",
  service: "gold_cost_by_resource[ServiceName]",
  sub: "gold_cost_by_resource[SubAccountName]",
  region: "gold_cost_by_resource[RegionName]",
};

function monthFilter(months: string[]): string | null {
  if (!months.length) return null;
  const set = months.map((m) => `"${m}"`).join(", ");
  return `        FILTER ( ALL ( gold_cost_by_resource[YearMonth] ), gold_cost_by_resource[YearMonth] IN { ${set} } )`;
}

function dimFilters(sel: ExpSel, exclude?: ExpDim): string[] {
  const out: string[] = [];
  (["category", "service", "sub", "region"] as ExpDim[]).forEach((d) => {
    const vals = sel[d];
    if (d !== exclude && vals && vals.length) {
      const set = vals.map((v) => `"${esc(v)}"`).join(", ");
      out.push(`        FILTER ( ALL ( ${EXP_COL[d]} ), ${EXP_COL[d]} IN { ${set} } )`);
    }
  });
  return out;
}

/** Top-N of one dimension, cross-filtered by the other dims + months. */
export function explorerDimDax(dim: ExpDim, sel: ExpSel, n = 10): string {
  const filters = dimFilters(sel, dim);
  const mf = monthFilter(sel.months);
  if (mf) filters.push(mf);
  const fs = filters.length ? filters.join(",\n") + ",\n" : "";
  return `EVALUATE
TOPN (
    ${n},
    SUMMARIZECOLUMNS (
        ${EXP_COL[dim]},
${fs}        "Cost", [Resource Effective Cost]
    ),
    [Cost], DESC
)
ORDER BY [Cost] DESC`;
}

/** Cost by month, filtered by the dim selection (NOT by month selection). */
export function explorerMonthsDax(sel: ExpSel): string {
  const filters = dimFilters(sel);
  const fs = filters.length ? filters.join(",\n") + ",\n" : "";
  return `EVALUATE
SUMMARIZECOLUMNS (
    gold_cost_by_resource[YearMonth],
${fs}        "Cost", [Resource Effective Cost]
)
ORDER BY gold_cost_by_resource[YearMonth] ASC`;
}

/** Top resources for the full selection (months + all dims). */
export function explorerResourcesDax(sel: ExpSel, n = 20): string {
  const filters = dimFilters(sel);
  const mf = monthFilter(sel.months);
  if (mf) filters.push(mf);
  const fs = filters.length ? filters.join(",\n") + ",\n" : "";
  return `EVALUATE
TOPN (
    ${n},
    SUMMARIZECOLUMNS (
        gold_cost_by_resource[ResourceName],
        gold_cost_by_resource[ResourceType],
        gold_cost_by_resource[ResourceGroupName],
        gold_cost_by_resource[SubAccountName],
        gold_cost_by_resource[ServiceName],
        gold_cost_by_resource[RegionName],
${fs}        "Cost", [Resource Effective Cost]
    ),
    [Cost], DESC
)
ORDER BY [Cost] DESC`;
}

/** Total cost for the current selection. */
export function explorerTotalDax(sel: ExpSel): string {
  const filters = dimFilters(sel);
  const mf = monthFilter(sel.months);
  if (mf) filters.push(mf);
  const inner = filters.length
    ? `CALCULATE ( [Resource Effective Cost], ${filters.map((f) => f.trim()).join(", ")} )`
    : `[Resource Effective Cost]`;
  return `EVALUATE
ROW ( "Total", ${inner} )`;
}

/** One dimension value broken down by month (respects other dim filters + selected months). */
export function explorerItemByMonthDax(dim: ExpDim, value: string, sel: ExpSel): string {
  const filters = dimFilters(sel, dim);
  filters.push(`        FILTER ( ALL ( ${EXP_COL[dim]} ), ${EXP_COL[dim]} = "${esc(value)}" )`);
  const mf = monthFilter(sel.months);
  if (mf) filters.push(mf);
  const fs = filters.join(",\n") + ",\n";
  return `EVALUATE
SUMMARIZECOLUMNS (
    gold_cost_by_resource[YearMonth],
${fs}        "Cost", [Resource Effective Cost]
)
ORDER BY gold_cost_by_resource[YearMonth] ASC`;
}

const FOCUS_COL: Record<"category" | "sub" | "region", string> = {
  category: "focus_partitioned[ServiceCategory]",
  sub: "focus_partitioned[SubAccountName]",
  region: "focus_partitioned[RegionName]",
};

/** What-changed by service with usage vs rate (prev→curr), respecting category/sub/region + service filters. */
export function explorerChangeDax(prevYm: string, currYm: string, sel: ExpSel, n = 8): string {
  const dims: ("category" | "sub" | "region")[] = ["category", "sub", "region"];
  const filters = dims
    .filter((d) => sel[d] && sel[d]!.length)
    .map((d) => {
      const set = sel[d]!.map((v) => `"${esc(v)}"`).join(", ");
      return `        FILTER ( ALL ( ${FOCUS_COL[d]} ), ${FOCUS_COL[d]} IN { ${set} } )`;
    });
  // The panel groups BY ServiceName, so a selected service must be applied as an explicit
  // filter (otherwise clicking a service doesn't narrow "What changed", unlike the other dims).
  if (sel.service && sel.service.length) {
    const set = sel.service.map((v) => `"${esc(v)}"`).join(", ");
    filters.push(
      `        FILTER ( ALL ( focus_partitioned[ServiceName] ), focus_partitioned[ServiceName] IN { ${set} } )`
    );
  }
  const fs = filters.length ? filters.join(",\n") + ",\n" : "";
  return `DEFINE
    VAR _prev = "${prevYm}"
    VAR _curr = "${currYm}"
EVALUATE
TOPN (
    ${n},
    SUMMARIZECOLUMNS (
        focus_partitioned[ServiceName],
${fs}        "Prev", CALCULATE ( [FX Effective Cost], dim_date[YearMonth] = _prev ),
        "Curr", CALCULATE ( [FX Effective Cost], dim_date[YearMonth] = _curr ),
        "PrevQty", CALCULATE ( [FX Consumed Quantity], dim_date[YearMonth] = _prev ),
        "CurrQty", CALCULATE ( [FX Consumed Quantity], dim_date[YearMonth] = _curr )
    ),
    [Curr], DESC
)
ORDER BY [Curr] DESC`;
}

/** Total spend for prev and curr month (respects dim filters) — for the Selected Difference KPI. */
export function explorerRangeDeltaDax(prevYm: string, currYm: string, sel: ExpSel): string {
  const filters = dimFilters(sel).map((f) => f.trim());
  const extra = filters.length ? filters.join(", ") + ", " : "";
  return `EVALUATE
ROW (
    "Prev", CALCULATE ( [Resource Effective Cost], ${extra}gold_cost_by_resource[YearMonth] = "${prevYm}" ),
    "Curr", CALCULATE ( [Resource Effective Cost], ${extra}gold_cost_by_resource[YearMonth] = "${currYm}" )
)`;
}

/** Prev vs curr by ServiceName for the current dim selection (Explorer v2 bridge). */
export function explorerBridgeDax(prevYm: string, currYm: string, sel: ExpSel, n = 8): string {
  const filters = dimFilters(sel, "service");
  const fs = filters.length ? filters.join(",\n") + ",\n" : "";
  return `DEFINE
    VAR _prev = "${prevYm}"
    VAR _curr = "${currYm}"
EVALUATE
TOPN (
    ${n},
    SUMMARIZECOLUMNS (
        gold_cost_by_resource[ServiceName],
${fs}        "Prev", CALCULATE ( [Resource Effective Cost], gold_cost_by_resource[YearMonth] = _prev ),
        "Curr", CALCULATE ( [Resource Effective Cost], gold_cost_by_resource[YearMonth] = _curr )
    ),
    [Curr], DESC
)
ORDER BY [Curr] DESC`;
}

// ---------------------------------------------------------------------------
// Concentration — cross-filtering lists (subscription / service / region)
// ---------------------------------------------------------------------------

export type ConcDim = "sub" | "service" | "region";
export interface ConcSelection {
  sub?: string | null;
  service?: string | null;
  region?: string | null;
}

const CONC_COL: Record<ConcDim, string> = {
  sub: "focus_partitioned[SubAccountName]",
  service: "focus_partitioned[ServiceName]",
  region: "focus_partitioned[RegionName]",
};

/** Top-N of one dimension, cross-filtered by the current selection on the OTHER dims. */
export function concentrationDax(dim: ConcDim, sel: ConcSelection, n = 10): string {
  const dims: ConcDim[] = ["sub", "service", "region"];
  const filters = dims
    .filter((d) => d !== dim && sel[d])
    .map((d) => `        FILTER ( ALL ( ${CONC_COL[d]} ), ${CONC_COL[d]} = "${esc(sel[d]!)}" )`);
  const filterStr = filters.length ? filters.join(",\n") + ",\n" : "";
  return `EVALUATE
TOPN (
    ${n},
    SUMMARIZECOLUMNS (
        ${CONC_COL[dim]},
${filterStr}        "Cost", [FX Effective Cost]
    ),
    [Cost], DESC
)
ORDER BY [Cost] DESC`;
}

const RES_COL: Record<ConcDim, string> = {
  sub: "gold_cost_by_resource[SubAccountName]",
  service: "gold_cost_by_resource[ServiceName]",
  region: "gold_cost_by_resource[RegionName]",
};

/** Top resources cross-filtered by the current subscription/service/region selection. */
export function concentrationResourcesDax(sel: ConcSelection, n = 12): string {
  const dims: ConcDim[] = ["sub", "service", "region"];
  const filters = dims
    .filter((d) => sel[d])
    .map((d) => `        FILTER ( ALL ( ${RES_COL[d]} ), ${RES_COL[d]} = "${esc(sel[d]!)}" )`);
  const filterStr = filters.length ? filters.join(",\n") + ",\n" : "";
  return `EVALUATE
TOPN (
    ${n},
    SUMMARIZECOLUMNS (
        gold_cost_by_resource[ResourceName],
        gold_cost_by_resource[ResourceType],
        gold_cost_by_resource[ResourceGroupName],
        gold_cost_by_resource[SubAccountName],
        gold_cost_by_resource[ServiceName],
        gold_cost_by_resource[RegionName],
${filterStr}        "Cost", [Resource Effective Cost]
    ),
    [Cost], DESC
)
ORDER BY [Cost] DESC`;
}
