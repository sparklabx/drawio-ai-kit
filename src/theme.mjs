// drawio-ai-kit — THEME (design tokens / style system).
// Distilled from the reference diagram the user liked. The whole look = a small, cohesive set of
// PALE, theme-aware (light-dark) tints + AWS icons carrying the strong color + clean 2px edges with
// animated main flow. Use the helpers below (or the themed creators in layout-engine.mjs) so every
// diagram inherits this style by default instead of hand-picking colors.

export const THEME = {
  // Per-stage frame tints — PALE and theme-aware (look right in light AND dark mode).
  // Stage i of a pipeline takes stages[i]; cohesive, never garish.
  stages: [
    "light-dark(#eaf3ec,#16241b)", // 1 green   (ingest)
    "light-dark(#fff3e9,#2a1d12)", // 2 orange  (process)
    "light-dark(#fff8e6,#2a2410)", // 3 amber   (store)
    "light-dark(#f3eef8,#241b2e)", // 4 purple  (serve)
    "light-dark(#e9eef4,#19222e)", // 5 blue-grey
  ],
  stageStroke: ["#82B366", "#D79B00", "#D6B656", "#9673A6", "#6C8EBF"],

  base: "light-dark(#ffffff,#0f1620)",        // plain box / OSS component
  baseStroke: "#5A6B7B",
  endpoint: "light-dark(#eaf3ff,#10202e)",    // source / consumer card (entry/exit)
  endpointStroke: "#6C8EBF",
  band: "light-dark(#eef1f5,#1b2430)",        // cross-cutting band (governance/security/ops)
  bandStroke: "#8593A3",
  // AWS-convention container colours (matches the common reference scheme).
  subnetPublic: "light-dark(#eef5e6,#1a2410)",  subnetPublicStroke: "#7AA116",   // public subnet — AWS green
  subnetPrivate: "light-dark(#e6f4f4,#0f2424)", subnetPrivateStroke: "#00A4A6",  // private subnet — AWS teal
  regionStroke: "#147EBA",                     // Region border — AWS blue (kept distinct from teal subnets)
  vpcStroke: "#8C4FFF",                        // VPC border — AWS networking purple
  accountStroke: "#C2487A",                    // Account border — magenta (like the reference)
  azStroke: "#2F9491",                         // Availability Zone / Local Zone — muted teal-green (dashed); distinct from the brighter private-subnet teal
  note: "light-dark(#fbe7d4,#3a2a16)",        // emphasis / callout note
  noteStroke: "#D79B00",
  onprem: "light-dark(#eef1f5,#181f29)",      // on-premise / external site frame
  onpremStroke: "#666666",

  fontColor: "light-dark(#1B2733,#CFE0F0)",   // theme-aware text
  edge: {
    stroke: "light-dark(#2D6A9F,#5B9BD5)",    // calm blue — the signature edge color
    strokeWidth: 2,
    fontColor: "light-dark(#1B2733,#CFE0F0)",
    labelBg: "light-dark(#FFFFFF,#0B0F14)",
  },
  fonts: { title: 14, label: 11, small: 10 },
  gaps: { layer: 50, item: 16 },
};

export const stageFill = (i) => THEME.stages[i % THEME.stages.length];
export const stageStroke = (i) => THEME.stageStroke[i % THEME.stageStroke.length];
