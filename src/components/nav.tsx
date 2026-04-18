import Link from "next/link";
import { Activity, FileText, Network, BookOpen } from "lucide-react";
import { cn } from "@/lib/utils";

const links = [
  { href: "/", label: "Overview", icon: Activity },
  { href: "/incidents", label: "Incidents", icon: FileText },
  { href: "/initiatives", label: "Initiatives", icon: Network },
  { href: "/wiki", label: "Wiki", icon: BookOpen },
];

export function Nav() {
  return (
    <header
      className={cn(
        "sticky top-0 z-20 w-full border-b border-sage-border",
        // warm parchment with slight translucency to reveal page beneath
        "bg-parchment/90 backdrop-blur",
      )}
    >
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-8 px-6">
        <Link
          href="/"
          className="group flex items-center gap-2 font-semibold tracking-tight text-deep-olive"
        >
          <span
            aria-hidden
            className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-cta-dark font-mono text-[11px] font-bold text-parchment shadow-sm"
          >
            S³
          </span>
          <span className="font-sans text-[15px] font-bold transition-colors group-hover:text-brand-orange">
            SixSigmaSense
          </span>
          <span className="hidden text-[10px] font-medium uppercase tracking-wider text-muted-olive sm:inline">
            quality co-pilot
          </span>
        </Link>
        <nav className="flex items-center gap-1 text-[15px]">
          {links.map((l) => {
            const Icon = l.icon;
            return (
              <Link
                key={l.href}
                href={l.href}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-3 py-1.5 font-medium text-muted-olive",
                  "transition-colors hover:bg-hover-bg hover:text-brand-orange",
                )}
              >
                <Icon className="h-4 w-4" />
                {l.label}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto flex items-center gap-3">
          <span className="rounded-full bg-sage-cream px-2.5 py-0.5 font-mono text-[11px] font-medium text-muted-olive ring-1 ring-inset ring-sage-border">
            team_vitruvius
          </span>
        </div>
      </div>
    </header>
  );
}
