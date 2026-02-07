import { tool } from "ai";
import { z } from "zod";
import { execInContainer } from "../../docker/executor.js";
import { ensureContainer } from "../../docker/sandbox-pool.js";

const shellSchema = z.object({
  command: z.string().describe("The shell command to execute"),
  cwd: z.string().optional().describe("Working directory for the command"),
});

export const shellTool = tool({
  description:
    "Run a shell command and return its output. Use for system operations like ls, git, npm, etc.",
  inputSchema: shellSchema,
  execute: async ({ command, cwd }) => {
    try {
      const proc = Bun.spawn(["sh", "-c", command], {
        cwd: cwd || process.cwd(),
        stdout: "pipe",
        stderr: "pipe",
      });

      const [stdout, stderr] = await Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
      ]);

      const exitCode = await proc.exited;

      return {
        stdout: stdout.slice(0, 50000),
        stderr: stderr.slice(0, 10000),
        exitCode,
      };
    } catch (error) {
      return { error: `Failed to execute command: ${(error as Error).message}` };
    }
  },
});

export function createDockerShellTool(sessionId: string) {
  return tool({
    description:
      "Run a shell command and return its output. Use for system operations like ls, git, npm, etc.",
    inputSchema: shellSchema,
    execute: async ({ command, cwd }) => {
      try {
        await ensureContainer(sessionId);
        return await execInContainer(sessionId, command, { cwd });
      } catch (error) {
        return { error: `Failed to execute command: ${(error as Error).message}` };
      }
    },
  });
}
