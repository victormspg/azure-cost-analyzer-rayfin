import { useEffect, useRef, useState } from "react";

import { useChat } from "@/lib/chat";
import { cn } from "@/lib/utils";
import { ViewHeader } from "./AppShell";

const SUGGESTIONS = [
  "Why did June go up?",
  "How much of my spend is untagged?",
  "What are my top services?",
  "Where can I save money?",
];

export function DataAgentChat() {
  const { messages, busy, send } = useChat();
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    requestAnimationFrame(() => scrollRef.current?.scrollTo({ top: 9e9, behavior: "smooth" }));
  }, [messages, busy]);

  function submit(text: string) {
    const q = text.trim();
    if (!q || busy) return;
    send(q);
    setInput("");
  }

  return (
    <>
      <ViewHeader title="FinOps Assistant" subtitle="Chat with your cost data in plain language" />

      <div className="mb-l rounded-lg border border-border bg-card p-l">
        <p className="mb-s text-100 font-semibold uppercase tracking-wide text-muted-foreground">
          How the assistant works
        </p>
        <ul className="grid grid-cols-1 gap-s text-100 text-muted-foreground sm:grid-cols-2">
          <li>
            <b className="text-foreground">Grounded</b> — connected to the published Data Agent over
            your semantic model, so answers reflect your real cost data.
          </li>
          <li>
            <b className="text-foreground">Ask in plain language</b> — why costs changed, what&apos;s
            untagged, your top services, or where to save.
          </li>
        </ul>
      </div>

      <div className="flex h-[calc(100vh-17rem)] min-h-[24rem] flex-col overflow-hidden rounded-lg border border-border bg-card">
        <div ref={scrollRef} className="flex-1 space-y-m overflow-auto p-l">
          {messages.map((m, i) => (
            <div key={i} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
              <div
                className={cn(
                  "max-w-[80%] rounded-xl px-l py-m text-200",
                  m.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "border border-border bg-background text-foreground"
                )}
              >
                {m.text}
              </div>
            </div>
          ))}
          {busy ? (
            <div className="flex justify-start">
              <div className="flex items-center gap-xs rounded-xl border border-border bg-background px-l py-m">
                <Dot delay={0} />
                <Dot delay={150} />
                <Dot delay={300} />
              </div>
            </div>
          ) : null}
        </div>

        <div className="border-t border-border p-m">
          <div className="mb-s flex flex-wrap gap-xs">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                type="button"
                disabled={busy}
                onClick={() => submit(s)}
                className="rounded-full border border-border px-m py-xs text-100 font-medium text-muted-foreground transition-colors hover:border-primary hover:text-primary disabled:opacity-50"
              >
                {s}
              </button>
            ))}
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              submit(input);
            }}
            className="flex items-center gap-s"
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about trends, drivers, tags, savings…"
              className="flex-1 rounded-md border border-border bg-background px-l py-s-nudge text-200 text-foreground focus:border-primary focus:outline-none"
            />
            <button
              type="submit"
              disabled={!input.trim() || busy}
              className="rounded-md bg-primary px-l py-s-nudge text-200 font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-40"
            >
              {busy ? "…" : "Send"}
            </button>
          </form>
        </div>
      </div>
    </>
  );
}

function Dot({ delay }: { delay: number }) {
  return (
    <span
      className="inline-block h-2 w-2 animate-bounce rounded-full bg-muted-foreground"
      style={{ animationDelay: `${delay}ms` }}
    />
  );
}
