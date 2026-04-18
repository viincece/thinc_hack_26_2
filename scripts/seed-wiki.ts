import { config } from "dotenv";
import { seedFourStories } from "../src/lib/kg/seed";

// Load env the same way Next does.
config({ path: ".env.local" });
config({ path: ".env" });

async function main() {
  console.log("Seeding knowledge graph with the four data-patterns stories…");
  await seedFourStories();
  console.log("Done.  Event log is at wiki/events.jsonl");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
