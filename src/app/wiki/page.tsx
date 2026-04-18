import Link from "next/link";
import { ArrowRight, Cpu, Lightbulb, MessageSquare, FileText, BookOpen, Network } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  listConcepts,
  listEntities,
  listRecentObservations,
  listSources,
  stats,
} from "@/lib/kg/browse";
import { KgBadge, kindMeta } from "@/components/wiki/kg-icon";

export const dynamic = "force-dynamic";

export default async function WikiHome() {
  let s = {
    entities: 0,
    concepts: 0,
    observations: 0,
    reports: 0,
    sources: 0,
    logs: 0,
  };
  let entities: Awaited<ReturnType<typeof listEntities>> = [];
  let concepts: Awaited<ReturnType<typeof listConcepts>> = [];
  let observations: Awaited<ReturnType<typeof listRecentObservations>> = [];
  let sources: Awaited<ReturnType<typeof listSources>> = [];
  let error: string | null = null;
  try {
    [s, entities, concepts, observations, sources] = await Promise.all([
      stats(),
      listEntities(),
      listConcepts(),
      listRecentObservations(6),
      listSources(),
    ]);
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  // Entity kind breakdown
  const kindBuckets = new Map<string, number>();
  for (const e of entities) {
    kindBuckets.set(e.kind, (kindBuckets.get(e.kind) ?? 0) + 1);
  }
  const kindList = [...kindBuckets.entries()].sort((a, b) => b[1] - a[1]);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Knowledge wiki</h1>
          <p className="text-sm text-zinc-500">
            A Kuzu property graph of entities, concepts, observations, and
            reports. Maintained by the co-pilot; grows as you close reports.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/wiki/graph">
            View graph <Network className="h-4 w-4" />
          </Link>
        </Button>
      </div>

      {error ? (
        <Card className="border-amber-300 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30">
          <CardHeader>
            <CardTitle className="text-amber-900 dark:text-amber-200">
              Can&apos;t read the knowledge graph
            </CardTitle>
            <CardDescription className="text-amber-800 dark:text-amber-200/80">
              {error}. Try running <code>npm run wiki:seed</code> in{" "}
              <code>web/</code>.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
        <StatTile label="Entities" value={s.entities} icon={<Cpu className="h-4 w-4" />} href="/wiki/entities" />
        <StatTile label="Concepts" value={s.concepts} icon={<Lightbulb className="h-4 w-4" />} href="/wiki/concepts" />
        <StatTile label="Observations" value={s.observations} icon={<MessageSquare className="h-4 w-4" />} href="/wiki/observations" />
        <StatTile label="Reports" value={s.reports} icon={<FileText className="h-4 w-4" />} href="/wiki/reports" />
        <StatTile label="Sources" value={s.sources} icon={<BookOpen className="h-4 w-4" />} href="/wiki/sources" />
        <StatTile label="Events" value={s.logs} icon={<Network className="h-4 w-4" />} href="/wiki/log" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Concepts</CardTitle>
            <CardDescription>
              Reusable failure modes and mechanisms. These are the patterns
              the co-pilot recognizes across incidents.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {concepts.map((c) => {
              const meta = kindMeta("Concept");
              const Icon = meta.icon;
              return (
                <Link
                  key={c.id}
                  href={`/wiki/n/${encodeURIComponent(c.id)}`}
                  className="group rounded-lg border border-zinc-200 p-3 transition-colors hover:border-amber-300 hover:bg-amber-50/50 dark:border-zinc-800 dark:hover:border-amber-900 dark:hover:bg-amber-950/30"
                >
                  <div className="flex items-start gap-2">
                    <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${meta.color}`} />
                    <div className="min-w-0">
                      <div className="font-medium">{c.title}</div>
                      <div className="mt-1 line-clamp-2 text-xs text-zinc-500">
                        {c.body}
                      </div>
                    </div>
                  </div>
                </Link>
              );
            })}
            {!concepts.length ? <Empty>No concepts yet.</Empty> : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Entity mix</CardTitle>
            <CardDescription>
              How many named things the wiki knows about, by kind.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-1">
            {kindList.length ? (
              kindList.map(([kind, count]) => {
                const pct = entities.length
                  ? Math.round((count / entities.length) * 100)
                  : 0;
                return (
                  <div key={kind} className="flex items-center gap-2 text-sm">
                    <div className="w-24 shrink-0">
                      <KgBadge kind={kind} />
                    </div>
                    <div className="relative h-2 flex-1 rounded-full bg-zinc-100 dark:bg-zinc-800">
                      <div
                        className="absolute inset-y-0 left-0 rounded-full bg-zinc-400"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <div className="w-8 text-right text-xs text-zinc-500">
                      {count}
                    </div>
                  </div>
                );
              })
            ) : (
              <Empty>No entities yet.</Empty>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between">
            <div>
              <CardTitle>Recent observations</CardTitle>
              <CardDescription>
                Atomic, cite-able facts the co-pilot recorded.
              </CardDescription>
            </div>
            <Button asChild variant="ghost" size="sm">
              <Link href="/wiki/observations">
                All <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-2">
            {observations.map((o) => (
              <Link
                key={o.id}
                href={`/wiki/n/${encodeURIComponent(o.id)}`}
                className="block rounded-md border border-zinc-200 p-3 text-sm hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900"
              >
                <div className="mb-1 flex items-center gap-2">
                  <KgBadge kind="Observation" />
                  <span className="font-mono text-[11px] text-zinc-500">
                    {o.id}
                  </span>
                  <span className="ml-auto text-[11px] text-zinc-500">
                    conf {Math.round((o.confidence ?? 0) * 100)}%
                  </span>
                </div>
                <div className="line-clamp-2 text-zinc-700 dark:text-zinc-300">
                  {o.text}
                </div>
              </Link>
            ))}
            {!observations.length ? <Empty>No observations yet.</Empty> : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Sources</CardTitle>
            <CardDescription>
              Raw inputs ingested by the wiki. Each observation traces back to
              one of these.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {sources.map((s) => (
              <Link
                key={s.id}
                href={`/wiki/n/${encodeURIComponent(s.id)}`}
                className="flex items-center gap-2 rounded-md border border-zinc-200 p-2 text-sm hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900"
              >
                <KgBadge kind="Source" subkind={s.source_kind} />
                <span className="truncate">{s.title}</span>
              </Link>
            ))}
            {!sources.length ? <Empty>No sources yet.</Empty> : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StatTile({
  label,
  value,
  icon,
  href,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="rounded-lg border border-zinc-200 bg-white p-3 transition-colors hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:bg-zinc-900"
    >
      <div className="flex items-center justify-between">
        <span className="text-[11px] uppercase tracking-wide text-zinc-500">
          {label}
        </span>
        <span className="text-zinc-400">{icon}</span>
      </div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
    </Link>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-dashed border-zinc-200 p-4 text-center text-sm text-zinc-500 dark:border-zinc-800">
      {children}
    </div>
  );
}
