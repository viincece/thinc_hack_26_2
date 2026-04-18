import { kg } from "./client";
import {
  upsertEntity,
  upsertConcept,
  upsertSource,
  writeObservation,
  link,
  logEntry,
} from "./write";

/**
 * Seeds the wiki with the four root-cause stories described in
 * docs/DATA_PATTERNS.md.  Idempotent — safe to re-run, but every run appends
 * "re-seeded" log entries.
 *
 * Uses entity ids = manex ids where applicable (PM-00008, SB-00007, …) so
 * the agent can anchor directly on a handle it gets from the REST API.
 */
export async function seedFourStories() {
  await kg().init();

  const src = "SRC-DATA-PATTERNS";
  await upsertSource({
    id: src,
    source_kind: "note",
    title: "DATA_PATTERNS.md (hackathon brief)",
    url: "docs/DATA_PATTERNS.md",
    body:
      "Four root-cause stories + deliberate noise, plus global distributions " +
      "of defect codes, test result bands, and field-claim lag.",
  });

  // -------------------- Shared concepts --------------------
  await upsertConcept({
    id: "cold-solder-joint",
    title: "Cold solder joint",
    body:
      "Poor wetting during reflow creates a mechanically fragile joint that " +
      "survives electrical test but fails under thermal cycling. Common " +
      "upstream causes: capacitor ESR out of spec, flux contamination, " +
      "reflow profile drift.",
  });
  await upsertConcept({
    id: "esr-degradation",
    title: "Elevated ESR on electrolytic capacitor",
    body:
      "Equivalent Series Resistance above the datasheet limit. In 100µF " +
      "electrolytic caps it correlates with wetting problems on reflow and " +
      "accelerated end-of-life in the field.",
  });
  await upsertConcept({
    id: "torque-calibration-drift",
    title: "Torque calibration drift",
    body:
      "Torque wrench loses calibration over time; screws end up " +
      "under-torqued, which allows housing vibration amplitude to exceed " +
      "the VIB_TEST limit at end-of-line. Signature is narrow in time and " +
      "to a single section.",
  });
  await upsertConcept({
    id: "thermal-drift-failure",
    title: "Thermal drift / slow parametric failure",
    body:
      "Component operates inside absolute limits but close to its thermal " +
      "envelope; parameters drift with temperature and over time. Escapes " +
      "short-duration factory tests; surfaces as field claims 8-12 weeks " +
      "after build.",
  });
  await upsertConcept({
    id: "operator-handling-cosmetic",
    title: "Operator handling — cosmetic defects",
    body:
      "Rough handling during packaging / rework produces surface " +
      "scratches and misaligned labels. Low severity, no functional " +
      "impact. Signature is clustered to specific production orders + " +
      "operator.",
  });

  // Concept edges
  await link("CAUSED_BY", "cold-solder-joint", "esr-degradation");

  // -------------------- Story 1: Supplier batch SB-00007 --------------------
  await upsertEntity({
    id: "supplier:elektroparts",
    entity_kind: "Supplier",
    label: "ElektroParts GmbH",
    body: "Tier-2 passive-components supplier. Batches delivered in Q1 2026.",
  });
  await upsertEntity({
    id: "SB-00007",
    entity_kind: "Batch",
    label: "SB-00007 (100µF, ElektroParts, Feb 2026)",
    manex_table: "supplier_batch",
    manex_id: "SB-00007",
    body:
      "Batch of 100µF electrolytic capacitors received early February 2026. " +
      "Incoming inspection ESR readings were elevated vs nominal.",
  });
  await upsertEntity({
    id: "PM-00008",
    entity_kind: "Part",
    label: "PM-00008 — 100µF electrolytic capacitor",
    manex_table: "part_master",
    manex_id: "PM-00008",
    body:
      "Bulk input-side decoupling cap used across several assemblies. " +
      "Tied to SOLDER_COLD defects from batch SB-00007.",
  });
  await upsertEntity({
    id: "defectcode:SOLDER_COLD",
    entity_kind: "DefectCode",
    label: "SOLDER_COLD",
    body: "In-factory defect: cold solder joint detected at end-of-line test.",
  });
  await link("SUPPLIED_BY", "SB-00007", "supplier:elektroparts");
  await link("OF_PART", "SB-00007", "PM-00008");
  await link("INDICATED_BY", "cold-solder-joint", "defectcode:SOLDER_COLD");

  await writeObservation({
    id: "OBS-S1-01",
    text:
      "Batch SB-00007 of 100µF capacitors (PM-00008) from ElektroParts GmbH, " +
      "received early Feb 2026, shows ESR readings elevated vs nominal on " +
      "incoming inspection. Poor wetting during reflow → cold solder joints.",
    confidence: 0.9,
    about_entities: ["SB-00007", "PM-00008", "supplier:elektroparts"],
    about_concepts: ["cold-solder-joint", "esr-degradation"],
    evidenced_by: src,
  });
  await writeObservation({
    id: "OBS-S1-02",
    text:
      "In-factory SOLDER_COLD defect cluster concentrated in weeks 5-6/2026 " +
      "on products that contain a part from batch SB-00007. ~30 products " +
      "affected, ~25 in-factory defects.",
    confidence: 0.9,
    about_entities: ["SB-00007", "PM-00008", "defectcode:SOLDER_COLD"],
    about_concepts: ["cold-solder-joint"],
    evidenced_by: src,
  });
  await writeObservation({
    id: "OBS-S1-03",
    text:
      "~12 field claims in March 2026 cite PM-00008 with complaints like " +
      "\"Totalausfall\" / \"Ausfall nach wenigen Wochen\". Failure mode " +
      "consistent with cold-solder joint breaking under thermal cycling.",
    confidence: 0.85,
    about_entities: ["PM-00008"],
    about_concepts: ["cold-solder-joint"],
    evidenced_by: src,
  });

  // -------------------- Story 2: Torque drift --------------------
  await upsertEntity({
    id: "section:montage-linie-1",
    entity_kind: "Section",
    label: "Montage Linie 1",
    body:
      "Assembly line 1 station. Operated with torque wrenches for housing " +
      "fixation screws.",
  });
  await upsertEntity({
    id: "testcode:VIB_TEST",
    entity_kind: "TestCode",
    label: "VIB_TEST",
    body: "Vibration amplitude test at end-of-line.",
  });
  await link("INDICATED_BY", "torque-calibration-drift", "testcode:VIB_TEST");

  await writeObservation({
    id: "OBS-S2-01",
    text:
      "VIB_TEST failures spike at Montage Linie 1 across weeks 49-52/2025 " +
      "then fall to zero from KW 2/2026 onward — a narrow, self-corrected " +
      "time window consistent with torque-wrench calibration drift.",
    confidence: 0.9,
    about_entities: ["section:montage-linie-1", "testcode:VIB_TEST"],
    about_concepts: ["torque-calibration-drift"],
    evidenced_by: src,
  });
  await writeObservation({
    id: "OBS-S2-02",
    text:
      "Rework action_text entries in the affected period mention " +
      "\"Schraubmoment nachgezogen\" — screws retightened after failure, " +
      "matching an under-torque root cause.",
    confidence: 0.8,
    about_entities: ["section:montage-linie-1"],
    about_concepts: ["torque-calibration-drift"],
    evidenced_by: src,
  });

  // -------------------- Story 3: Design weakness on ART-00001 --------------
  await upsertEntity({
    id: "ART-00001",
    entity_kind: "Article",
    label: "Motor Controller MC-200 (ART-00001)",
    manex_table: "article",
    manex_id: "ART-00001",
    body:
      "Motor controller product. BOM includes a 'Steuerplatine' assembly " +
      "with resistor PM-00015 at position R33.",
  });
  await upsertEntity({
    id: "PM-00015",
    entity_kind: "Part",
    label: "PM-00015 — resistor at R33 (Steuerplatine)",
    manex_table: "part_master",
    manex_id: "PM-00015",
    body:
      "Resistor at BOM find_number R33 on the Steuerplatine assembly. Runs " +
      "hot under nominal load; gradual drift leads to field failures.",
  });
  await upsertEntity({
    id: "bompos:R33",
    entity_kind: "BomPosition",
    label: "R33 on Steuerplatine",
    body: "BOM position R33 — parametric-drift hotspot.",
  });
  await link("USED_AT", "PM-00015", "bompos:R33");
  await link("IN_ARTICLE", "bompos:R33", "ART-00001");

  await writeObservation({
    id: "OBS-S3-01",
    text:
      "Field claims on ART-00001 cluster 8-12 weeks after customer operation " +
      "begins. No matching in-factory defect record — short-duration " +
      "factory tests don't catch the drift.",
    confidence: 0.9,
    about_entities: ["ART-00001", "PM-00015", "bompos:R33"],
    about_concepts: ["thermal-drift-failure"],
    evidenced_by: src,
  });
  await writeObservation({
    id: "OBS-S3-02",
    text:
      "German complaint_text on these claims mentions \"schleichender " +
      "Ausfall\", \"Temperatur\", \"Drift\" — consistent with a " +
      "thermally-driven parametric failure of PM-00015 at R33.",
    confidence: 0.85,
    about_entities: ["PM-00015", "bompos:R33"],
    about_concepts: ["thermal-drift-failure"],
    evidenced_by: src,
  });

  // -------------------- Story 4: Operator handling --------------------
  await upsertEntity({
    id: "operator:user_042",
    entity_kind: "Operator",
    label: "user_042 (packaging)",
    manex_table: "rework",
    manex_id: "user_042",
    body:
      "Packaging / rework operator associated with a cluster of cosmetic " +
      "defects across three specific production orders.",
  });
  for (const po of ["PO-00012", "PO-00018", "PO-00024"]) {
    await upsertEntity({
      id: po,
      entity_kind: "Order",
      label: po,
      manex_table: "production_order",
      manex_id: po,
    });
  }
  for (const dc of ["VISUAL_SCRATCH", "LABEL_MISALIGN"]) {
    await upsertEntity({
      id: `defectcode:${dc}`,
      entity_kind: "DefectCode",
      label: dc,
    });
    await link("INDICATED_BY", "operator-handling-cosmetic", `defectcode:${dc}`);
  }

  await writeObservation({
    id: "OBS-S4-01",
    text:
      "Cosmetic defects (VISUAL_SCRATCH, LABEL_MISALIGN) at severity=low " +
      "cluster on orders PO-00012, PO-00018, PO-00024. rework.user_id " +
      "'user_042' dominates these three orders.",
    confidence: 0.9,
    about_entities: [
      "operator:user_042",
      "PO-00012",
      "PO-00018",
      "PO-00024",
      "defectcode:VISUAL_SCRATCH",
      "defectcode:LABEL_MISALIGN",
    ],
    about_concepts: ["operator-handling-cosmetic"],
    evidenced_by: src,
  });

  await logEntry(
    "seed",
    "Seeded four root-cause stories from DATA_PATTERNS.md.",
  );
}
