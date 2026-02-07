import { tool } from "ai";
import { z } from "zod";
import { execInContainer } from "../../docker/executor.js";
import { ensureContainer } from "../../docker/sandbox-pool.js";

function shellEscape(s: string): string {
  return `'${s.replace(/'/g, "'\\''")}'`;
}

const executeCodeSchema = z.object({
  code: z.string().describe("The code to execute"),
  language: z
    .enum(["javascript", "typescript", "python", "shell"])
    .describe("The programming language"),
});

export const executeCodeTool = tool({
  description:
    "Execute code in a sandboxed environment. Supports JavaScript/TypeScript (via Bun), Python, and shell scripts.",
  inputSchema: executeCodeSchema,
  execute: async ({ code, language }) => {
    try {
      let cmd: string[];
      let _input: string | undefined;

      switch (language) {
        case "javascript":
        case "typescript": {
          // Write to temp file and execute with bun
          const tsPath = `/tmp/exec_${Date.now()}.ts`;
          await Bun.write(tsPath, code);
          cmd = ["bun", "run", tsPath];
          break;
        }
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

export function createDockerExecuteCodeTool(sessionId: string) {
  return tool({
    description:
      "Execute code in a sandboxed Docker environment. Supports JavaScript/TypeScript (via Bun), Python, and shell scripts.",
    inputSchema: executeCodeSchema,
    execute: async ({ code, language }) => {
      try {
        await ensureContainer(sessionId);

        let command: string;
        switch (language) {
          case "javascript":
          case "typescript": {
            const b64 = Buffer.from(code).toString("base64");
            const tsPath = `/tmp/exec_${Date.now()}.ts`;
            command = `echo '${b64}' | base64 -d > ${tsPath} && bun run ${tsPath}`;
            break;
          }
          case "python":
            command = `python3 -c ${shellEscape(code)}`;
            break;
          case "shell":
            command = code;
            break;
          default:
            return { error: `Unsupported language: ${language}` };
        }

        return await execInContainer(sessionId, command, { timeout: 30000 });
      } catch (error) {
        return {
          error: `Failed to execute code: ${(error as Error).message}`,
        };
      }
    },
  });
}
