/**
 * DistrictLayout — auto-computes [x, z] world positions for every repo
 * based on which district it belongs to.
 *
 * Design goals:
 *  - Zero hardcoded per-repo coordinates. The only hardcoded values are the
 *    district bounding-box origins and grid spacing — things that change only
 *    if the city map itself is redesigned.
 *  - Adding a new repo to a district only requires setting district in the DB;
 *    it will automatically appear at the next available grid slot.
 *  - "special" repos keep hand-placed positions defined here (not a grid).
 *
 * Coordinate system: Three.js world space, ground plane is y=0.
 *   +x → East, −x → West, +z → South, −z → North
 *
 * District map:
 *   ms-partner  NW   origin (−64, 0, −8)   grid grows East (+x) then North (−z)
 *   ms-pip      NE   origin ( 24, 0, −24)   grid grows East (+x) then North (−z)
 *   special     —    fixed positions per slug (production-support)
 *
 * ms-pip grid slots (cols=3, colSpacing=8, rowSpacing=16, rowDir=-1):
 *   row 0: (24,-24)=wp26  (32,-24)=wp27  (40,-24)=wp28
 *   row 1: (24,-40)=wp29  (32,-40)=wp30  (40,-40)=wp31
 *   row 2: (24,-56)=wp32  …
 * All slots are exact main-road waypoints — no stub mapping needed.
 */

/** Default grid spacing between building centres (used for rows and cols unless overridden). */
const SPACING = 16;

/**
 * District grid configurations.
 * origin:    [x, z] of the first (nearest-to-plaza) slot.
 * cols:      max buildings per row before wrapping to the next row.
 * rowDir:    direction rows grow — +1 = south (+z), -1 = north (−z).
 * colSpacing: x-distance between columns (defaults to SPACING).
 * rowSpacing: z-distance between rows    (defaults to SPACING).
 *
 * ms-pip uses colSpacing=14 to provide adequate gaps between buildings,
 * while row spacing stays 16 for proper street separation.
 */
const DISTRICT_GRID = {
  'ms-partner': { origin: [-64, -8],  cols: 4, rowDir: -1 },
  'ms-pip':     { origin: [ 24, -24], cols: 3, rowDir: -1, colSpacing: 14 },
};

/**
 * Hand-placed positions for repos that don't fit a regular grid.
 * Keyed by slug.
 */
const SPECIAL_POSITIONS = {
  'production-support': [ 20, 0 ],
};

/**
 * Computes world [x, z] positions for every repo in the provided API list.
 *
 * @param {Array<{slug: string, district: string}>} apiRepos
 *   Full list from GET /api/repos. Only slug and district are used here.
 *
 * @returns {Map<string, [number, number]>}
 *   Map from slug → [x, z] world position.
 */
export function computeLayout(apiRepos) {
  /** @type {Map<string, [number, number]>} */
  const layout = new Map();

  // Separate special repos first
  const gridRepos = apiRepos.filter(r => r.district !== 'special');
  const specialRepos = apiRepos.filter(r => r.district === 'special');

  // ── Grid-based districts ─────────────────────────────────────────────────
  // Group by district, preserving API order within each group
  /** @type {Map<string, Array<{slug:string}>>} */
  const byDistrict = new Map();
  for (const repo of gridRepos) {
    if (!byDistrict.has(repo.district)) byDistrict.set(repo.district, []);
    byDistrict.get(repo.district).push(repo);
  }

  for (const [district, repos] of byDistrict) {
    const cfg = DISTRICT_GRID[district];
    if (!cfg) {
      console.warn(`DistrictLayout: unknown district "${district}" — skipping`);
      continue;
    }
    const [ox, oz]   = cfg.origin;
    const rowDir     = cfg.rowDir    ?? 1;
    const colSpacing = cfg.colSpacing ?? SPACING;
    const rowSpacing = SPACING;
    repos.forEach((repo, idx) => {
      const col = idx % cfg.cols;
      const row = Math.floor(idx / cfg.cols);
      layout.set(repo.slug, [ox + col * colSpacing, oz + row * rowSpacing * rowDir]);
    });
  }

  // ── Special (hand-placed) ─────────────────────────────────────────────────
  for (const repo of specialRepos) {
    const pos = SPECIAL_POSITIONS[repo.slug];
    if (pos) {
      layout.set(repo.slug, pos);
    } else {
      // Fallback: stack them near world origin so they're at least visible
      const fallbackIdx = [...layout.keys()].length;
      console.warn(`DistrictLayout: no fixed position for special repo "${repo.slug}" — using fallback`);
      layout.set(repo.slug, [0, fallbackIdx * SPACING]);
    }
  }

  return layout;
}
