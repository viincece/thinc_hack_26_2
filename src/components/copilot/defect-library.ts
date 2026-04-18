/**
 * Catalog of defect reference photos served from /public/defect_images.
 * The engineer — or the agent — can pick from these in D2 rather than
 * needing to upload a file every time.
 */

export type DefectPhoto = {
  id: string;
  label: string;
  url: string;
  filename: string;
};

function entry(filename: string, label: string): DefectPhoto {
  return {
    id: filename.replace(/\.[^.]+$/, ""),
    label,
    url: `/defect_images/${filename}`,
    filename,
  };
}

export const DEFECT_LIBRARY: DefectPhoto[] = [
  entry("defect_01_cold_solder.png", "Cold solder joint"),
  entry("defect_02_housing_crack.png", "Housing crack"),
  entry("defect_03_burnt_resistor.png", "Burnt resistor"),
  entry("defect_04_bent_pin.png", "Bent pin"),
  entry("defect_05_loose_wire.png", "Loose wire"),
  entry("defect_06_corrosion.png", "Corrosion"),
  entry("defect_07_misalignment.png", "Misalignment"),
  entry("defect_08_bulging_cap.png", "Bulging capacitor"),
  entry("defect_09_lens_scratch.png", "Lens scratch"),
  entry("defect_10_debris.png", "Debris / contamination"),
  entry("defect_11_bad_label.png", "Label misprint"),
  entry("defect_12_lifted_pad.png", "Lifted PCB pad"),
];

/**
 * Map defect codes that actually appear in Manex onto the closest photo in
 * the library. Kept as a plain record so the agent and the incident page
 * can both import and extend it.
 */
const DEFECT_CODE_TO_FILE: Record<string, string> = {
  SOLDER_COLD: "defect_01_cold_solder.png",
  COLD_JOINT: "defect_01_cold_solder.png",
  VISUAL_CRACK: "defect_02_housing_crack.png",
  HAIRLINE: "defect_02_housing_crack.png",
  BURNED: "defect_03_burnt_resistor.png",
  THERMAL_DRIFT: "defect_03_burnt_resistor.png",
  POLARITY: "defect_04_bent_pin.png",
  MISSING_PART: "defect_05_loose_wire.png",
  LABEL_MISALIGN: "defect_11_bad_label.png",
  DIM_OOL: "defect_07_misalignment.png",
  VISUAL_SCRATCH: "defect_09_lens_scratch.png",
  VIB_FAIL: "defect_12_lifted_pad.png",
  TEST_OOL: "defect_10_debris.png",
  FUNC_FAIL: "defect_10_debris.png",
};

export function photoForDefectCode(code: string | null | undefined): DefectPhoto | null {
  if (!code) return null;
  const file = DEFECT_CODE_TO_FILE[code.toUpperCase()];
  if (!file) return null;
  return DEFECT_LIBRARY.find((p) => p.filename === file) ?? null;
}

/**
 * Resolve a thumbnail URL for a failureImages entry. Accepts uploads
 * (dataUrl), library picks (url), and — crucially — name-only entries
 * the agent may write when it references a library photo by filename.
 * Matching is tolerant to a missing or mismatched extension.
 */
export function resolveFailureImageSrc(img: {
  name?: string;
  url?: string;
  dataUrl?: string;
}): string | undefined {
  if (img.dataUrl) return img.dataUrl;
  if (img.url) return img.url;
  if (!img.name) return undefined;
  const stem = img.name
    .toLowerCase()
    .replace(/\.(png|jpe?g|gif|webp|tiff?)$/i, "")
    .trim();
  if (!stem) return undefined;
  // Exact stem match.
  const byStem = DEFECT_LIBRARY.find(
    (p) => p.filename.toLowerCase().replace(/\.[^.]+$/, "") === stem,
  );
  if (byStem) return byStem.url;
  // Substring match — e.g. "loose_wire" in "defect_05_loose_wire".
  const byId = DEFECT_LIBRARY.find((p) => p.id.toLowerCase().includes(stem));
  if (byId) return byId.url;
  const byContains = DEFECT_LIBRARY.find((p) =>
    stem.includes(p.id.toLowerCase()),
  );
  return byContains?.url;
}
