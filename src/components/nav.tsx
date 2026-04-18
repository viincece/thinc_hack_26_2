import Link from "next/link";
import { Activity, FileText, Network, BookOpen } from "lucide-react";

const links = [
  { href: "/", label: "Overview", icon: Activity },
  { href: "/incidents", label: "Incidents", icon: FileText },
  { href: "/initiatives", label: "Initiatives", icon: Network },
  { href: "/wiki", label: "Wiki", icon: BookOpen },
];

export function Nav() {
  return (
    <header className="sticky top-0 z-20 w-full border-b border-zinc-200 bg-white/80 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/80">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-8 px-6">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
          <span className="tracking-tight">Manex Co-Pilot</span>
        </Link>
        <nav className="flex items-center gap-1 text-sm">
          {links.map((l) => {
            const Icon = l.icon;
            return (
              <Link
                key={l.href}
                href={l.href}
                className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-50"
              >
                <Icon className="h-4 w-4" />
                {l.label}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto text-xs text-zinc-500">
          team_vitruvius
        </div>
      </div>
    </header>
  );
}
