/**
 * Execute commands inside a Docker sandbox container.
 */

const CONTAINER_PREFIX = "exo-sandbox-";

export async function execInContainer(
  sessionId: string,
  command: string,
  options: { cwd?: string; timeout?: number } = {},
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const containerName = `${CONTAINER_PREFIX}${sessionId}`;
  const { cwd, timeout = 30000 } = options;

  const args = ["docker", "exec"];
  if (cwd) {
    args.push("-w", cwd);
  }
  args.push(containerName, "sh", "-c", command);

  const proc = Bun.spawn(args, {
    stdout: "pipe",
    stderr: "pipe",
  });

  // Set up timeout
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => {
      proc.kill();
      reject(new Error(`Command timed out after ${timeout}ms`));
    }, timeout);
  });

  try {
    const [stdout, stderr, exitCode] = await Promise.race([
      Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
        proc.exited,
      ]),
      timeoutPromise,
    ]);

    return {
      stdout: (stdout as string).slice(0, 50000),
      stderr: (stderr as string).slice(0, 10000),
      exitCode: exitCode as number,
    };
  } catch (error) {
    return {
      stdout: "",
      stderr: (error as Error).message,
      exitCode: 1,
    };
  }
}

export async function copyToContainer(
  sessionId: string,
  localPath: string,
  containerPath: string,
): Promise<void> {
  const containerName = `${CONTAINER_PREFIX}${sessionId}`;

  const proc = Bun.spawn(["docker", "cp", localPath, `${containerName}:${containerPath}`], {
    stdout: "pipe",
    stderr: "pipe",
  });

  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    const stderr = await new Response(proc.stderr).text();
    throw new Error(`Failed to copy to container: ${stderr}`);
  }
}
