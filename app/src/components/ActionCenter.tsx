import { useMemo } from "react";

import { governanceResourcesDax } from "@/queries/cfo/builders";
import { useSemanticModelQuery } from "@/hooks/use-semantic-model-query";
import { useTagSchema } from "@/hooks/use-tag-schema";
import { usePeriod } from "@/lib/period";
import { useTagStore } from "@/lib/tag-store";
import { cn } from "@/lib/utils";
import { fmtUsd } from "@/lib/format";

import { ViewHeader, Loading, ErrorState } from "./AppShell";

type ResRow = {
  id: string;
  name: string;
  type: string;
  rg: string;
  sub: string;
  service: string;
  /** tag value per schema column (same order as the tag schema). */
  tagVals: string[];
  curr: number;
};

type Severity = "high" | "medium" | "low";
type Rec = {
  id: string;
  title: string;
  analysis: string;
  impact: number;
  severity: Severity;
  resourceId: string;
  service: string;
  name: string;
};

const SEV_STYLE: Record<Severity, string> = {
  high: "border-l-destructive",
  medium: "border-l-warning",
  low: "border-l-primary",
};
const SEV_BADGE: Record<Severity, string> = {
  high: "bg-destructive/15 text-destructive",
  medium: "bg-warning/15 text-warning",
  low: "bg-primary/15 text-primary",
};

function severityFor(v: number): Severity {
  return v > 100 ? "high" : v > 20 ? "medium" : "low";
}

function portalUrl(resourceId: string): string {
  return `https://portal.azure.com/#resource${resourceId}/overview`;
}

