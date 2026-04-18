/**
 * Rewrites `<Text style={styles.tableHeadCell}>…</Text>` and the `tableCell`
 * variants to use the View-wrapped `<Th>` / `<Td>` helpers. One-shot script —
 * not part of the build.
 */
import { promises as fs } from "node:fs";

const PATH = "src/lib/export/export-pdf.tsx";

function main() {
  return fs.readFile(PATH, "utf8").then(async (src) => {
    let out = src;

    // <Text style={[styles.tableHeadCell, { flex: N }]}>...</Text>
    out = out.replace(
      /<Text style=\{\[styles\.tableHeadCell, \{ flex: ([\d.]+) \}\]\}>([\s\S]*?)<\/Text>/g,
      (_, flex, body) => `<Th flex={${flex}}>${body.trim()}</Th>`,
    );
    // <Text style={styles.tableHeadCell}>...</Text>
    out = out.replace(
      /<Text style=\{styles\.tableHeadCell\}>([\s\S]*?)<\/Text>/g,
      (_, body) => `<Th>${body.trim()}</Th>`,
    );
    // <Text style={[styles.tableCell, { flex: N }]}>{...}</Text>
    out = out.replace(
      /<Text style=\{\[styles\.tableCell, \{ flex: ([\d.]+) \}\]\}>([\s\S]*?)<\/Text>/g,
      (_, flex, body) => {
        const trimmed = body.trim();
        // If body is a simple {expr}, keep it as a Td child expression.
        return `<Td flex={${flex}}>${trimmed}</Td>`;
      },
    );
    // <Text style={styles.tableCell}>{...}</Text>
    out = out.replace(
      /<Text style=\{styles\.tableCell\}>([\s\S]*?)<\/Text>/g,
      (_, body) => `<Td>${body.trim()}</Td>`,
    );

    await fs.writeFile(PATH, out);
    console.log("ok");
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
