import { useEffect, useRef, useState } from "react";
import { SearchIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { isTypingTarget } from "../dom";
import { Q_MAX, shouldSyncFromUrl, toQueryText } from "../inputs";

const DEBOUNCE_MS = 200;
const PLACEHOLDER = "Search NSN, item, solicitation, PR or quantity…";

export function SearchBox({ value, onChange }: { value: string; onChange: (q: string) => void }) {
  const [text, setText] = useState(value);
  const input = useRef<HTMLInputElement>(null);

  // URL changed underneath us (back/forward, Clear all): follow it — but don't eat a trailing space being typed.
  useEffect(() => {
    if (shouldSyncFromUrl(value, text)) setText(value);
  }, [value]);

  useEffect(() => {
    if ((toQueryText(text) ?? "") === value) return;
    const t = setTimeout(() => onChange(text), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [text]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/" || isTypingTarget(e.target)) return;
      e.preventDefault();
      input.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="relative w-full max-w-xl">
      <SearchIcon className="text-muted-foreground absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
      <Input
        ref={input}
        type="search"
        aria-label="Search"
        className="pl-8"
        maxLength={Q_MAX}
        placeholder={PLACEHOLDER}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => e.key === "Escape" && input.current?.blur()}
      />
    </div>
  );
}
