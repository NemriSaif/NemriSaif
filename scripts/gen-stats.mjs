// Regenerates the profile stat cards (assets/github-stats.svg, assets/top-langs.svg)
// from live GitHub data. Runs in CI with GH_TOKEN set to the Actions GITHUB_TOKEN.
// Pure Node, no dependencies.

import { writeFileSync, mkdirSync } from "node:fs";

const USER = "NemriSaif";
const tok = process.env.GH_TOKEN;
if (!tok) {
  console.error("GH_TOKEN is not set");
  process.exit(1);
}

const query = `query {
  user(login: "${USER}") {
    contributionsCollection { totalCommitContributions }
    pullRequests { totalCount }
    issues { totalCount }
    repositories(first: 100, ownerAffiliations: OWNER, isFork: false) {
      totalCount
      nodes {
        languages(first: 10, orderBy: { field: SIZE, direction: DESC }) {
          edges { size node { name color } }
        }
      }
    }
  }
}`;

const res = await fetch("https://api.github.com/graphql", {
  method: "POST",
  headers: {
    Authorization: "bearer " + tok,
    "User-Agent": "nemrisaif-stats-gen",
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ query }),
});

const json = await res.json();
if (!res.ok || json.errors) {
  console.error("GitHub API error:", JSON.stringify(json.errors || json).slice(0, 500));
  process.exit(1);
}

const u = json.data.user;
const commits = u.contributionsCollection.totalCommitContributions;
const repos = u.repositories.totalCount;
const prs = u.pullRequests.totalCount;
const issues = u.issues.totalCount;

const langTotals = {};
for (const r of u.repositories.nodes) {
  for (const e of r.languages.edges) {
    langTotals[e.node.name] = langTotals[e.node.name] || { size: 0, color: e.node.color };
    langTotals[e.node.name].size += e.size;
  }
}
const allSize = Object.values(langTotals).reduce((s, l) => s + l.size, 0) || 1;
const langs = Object.entries(langTotals)
  .sort((a, b) => b[1].size - a[1].size)
  .slice(0, 6)
  .map(([name, v]) => ({ name, color: v.color || "#888888", pct: +((100 * v.size) / allSize).toFixed(1) }));

// ---- shared style ----
const FONT = `font-family="Segoe UI, Ubuntu, Helvetica, Arial, sans-serif"`;
const PANEL = "#0c1320", CYAN = "#22d3ee", WHITE = "#e6edf3", MUTED = "#8b949e", BORDER = "#1f2733";
const W = 420, H = 165;

// ---- Card A: GitHub at a glance ----
const stats = [
  { n: String(commits), l: "Commits (last 12 mo)" },
  { n: String(repos), l: "Public repositories" },
  { n: String(prs), l: "Pull requests" },
  { n: String(issues), l: "Issues opened" },
];
const cellX = [30, 222], cellY = [78, 128];
let tiles = "";
stats.forEach((s, i) => {
  const x = cellX[i % 2], y = cellY[Math.floor(i / 2)];
  tiles += `<text x="${x}" y="${y}" ${FONT} font-size="30" font-weight="800" fill="${CYAN}">${s.n}</text>`;
  tiles += `<text x="${x + 2}" y="${y + 20}" ${FONT} font-size="12.5" fill="${MUTED}">${s.l}</text>`;
});
const cardA = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="GitHub at a glance">
  <defs><radialGradient id="g" cx="92%" cy="6%" r="60%"><stop offset="0" stop-color="${CYAN}" stop-opacity="0.16"/><stop offset="1" stop-color="${CYAN}" stop-opacity="0"/></radialGradient></defs>
  <rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="14" fill="${PANEL}" stroke="${BORDER}"/>
  <rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="14" fill="url(#g)"/>
  <text x="30" y="40" ${FONT} font-size="17" font-weight="700" fill="${WHITE}">GitHub at a glance</text>
  <rect x="30" y="50" width="34" height="3" rx="1.5" fill="${CYAN}"/>
  ${tiles}
</svg>`;

// ---- Card B: Most used languages ----
const barX = 30, barW = 360, barY = 64, barH = 12;
const shown = langs.reduce((s, l) => s + l.pct, 0) || 1;
let segs = "", cx = barX;
langs.forEach((l) => {
  const w = (l.pct / shown) * barW;
  segs += `<rect x="${cx.toFixed(1)}" y="${barY}" width="${w.toFixed(1)}" height="${barH}" fill="${l.color}"/>`;
  cx += w;
});
const lx = [30, 215], ly = [104, 128, 152];
let leg = "";
langs.forEach((l, i) => {
  const x = lx[i % 2], y = ly[Math.floor(i / 2)];
  leg += `<circle cx="${x + 5}" cy="${y - 4}" r="5" fill="${l.color}"/>`;
  leg += `<text x="${x + 16}" y="${y}" ${FONT} font-size="12.5" fill="${WHITE}">${l.name} <tspan fill="${MUTED}">${l.pct}%</tspan></text>`;
});
const cardB = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Most used languages">
  <defs><radialGradient id="g2" cx="92%" cy="6%" r="60%"><stop offset="0" stop-color="${CYAN}" stop-opacity="0.16"/><stop offset="1" stop-color="${CYAN}" stop-opacity="0"/></radialGradient><clipPath id="bar"><rect x="${barX}" y="${barY}" width="${barW}" height="${barH}" rx="6"/></clipPath></defs>
  <rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="14" fill="${PANEL}" stroke="${BORDER}"/>
  <rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="14" fill="url(#g2)"/>
  <text x="30" y="40" ${FONT} font-size="17" font-weight="700" fill="${WHITE}">Most used languages</text>
  <rect x="30" y="50" width="34" height="3" rx="1.5" fill="${CYAN}"/>
  <g clip-path="url(#bar)">${segs}</g>
  ${leg}
</svg>`;

mkdirSync("assets", { recursive: true });
writeFileSync("assets/github-stats.svg", cardA);
writeFileSync("assets/top-langs.svg", cardB);
console.log(`Regenerated cards: ${commits} commits, ${repos} repos, ${prs} PRs, ${issues} issues, ${langs.length} languages`);
