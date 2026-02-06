import { tool } from "ai";
import { z } from "zod";

export const shellTool = tool({
  description:
    "Run a shell command and return its output. Use for system operations like ls, git, npm, etc.",
  inputSchema: z.object({
    command: z.string().describe("The shell command to execute"),
    cwd: z.string().optional().describe("Working directory for the command"),
  }),
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
