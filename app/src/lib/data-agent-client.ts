/**
 * Data Agent client.
 *
 * onClick → askAgent(question) returns a Promise the UI awaits (typing state).
 *
 * Demo: resolves a grounded canned answer after a short delay — so the async
 * wait/receive UX is real even with no backend.
 *
 * Live: set `VITE_DATA_AGENT_URL` to the Fabric **User Data Function** (UDF)
 * public URL. The UDF (`ask(userQuestion)`) authenticates to the published
 * Fabric Data Agent with a Service Principal and returns the answer. The UDF
 * REST contract is:
 *   POST <url>  { "userQuestion": "..." }
 *   → { "status": "Succeeded", "output": "<answer>", "errors": [] }
 * Auth: `Authorization: Bearer <token>` (Power BI scope
 * `https://analysis.windows.net/powerbi/api/user_impersonation`). For a quick
 * end-to-end test, drop a short-lived token in `VITE_DATA_AGENT_TOKEN`
 * (e.g. `az account get-access-token --resource https://analysis.windows.net/powerbi/api`);
 * production should acquire it per-user via MSAL SSO.
 */

const ENDPOINT = import.meta.env.VITE_DATA_AGENT_URL as string | undefined;
const KEY = import.meta.env.VITE_DATA_AGENT_KEY as string | undefined;

export function isAgentConfigured(): boolean {
  return Boolean(ENDPOINT);
}

/**
 * Bearer token for the UDF endpoint. For now: a short-lived token from
 * `VITE_DATA_AGENT_TOKEN` (quick testing) — swap for MSAL SSO acquisition later.
 * Returns undefined when unset (e.g. an Anonymous-auth function).
 */
async function getAccessToken(): Promise<string | undefined> {
  return import.meta.env.VITE_DATA_AGENT_TOKEN as string | undefined;
}

function canned(qRaw: string): string {
  const q = qRaw.toLowerCase();
  if (/(june|junio|increase|\bup\b|subi|why|change)/.test(q))
    return "June spend was $1,091 — up 97% from May ($553). Analytics drove +$479 of the +$539 move, mostly Microsoft.Fabric (usage roughly doubled, 1,163 → 2,745 units) and Azure AI Search. It reads like a real usage surge, not a rate change.";
  if (/(untag|tag|govern)/.test(q))
    return "About 76% of spend has no Project tag — the largest single item is the Fabric capacity 'vmspfabriccapacityf2' (~$821). Head to Tag Studio to assign the 4 mandatory tags (Project, Environment, Owner, Team) and commit them to Azure.";
  if (/(top|service|concentrat|where.*spend)/.test(q))
    return "Your top 3 services are Microsoft.Fabric (~$820), Azure DB for PostgreSQL (~$654) and Azure AI Search (~$348) — together ~80% of spend. Geographically, West US 3 holds ~70%.";
  if (/(save|saving|optimi|reduce|cost down)/.test(q))
    return "Effective savings vs list price is only ~0.1% — there are no reservations or commitments in play. Quick wins: tag the untagged 76% for accountability, and review the Fabric capacity concentration in Action Center.";
  return "I can answer questions about your Azure cost: trends, drivers, tagging, concentration and savings. Try one of the suggested prompts to see grounded answers from the model.";
}

interface UdfResponse {
  status?: string;
  output?: unknown;
  errors?: Array<{ name?: string; message?: string }>;
  // legacy Azure Function shape
  answer?: string;
  reply?: string;
}

export async function askAgent(question: string): Promise<string> {
  if (!ENDPOINT) {
    await new Promise((r) => setTimeout(r, 700 + Math.random() * 500));
    return canned(question);
  }

  const token = await getAccessToken();
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(KEY ? { "x-functions-key": KEY } : {}),
    },
    body: JSON.stringify({ userQuestion: question }),
  });
  if (!res.ok) throw new Error(`Agent error ${res.status}`);

  const data = (await res.json()) as UdfResponse;

  // UDF envelope: surface non-success as an error the chat can show.
  if (data.status && data.status !== "Succeeded") {
    throw new Error(data.errors?.[0]?.message ?? data.status);
  }

  const out = data.output ?? data.answer ?? data.reply;
  if (typeof out === "string") return out;
  return out != null ? JSON.stringify(out) : "No answer returned.";
}

