import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api } from "../services/api";
import type { CampEvent } from "../services/types";

// The events the signed-in viewer can open, loaded once for the sidebar and the topbar.
// Pages that create or rename an event call reload() so the navigation shows the change at once.
export interface WorkspaceEventsValue {
  events: CampEvent[];
  state: "loading" | "ready" | "error";
  reload: () => void;
}

const IDLE: WorkspaceEventsValue = { events: [], state: "loading", reload: () => undefined };
const WorkspaceEventsContext = createContext<WorkspaceEventsValue | null>(null);

export function WorkspaceEventsProvider({ children }: { children: ReactNode }) {
  const [events, setEvents] = useState<CampEvent[]>([]);
  const [state, setState] = useState<WorkspaceEventsValue["state"]>("loading");
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    api
      .listEvents()
      .then(({ events: loaded }) => {
        if (cancelled) return;
        setEvents(loaded);
        setState("ready");
      })
      .catch(() => {
        if (!cancelled) setState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [version]);

  const reload = useCallback(() => setVersion((v) => v + 1), []);
  const value = useMemo(() => ({ events, state, reload }), [events, state, reload]);
  return <WorkspaceEventsContext.Provider value={value}>{children}</WorkspaceEventsContext.Provider>;
}

// Outside the provider (in isolated page tests) there is no list, and reload does nothing.
export function useWorkspaceEvents(): WorkspaceEventsValue {
  return useContext(WorkspaceEventsContext) ?? IDLE;
}
