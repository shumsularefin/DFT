// Tiny arithmetic evaluator for the k-path parameter tables (+ - * / ( ) numbers and named variables).
// The HPKOT tables (src/data/kpath/hpkot/variants.json) store every k-parameter and point coordinate as a string such as
// "(2+a/c*cosbeta)/4/sinbeta/sinbeta" or "1/2-Z". No eval(); a recursive-descent parser with left-to-right
// associativity, so "a/b/c" means (a/b)/c, exactly as in the source tables.
// @source S-006 (Hinuma et al. 2017, the tables), S-033 (SeeK-path implementation)

export type Vars = Readonly<Record<string, number>>;

type Tok = { t: 'num'; v: number } | { t: 'id'; v: string } | { t: 'op'; v: string };

function tokenize(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i]!;
    if (ch === ' ') {
      i++;
    } else if (/[0-9.]/.test(ch)) {
      const m = /^[0-9]*\.?[0-9]+(?:[eE][+-]?[0-9]+)?|^[0-9]+\.?/.exec(src.slice(i))!;
      out.push({ t: 'num', v: Number(m[0]) });
      i += m[0].length;
    } else if (/[A-Za-z_]/.test(ch)) {
      const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(i))!;
      out.push({ t: 'id', v: m[0] });
      i += m[0].length;
    } else if ('+-*/()'.includes(ch)) {
      out.push({ t: 'op', v: ch });
      i++;
    } else {
      throw new SyntaxError(`Unexpected character '${ch}' in expression "${src}".`);
    }
  }
  return out;
}

/** Evaluate `src` with the given variables. Throws SyntaxError or ReferenceError with the expression in the message. */
export function evalExpr(src: string, vars: Vars): number {
  const toks = tokenize(src);
  let p = 0;
  const peek = () => toks[p];
  const isOp = (v: string) => {
    const t = peek();
    return t !== undefined && t.t === 'op' && t.v === v;
  };
  function primary(): number {
    const t = toks[p++];
    if (t === undefined) throw new SyntaxError(`Unexpected end of expression "${src}".`);
    if (t.t === 'num') return t.v;
    if (t.t === 'id') {
      const v = vars[t.v];
      if (v === undefined) throw new ReferenceError(`Unknown symbol '${t.v}' in expression "${src}".`);
      return v;
    }
    if (t.v === '(') {
      const v = sum();
      if (!isOp(')')) throw new SyntaxError(`Missing ')' in expression "${src}".`);
      p++;
      return v;
    }
    if (t.v === '-') return -unary();
    if (t.v === '+') return unary();
    throw new SyntaxError(`Unexpected '${t.v}' in expression "${src}".`);
  }
  function unary(): number {
    return primary();
  }
  function product(): number {
    let v = unary();
    while (isOp('*') || isOp('/')) {
      const op = toks[p++] as { v: string };
      const r = unary();
      v = op.v === '*' ? v * r : v / r;
    }
    return v;
  }
  function sum(): number {
    let v = product();
    while (isOp('+') || isOp('-')) {
      const op = toks[p++] as { v: string };
      const r = product();
      v = op.v === '+' ? v + r : v - r;
    }
    return v;
  }
  const v = sum();
  if (p !== toks.length) throw new SyntaxError(`Unexpected trailing input in expression "${src}".`);
  return v;
}
