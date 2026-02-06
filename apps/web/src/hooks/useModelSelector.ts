"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";

export function useModelSelector(sessionId: string | null) {
  const [model, setModelState] = useState<string>("");
  const [availableModels, setAvailableModels] = useState<string[]>([]);

  // Fetch available models from API on mount
  useEffect(() => {
    api
      .getModels()
      .then(({ models, default: defaultModel }) => {
        setAvailableModels(models);
        setModelState((prev) => prev || defaultModel);
      })
      .catch(() => {
        // Fallback if API is unreachable
      });
  }, []);

  const setModel = useCallback(
    async (newModel: string) => {
      setModelState(newModel);
      if (sessionId) {
        try {
          await api.updateSession(sessionId, { model: newModel });
        } catch {
          // Silently fail — model is still set locally
        }
      }
    },
    [sessionId],
  );

  return { model, setModel, availableModels };
}
