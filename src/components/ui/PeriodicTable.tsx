import { useMemo, useRef, useState, type KeyboardEvent } from 'react';
import elementsData from '../../data/elements.json';
import './PeriodicTable.css';
import './button.css';

export interface ElementEntry {
  readonly Z: number;
  readonly symbol: string;
  readonly name: string;
  readonly period: number;
  readonly group: number | null;
  readonly block: string;
  readonly category: string;
}

export const ALL_ELEMENTS = elementsData.elements as readonly ElementEntry[];

export interface PeriodicTableProps {
  selected?: string | null;
  onSelect: (symbol: string) => void;
  disabled?: ReadonlySet<string>;
  highlighted?: ReadonlySet<string>;
  label?: string;
}

/** Grid row (1..10) and column (1..18) for each element Z=1..103. */
function gridPos(el: ElementEntry): { row: number; col: number } {
  if (el.Z >= 57 && el.Z <= 71) return { row: 9, col: 4 + (el.Z - 57) };
  if (el.Z >= 89 && el.Z <= 103) return { row: 10, col: 4 + (el.Z - 89) };
  return { row: el.period, col: el.group ?? 1 };
}

const CAT_SHORT: Record<string, string> = {
  'alkali-metal': 'AM',
  'alkaline-earth-metal': 'AE',
  'transition-metal': 'TM',
  'post-transition-metal': 'PT',
  metalloid: 'MD',
  nonmetal: 'NM',
  halogen: 'HL',
  'noble-gas': 'NG',
  lanthanide: 'Ln',
  actinide: 'An',
};

export default function PeriodicTable({
  selected,
  onSelect,
  disabled,
  highlighted,
  label = 'Periodic table element picker',
}: PeriodicTableProps) {
  const [query, setQuery] = useState('');
  const btnRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

  const positions = useMemo(() => {
    const bySym = new Map<string, { row: number; col: number }>();
    const byPos = new Map<string, ElementEntry>();
    for (const el of ALL_ELEMENTS) {
      const p = gridPos(el);
      bySym.set(el.symbol, p);
      byPos.set(`${p.row},${p.col}`, el);
    }
    return { bySym, byPos };
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return ALL_ELEMENTS;
    return ALL_ELEMENTS.filter(
      (el) => el.symbol.toLowerCase().includes(q) || el.name.toLowerCase().includes(q) || String(el.Z) === q,
    );
  }, [query]);

  const matchSet = useMemo(() => new Set(filtered.map((e) => e.symbol)), [filtered]);

  function moveFocus(el: ElementEntry, dRow: number, dCol: number) {
    const pos = positions.bySym.get(el.symbol);
    if (!pos) return;
    let r = pos.row + dRow;
    let c = pos.col + dCol;
    while (r >= 1 && r <= 10 && c >= 1 && c <= 18) {
      const hit = positions.byPos.get(`${r},${c}`);
      if (hit && !disabled?.has(hit.symbol)) {
        btnRefs.current.get(hit.symbol)?.focus();
        return;
      }
      r += dRow;
      c += dCol;
    }
  }

  function onCellKeyDown(e: KeyboardEvent<HTMLButtonElement>, el: ElementEntry) {
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      moveFocus(el, 0, 1);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      moveFocus(el, 0, -1);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      moveFocus(el, 1, 0);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      moveFocus(el, -1, 0);
    }
  }

  return (
    <div className="pt-wrap" role="region" aria-label={label}>
      <div className="pt-toolbar">
        <label className="sr-only" htmlFor="pt-search-input">
          Filter elements by symbol, name, or atomic number
        </label>
        <input
          id="pt-search-input"
          className="pt-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search symbol, name, or Z (e.g. Sr, Titanium, 22)"
        />
        {query && filtered.length === 1 && !disabled?.has(filtered[0]!.symbol) && (
          <button type="button" className="btn" onClick={() => onSelect(filtered[0]!.symbol)}>
            Select {filtered[0]!.symbol}
          </button>
        )}
      </div>

      <div className="pt-grid" role="grid" aria-label={label}>
        {ALL_ELEMENTS.map((el) => {
          const pos = positions.bySym.get(el.symbol)!;
          const isDis =
            Boolean(disabled?.has(el.symbol)) || (query.trim() !== '' && !matchSet.has(el.symbol));
          const isSel = selected === el.symbol;
          const isHi = Boolean(highlighted?.has(el.symbol));
          return (
            <button
              key={el.symbol}
              ref={(node) => {
                if (node) btnRefs.current.set(el.symbol, node);
                else btnRefs.current.delete(el.symbol);
              }}
              type="button"
              className={`pt-cell${isHi ? ' pt-highlight' : ''}`}
              style={{ gridRow: pos.row, gridColumn: pos.col }}
              disabled={isDis}
              aria-pressed={isSel}
              aria-label={`${el.name}, ${el.symbol}, atomic number ${el.Z}, ${el.category.replace(/-/g, ' ')}`}
              onClick={() => onSelect(el.symbol)}
              onKeyDown={(e) => onCellKeyDown(e, el)}
            >
              <span className="pt-z">{el.Z}</span>
              <span className="pt-sym">{el.symbol}</span>
              <span className="pt-cat-tag" aria-hidden="true">
                {CAT_SHORT[el.category] ?? ''}
              </span>
            </button>
          );
        })}
      </div>

      <div className="pt-list" role="listbox" aria-label={`${label} (list view)`}>
        {filtered.map((el) => {
          const isDis = Boolean(disabled?.has(el.symbol));
          const isSel = selected === el.symbol;
          return (
            <button
              key={el.symbol}
              type="button"
              className="pt-list-btn"
              disabled={isDis}
              aria-pressed={isSel}
              onClick={() => onSelect(el.symbol)}
            >
              <span>
                <strong>{el.symbol}</strong> ({el.Z}) {el.name}
              </span>
              <span className="pt-cat-tag">{el.category.replace(/-/g, ' ')}</span>
            </button>
          );
        })}
      </div>

      <div className="pt-legend">
        <span>AM alkali</span>
        <span>AE alkaline earth</span>
        <span>TM transition</span>
        <span>PT post-transition</span>
        <span>MD metalloid</span>
        <span>NM nonmetal</span>
        <span>HL halogen</span>
        <span>NG noble gas</span>
        <span>Ln lanthanide</span>
        <span>An actinide</span>
      </div>
    </div>
  );
}
