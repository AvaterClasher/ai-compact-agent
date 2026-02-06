import { tool } from "ai";
import { z } from "zod";

export const executeCodeTool = tool({
  description:
    "Execute code in a sandboxed environment. Supports JavaScript/TypeScript (via Bun), Python, and shell scripts.",
  inputSchema: z.object({
    code: z.string().describe("The code to execute"),
    language: z
      .enum(["javascript", "typescript", "python", "shell"])
      .describe("The programming language"),
  }),
  execute: async ({ code, language }) => {
    try {
      let cmd: string[];
      let input: string | undefined;

      switch (language) {
        case "javascript":
        case "typescript":
          // Write to temp file and execute with bun
          const tsPath = `/tmp/exec_${Date.now()}.ts`;
          await Bun.write(tsPath, code);
          cmd = ["bun", "run", tsPath];
          break;
        case "python":
          cmd = ["python3", "-c", code];
          break;
        case "shell":
          cmd = ["sh", "-c", code];
          break;
        default:
          return { error: `Unsupported language: ${language}` };
      }

      const proc = Bun.spawn(cmd, {
        stdout: "pipe",
        stderr: "pipe",
        env: { ...process.env, NODE_ENV: "development" },
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
      return {
        error: `Failed to execute code: ${(error as Error).message}`,
      };
    }
  },
});
