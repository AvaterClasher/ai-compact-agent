"use client";

import { ArrowRight, BookOpen, Terminal } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef } from "react";
import { useAppContext } from "@/contexts/AppContext";

export default function Home() {
  const router = useRouter();
  const { createSession } = useAppContext();
  const inputRef = useRef<HTMLInputElement>(null);

  const handleNewSession = async () => {
    const session = await createSession();
    router.push(`/chat/${session.id}`);
  };

  const handleSubmitWithMessage = async (text: string) => {
    const session = await createSession();
    router.push(`/chat/${session.id}?q=${encodeURIComponent(text)}`);
  };

  return (
    <div className="flex-1 flex items-center justify-center relative">
      <div className="relative text-center animate-fade-in max-w-lg px-6">
        <p className="text-lg text-foreground leading-relaxed mb-2">
          This is an open-source{" "}
          <span className="inline-flex items-center gap-1.5 align-middle border border-border rounded px-2 py-0.5 bg-secondary text-sm font-medium">
            <Terminal className="w-3.5 h-3.5 text-primary" />
            Exo
          </span>{" "}
          Agent UI, built with{" "}
          <span className="inline-flex items-center gap-1 align-middle border border-border rounded px-2 py-0.5 bg-secondary text-sm font-medium">
            AI SDK
          </span>
        </p>
        <p className="text-muted-foreground text-sm mb-8">
          For the full experience, connect to a running Exo API.
        </p>

        <div className="flex items-center justify-center gap-3">
          <button
            type="button"
            className="group inline-flex items-center gap-2 px-4 py-2.5 border border-border bg-transparent text-foreground text-xs font-mono font-medium tracking-wider uppercase rounded-md hover:bg-secondary transition-colors duration-150 cursor-pointer focus-ring"
          >
            <BookOpen className="w-3.5 h-3.5" />
            Go to Docs
          </button>
          <button
            type="button"
            onClick={handleNewSession}
            className="group inline-flex items-center gap-2 px-4 py-2.5 border border-border bg-transparent text-foreground text-xs font-mono font-medium tracking-wider uppercase rounded-md hover:bg-secondary transition-colors duration-150 cursor-pointer focus-ring"
          >
            New Session
            <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
          </button>
        </div>
      </div>

      {/* Bottom input */}
      <div className="absolute bottom-6 left-0 right-0 px-8">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center gap-3 rounded-lg border border-border bg-input px-4 py-3">
            <input
              ref={inputRef}
              type="text"
              placeholder="Ask anything"
              className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
              onKeyDown={async (e) => {
                if (e.key === "Enter") {
                  const text = (e.target as HTMLInputElement).value.trim();
                  if (text) await handleSubmitWithMessage(text);
                }
              }}
            />
            <button
              type="button"
              onClick={async () => {
                const text = inputRef.current?.value.trim();
                if (text) {
                  await handleSubmitWithMessage(text);
                } else {
                  await handleNewSession();
                }
              }}
              className="shrink-0 p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            >
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
