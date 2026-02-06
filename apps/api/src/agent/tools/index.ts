import { readFileTool } from "./read-file.js";
import { writeFileTool } from "./write-file.js";
import { shellTool } from "./shell.js";
import { executeCodeTool } from "./execute-code.js";

export const agentTools = {
  readFile: readFileTool,
  writeFile: writeFileTool,
  shell: shellTool,
  executeCode: executeCodeTool,
};
