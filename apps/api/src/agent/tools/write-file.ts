import { tool } from "ai";
import { z } from "zod";

export const writeFileTool = tool({
  description: "Write content to a file at the given path. Creates directories as needed.",
  inputSchema: z.object({
    path: z.string().describe("The file path to write to"),
    content: z.string().describe("The content to write"),
  }),
  execute: async ({ path, content }) => {
    try {
      await Bun.write(path, content);
      return { success: true, path, bytesWritten: content.length };
    } catch (error) {
      return { error: `Failed to write file: ${(error as Error).message}` };
    }
  },
});
