import { type ReactNode } from "react";

import { cn } from "@/lib/utils";
import { useRole, VIEW_META, type ViewKey } from "@/lib/roles";

export type { ViewKey };

function Caret({ dir }: { dir: "up" | "down" }) {
  return (
    <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
      {dir === "up" ? (
        <path d="M4 10l4-4 4 4" strokeLinecap="round" strokeLinejoin="round" />
      ) : (
        <path d="M4 6l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
      )}
    </svg>
  );
}

/** Left navigation (role-aware, reorderable) + framed content area. */
export function AppShell({ children }: { children: ReactNode }) {
  const {
    role,
    roles,
    setRoleId,
    views,
    activeView,
    setActiveView,
    moveView,
    resetOrder,
    customized,
  } = useRole();

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <aside className="flex w-60 shrink-0 flex-col border-r border-border bg-card p-l">
        <div className="mb-xl flex items-center gap-s">
          <div className="grid grid-cols-2 gap-[2px]">
            <span className="h-[10px] w-[10px]" style={{ background: "#F25022" }} />
            <span className="h-[10px] w-[10px]" style={{ background: "#7FBA00" }} />
            <span className="h-[10px] w-[10px]" style={{ background: "#00A4EF" }} />
            <span className="h-[10px] w-[10px]" style={{ background: "#FFB900" }} />
          </div>
          <span className="font-heading text-300 font-semibold leading-tight">
            Azure Cost Analyzer
          </span>
        </div>

        {/* Persona card + identity-driven role switch */}
        <div className="mb-l rounded-lg border border-border bg-secondary px-m py-l">
          <div className="flex items-center gap-m">
            <div
              className="grid h-11 w-11 shrink-0 place-items-center rounded-md text-300 font-semibold text-primary-foreground"
              style={{ background: role.accent }}
            >
              {role.initials}
            </div>
            <div className="min-w-0">
              <p className="text-300 font-semibold leading-tight text-foreground">{role.label}</p>
              <p className="mt-xxs text-200 leading-tight text-muted-foreground">{role.title}</p>
            </div>
          </div>
          <label className="mt-m block">
            <span className="text-100 font-semibold uppercase tracking-wide text-muted-foreground">
              Viewing as
            </span>
            <select
              value={role.id}
              onChange={(e) => setRoleId(e.target.value)}
              className="mt-xxs w-full rounded-md border border-border bg-card px-m py-s-nudge text-200 font-medium text-foreground transition-colors focus:border-primary focus:outline-none"
            >
              {roles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="mb-s flex items-center justify-between px-m">
          <span className="text-100 font-semibold uppercase tracking-wide text-muted-foreground">
            Views
          </span>
          {customized ? (
            <button
              type="button"
              onClick={resetOrder}
              className="text-100 font-medium text-muted-foreground underline-offset-2 hover:text-primary hover:underline"
            >
              Reset
            </button>
          ) : null}
        </div>

        <nav className="flex flex-col gap-xxs">
          {views.map((key, i) => {
            const meta = VIEW_META[key];
            const isActive = activeView === key;
            return (
              <div key={key} className="group flex items-center gap-xxs">
                <button
                  type="button"
                  onClick={() => setActiveView(key)}
                  className={cn(
                    "flex flex-1 items-center gap-s rounded-md px-m py-s-nudge text-left text-200 font-medium transition-colors",
                    isActive
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                  )}
                >
                  <span
                    aria-hidden
                    className="shrink-0 rounded-full transition-all"
                    style={{
                      background: meta.color,
                      width: 3,
                      height: isActive ? 18 : 12,
                    }}
                  />
                  {meta.label}
                </button>
                <div className="flex flex-col text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100">
                  <button
                    type="button"
                    aria-label={`Move ${meta.label} up`}
                    disabled={i === 0}
                    onClick={() => moveView(key, -1)}
                    className="grid h-3.5 w-4 place-items-center rounded hover:text-primary disabled:opacity-30"
                  >
                    <Caret dir="up" />
                  </button>
                  <button
                    type="button"
                    aria-label={`Move ${meta.label} down`}
                    disabled={i === views.length - 1}
                    onClick={() => moveView(key, 1)}
                    className="grid h-3.5 w-4 place-items-center rounded hover:text-primary disabled:opacity-30"
                  >
                    <Caret dir="down" />
                  </button>
                </div>
              </div>
            );
          })}
        </nav>
      </aside>

      <main className="min-w-0 flex-1 overflow-auto px-xxxl py-xxl">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  );
}

/** Consistent page header for every view. */
export function ViewHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <header className="mb-xl">
      <h1 className="font-heading text-[length:var(--text-hero-700)] font-semibold leading-hero-700 text-foreground">
        {title}
      </h1>
      {subtitle ? (
        <p className="mt-xxs text-300 text-muted-foreground">{subtitle}</p>
      ) : null}
    </header>
  );
}

/** Reusable "what would make this real" callout for demo-mode views. */
export function DemoBanner({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <div className="mb-l rounded-lg border border-primary/30 bg-primary/5 px-l py-m text-200 text-muted-foreground">
      <span className="font-semibold text-foreground">{title ?? "Demo mode"}:</span> {children}
    </div>
  );
}

/** Small rotating chevron for expand/collapse affordances. */
export function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className={cn("shrink-0 transition-transform duration-150", open && "rotate-180")}
      aria-hidden
    >
      <path d="M4 6l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Loading({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="grid h-64 place-items-center text-200 text-muted-foreground">
      {label}
    </div>
  );
}

export function ErrorState({ message }: { message?: string }) {
  return (
    <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-l text-200 text-destructive">
      Couldn&apos;t load data{message ? `: ${message}` : ""}.
    </div>
  );
}
