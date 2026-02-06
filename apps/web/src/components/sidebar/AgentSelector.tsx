"use client";

import { Bot, ChevronDown, Cpu } from "lucide-react";

interface AgentSelectorProps {
  selectedModel: string;
  onModelChange: (model: string) => void;
  availableModels: readonly string[];
}

function _getProviderIcon(model: string) {
  if (model.startsWith("claude")) return "anthropic";
  if (model.startsWith("gpt") || model.startsWith("o3") || model.startsWith("o4")) return "openai";
  return "openai";
}

function formatModelName(model: string) {
  return model.replace(/-\d{8}$/, "").toUpperCase();
}

export function AgentSelector({
  selectedModel,
  onModelChange,
  availableModels,
}: AgentSelectorProps) {
  return (
    <div className="space-y-1.5 px-2">
      {/* Agent type (static) */}
      <div className="flex items-center gap-2 bg-input border border-border rounded-md px-2.5 py-2 cursor-default">
        <Bot className="w-3.5 h-3.5 text-primary shrink-0" />
        <span className="flex-1 text-xs font-medium text-foreground truncate">Salvador Agent</span>
        <ChevronDown className="w-3 h-3 text-dim shrink-0" />
      </div>

      {/* Model selector */}
      <div className="relative">
        <div className="flex items-center gap-2 bg-input border border-border rounded-md px-2.5 py-2">
          <Cpu className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          <select
            value={selectedModel}
            onChange={(e) => onModelChange(e.target.value)}
            className="flex-1 bg-transparent text-xs text-foreground focus:outline-none appearance-none cursor-pointer min-w-0 truncate"
          >
            {availableModels.map((model) => (
              <option key={model} value={model} className="bg-card text-foreground">
                {formatModelName(model)}
              </option>
            ))}
          </select>
          <ChevronDown className="w-3 h-3 text-dim shrink-0" />
        </div>
      </div>
    </div>
  );
}
