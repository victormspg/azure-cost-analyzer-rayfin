import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type ViewKey =
  | "summary2"
  | "explorer"
  | "action"
  | "anomaly"
  | "chargeback"
  | "dataagent";

export const VIEW_META: Record<ViewKey, { label: string; color: string; blurb: string }> = {
  summary2: { label: "Executive Summary", color: "#0f6cbd", blurb: "12-month scorecard" },
  explorer: { label: "Explorer", color: "#5c2e91", blurb: "Slice, compare & see what changed" },
  action: { label: "Action Center", color: "#e3008c", blurb: "Fix what matters" },
  anomaly: { label: "Unusual Spend", color: "#ca5010", blurb: "Cost that jumped" },
  chargeback: { label: "Chargeback", color: "#c19c00", blurb: "Cost by team" },
  dataagent: { label: "FinOps Assistant", color: "#00b7c3", blurb: "Chat with your data" },
};

export interface RoleDef {
  id: string;
  label: string;
  title: string;
  initials: string;
  accent: string;
  views: ViewKey[];
}

/**
 * Persona → tailored experience. In a deployed app the signed-in user's Entra
 * groups map to one of these roles; here the switcher lets us demo the same
 * identity-driven behavior. Each role gets its own view set AND default order.
 */
export const ROLES: RoleDef[] = [
  {
    id: "cfo",
    label: "CFO",
    title: "Financial Leader",
    initials: "CF",
    accent: "var(--color-primary)",
    views: ["summary2", "explorer", "anomaly", "chargeback", "action", "dataagent"],
  },
  {
    id: "finops",
    label: "FinOps Lead",
    title: "Optimization Owner",
    initials: "FL",
    accent: "#8764b8",
    views: ["explorer", "action", "anomaly", "chargeback", "dataagent"],
  },
  {
    id: "engineer",
    label: "Engineer",
    title: "Service Owner",
    initials: "EN",
    accent: "#0f7b0f",
    views: ["explorer", "action", "anomaly", "dataagent"],
  },
  {
    id: "admin",
    label: "Platform Admin",
    title: "Governance & Tags",
    initials: "PA",
    accent: "#c19c00",
    views: ["action", "chargeback", "explorer", "anomaly", "summary2", "dataagent"],
  },
];

const STORAGE_PREFIX = "aca.order.";

function loadOrder(roleId: string, base: ViewKey[]): ViewKey[] {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + roleId);
    if (!raw) return base;
    const saved = JSON.parse(raw) as ViewKey[];
    // keep only views still allowed for this role, then append any new ones
    const kept = saved.filter((v) => base.includes(v));
    const missing = base.filter((v) => !kept.includes(v));
    return [...kept, ...missing];
  } catch {
    return base;
  }
}

interface RoleState {
  role: RoleDef;
  roles: RoleDef[];
  setRoleId: (id: string) => void;
  views: ViewKey[];
  activeView: ViewKey;
  setActiveView: (v: ViewKey) => void;
  moveView: (v: ViewKey, dir: -1 | 1) => void;
  resetOrder: () => void;
  customized: boolean;
}

const RoleContext = createContext<RoleState | null>(null);

export function RoleProvider({ children }: { children: ReactNode }) {
  const [roleId, setRoleId] = useState<string>(ROLES[0].id);
  const [orders, setOrders] = useState<Record<string, ViewKey[]>>({});
  const [customFlags, setCustomFlags] = useState<Record<string, boolean>>({});
  const [activeView, setActiveView] = useState<ViewKey>(ROLES[0].views[0]);

  const role = useMemo(() => ROLES.find((r) => r.id === roleId) ?? ROLES[0], [roleId]);

  const views = useMemo(
    () => orders[roleId] ?? loadOrder(roleId, role.views),
    [orders, roleId, role.views]
  );

  // Keep the active view valid whenever the role (and its view set) changes.
  useEffect(() => {
    if (!views.includes(activeView)) setActiveView(views[0]);
  }, [views, activeView]);

  const persist = (id: string, next: ViewKey[]) => {
    setOrders((o) => ({ ...o, [id]: next }));
    setCustomFlags((f) => ({ ...f, [id]: true }));
    try {
      localStorage.setItem(STORAGE_PREFIX + id, JSON.stringify(next));
    } catch {
      /* ignore storage failures */
    }
  };

  const moveView = (v: ViewKey, dir: -1 | 1) => {
    const cur = [...views];
    const i = cur.indexOf(v);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= cur.length) return;
    [cur[i], cur[j]] = [cur[j], cur[i]];
    persist(roleId, cur);
  };

  const resetOrder = () => {
    setOrders((o) => {
      const next = { ...o };
      delete next[roleId];
      return next;
    });
    setCustomFlags((f) => ({ ...f, [roleId]: false }));
    try {
      localStorage.removeItem(STORAGE_PREFIX + roleId);
    } catch {
      /* ignore */
    }
  };

  const value: RoleState = {
    role,
    roles: ROLES,
    setRoleId,
    views,
    activeView,
    setActiveView,
    moveView,
    resetOrder,
    customized: Boolean(customFlags[roleId] ?? localStorage.getItem(STORAGE_PREFIX + roleId)),
  };

  return <RoleContext.Provider value={value}>{children}</RoleContext.Provider>;
}

export function useRole(): RoleState {
  const ctx = useContext(RoleContext);
  if (!ctx) throw new Error("useRole must be used within a RoleProvider");
  return ctx;
}
