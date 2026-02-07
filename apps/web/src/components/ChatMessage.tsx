"use client";

import type { Message as ExoMessage, MessagePart } from "@repo/shared";
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
  message: ExoMessage;
  isStreaming?: boolean;
  streamingMeta?: StreamingMeta;
}

type ToolState = "input-available" | "output-available" | "output-error";

function getToolState(toolCallId: string, parts: MessagePart[]): ToolState {
  const result = parts.find((p) => p.type === "tool-result" && p.toolCallId === toolCallId);
  if (!result) return "input-available";
  try {
    const output = JSON.parse(result.content);
    if (output?.error) return "output-error";
  } catch {
    // ignore
  }
  return "output-available";
}

function getToolResult(toolCallId: string, parts: MessagePart[]): MessagePart | undefined {
  return parts.find((p) => p.type === "tool-result" && p.toolCallId === toolCallId);
}

function parseContent(content: string): unknown {
  try {
    return JSON.parse(content);
  } catch {
    return content;
  }
}

function ToolCallPart({ part, parts }: { part: MessagePart; parts: MessagePart[] }) {
  const toolCallId = part.toolCallId ?? "";
  const toolName = part.toolName ?? "";
  const state = getToolState(toolCallId, parts);
  const result = getToolResult(toolCallId, parts);
  const input = parseContent(part.content);
  const output = result ? parseContent(result.content) : undefined;
  const errorText =
    state === "output-error" && typeof output === "object" && output !== null && "error" in output
      ? String((output as { error: unknown }).error)
      : undefined;

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
        {result && <ToolOutput output={output} errorText={errorText} />}
      </ToolContent>
    </Tool>
  );
}

function AssistantParts({
  message,
  isStreaming,
  streamingMeta,
}: {
  message: ExoMessage;
  isStreaming?: boolean;
  streamingMeta?: StreamingMeta;
}) {
  const parts = message.parts ?? [];
  const hasContent = parts.some((p) => p.type === "text") || message.content;

  return (
    <>
      {parts.map((part) => {
        switch (part.type) {
          case "reasoning":
            return (
              <Reasoning
                key={part.id}
                isStreaming={isStreaming && streamingMeta?.reasoningIsStreaming}
                defaultOpen={isStreaming && streamingMeta?.reasoningIsStreaming}
              >
                <ReasoningTrigger />
                <ReasoningContent>{part.content}</ReasoningContent>
              </Reasoning>
            );

          case "tool-call":
            return <ToolCallPart key={part.id} part={part} parts={parts} />;

          case "tool-result":
            // Rendered as part of the matching tool-call
            return null;

          case "text":
            return <MessageResponse key={part.id}>{part.content}</MessageResponse>;

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

  if (isSystem) {
    return (
      <div className="py-1.5">
        <Message from="system">
          <MessageContent>
            <div className="text-xs text-muted-foreground italic">{message.content}</div>
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
              {message.content}
            </div>
          </MessageContent>
        </Message>
      </div>
    );
  }

  // Assistant message
  const hasParts = message.parts && message.parts.length > 0;

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
          ) : message.content ? (
            <MessageResponse>{message.content}</MessageResponse>
          ) : (
            <Shimmer as="span" className="text-sm">
              Thinking...
            </Shimmer>
          )}
        </MessageContent>
        {message.content && (
          <MessageActions>
            <MessageAction
              tooltip="Copy"
              label="Copy message"
              onClick={() => navigator.clipboard.writeText(message.content)}
            >
              <CopyIcon className="size-3" />
            </MessageAction>
          </MessageActions>
        )}
      </Message>
    </div>
  );
}
