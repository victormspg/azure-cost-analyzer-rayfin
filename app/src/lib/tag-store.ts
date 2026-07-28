import { useCallback, useState } from "react";

/**
 * Governance store for tag write-back with a two-phase flow:
 *   1. stage()          — tags assigned locally (pending)
 *   2. markCommitted()  — tags pushed to Azure Resource Manager
 *
 * Every assignment keeps the real ARM `resourceId`, so committing PATCHes
 * `management.azure.com/{resourceId}/providers/Microsoft.Resources/tags/default`
 * through the tag-writer Azure Function (see src/lib/arm-client.ts).
 */

export type TagSet = Record<string, string>;

export type TagStatus = "staged" | "committed";

export interface Assignment {
  resourceId: string;
  resourceName: string;
  cost: number;
  tags: TagSet;
  status: TagStatus;
  stagedAt: string;
  committedAt?: string;
  simulated?: boolean;
}

const KEY = "aca.tags";

function read(): Record<string, Assignment> {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "{}") as Record<string, Assignment>;
  } catch {
    return {};
  }
}

function write(map: Record<string, Assignment>): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(map));
  } catch {
    /* ignore storage failures */
  }
}

export function tagCount(tags: TagSet): number {
  return Object.values(tags).filter(Boolean).length;
}

export function useTagStore() {
  const [map, setMap] = useState<Record<string, Assignment>>(read);

  const stage = useCallback(
    (input: { resourceId: string; resourceName: string; cost: number; tags: TagSet }) => {
      setMap((prev) => {
        const next = {
          ...prev,
          [input.resourceId]: {
            ...input,
            status: "staged" as const,
            stagedAt: new Date().toISOString(),
          },
        };
        write(next);
        return next;
      });
    },
    []
  );

  const markCommitted = useCallback((ids: string[], simulated: boolean) => {
    setMap((prev) => {
      const next = { ...prev };
      const now = new Date().toISOString();
      for (const id of ids) {
        if (next[id]) next[id] = { ...next[id], status: "committed", committedAt: now, simulated };
      }
      write(next);
      return next;
    });
  }, []);

  const remove = useCallback((resourceId: string) => {
    setMap((prev) => {
      const next = { ...prev };
      delete next[resourceId];
      write(next);
      return next;
    });
  }, []);

  const clear = useCallback(() => {
    setMap(() => {
      write({});
      return {};
    });
  }, []);

  return { map, stage, markCommitted, remove, clear };
}
