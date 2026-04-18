import Link from "next/link";
import { Lightbulb } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { listConcepts } from "@/lib/kg/browse";

export const dynamic = "force-dynamic";

export default async function ConceptsPage() {
  const concepts = await listConcepts().catch(() => []);
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Concepts</h1>
        <p className="text-sm text-zinc-500">
          Reusable failure modes and mechanisms. These are the patterns that
          link together specific incidents — the abstractions the co-pilot
          recognizes.
        </p>
      </div>
      {concepts.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No concepts yet</CardTitle>
            <CardDescription>
              Seed the wiki with <code>npm run wiki:seed</code> to populate it
              with the four hackathon stories.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {concepts.map((c) => (
            <Link
              key={c.id}
              href={`/wiki/n/${encodeURIComponent(c.id)}`}
              className="group block rounded-lg border border-zinc-200 bg-white p-4 transition-colors hover:border-amber-300 hover:bg-amber-50/50 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-amber-900 dark:hover:bg-amber-950/30"
            >
              <div className="flex items-start gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300">
                  <Lightbulb className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <div className="font-semibold">{c.title}</div>
                  <div className="mt-0.5 font-mono text-[11px] text-zinc-500">
                    {c.id}
                  </div>
                  <div className="mt-2 line-clamp-3 text-sm text-zinc-600 dark:text-zinc-400">
                    {c.body}
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
