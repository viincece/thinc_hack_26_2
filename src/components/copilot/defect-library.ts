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
