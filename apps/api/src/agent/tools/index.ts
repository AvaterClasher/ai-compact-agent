import { executeCodeTool } from "./execute-code.js";
import { readFileTool } from "./read-file.js";
import { shellTool } from "./shell.js";
import { writeFileTool } from "./write-file.js";

export const agentTools = {
  readFile: readFileTool,
  writeFile: writeFileTool,
  shell: shellTool,
  executeCode: executeCodeTool,
};
