"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { setApiEndpoint } from "@/lib/api";

export type EndpointStatus = "connected" | "disconnected" | "checking";
export type SandboxStatus = "ready" | "building" | "error" | "not_checked" | null;

interface EndpointState {
  url: string;
  status: EndpointStatus;
  sandboxStatus: SandboxStatus;
}

export function useEndpoint() {
  const [state, setState] = useState<EndpointState>({
    url: process.env.NEXT_PUBLIC_API_URL || "http://localhost:5001",
    status: "checking",
    sandboxStatus: null,
  });
  const intervalRef = useRef<ReturnType<typeof setInterval>>(undefined);

  const checkHealth = useCallback(async (url: string) => {
    setState((prev) => ({ ...prev, status: "checking" }));
    try {
      const res = await fetch(`${url}/api/health`, { signal: AbortSignal.timeout(5000) });
      if (res.ok) {
        const data = await res.json();
        const sandbox = data.sandbox?.status ?? null;
        setState({ url, status: "connected", sandboxStatus: sandbox });
      } else {
        setState({ url, status: "disconnected", sandboxStatus: null });
      }
    } catch {
      setState((prev) => ({ ...prev, status: "disconnected", sandboxStatus: null }));
    }
  }, []);

  const setUrl = useCallback(
    (url: string) => {
      setApiEndpoint(url);
      setState({ url, status: "checking", sandboxStatus: null });
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

  return {
    url: state.url,
    status: state.status,
    sandboxStatus: state.sandboxStatus,
    setUrl,
    refresh,
  };
}
