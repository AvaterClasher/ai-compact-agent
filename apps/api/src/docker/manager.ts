/**
 * Docker container lifecycle management.
 * Manages creation, cleanup, and health checks for sandbox containers.
 */

import { resolve } from "node:path";
import { logger } from "../logger.js";

const SANDBOX_IMAGE = "exo-sandbox:latest";
const CONTAINER_PREFIX = "exo-sandbox-";
const DOCKER_DIR = resolve(import.meta.dir, "../../../../docker");
const DOCKERFILE_PATH = resolve(DOCKER_DIR, "sandbox.Dockerfile");

export type SandboxStatus = "ready" | "building" | "error" | "not_checked";

let sandboxStatus: SandboxStatus = "not_checked";
let sandboxError: string | null = null;

export function getSandboxStatus() {
  return { status: sandboxStatus, error: sandboxError };
}

/**
 * Ensure the sandbox Docker image exists, building it if necessary.
 * Called once on server startup.
 */
export async function ensureImage(): Promise<void> {
  // Check if image exists
  const inspect = Bun.spawn(["docker", "image", "inspect", SANDBOX_IMAGE], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const inspectExit = await inspect.exited;

  if (inspectExit === 0) {
    sandboxStatus = "ready";
    logger.info("Sandbox image found", { image: SANDBOX_IMAGE });
    return;
  }

  // Build the image
  sandboxStatus = "building";
  sandboxError = null;
  logger.info("Building sandbox image...", { dockerfile: DOCKERFILE_PATH });
  const build = Bun.spawn(
    ["docker", "build", "-f", DOCKERFILE_PATH, "-t", SANDBOX_IMAGE, DOCKER_DIR],
    {
      stdout: "pipe",
      stderr: "pipe",
    },
  );

  const stderr = await new Response(build.stderr).text();
  const buildExit = await build.exited;

  if (buildExit !== 0) {
    sandboxStatus = "error";
    sandboxError = stderr.slice(0, 500);
    throw new Error(`Failed to build sandbox image: ${stderr}`);
  }

  sandboxStatus = "ready";
  logger.info("Sandbox image built successfully");
}

export async function createContainer(sessionId: string): Promise<string> {
  const containerName = `${CONTAINER_PREFIX}${sessionId}`;

  const proc = Bun.spawn(
    [
      "docker",
      "run",
      "-d",
      "--name",
      containerName,
      "--memory",
      "512m",
      "--cpus",
      "1",
      "--network",
      "none",
      "--rm",
      SANDBOX_IMAGE,
      "tail",
      "-f",
      "/dev/null",
    ],
    {
      stdout: "pipe",
      stderr: "pipe",
    },
  );

  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const exitCode = await proc.exited;

  if (exitCode !== 0) {
    throw new Error(`Failed to create container: ${stderr}`);
  }

  return stdout.trim();
}

export async function removeContainer(sessionId: string): Promise<void> {
  const containerName = `${CONTAINER_PREFIX}${sessionId}`;

  const proc = Bun.spawn(["docker", "rm", "-f", containerName], {
    stdout: "pipe",
    stderr: "pipe",
  });

  await proc.exited;
}

export async function isContainerRunning(sessionId: string): Promise<boolean> {
  const containerName = `${CONTAINER_PREFIX}${sessionId}`;

  const proc = Bun.spawn(["docker", "inspect", "-f", "{{.State.Running}}", containerName], {
    stdout: "pipe",
    stderr: "pipe",
  });

  const stdout = await new Response(proc.stdout).text();
  const exitCode = await proc.exited;

  return exitCode === 0 && stdout.trim() === "true";
}
