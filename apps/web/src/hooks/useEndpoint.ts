"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { setApiEndpoint } from "@/lib/api";

export type EndpointStatus = "connected" | "disconnected" | "checking";

interface EndpointState {
  url: string;
  status: EndpointStatus;
}

export function useEndpoint() {
  const [state, setState] = useState<EndpointState>({
    url: process.env.NEXT_PUBLIC_API_URL || "http://localhost:5001",
    status: "checking",
  });
  const intervalRef = useRef<ReturnType<typeof setInterval>>(undefined);

  const checkHealth = useCallback(async (url: string) => {
    setState((prev) => ({ ...prev, status: "checking" }));
    try {
      const res = await fetch(`${url}/api/health`, { signal: AbortSignal.timeout(5000) });
      setState({ url, status: res.ok ? "connected" : "disconnected" });
    } catch {
      setState((prev) => ({ ...prev, status: "disconnected" }));
    }
  }, []);

  const setUrl = useCallback(
    (url: string) => {
      setApiEndpoint(url);
      setState({ url, status: "checking" });
      checkHealth(url);
    },
    [checkHealth],
  );

  const refresh = useCallback(() => {
    checkHealth(state.url);
  }, [state.url, checkHealth]);

  useEffect(() => {
    checkHealth(state.url);
    intervalRef.current = setInterval(() => checkHealth(state.url), 30000);
    return () => clearInterval(intervalRef.current);
  }, [state.url, checkHealth]);

  return { url: state.url, status: state.status, setUrl, refresh };
}
