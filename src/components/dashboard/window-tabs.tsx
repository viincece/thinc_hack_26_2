import Link from "next/link";
import { cn } from "@/lib/utils";
import {
  WINDOW_KEYS,
  WINDOW_LABEL,
  type WindowKey,
} from "@/lib/dashboard/window";

/**
 * Segmented control for the dashboard's "Quality signals" strip.
 *
 * Each tab is a `<Link href="/?window=…">` — state lives in the URL,
 * so switching windows is just SSR with no client-side data fetching
 * and no loading spinner. `scroll={false}` keeps the viewport stable
 * when the user flips between windows.
 */
export function WindowTabs({ current }: { current: WindowKey }) {
  return (
    <div
      role="tablist"
      aria-label="Quality-signals time window"
      className="inline-flex items-center gap-0.5 rounded-md border border-sage-border bg-parchment p-0.5 text-[11px]"
    >
      {WINDOW_KEYS.map((w) => {
        const active = current === w;
        return (
          <Link
            key={w}
            href={`/?window=${w}`}
            scroll={false}
            role="tab"
            aria-selected={active}
            aria-label={WINDOW_LABEL[w]}
            className={cn(
              "rounded px-2 py-1 font-medium transition-colors",
              active
                ? "bg-sage-cream text-deep-olive shadow-sm ring-1 ring-inset ring-sage-border"
                : "text-muted-olive hover:bg-sage-cream/60 hover:text-deep-olive",
            )}
          >
            {w}
          </Link>
        );
      })}
    </div>
  );
}
