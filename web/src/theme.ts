// Palette per the dataviz skill's validated default (references/palette.md).
// Both modes are pre-validated — do not reorder or cycle these.
export const categorical = {
  light: ["#2a78d6", "#1baf7a", "#eda100", "#008300", "#4a3aa7", "#e34948", "#e87ba4", "#eb6834"],
  dark: ["#3987e5", "#199e70", "#c98500", "#008300", "#9085e9", "#e66767", "#d55181", "#d95926"],
};

// Sequential single-hue ramp (blue), light -> dark, for magnitude encodings.
export const sequentialBlue = ["#cde2fb", "#9ec5f4", "#6da7ec", "#3987e5", "#256abf", "#184f95", "#0d366b"];
// Second sequential hue (aqua), used when two magnitude contexts appear at once.
export const sequentialAqua = ["#c8ece0", "#8fd6bc", "#4fbd93", "#1baf7a", "#158a5f", "#0f6544", "#0a412b"];

// Status palette (fixed, never themed) — used for additions/deletions.
export const status = {
  good: { light: "#0ca30c", dark: "#0ca30c" },
  critical: { light: "#d03b3b", dark: "#d03b3b" },
};

export function prefersDark(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches;
}

// Chart chrome (axes/gridlines) per references/palette.md; canvas/SVG
// rendering can't read CSS custom properties, so these are resolved here.
export function chartChrome(dark: boolean) {
  return {
    muted: "#898781",
    gridline: dark ? "#2c2c2a" : "#e1e0d9",
    baseline: dark ? "#383835" : "#c3c2b7",
  };
}

// Stable categorical color for the Nth distinct entity (author, branch, ...).
// Cycles past 8 — acceptable degradation since entity names are always
// shown as direct labels alongside the color, never color-only identity.
export function categoricalColor(index: number, dark: boolean): string {
  const arr = dark ? categorical.dark : categorical.light;
  return arr[index % arr.length];
}
