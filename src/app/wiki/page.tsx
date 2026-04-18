import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function WikiPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-6 px-6 py-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Knowledge wiki</h1>
        <p className="text-sm text-zinc-500">
          Persistent, LLM-maintained knowledge base. Finished reports land here
          and compound over time — per the llm-wiki pattern.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Not wired up yet</CardTitle>
          <CardDescription>
            Next step: stand up <code>wiki_pages</code> + <code>wiki_embeddings</code>{" "}
            on Postgres (pgvector), index a handful of seed markdown pages for
            the four stories, and add the hybrid retriever tool to the agent.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-zinc-600 dark:text-zinc-400">
          <p>Planned structure:</p>
          <pre className="overflow-x-auto rounded-md bg-zinc-50 p-3 text-xs dark:bg-zinc-900">{`/wiki/
  index.md
  log.md
  entities/
    parts/PM-00008.md
    suppliers/elektroparts.md
    articles/ART-00001.md
    sections/montage-linie-1.md
    operators/user_042.md
  concepts/
    cold-solder-joint.md
    torque-calibration-drift.md
    thermal-drift-failure.md
  reports/
    8D-2026-003-cold-solder-sb00007.md
    fmea-art00001-steuerplatine.md`}</pre>
        </CardContent>
      </Card>
    </div>
  );
}
