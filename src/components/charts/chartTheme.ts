// Concrete values for SVG attributes (Recharts sets attributes, which don't
// resolve CSS var()). Keep in sync with the tokens in globals.css.
export const CHART = {
  series1: "#2f7fae", // ocean
  series2: "#a5822b", // gold
  series3: "#94539b", // plum
  series4: "#4e8348", // moss
  series5: "#d06e87", // rose
  grid: "rgba(22, 24, 29, 0.08)",
  axisText: "rgba(22, 24, 29, 0.55)",
  cursor: "rgba(22, 24, 29, 0.18)",
} as const;

export const AXIS_TICK = {
  fill: CHART.axisText,
  fontSize: 11,
  fontFamily: "var(--font-geist-mono), monospace",
} as const;
