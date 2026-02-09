import { tool } from "ai";
import { z } from "zod";
import { execInContainer } from "../../docker/executor.js";
import { ensureContainer } from "../../docker/sandbox-pool.js";

function shellEscape(s: string): string {
  return `'${s.replace(/'/g, "'\\''")}'`;
}

const writeFileSchema = z.object({
  path: z.string().describe("The file path to write to"),
  content: z.string().describe("The content to write"),
});

export const writeFileTool = tool({
  description: "Write content to a file at the given path. Creates directories as needed.",
  inputSchema: writeFileSchema,
  execute: async ({ path, content }) => {
    try {
      await Bun.write(path, content);
      return { success: true, path, bytesWritten: content.length };
    } catch (error) {
      return { error: `Failed to write file: ${(error as Error).message}` };
    }
  },
});

export function createDockerWriteFileTool(sessionId: string) {
  return tool({
    description: "Write content to a file at the given path. Creates directories as needed.",
    inputSchema: writeFileSchema,
    execute: async ({ path, content }) => {
      try {
        await ensureContainer(sessionId);
        const b64 = Buffer.from(content).toString("base64");
        const dir = path.substring(0, path.lastIndexOf("/"));
        const mkdirCmd = dir ? `mkdir -p ${shellEscape(dir)} && ` : "";
        const result = await execInContainer(
          sessionId,
          `${mkdirCmd}echo '${b64}' | base64 -d > ${shellEscape(path)}`,
        );
        if (result.exitCode !== 0) {
          return { error: `Failed to write file: ${result.stderr}` };
        }
        return { success: true, path, bytesWritten: content.length };
      } catch (error) {
        return { error: `Failed to write file: ${(error as Error).message}` };
      }
    },
  });
}
