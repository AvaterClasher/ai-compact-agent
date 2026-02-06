import { tool } from "ai";
import { z } from "zod";

export const readFileTool = tool({
  description: "Read the contents of a file at the given path",
  inputSchema: z.object({
    path: z.string().describe("The file path to read"),
  }),
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
