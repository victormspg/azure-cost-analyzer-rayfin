import { useEffect, useMemo, useState } from "react";

import { chargebackResourcesDax } from "@/queries/cfo/builders";
import { useSemanticModelQuery } from "@/hooks/use-semantic-model-query";
import { useTagSchema } from "@/hooks/use-tag-schema";
import { useTagStore } from "@/lib/tag-store";
import { cn } from "@/lib/utils";
import { fmtUsd, fmtPct } from "@/lib/format";

import { ViewHeader, Loading, ErrorState, Chevron } from "./AppShell";

type ResRow = {
  id: string;
  name: string;
  type: string;
  rg: string;
  sub: string;
  service: string;
  /** tag value keyed by WIDE column name. */
  tags: Record<string, string>;
  cost: number;
};

const PALETTE = ["#0f6cbd", "#8764b8", "#0f7b0f", "#c19c00", "#c94f4f", "#5c2e91", "#038387", "#8e562e"];

export function Chargeback() {
  const { columns, isLoading: schemaLoading, error: schemaError } = useTagSchema();
  const tagCols = useMemo(() => columns.map((c) => c.column), [columns]);
  const query = useMemo(
    () => (schemaLoading ? "" : chargebackResourcesDax(tagCols)),
    [schemaLoading, tagCols]
  );
  const { data, isLoading, error } = useSemanticModelQuery({ connection: "aca", query });
  const { map } = useTagStore();

  // Group-by dimensions are tag COLUMNS; default to the top-ranked tag once the schema loads.
  const [dims, setDims] = useState<string[]>([]);
  useEffect(() => {
    if (columns.length && dims.length === 0) setDims([columns[0].column]);
  }, [columns, dims.length]);

  const [openKey, setOpenKey] = useState<string | null>(null);
  const [valueFilters, setValueFilters] = useState<Record<string, string[]>>({});
  const toggleValue = (d: string, v: string) =>
    setValueFilters((cur) => {
      const list = cur[d] ?? [];
      return { ...cur, [d]: list.includes(v) ? list.filter((x) => x !== v) : [...list, v] };
    });

  const toggleDim = (d: string) =>
    setDims((cur) => {
      if (cur.includes(d)) return cur.length === 1 ? cur : cur.filter((x) => x !== d);
      return [...cur, d];
    });

  const header = <ViewHeader title="Chargeback" subtitle="Allocate spend across your resource tags" />;

  if (schemaLoading || isLoading)
    return (
      <>
        {header}
        <Loading />
      </>
    );
  if (schemaError || error || data?.status === "error")
    return (
      <>
        {header}
        <ErrorState
          message={data?.status === "error" ? data.error.message : (schemaError ?? error)?.message}
        />
      </>
    );
  if (data?.status !== "success") return null;

  // key <-> column helpers from the (dynamic) tag schema.
  const colToKey = new Map(columns.map((c) => [c.column, c.key]));
  const colToLabel = new Map(columns.map((c) => [c.column, c.display]));
  const nTags = columns.length;

  const resources: ResRow[] = (data.table.rows as unknown as unknown[][])
    .map((row) => {
      const tags: Record<string, string> = {};
      columns.forEach((c, i) => (tags[c.column] = String(row[6 + i] ?? "Untagged") || "Untagged"));
      return {
        id: String(row[0]),
        name: String(row[1] ?? "—"),
        type: String(row[2] ?? "\u2014") || "\u2014",
        rg: String(row[3] ?? ""),
        sub: String(row[4] ?? ""),
        service: String(row[5] ?? ""),
        tags,
        cost: Number(row[6 + nTags] ?? 0),
      };
    })
    .filter((r) => r.cost >= 1);

  // Resolve a resource's value for a tag column; locally-assigned tags (Tag now) override source.
  const resolveOne = (r: ResRow, col: string): string => {
    const key = colToKey.get(col);
    const local = key ? map[r.id]?.tags?.[key] : undefined;
    return local || r.tags[col] || "Untagged";
  };
  const resolve = (r: ResRow): string => dims.map((d) => resolveOne(r, d)).join(" · ");
  const dimsLabel = dims.map((d) => colToLabel.get(d) ?? d).join(" + ");

  // Distinct values present per selected dim (options for the value filters).
  const valuesByDim: Record<string, string[]> = {};
  for (const d of dims) {
    const set = new Set<string>();
    for (const r of resources) set.add(resolveOne(r, d));
    valuesByDim[d] = Array.from(set).sort((a, b) => {
      const au = a === "Untagged" || a === "Unassigned";
      const bu = b === "Untagged" || b === "Unassigned";
      if (au !== bu) return au ? 1 : -1;
      return a.localeCompare(b);
    });
  }

  // Keep only resources matching every active value filter (empty filter = all values).
  const filteredResources = resources.filter((r) =>
    dims.every((d) => {
      const vf = valueFilters[d] ?? [];
      return !vf.length || vf.includes(resolveOne(r, d));
    })
  );

  const groupsMap = new Map<string, { cost: number; items: ResRow[] }>();
  for (const r of filteredResources) {
    const key = resolve(r);
    const g = groupsMap.get(key) ?? { cost: 0, items: [] };
    g.cost += r.cost;
    g.items.push(r);
    groupsMap.set(key, g);
  }
  const groups = Array.from(groupsMap.entries())
    .map(([key, g]) => ({ key, cost: g.cost, items: g.items.sort((a, b) => b.cost - a.cost) }))
    .sort((a, b) => b.cost - a.cost);

  const total = groups.reduce((s, g) => s + g.cost, 0);
  const max = Math.max(1, ...groups.map((g) => g.cost));

  return (
    <>
      {header}

      <div className="mb-l rounded-lg border border-border bg-card p-l">
        <p className="mb-s text-100 font-semibold uppercase tracking-wide text-muted-foreground">
          How chargeback works
        </p>
        <ul className="grid grid-cols-1 gap-s text-100 text-muted-foreground sm:grid-cols-2">
          <li>
            <b className="text-foreground">Group by</b> — resource cost is allocated across the tag
            keys discovered in this tenant. Pick one or several to slice by.
          </li>
          <li>
            <b className="text-foreground">Filter</b> — narrow to specific tag values to see just those
            combinations, each with its resources listed underneath.
          </li>
        </ul>
      </div>

      {/* Controls: group by + value filters (single card) */}
      <div className="mb-l rounded-lg border border-border bg-card p-l">
        <div className="flex flex-wrap items-center gap-s">
          <span className="text-100 font-semibold uppercase tracking-wide text-muted-foreground">Group by</span>
          <div className="inline-flex flex-wrap gap-xxs">
            {columns.map((c) => {
              const selected = dims.includes(c.column);
              return (
                <button
                  key={c.column}
                  type="button"
                  onClick={() => {
                    toggleDim(c.column);
                    setOpenKey(null);
                  }}
                  className={cn(
                    "rounded-md px-l py-s-nudge text-200 font-medium transition-colors",
                    selected
                      ? "bg-primary text-primary-foreground"
                      : "border border-border text-muted-foreground hover:text-foreground"
                  )}
                >
                  {c.display}
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-m flex flex-col gap-m border-t border-border pt-m">
          {dims.map((d) => {
            const opts = valuesByDim[d] ?? [];
            const selVals = valueFilters[d] ?? [];
            return (
              <div key={d} className="flex flex-wrap items-center gap-xs">
                <span className="w-28 shrink-0 text-100 font-semibold uppercase tracking-wide text-muted-foreground">
                  {colToLabel.get(d) ?? d}
                </span>
                {opts.length === 0 ? (
                  <span className="text-100 text-muted-foreground">No values</span>
                ) : (
                  opts.map((v) => {
                    const on = selVals.includes(v);
                    const empty = v === "Untagged" || v === "Unassigned";
                    return (
                      <button
                        key={v}
                        type="button"
                        onClick={() => toggleValue(d, v)}
                        className={cn(
                          "rounded-full border px-m py-xs text-100 font-medium transition-colors",
                          on
                            ? "border-primary bg-primary/10 text-primary"
                            : empty
                              ? "border-warning/40 text-warning hover:bg-warning/10"
                              : "border-border text-muted-foreground hover:text-foreground"
                        )}
                      >
                        {v}
                      </button>
                    );
                  })
                )}
                {selVals.length ? (
                  <button
                    type="button"
                    onClick={() => setValueFilters((c) => ({ ...c, [d]: [] }))}
                    className="ml-xs text-100 font-medium text-muted-foreground underline-offset-2 hover:text-primary hover:underline"
                  >
                    clear
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border bg-secondary/50 px-l py-m">
          <h3 className="text-300 font-semibold text-foreground">
            Statement by {dimsLabel}
          </h3>
          <span className="text-100 text-muted-foreground">
            <b className="font-numeric text-foreground">{fmtUsd(total, 0)}</b> across {groups.length} group{groups.length === 1 ? "" : "s"}
          </span>
        </div>
        <div className="divide-y divide-border">
          {groups.map((g, i) => {
            const isOpen = openKey === g.key;
            const unassignedKey = g.key.includes("Unassigned") || g.key.includes("Untagged");
            return (
              <div key={g.key}>
                <button
                  type="button"
                  onClick={() => setOpenKey(isOpen ? null : g.key)}
                  className="flex w-full items-center gap-m px-l py-m text-left transition-colors hover:bg-secondary/40"
                >
                  <span className="text-muted-foreground">
                    <Chevron open={isOpen} />
                  </span>
                  <span className="flex w-60 shrink-0 flex-wrap gap-xxs">
                    {g.key.split(" · ").map((part, idx) => {
                      const empty = part === "Unassigned" || part === "Untagged";
                      return (
                        <span
                          key={idx}
                          className={cn(
                            "rounded px-xs py-[1px] text-100",
                            empty ? "bg-warning/15 text-warning" : "bg-secondary text-foreground"
                          )}
                        >
                          <span className="text-muted-foreground">
                            {(colToLabel.get(dims[idx]) ?? dims[idx])}:
                          </span>{" "}
                          {part}
                        </span>
                      );
                    })}
                  </span>
                  <div className="relative h-5 flex-1 rounded bg-secondary">
                    <div
                      className="h-full rounded"
                      style={{ width: `${(g.cost / max) * 100}%`, background: unassignedKey ? "var(--color-warning)" : PALETTE[i % PALETTE.length] }}
                    />
                  </div>
                  <span className="w-20 shrink-0 text-right font-numeric text-200 font-semibold text-foreground">
                    {fmtUsd(g.cost)}
                  </span>
                  <span className="w-12 shrink-0 text-right text-100 text-muted-foreground">
                    {fmtPct(total ? g.cost / total : 0, 0)}
                  </span>
                </button>

                {isOpen ? (
                  <div className="max-h-96 overflow-auto border-t border-border bg-secondary/30 px-l py-s">
                    <div className="flex items-center gap-m py-xs text-100 uppercase tracking-wide text-muted-foreground">
                      <span className="w-56 shrink-0">Resource</span>
                      <span className="flex-1">Subscription · Resource group · Type</span>
                      <span className="shrink-0">Cost</span>
                    </div>
                    {g.items.map((r) => (
                      <div key={r.id} className="flex items-center gap-m py-xs" title={r.id}>
                        <span className="w-56 shrink-0 truncate text-100 text-foreground">{r.name}</span>
                        <span className="flex-1 truncate text-100 text-muted-foreground">
                          {r.sub} · {r.rg} · {r.type}
                        </span>
                        <span className="shrink-0 font-numeric text-100 text-foreground">{fmtUsd(r.cost)}</span>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
