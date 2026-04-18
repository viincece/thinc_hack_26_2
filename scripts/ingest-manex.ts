import { config } from "dotenv";
import { ingestFromManex } from "../src/lib/kg/ingest-sql";

config({ path: ".env.local" });
config({ path: ".env" });

async function main() {
  console.log("Ingesting structural entities from Manex REST API…");
  const summary = await ingestFromManex();
  console.log("Done.", summary);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
