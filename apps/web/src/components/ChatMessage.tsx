"use client";

import type { UIMessage } from "ai";
import { CopyIcon } from "lucide-react";
import { CodeBlock } from "@/components/ai-elements/code-block";
import {
  Message,
  MessageAction,
  MessageActions,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message";
import { Reasoning, ReasoningContent, ReasoningTrigger } from "@/components/ai-elements/reasoning";
import {
  Sandbox,
  SandboxContent,
  SandboxHeader,
  SandboxTabContent,
  SandboxTabs,
  SandboxTabsBar,
  SandboxTabsList,
  SandboxTabsTrigger,
} from "@/components/ai-elements/sandbox";
import { Shimmer } from "@/components/ai-elements/shimmer";
import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
} from "@/components/ai-elements/tool";
import type { StreamingMeta } from "@/hooks/useChat";

interface ChatMessageProps {
  message: UIMessage;
  isStreaming?: boolean;
  streamingMeta?: StreamingMeta;
}

type ToolState = "input-available" | "output-available" | "output-error";

/** Extract text content from a UIMessage */
function getTextContent(message: UIMessage): string {
  return message.parts
    .filter((p): p is Extract<typeof p, { type: "text" }> => p.type === "text")
    .map((p) => p.text)
    .join("");
}

interface DynamicToolPart {
  type: "dynamic-tool";
  toolName: string;
  toolCallId: string;
  state: string;
  input?: unknown;
  output?: unknown;
  errorText?: string;
}

function ToolCallPart({ part }: { part: DynamicToolPart }) {
  const toolName = part.toolName;
  const state: ToolState =
    part.state === "output-error"
      ? "output-error"
      : part.state === "output-available"
        ? "output-available"
        : "input-available";
  const input = part.input;
  const output = part.output;
  const errorText =
    state === "output-error" ? (part.errorText ?? "Tool execution failed") : undefined;

  // Use Sandbox for executeCode tool
  if (toolName === "executeCode") {
    const codeInput = input as { code?: string; language?: string };
    const codeOutput = output as
      | { stdout?: string; stderr?: string; exitCode?: number }
      | undefined;
    const outputText = codeOutput
      ? [codeOutput.stdout, codeOutput.stderr].filter(Boolean).join("\n") || "(no output)"
      : undefined;

    return (
      <Sandbox defaultOpen>
        <SandboxHeader title={codeInput.language ?? "Code"} state={state} />
        <SandboxContent>
          <SandboxTabs defaultValue="code">
            <SandboxTabsBar>
              <SandboxTabsList>
                <SandboxTabsTrigger value="code">Code</SandboxTabsTrigger>
                {outputText && <SandboxTabsTrigger value="output">Output</SandboxTabsTrigger>}
              </SandboxTabsList>
            </SandboxTabsBar>
            <SandboxTabContent value="code">
              <CodeBlock
                code={codeInput.code ?? ""}
                language={codeInput.language === "python" ? "python" : "typescript"}
              />
            </SandboxTabContent>
            {outputText && (
              <SandboxTabContent value="output">
                <CodeBlock code={outputText} language="bash" />
              </SandboxTabContent>
            )}
          </SandboxTabs>
        </SandboxContent>
      </Sandbox>
    );
  }

  return (
    <Tool>
      <ToolHeader title={toolName} type="tool-invocation" state={state} />
      <ToolContent>
        <ToolInput input={input} />
        {output !== undefined && <ToolOutput output={output} errorText={errorText} />}
      </ToolContent>
    </Tool>
  );
}

function AssistantParts({
  message,
  isStreaming,
  streamingMeta,
}: {
  message: UIMessage;
  isStreaming?: boolean;
  streamingMeta?: StreamingMeta;
}) {
  const parts = message.parts;
  const hasContent = parts.some((p) => p.type === "text") || getTextContent(message);

  return (
    <>
      {parts.map((part, i) => {
        switch (part.type) {
          case "reasoning":
            return (
              <Reasoning
                key={`${message.id}-reasoning-${i}`}
                isStreaming={isStreaming && streamingMeta?.reasoningIsStreaming}
                defaultOpen={isStreaming && streamingMeta?.reasoningIsStreaming}
              >
                <ReasoningTrigger />
                <ReasoningContent>{part.text}</ReasoningContent>
              </Reasoning>
            );

          case "dynamic-tool":
            return (
              <ToolCallPart
                key={`${message.id}-tool-${(part as DynamicToolPart).toolCallId}`}
                part={part as DynamicToolPart}
              />
            );

          case "text":
            return <MessageResponse key={`${message.id}-text-${i}`}>{part.text}</MessageResponse>;

          default:
            return null;
        }
      })}
      {/* Show shimmer if streaming with no visible content yet */}
      {isStreaming && !hasContent && !parts.some((p) => p.type === "reasoning") && (
        <Shimmer as="span" className="text-sm">
          Thinking...
        </Shimmer>
      )}
    </>
  );
}

export function ChatMessage({ message, isStreaming, streamingMeta }: ChatMessageProps) {
  const isUser = message.role === "user";
  const isSystem = message.role === "system";
  const textContent = getTextContent(message);

  if (isSystem) {
    return (
      <div className="py-1.5">
        <Message from="system">
          <MessageContent>
            <div className="text-xs text-muted-foreground italic">{textContent}</div>
          </MessageContent>
        </Message>
      </div>
    );
  }

  if (isUser) {
    return (
      <div className="py-3">
        <Message from="user">
          <MessageContent>
            <div className="text-[15px] leading-relaxed text-foreground whitespace-pre-wrap">
              {textContent}
            </div>
          </MessageContent>
        </Message>
      </div>
    );
  }

  // Assistant message
  const hasParts = message.parts.length > 0;

  return (
    <div className="py-3">
      <Message from="assistant">
        <MessageContent>
          {hasParts ? (
            <AssistantParts
              message={message}
              isStreaming={isStreaming}
              streamingMeta={streamingMeta}
            />
          ) : (
            <Shimmer as="span" className="text-sm">
              Thinking...
            </Shimmer>
          )}
        </MessageContent>
        {textContent && (
          <MessageActions>
            <MessageAction
              tooltip="Copy"
              label="Copy message"
              onClick={() => navigator.clipboard.writeText(textContent)}
            >
              <CopyIcon className="size-3" />
            </MessageAction>
          </MessageActions>
        )}
      </Message>
    </div>
  );
}
