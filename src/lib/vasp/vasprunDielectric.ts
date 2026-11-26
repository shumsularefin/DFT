// Reader for the <dielectricfunction> blocks of vasprun.xml (LOPTICS, M15.5).
// @source S-019 (VASP wiki, LOPTICS, read 2026-11-26, oldid 31076: computes the frequency-dependent dielectric matrix;
//   the page does not describe vasprun.xml), S-034 (pymatgen Vasprun._parse_diel and Vasprun.dielectric give the
//   layout and the block choice used here; the golden fixture is read back by that code)
//
// Streaming-safe: the reader scans the text with indexOf for the dielectric blocks only and never builds a DOM of
// the whole file, so a vasprun.xml of tens of MB costs one pass over the string. The caller can run it in a worker;
// it has no DOM dependency.

export const DIELECTRIC_COMPONENTS = ['xx', 'yy', 'zz', 'xy', 'yz', 'zx'] as const;
export type DielectricComponent = (typeof DIELECTRIC_COMPONENTS)[number];

export interface DielectricBlock {
  /** The `comment` attribute ("density-density", "current-current" in VASP 6), or undefined. */
  comment?: string;
  energiesEv: number[];
  eps1: Record<DielectricComponent, number[]>;
  eps2: Record<DielectricComponent, number[]>;
}

export interface VasprunDielectricResult {
  blocks: DielectricBlock[];
  /** The block to analyse: "density-density" when present, else the first unlabelled one (pymatgen's choice). */
  selected?: DielectricBlock;
  warnings: string[];
}

function rowsOf(section: string): number[][] {
  const rows: number[][] = [];
  const re = /<r>([^<]*)<\/r>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(section))) rows.push(m[1]!.trim().split(/\s+/).map(Number));
  return rows;
}

function part(block: string, tag: 'real' | 'imag'): number[][] | undefined {
  const a = block.indexOf(`<${tag}>`);
  const b = block.indexOf(`</${tag}>`, a);
  if (a < 0 || b < 0) return undefined;
  return rowsOf(block.slice(a, b));
}

function emptyComponents(): Record<DielectricComponent, number[]> {
  return { xx: [], yy: [], zz: [], xy: [], yz: [], zx: [] };
}

export function parseVasprunDielectric(text: string): VasprunDielectricResult {
  const blocks: DielectricBlock[] = [];
  const warnings: string[] = [];
  let from = 0;
  for (;;) {
    const start = text.indexOf('<dielectricfunction', from);
    if (start < 0) break;
    const end = text.indexOf('</dielectricfunction>', start);
    if (end < 0) {
      warnings.push('A <dielectricfunction> block is not closed; the file may be truncated.');
      break;
    }
    const tagEnd = text.indexOf('>', start);
    const comment = /comment="([^"]*)"/.exec(text.slice(start, tagEnd))?.[1];
    const body = text.slice(tagEnd + 1, end);
    from = end + 1;
    const im = part(body, 'imag');
    const re = part(body, 'real');
    if (!im || !re || im.length === 0 || im.length !== re.length) {
      warnings.push(
        `Dielectric block ${comment ?? '(unlabelled)'} has missing or mismatched real and imaginary parts.`,
      );
      continue;
    }
    const bad = [...im, ...re].some((r) => r.length !== 7 || !r.every(Number.isFinite));
    if (bad) {
      warnings.push(
        `Dielectric block ${comment ?? '(unlabelled)'} has rows that are not energy plus six components.`,
      );
      continue;
    }
    const eps1 = emptyComponents();
    const eps2 = emptyComponents();
    DIELECTRIC_COMPONENTS.forEach((c, j) => {
      eps2[c] = im.map((r) => r[j + 1]!);
      eps1[c] = re.map((r) => r[j + 1]!);
    });
    blocks.push({
      ...(comment !== undefined ? { comment } : {}),
      energiesEv: im.map((r) => r[0]!),
      eps1,
      eps2,
    });
  }
  const selected =
    blocks.find((b) => b.comment === 'density-density') ?? blocks.find((b) => b.comment === undefined);
  if (blocks.length === 0)
    warnings.push('No <dielectricfunction> block was found (was LOPTICS = .TRUE. set?).');
  else if (!selected) warnings.push('No density-density or unlabelled dielectric block; none was selected.');
  return { blocks, ...(selected ? { selected } : {}), warnings };
}
