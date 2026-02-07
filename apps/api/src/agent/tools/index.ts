import { createDockerExecuteCodeTool, executeCodeTool } from "./execute-code.js";
import { createDockerReadFileTool, readFileTool } from "./read-file.js";
import { createDockerShellTool, shellTool } from "./shell.js";
import { createDockerWriteFileTool, writeFileTool } from "./write-file.js";

export const agentTools = {
  readFile: readFileTool,
  writeFile: writeFileTool,
  shell: shellTool,
  executeCode: executeCodeTool,
};

export function createSandboxedTools(sessionId: string) {
  return {
    readFile: createDockerReadFileTool(sessionId),
    writeFile: createDockerWriteFileTool(sessionId),
    shell: createDockerShellTool(sessionId),
    executeCode: createDockerExecuteCodeTool(sessionId),
  };
}
