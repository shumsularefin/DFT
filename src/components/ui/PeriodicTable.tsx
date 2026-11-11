import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  CATEGORIES,
  CELLS,
  cellLabel,
  matchElements,
  neighbour,
  type Cell,
  type Dir,
} from '../../lib/chem/periodic';
import './PeriodicTable.css';

export interface PeriodicTableProps {
  /** Accessible name, for example "Pick an element for the A site". */
  label: string;
  selected?: string | null;
  onSelect: (symbol: string) => void;
  /** Elements that cannot be chosen. They stay focusable so arrow keys keep working, and say so aloud. */
  isDisabled?: (symbol: string) => boolean;
  /** Elements to mark as suggested (dashed outline plus the word "suggested" for screen readers). */
  highlighted?: ReadonlySet<string>;
  /** Move keyboard focus into the table on mount. */
  autoFocus?: boolean;
}

const ARROWS: Record<string, Dir> = {
  ArrowLeft: 'left',
  ArrowRight: 'right',
  ArrowUp: 'up',
  ArrowDown: 'down',
};

function useCompact(): boolean {
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 640px)');
    const read = () => setCompact(mq.matches);
    read();
    mq.addEventListener('change', read);
    return () => mq.removeEventListener('change', read);
  }, []);
  return compact;
}

/**
 * Shared periodic table. Wide screens: 18-column grid, arrow keys move by position, letters jump to a matching
 * element, Enter or Space selects. Narrow screens (640 px and below): search box plus a scrollable list.
 * Categories are shown by colour and by text (legend and screen-reader name).
 */
export default function PeriodicTable({
  label,
  selected = null,
  onSelect,
  isDisabled,
  highlighted,
  autoFocus = false,
}: PeriodicTableProps) {
  const compact = useCompact();
  const disabled = useCallback((s: string) => (isDisabled ? isDisabled(s) : false), [isDisabled]);
  const firstEnabled = useMemo(() => CELLS.find((c) => !disabled(c.symbol))?.symbol ?? 'H', [disabled]);
  const [focus, setFocus] = useState<string>(selected ?? firstEnabled);
  const [query, setQuery] = useState('');
  const refs = useRef(new Map<string, HTMLButtonElement>());
  const buffer = useRef({ text: '', at: 0 });
  const searchId = useId();
  const mounted = useRef(false);

  const visible = useMemo(() => (compact ? matchElements(query) : CELLS), [compact, query]);

  const tabbable = visible.some((v) => v.symbol === focus) ? focus : visible[0]?.symbol;

  const focusCell = (symbol: string) => {
    setFocus(symbol);
    refs.current.get(symbol)?.focus();
  };

  useEffect(() => {
    if (autoFocus && !mounted.current) refs.current.get(focus)?.focus();
    mounted.current = true;
  }, [autoFocus, focus, compact]);

  const choose = (c: Cell) => {
    if (disabled(c.symbol)) return;
    onSelect(c.symbol);
  };

  const onKeyDown = (e: React.KeyboardEvent, c: Cell) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (compact) {
      const i = visible.findIndex((x) => x.symbol === c.symbol);
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const n = visible[Math.min(visible.length - 1, Math.max(0, i + (e.key === 'ArrowDown' ? 1 : -1)))];
        if (n) focusCell(n.symbol);
      }
      return;
    }
    const dir = ARROWS[e.key];
    if (dir) {
      e.preventDefault();
      focusCell(neighbour(c.symbol, dir));
      return;
    }
    if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      const row = CELLS.filter((x) => x.row === c.row).sort((a, b) => a.col - b.col);
      const t = e.key === 'Home' ? row[0] : row[row.length - 1];
      if (t) focusCell(t.symbol);
      return;
    }
    if (e.key.length === 1 && /[a-z0-9]/i.test(e.key)) {
      const now = Date.now();
      const b = buffer.current;
      b.text = now - b.at > 700 ? e.key : b.text + e.key;
      b.at = now;
      const hit = matchElements(b.text)[0];
      if (hit) {
        e.preventDefault();
        focusCell(hit.symbol);
      }
    }
  };

  const text = (c: Cell) =>
    `${cellLabel(c)}, ${c.category}${disabled(c.symbol) ? ', not available for this choice' : ''}${
      highlighted?.has(c.symbol) ? ', suggested' : ''
    }`;

  const button = (c: Cell, cls: string, children: React.ReactNode, labelled = true) => (
    <button
      key={c.symbol}
      type="button"
      ref={(el) => {
        if (el) refs.current.set(c.symbol, el);
        else refs.current.delete(c.symbol);
      }}
      className={cls}
      data-cat={c.category}
      data-symbol={c.symbol}
      data-highlight={highlighted?.has(c.symbol) ? 'true' : undefined}
      data-z={c.z}
      aria-label={labelled ? text(c) : undefined}
      aria-pressed={selected === c.symbol}
      aria-disabled={disabled(c.symbol) || undefined}
      tabIndex={c.symbol === tabbable ? 0 : -1}
      onFocus={() => setFocus(c.symbol)}
      onClick={() => choose(c)}
      onKeyDown={(e) => onKeyDown(e, c)}
    >
      {children}
    </button>
  );

  return (
    <div className="pt" role="group" aria-label={label}>
      {compact ? (
        <div className="pt-search">
          <label htmlFor={searchId}>Search elements by name, symbol or atomic number</label>
          <input
            id={searchId}
            type="search"
            value={query}
            autoComplete="off"
            onChange={(e) => setQuery(e.target.value)}
          />
          <p role="status" className="pt-count">
            {visible.length} {visible.length === 1 ? 'element matches' : 'elements match'}
          </p>
          <ul className="pt-list">
            {visible.map((c) => (
              <li key={c.symbol} data-cat={c.category}>
                {button(
                  c,
                  'pt-item',
                  <>
                    <b>{c.symbol}</b>
                    <span>{c.name}</span>
                    <span className="pt-cat">{c.category}</span>
                    <span className="sr-only">
                      , atomic number {c.z}
                      {disabled(c.symbol) ? ', not available for this choice' : ''}
                      {highlighted?.has(c.symbol) ? ', suggested' : ''}
                    </span>
                  </>,
                  false,
                )}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="pt-grid">
          {CELLS.map((c) => {
            const style = { gridRow: c.row >= 8 ? c.row + 1 : c.row, gridColumn: c.col } as const;
            return (
              <span key={c.symbol} style={style} className="pt-wrap" data-cat={c.category} data-row={c.row}>
                {button(c, 'pt-cell', <span className="pt-sym">{c.symbol}</span>)}
              </span>
            );
          })}
          <span className="pt-gap" style={{ gridRow: 8 }} aria-hidden="true" />
          <span className="pt-marker" style={{ gridRow: 6, gridColumn: 3 }} aria-hidden="true">
            57-71
          </span>
          <span className="pt-marker" style={{ gridRow: 7, gridColumn: 3 }} aria-hidden="true">
            89-103
          </span>
        </div>
      )}
      <ul className="pt-legend" aria-label="Element categories">
        {CATEGORIES.map((k) => (
          <li key={k} data-cat={k}>
            <i aria-hidden="true" />
            {k}
          </li>
        ))}
      </ul>
    </div>
  );
}
