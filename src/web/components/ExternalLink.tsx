import type { MouseEvent, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useDodHint } from "./DodHint";

const isPlainClick = (e: MouseEvent) => e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;

/** A real outbound anchor (middle-click/copy link work); plain clicks go through the DoD hint. */
export function ExternalLink({ href, className, children, title }: {
  href: string; className?: string; children: ReactNode; title?: string;
}) {
  const open = useDodHint();
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title={title}
      className={cn("underline-offset-2 hover:underline", className)}
      onClick={(e) => {
        if (!isPlainClick(e)) return;
        e.preventDefault();
        open(href);
      }}
    >
      {children}
    </a>
  );
}
