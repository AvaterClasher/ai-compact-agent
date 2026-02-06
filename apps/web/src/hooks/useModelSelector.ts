"use client";

import { AVAILABLE_MODELS, DEFAULT_MODEL } from "@repo/shared";
import { useCallback, useState } from "react";
import { api } from "@/lib/api";

export function useModelSelector(sessionId: string | null) {
  const [model, setModelState] = useState<string>(DEFAULT_MODEL);

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

  return { model, setModel, availableModels: AVAILABLE_MODELS };
}
