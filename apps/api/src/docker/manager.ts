/**
 * Docker container lifecycle management.
 * Manages creation, cleanup, and health checks for sandbox containers.
 */

const SANDBOX_IMAGE = "exo-sandbox:latest";
const CONTAINER_PREFIX = "exo-sandbox-";

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
      "sleep",
      "3600",
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
