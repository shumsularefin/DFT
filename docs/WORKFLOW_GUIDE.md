# Changing the Workflow section

The Workflow section (`/workflow/`, D-110) follows a research group's protocol, and the protocol changes. This guide says where each part lives and how to change it. Every change ends the same way: bump the version (step 4 below), run `npm run verify`, and open a pull request.

## Where things live

| What you see on the site | File | How it is made |
| --- | --- | --- |
| A step page (text, tables, commands, callouts) | `src/content/workflow/<step-id>.mdx` | Hand-written. One file per step. |
| The step card (folder, needs, run, leaves), the Learn and Tools links, the checklist rows, the sources | Front matter at the top of the same `.mdx` file | Hand-written. Checked by `workflowSchema` in `src/lib/content-schema.mjs`. |
| The INCAR on a step page | `src/data/incar-presets.json`, shown by `<PresetIncar preset="..." variant="..." />` | Generated from the HTML handbook by `scripts/build/build-vasp-data.mjs`. Never typed into a page. The Input Builder reads the same file. |
| "The protocol step" quote and its notes | `src/data/workflow-protocol.json`, shown by `src/components/workflow/Protocol.astro` | Generated from the HTML handbook by `scripts/build/build-vasp-data.mjs`. |
| "Before you submit" | `CHECKLIST` in `src/lib/reference/tables.ts`, picked by the `checklist:` front matter | Hand-written. The same rows are on `/reference/checklist/`. |
| Version, revised date and the Revisions list | `src/data/workflow.json` | Hand-written. |
| The 3D view beside a step | `stage:` in the step's front matter (a scene id and three or four states, each tied to a `<Section id>` of the page) | Hand-written. The scenes are the handbook's (`src/lib/viewer3d/scenes/`); `src/lib/viewer3d/stages.test.ts` checks every state (D-125). |
| Order of the steps, the sidebar, the map and previous / next | `group:` and `order:` in each step's front matter | Automatic. |
| The source of truth | `docs/source-material/VASP_Workflow_Handbook.html` (S-042) | The author's handbook. |

`src/lib/workflow.test.ts` fails if an INCAR on the site no longer matches the INCAR printed in the HTML, if the protocol file and the HTML disagree, or if the version in `workflow.json` is not the newest Revisions entry. So a change made in one place and forgotten in another does not reach the site.

## 1. Change the text of a step

Edit `src/content/workflow/<step-id>.mdx`. Two formatting rules keep the MDX valid after `npm run format`:

- Do not indent anything inside `<Section>`, `<Callout>` or other components.
- Leave an empty line after each opening tag (`<Section id="x" heading="Y">`) and before each closing tag (`</Section>`).

Cite every fact with `<Cite id="S-042" />` (or another id from `src/data/sources.json`). Set `updated:` in the front matter to today's date.

## 2. Change an INCAR value or the protocol wording

These come from the HTML handbook, so change them there, so that the handbook and the site keep agreeing.

1. Edit the INCAR figure (or the protocol quote and its notes) in `docs/source-material/VASP_Workflow_Handbook.html`.
2. Re-extract the handbook. This needs a Chromium for Playwright:
   `PW_CHROMIUM_PATH=/path/to/chromium node scripts/build/extract-handbooks.mjs`
3. Regenerate the data: `node scripts/build/build-vasp-data.mjs` (presets, tags and the protocol) and, if you changed the error table, `node scripts/build/build-errors.mjs`.
4. Run `npx vitest run src/lib/workflow.test.ts`. It shows each tag that changed.

Every page and tool that shows that INCAR (the step page, the Input Builder, the Research Planner) changes at once. If a value on an older Handbook page now disagrees, `grep -rn "<TAG>" src/content` finds it.

## 3. Add, remove or reorder a step

- **Add:** every step needs a `stage:` block (the `3d-stages` guard fails without one); reuse the scene of the handbook topic the step links to. Then copy a similar step, for example `src/content/workflow/relaxation.mdx`, to `src/content/workflow/<new-id>.mdx`. Set `id` to the file name, and set `title`, `short`, `group` (one of Geometry, Electronic, Lattice and response, Beyond PBE), `order` and the rest of the front matter. The sidebar, the map on `/workflow/` and previous / next update themselves. If the step needs a new INCAR, add it to the handbook and follow section 2, or add a preset variant in `scripts/build/build-vasp-data.mjs`.
- **Remove:** delete the file and search for links to it: `grep -rn "/workflow/<id>/" src`.
- **Reorder:** change `order:` (within a group) or `group:`.
- **A new group:** add it to `WORKFLOW_GROUPS` in `src/lib/workflow.ts` and `WORKFLOW_GROUP_NAMES` in `src/lib/content-schema.mjs`, and give it a lane note in `src/pages/workflow/index.astro`.

## 4. Record the change

In `src/data/workflow.json`, raise `version` by one, set `revised` to today, and add a line at the top of `history` that says what changed in plain words, for example "Relaxation: EDIFFG is now -0.001 for all systems". The version shows on `/workflow/` and on every step page, and the Revisions list shows on `/workflow/`. Add a line to `CHANGELOG.md` as well.

## 5. Check and publish

Run `npm run verify` and open a pull request. When it is merged into `main`, the site deploys.
