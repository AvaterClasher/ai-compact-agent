"use client";

import { CheckIcon, ChevronDown } from "lucide-react";
import { useState } from "react";
import {
  ModelSelector,
  ModelSelectorContent,
  ModelSelectorEmpty,
  ModelSelectorGroup,
  ModelSelectorInput,
  ModelSelectorItem,
  ModelSelectorList,
  ModelSelectorLogo,
  ModelSelectorName,
  ModelSelectorTrigger,
} from "@/components/ai-elements/model-selector";

interface AgentSelectorProps {
  selectedModel: string;
  onModelChange: (model: string) => void;
  availableModels: readonly string[];
}

function getProvider(model: string) {
  if (model.startsWith("claude")) return "anthropic";
  return "openai";
}

function formatModelName(model: string) {
  return model.replace(/-\d{8}$/, "");
}

function groupModels(models: readonly string[]) {
  const groups: Record<string, string[]> = {};
  for (const model of models) {
    let group: string;
    if (model.startsWith("claude")) group = "Anthropic";
    else if (model.startsWith("gpt")) group = "OpenAI GPT";
    else if (model.startsWith("o3") || model.startsWith("o4")) group = "OpenAI Reasoning";
    else group = "Other";
    if (!groups[group]) groups[group] = [];
    groups[group].push(model);
  }
  return groups;
}

export function AgentSelector({
  selectedModel,
  onModelChange,
  availableModels,
}: AgentSelectorProps) {
  const [open, setOpen] = useState(false);
  const groups = groupModels(availableModels);

  return (
    <div className="px-2">
      <ModelSelector open={open} onOpenChange={setOpen}>
        <ModelSelectorTrigger asChild>
          <button
            type="button"
            className="w-full flex items-center gap-2 bg-input border border-border rounded-md px-2.5 py-2 cursor-pointer hover:bg-secondary transition-colors"
          >
            <ModelSelectorLogo provider={getProvider(selectedModel)} />
            <span className="flex-1 text-xs text-foreground truncate text-left">
              {formatModelName(selectedModel)}
            </span>
            <ChevronDown className="w-3 h-3 text-dim shrink-0" />
          </button>
        </ModelSelectorTrigger>
        <ModelSelectorContent>
          <ModelSelectorInput placeholder="Search models..." />
          <ModelSelectorList>
            <ModelSelectorEmpty>No models found.</ModelSelectorEmpty>
            {Object.entries(groups).map(([group, models]) => (
              <ModelSelectorGroup key={group} heading={group}>
                {models.map((model) => (
                  <ModelSelectorItem
                    key={model}
                    value={model}
                    onSelect={() => {
                      onModelChange(model);
                      setOpen(false);
                    }}
                  >
                    <ModelSelectorLogo provider={getProvider(model)} />
                    <ModelSelectorName>{formatModelName(model)}</ModelSelectorName>
                    {model === selectedModel && (
                      <CheckIcon className="ml-auto size-3 text-primary" />
                    )}
                  </ModelSelectorItem>
                ))}
              </ModelSelectorGroup>
            ))}
          </ModelSelectorList>
        </ModelSelectorContent>
      </ModelSelector>
    </div>
  );
}
