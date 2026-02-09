"use client";

import type { ReactNode } from "react";

interface SidebarSectionProps {
  label: string;
  children: ReactNode;
}

export function SidebarSection({ label, children }: SidebarSectionProps) {
  return (
    <div className="px-3 py-2">
      <div className="px-2 py-1.5 mb-1.5">
        <span className="font-mono text-[10px] tracking-widest uppercase text-muted-foreground font-medium">
          {label}
        </span>
      </div>
      {children}
    </div>
  );
}
