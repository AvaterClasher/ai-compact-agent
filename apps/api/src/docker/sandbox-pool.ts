/**
 * Per-session Docker container lifecycle management.
 * Lazily creates containers on first tool use and tracks them for cleanup.
 */

import { logger } from "../logger.js";
import { createContainer, isContainerRunning, removeContainer } from "./manager.js";

const containerMap = new Map<string, string>(); // sessionId -> containerId

export async function ensureContainer(sessionId: string): Promise<void> {
  if (containerMap.has(sessionId)) {
    const running = await isContainerRunning(sessionId);
    if (running) return;
    containerMap.delete(sessionId);
  }

  const containerId = await createContainer(sessionId);
  containerMap.set(sessionId, containerId);
  logger.info("Sandbox container created", { sessionId, containerId });
}

export async function cleanupContainer(sessionId: string): Promise<void> {
  if (!containerMap.has(sessionId)) return;

  try {
    await removeContainer(sessionId);
    containerMap.delete(sessionId);
    logger.info("Sandbox container removed", { sessionId });
  } catch (error) {
    logger.warn("Failed to remove sandbox container", {
      sessionId,
      error: (error as Error).message,
    });
  }
}

export async function cleanupAllContainers(): Promise<void> {
  const entries = [...containerMap.entries()];
  await Promise.allSettled(entries.map(([sessionId]) => cleanupContainer(sessionId)));
}
