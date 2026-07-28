import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";

import { askAgent } from "./data-agent-client";

export type Msg = { role: "user" | "agent"; text: string };

interface ChatState {
  messages: Msg[];
  busy: boolean;
  send: (text: string) => void;
}

const ChatContext = createContext<ChatState | null>(null);

/**
 * Holds the Ask ACA conversation ABOVE the view tree, so it survives view
 * switches: navigate away while a reply is in flight and the answer still lands
 * (this provider stays mounted). Come back and the full conversation — plus the
 * typing indicator if still running — is exactly where you left it.
 */
export function ChatProvider({ children }: { children: ReactNode }) {
  const [messages, setMessages] = useState<Msg[]>([
    {
      role: "agent",
      text: "Hi — I'm ACA, your FinOps assistant. Ask me why costs changed, what's untagged, or where to save.",
    },
  ]);
  const [busy, setBusy] = useState(false);

  const send = useCallback(
    (text: string) => {
      const q = text.trim();
      if (!q || busy) return;
      setMessages((m) => [...m, { role: "user", text: q }]);
      setBusy(true);
      askAgent(q)
        .then((reply) => setMessages((m) => [...m, { role: "agent", text: reply }]))
        .catch((e) =>
          setMessages((m) => [...m, { role: "agent", text: `Sorry — I couldn't reach the agent (${String(e)}).` }])
        )
        .finally(() => setBusy(false));
    },
    [busy]
  );

  return <ChatContext.Provider value={{ messages, busy, send }}>{children}</ChatContext.Provider>;
}

export function useChat(): ChatState {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error("useChat must be used within a ChatProvider");
  return ctx;
}
