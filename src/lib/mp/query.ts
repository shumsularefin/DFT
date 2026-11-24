// Columnar query, sorting, perovskite check and CSV export engine for the Screening Studio (M9.2).
// @source S-024 (Materials Project attribution), S-044 (Materials Project summary fields)
import type { CrystalSystem, MpIndexColumns, Ordering } from './schema';

export interface MpSpaceGroup {
  readonly number: number;
  readonly symbol: string;
  readonly crystalSystem: CrystalSystem;
}

export interface MpIndex {
  readonly schemaVersion: 1;
  readonly dbVersion: string;
  readonly count: number;
  readonly symbols: readonly string[];
  readonly spaceGroups: readonly MpSpaceGroup[];
  readonly columns: MpIndexColumns;
  /** Optional M9.4 ML hook column; always null until a validated model exists. */
  readonly ml_e_above_hull?: readonly (number | null)[];
  readonly ml_model?: string | null;
}

export interface MaterialRow {
  readonly rowIndex: number;
  readonly material_id: string;
  readonly formula_pretty: string;
  readonly elements: readonly string[];
  readonly nsites: number;
  readonly volume: number;
  readonly density: number;
  readonly energy_above_hull: number;
  readonly formation_energy_per_atom: number | null;
  readonly band_gap: number;
  readonly is_gap_direct: boolean | null;
  readonly is_metal: boolean | null;
  readonly is_magnetic: boolean | null;
  readonly ordering: Ordering;
  readonly total_magnetization: number | null;
  readonly num_magnetic_sites: number | null;
  readonly spacegroup: MpSpaceGroup;
  readonly is_stable: boolean;
  readonly theoretical: boolean;
  readonly shard: string | null;
  readonly ml_e_above_hull: number | null;
}

export type SortKey =
  'material_id' | 'formula_pretty' | 'nsites' | 'energy_above_hull' | 'band_gap' | 'density';

export interface StudioQuery {
  readonly text?: string;
  readonly includeElements?: readonly string[];
  readonly excludeElements?: readonly string[];
  readonly maxEhull?: number | null;
  readonly minGap?: number | null;
  readonly maxGap?: number | null;
  readonly maxSites?: number | null;
  readonly onlyStable?: boolean;
  readonly onlyMagnetic?: boolean;
  readonly metalFilter?: 'any' | 'metal' | 'nonmetal';
  readonly crystalSystem?: CrystalSystem | '';
  readonly sortBy?: SortKey;
  readonly sortDir?: 'asc' | 'desc';
}

export function materializeRow(index: MpIndex, i: number): MaterialRow {
  const c = index.columns;
  return {
    rowIndex: i,
    material_id: c.material_id[i]!,
    formula_pretty: c.formula_pretty[i]!,
    elements: c.elements[i]!.map((idx) => index.symbols[idx]!),
    nsites: c.nsites[i]!,
    volume: c.volume[i]!,
    density: c.density[i]!,
    energy_above_hull: c.energy_above_hull[i]!,
    formation_energy_per_atom: c.formation_energy_per_atom[i] ?? null,
    band_gap: c.band_gap[i]!,
    is_gap_direct: c.is_gap_direct[i] ?? null,
    is_metal: c.is_metal[i] ?? null,
    is_magnetic: c.is_magnetic[i] ?? null,
    ordering: c.ordering[i] ?? null,
    total_magnetization: c.total_magnetization[i] ?? null,
    num_magnetic_sites: c.num_magnetic_sites[i] ?? null,
    spacegroup: index.spaceGroups[c.spacegroup[i]!]!,
    is_stable: c.is_stable[i]!,
    theoretical: c.theoretical[i]!,
    shard: c.shard[i] ?? null,
    ml_e_above_hull: index.ml_e_above_hull?.[i] ?? null,
  };
}

/** Fast columnar filter returning matching row indices (designed for 50k+ rows in < 100 ms). */
export function filterRowIndices(index: MpIndex, q: StudioQuery): number[] {
  const c = index.columns;
  const n = index.count;
  const text = q.text?.trim().toLowerCase() ?? '';
  const symToIdx = new Map<string, number>();
  index.symbols.forEach((s, idx) => symToIdx.set(s, idx));

  const incIdx: number[] = [];
  for (const el of q.includeElements ?? []) {
    const idx = symToIdx.get(el);
    if (idx === undefined) return [];
    incIdx.push(idx);
  }
  const excSet = new Set<number>();
  for (const el of q.excludeElements ?? []) {
    const idx = symToIdx.get(el);
    if (idx !== undefined) excSet.add(idx);
  }

  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    if (q.onlyStable && !c.is_stable[i]) continue;
    if (q.onlyMagnetic && !c.is_magnetic[i]) continue;
    if (q.metalFilter === 'metal' && !c.is_metal[i]) continue;
    if (q.metalFilter === 'nonmetal' && c.is_metal[i]) continue;
    if (q.maxEhull !== undefined && q.maxEhull !== null && c.energy_above_hull[i]! > q.maxEhull) continue;
    if (q.minGap !== undefined && q.minGap !== null && c.band_gap[i]! < q.minGap) continue;
    if (q.maxGap !== undefined && q.maxGap !== null && c.band_gap[i]! > q.maxGap) continue;
    if (q.maxSites !== undefined && q.maxSites !== null && c.nsites[i]! > q.maxSites) continue;
    if (q.crystalSystem && index.spaceGroups[c.spacegroup[i]!]!.crystalSystem !== q.crystalSystem) continue;

    if (incIdx.length > 0 || excSet.size > 0) {
      const els = c.elements[i]!;
      let ok = true;
      for (const req of incIdx) {
        if (!els.includes(req)) {
          ok = false;
          break;
        }
      }
      if (!ok) continue;
      if (excSet.size > 0 && els.some((e) => excSet.has(e))) continue;
    }

    if (text) {
      const idMatch = c.material_id[i]!.toLowerCase().includes(text);
      const formMatch = c.formula_pretty[i]!.toLowerCase().includes(text);
      if (!idMatch && !formMatch) continue;
    }
    out.push(i);
  }

  const sortBy = q.sortBy ?? 'energy_above_hull';
  const dir = q.sortDir === 'desc' ? -1 : 1;
  out.sort((a, b) => {
    if (sortBy === 'material_id' || sortBy === 'formula_pretty') {
      return dir * c[sortBy][a]!.localeCompare(c[sortBy][b]!);
    }
    return dir * (c[sortBy][a]! - c[sortBy][b]!);
  });
  return out;
}

export function looksLikePerovskite(formula: string, nsites: number): boolean {
  return nsites % 5 === 0 && /^[A-Z][a-z]?[A-Z][a-z]?(O|F|Cl|Br|I|S|Se)3$/.test(formula);
}

export function materialsToCsv(rows: readonly MaterialRow[], attribution: string): string {
  const comment = `# Attribution: ${attribution.replace(/\r?\n/g, ' ')}`;
  const header =
    'material_id,formula_pretty,spacegroup,crystal_system,nsites,energy_above_hull_eV_per_atom,band_gap_eV,is_metal,is_magnetic,ordering,density_g_cm3';
  const body = rows.map((r) =>
    [
      r.material_id,
      r.formula_pretty,
      `"${r.spacegroup.symbol}"`,
      r.spacegroup.crystalSystem,
      r.nsites,
      r.energy_above_hull.toFixed(4),
      r.band_gap.toFixed(4),
      r.is_metal ?? '',
      r.is_magnetic ?? '',
      r.ordering ?? '',
      r.density.toFixed(4),
    ].join(','),
  );
  return [comment, header, ...body].join('\n') + '\n';
}
