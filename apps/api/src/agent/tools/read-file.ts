import { tool } from "ai";
import { z } from "zod";
import { execInContainer } from "../../docker/executor.js";
import { ensureContainer } from "../../docker/sandbox-pool.js";

function shellEscape(s: string): string {
  return `'${s.replace(/'/g, "'\\''")}'`;
}

const readFileSchema = z.object({
  path: z.string().describe("The file path to read"),
});

export const readFileTool = tool({
  description: "Read the contents of a file at the given path",
  inputSchema: readFileSchema,
  execute: async ({ path }) => {
    try {
      const file = Bun.file(path);
      const exists = await file.exists();
      if (!exists) {
        return { error: `File not found: ${path}` };
      }
      const content = await file.text();
      return { content, path };
    } catch (error) {
      return { error: `Failed to read file: ${(error as Error).message}` };
    }
  },
});

export function createDockerReadFileTool(sessionId: string) {
  return tool({
    description: "Read the contents of a file at the given path",
    inputSchema: readFileSchema,
    execute: async ({ path }) => {
      try {
        await ensureContainer(sessionId);
        const result = await execInContainer(sessionId, `cat ${shellEscape(path)}`);
        if (result.exitCode !== 0) {
          return { error: `File not found or unreadable: ${path}` };
        }
        return { content: result.stdout, path };
      } catch (error) {
        return { error: `Failed to read file: ${(error as Error).message}` };
      }
    },
  });
}
