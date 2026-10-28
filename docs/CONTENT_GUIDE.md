# Content guide

How to write for this site. Read before any stage that creates or edits content. The linter (`npm run lint:content`, from M1.2) enforces the mechanical parts.

## 1. Who we write for

A complete beginner with no quantum mechanics and no DFT, who should be able to run a sensible first VASP project after modules 1 to 8. The author struggled to learn this from scattered forum posts and old spreadsheets; every page should save the next student that struggle.

Three levels, cumulative (D-011): **Beginner** (default), **Intermediate** (adds practical depth), **Pro** (adds equations, edge cases, literature). The page route never changes.

## 2. Voice

- Plain language, short sentences, active voice. Analogy first, symbols second. Define every term on first use with `<Term id="...">` (glossary in `src/data/glossary.json`).
- Answer three questions on every parameter or step: **why am I doing this, why this value, what happens if I skip it or get it wrong.**
- Be honest about uncertainty. Say "rule of thumb" or "heuristic" when it is one. Never state an invented number as a result.
- **No em dashes** (U+2014). A hyphen or an en dash (U+2013) in a numeric range is fine (400-700 eV); in running text prefer "400 to 700 eV".
- No filler, no hype, no "simply" or "just". No emojis. British or American spelling, but one per page (default American).
- Write original explanations. Never reproduce text from Sholl and Steckel, the VASP wiki or papers; cite them in "Go deeper" instead. Short factual statements derived from the author's handbooks are rewritten in the site's voice.
- Small delights are welcome (a surprising fact, a tiny story about why the physics matters), as long as they are true and sourced.

## 3. Topic page anatomy (MDX)

Every handbook topic uses these nine components in this order. The linter checks presence and order.

```mdx
---
id: encut                      # unique, kebab-case
title: Plane waves and the cutoff energy
module: 5                      # 1..11
order: 2
summary: One sentence for search results and cards.
concepts: [plane-wave-basis, encut]        # ids from src/data/concepts (M6.1 onward; before that, free ids)
requires: [fourier-idea]                   # prerequisite concept ids
vaspTags: [ENCUT, PREC]
sources: [S-010, S-019, S-040]             # at least one for any factual page
status: draft                  # draft | review | verified
---
<Why>…</Why>                    {/* Why this matters */}
<Intuition>…</Intuition>
<Lab id="encut-sphere" />       {/* Interactive lab (omit only if the work order says none) */}
<TheMath>…</TheMath>            {/* collapsible, level aware: use <Level min="intermediate"> inside */}
<InVasp>…</InVasp>              {/* tags, files, defaults, typical values */}
<WhatChanges>…</WhatChanges>    {/* cause and effect map */}
<Mistakes>…</Mistakes>
<Check ids={['q-encut-1','q-encut-2']} />   {/* feeds the adaptive engine */}
<GoDeeper>…</GoDeeper>          {/* book, VASP wiki page names, papers: cite, never copy */}
```

`<Level min="intermediate">…</Level>` and `<Level max="beginner">…</Level>` wrap level-specific text. A page must read completely and correctly at Beginner on its own.

## 4. Math

LaTeX via `$…$` and `$$…$$`, rendered at build time (D-008). Every symbol is defined at first use in plain words. Equations sit inside `<TheMath>` or `<Level min="intermediate">`, never as the first thing a beginner meets.

## 5. VASP content rules

- State the VASP version a statement applies to (D-017). Defaults and behavior are checked against the VASP wiki by page name; cite the page name in prose or `sources`.
- INCAR, KPOINTS and POSCAR examples go in `<VaspFile name="INCAR">` blocks (monospace, copy button, optional line annotations). They must be internally consistent (MAGMOM count matches atoms, etc.); the linter runs the INCAR validator on them from M3.4.
- Never show POTCAR contents. Explain what a POTCAR is, how to get one under the user's own licence, and what to read from it (`grep ENMAX POTCAR`).
- The author's protocol (docs/source-material, "Your protocol (fixed)") is the recommended path and is reproduced faithfully. Where the protocol differs from other common practice, say so neutrally.

## 6. Interactive labs

- Compute geometry and meshes correctly. A lab that shows an effect with a toy model says so ("Toy model, computed live"), and a lab that is only a picture says "Illustrative".
- Every lab has: a one-sentence goal, controls with units, live readouts, a "what to notice" box, a reset button, a text description of what is shown, keyboard operation, and reduced-motion behavior.
- Labs show their assumptions. If a number comes from a formula, the formula is one click away.

## 7. Questions ("Check your understanding")

Authored in `src/data/questions/module-NN.json`. M6.1 formalizes the schema with Zod and may add fields, but it must accept this shape, which every stage before M6.1 uses:

```json
{
  "id": "q-encut-1",
  "concepts": ["encut"],
  "type": "single",
  "prompt": "You raise ENCUT from 400 to 520 eV. What happens to the number of plane waves?",
  "options": [
    { "text": "It grows, roughly as ENCUT to the power 3/2", "correct": true, "why": "The plane waves fill a sphere of radius proportional to the square root of ENCUT, so the count grows like its cube." },
    { "text": "It stays the same", "correct": false, "why": "Tempting because the cell did not change, but the cutoff decides how many waves fit inside the sphere." }
  ],
  "hints": ["Think of the plane waves as points inside a sphere.", "The sphere's radius is the square root of ENCUT (in suitable units)."],
  "difficulty": 0.0,
  "level": "beginner",
  "sources": ["S-049"]
}
```

`type` is `single`, `multi`, `numeric` (with `answer` and `tolerance` instead of `options`) or `order`. `difficulty` is a logit prior (0 is average; -2 easy; +2 hard). Four or more questions per concept. Every option has a `why`; a wrong option's `why` says why it is tempting. No trick questions, no timers that punish.

## 8. Citing

`<Cite id="S-010" />` renders a numbered reference and links to `/references/#S-010`. Cite the specific page or section where possible. Add new sources to `docs/SCIENCE_SOURCES.md` with an honest status.

## 9. Review status

`status: draft` while the page is being written; the builder sets `review` when the stage's gates pass (the linter then requires `sources`); `verified` is set only by the auditor or the author after confirming the science. The site shows a small "Draft" or "Awaiting verification" label for non-verified pages, which doubles as the honest-ML-and-heuristics disclosure.