export function ActionCenter() {
  // Governance snapshot for the most recent COMPLETE month (the partial current calendar month
  // is excluded by the shared PeriodProvider). Tag keys are DISCOVERED at runtime from the model
  // (dim_tag_key), so this works against the demo tags AND any customer's real FOCUS tags.
  const { currYm, ready } = usePeriod();
  const { columns, isLoading: schemaLoading, error: schemaError } = useTagSchema();
  const { map } = useTagStore();

  const canQuery = ready && !schemaLoading;
  const query = useMemo(
    () => (canQuery ? governanceResourcesDax(currYm, columns.map((c) => c.column)) : ""),
    [canQuery, currYm, columns]
  );
  const { data, isLoading, error } = useSemanticModelQuery({ connection: "aca", query });

  const header = (
    <ViewHeader
      title="Action Center"
      subtitle="Untagged resources to fix — this month's governance gaps"
    />
  );

  if (!ready || schemaLoading || isLoading)
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
          message={
            data?.status === "error" ? data.error.message : (schemaError ?? error)?.message
          }
        />
      </>
    );
  if (data?.status !== "success") return null;

  const nTags = columns.length;
  const resourcesRaw: ResRow[] = (data.table.rows as unknown as unknown[][]).map((row) => {
    const cost = Number(row[6 + nTags] ?? 0);
    return {
      id: String(row[0]),
      name: String(row[1] ?? "—"),
      type: String(row[2] ?? "—"),
      rg: String(row[3] ?? ""),
      sub: String(row[4] ?? ""),
      service: String(row[5] ?? ""),
      tagVals: columns.map((_, i) => String(row[6 + i] ?? "Untagged")),
      curr: cost,
    };
  });

  // Same ARM ResourceId can appear under multiple name casings — dedupe & sum.
  const byId = new Map<string, ResRow>();
  for (const r of resourcesRaw) {
    const ex = byId.get(r.id);
    if (ex) ex.curr += r.curr;
    else byId.set(r.id, { ...r });
  }
  const resources = [...byId.values()].sort((a, b) => b.curr - a.curr);

  const recs: Rec[] = [];
  for (const r of resources) {
    const assigned = map[r.id]?.tags;
    // A tag is missing when its column value is "Untagged" AND it hasn't been locally assigned.
    const missing = columns
      .filter((c, i) => {
        const local = assigned?.[c.key];
        const source = r.tagVals[i];
        const present = Boolean(local) || (source && source !== "Untagged");
        return !present;
      })
      .map((c) => c.display);

    if (missing.length > 0 && r.curr > 0) {
      recs.push({
        id: `${r.id}:untagged`,
        title: `Tag ${r.name}`,
        analysis: `${r.service} · missing ${missing.join(", ")}. ${fmtUsd(r.curr)}/mo can't be fully charged back.`,
        impact: r.curr,
        severity: severityFor(r.curr),
        resourceId: r.id,
        service: r.service,
        name: r.name,
      });
    }
  }

  recs.sort((a, b) => b.impact - a.impact);
  const shown = recs.slice(0, 12);
  const addressable = shown.reduce((s, r) => s + r.impact, 0);
  const tagList = columns.map((c) => c.display).join(", ") || "the required tags";

  return (
    <>
      {header}

      <div className="mb-l rounded-lg border border-border bg-card p-l">
        <p className="mb-s text-100 font-semibold uppercase tracking-wide text-muted-foreground">
          How these alerts are generated
        </p>
        <p className="text-100 text-muted-foreground">
          <b className="text-foreground">Governance</b> — a resource is missing one or more of the
          tag keys defined for this tenant ({tagList}). Until it&apos;s fully tagged, its cost
          can&apos;t be attributed to a team or project for chargeback. Jump straight to the
          resource with <b className="text-foreground">Open in Portal</b> to fix it.
        </p>
      </div>

      <div className="mb-xl grid grid-cols-1 gap-l sm:grid-cols-3">
        <div className="rounded-lg border border-border bg-card px-xl py-l">
          <p className="text-200 font-medium uppercase tracking-wide text-muted-foreground">Open Recommendations</p>
          <p className="mt-xs font-numeric text-[length:var(--text-hero-700)] font-semibold leading-hero-700 text-foreground">
            {shown.length}
          </p>
          <p className="mt-xxs text-100 text-muted-foreground">untagged resources this month</p>
        </div>
        <div className="rounded-lg border border-border bg-card px-xl py-l">
          <p className="text-200 font-medium uppercase tracking-wide text-muted-foreground">Addressable Impact</p>
          <p className="mt-xs font-numeric text-[length:var(--text-hero-700)] font-semibold leading-hero-700 text-warning">
            {fmtUsd(addressable, 0)}
          </p>
          <p className="mt-xxs text-100 text-muted-foreground">monthly spend in scope</p>
        </div>
        <div className="rounded-lg border border-border bg-card px-xl py-l">
          <p className="text-200 font-medium uppercase tracking-wide text-muted-foreground">Top Untagged</p>
          <p className="mt-xs truncate text-[length:var(--text-hero-700)] font-semibold leading-hero-700 text-foreground">
            {shown[0]?.service ?? "—"}
          </p>
          <p className="mt-xxs truncate text-100 text-muted-foreground">{shown[0]?.name ?? "All clear"}</p>
        </div>
      </div>

      {shown.length === 0 ? (
        <div className="rounded-lg border border-border bg-card px-l py-xl text-center text-200 text-muted-foreground">
          🎉 Every resource with spend this month is fully tagged.
        </div>
      ) : (
        <div className="flex flex-col gap-m">
          {shown.map((r) => (
            <div key={r.id} className={cn("rounded-lg border border-border border-l-4 bg-card p-l", SEV_STYLE[r.severity])}>
              <div className="flex items-start justify-between gap-m">
                <div className="min-w-0">
                  <div className="flex items-center gap-s">
                    <span className={cn("rounded-full px-s py-[1px] text-100 font-semibold", SEV_BADGE[r.severity])}>
                      Governance
                    </span>
                    <h3 className="truncate text-300 font-semibold text-foreground">{r.title}</h3>
                  </div>
                  <p className="mt-xs text-200 text-foreground">{r.analysis}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="font-numeric text-300 font-semibold text-foreground">{fmtUsd(r.impact)}</p>
                  <p className="text-100 text-muted-foreground">impact / mo</p>
                </div>
              </div>
              <div className="mt-m flex flex-wrap items-center gap-s">
                <a
                  href={portalUrl(r.resourceId)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-9 items-center justify-center gap-xs rounded-md border border-border px-l text-100 font-semibold text-foreground transition-colors hover:border-primary hover:bg-secondary"
                >
                  Open in Portal
                  <span aria-hidden>↗</span>
                </a>
                <span className="truncate text-100 text-muted-foreground" title={r.resourceId}>
                  {r.resourceId}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
