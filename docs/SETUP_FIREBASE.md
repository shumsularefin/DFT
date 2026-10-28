# Setup for the author (about 20 minutes, once)

Nothing here goes into the repository except what is stated. Secrets live only in GitHub and Firebase.

## 1. Firebase project (Spark plan)

1. In the Firebase console create a project (or use the one you already connected). Stay on **Spark**; do not enable billing.
2. Enable **Hosting**. Do not enable Cloud Functions or Cloud Storage; this project never uses them.
3. Note the **project ID** (for example `dft-handbook-12345`).
4. Open the Spark pricing page and write the current Hosting transfer limit (per day or per month), Firestore limits and storage into `docs/OPEN_QUESTIONS.md` under Q-006. The design assumes the strict reading (360 MB per day) until you confirm.

## 2. Connect GitHub to Firebase deploys

You said the repository is already connected to the Firebase project. The workflows in `.github/workflows/` use the official `FirebaseExtended/action-hosting-deploy` action and need exactly two values:

| Kind | Name | Value |
|---|---|---|
| Repository **variable** | `FIREBASE_PROJECT_ID` | the project ID from step 1 |
| Repository **secret** | `FIREBASE_SERVICE_ACCOUNT` | the full JSON key of a service account allowed to deploy Hosting |

Easiest way to get the secret: on your own computer run `npx firebase-tools login`, then `npx firebase-tools init hosting:github` in a clone of this repository. It creates a suitable service account, stores its key as a GitHub secret named like `FIREBASE_SERVICE_ACCOUNT_<YOUR_PROJECT_ID>`, and offers to add its own workflow files. Answer **no** to the workflow files (this repository already has its own, and two deploy paths would fight), then in GitHub, Settings, Secrets and variables, Actions, create `FIREBASE_SERVICE_ACCOUNT` with the same JSON value (or rename the secret). If you already went through the console's "Connect to GitHub" flow, the secret probably exists under that longer name; copy its value the same way and delete any `firebase-hosting-*.yml` files it added.

If you create the service account by hand instead, give it at least the **Firebase Hosting Admin** role; if the first deploy fails with a permission error naming another API (for example API Keys or Cloud Run), add the viewer role it names. The exact role list could not be checked from the build sandbox.

Then add the variable `FIREBASE_PROJECT_ID` under the Variables tab of the same page.

Without these two values the workflows pass and do nothing, so nothing breaks while you set up.

Also edit `.firebaserc` and replace `REPLACE_WITH_YOUR_FIREBASE_PROJECT_ID` with the project ID (it is not secret; it is only for the local `firebase` CLI).

## 3. Optional: progress sync (stage M6.5)

Skip until you reach M6.5. Then: enable **Authentication** (Google sign-in) and **Firestore** (production mode; the stage adds rules). Register a web app and put its config values into repository **variables** (not secrets, not the repo): `PUBLIC_FIREBASE_API_KEY`, `PUBLIC_FIREBASE_AUTH_DOMAIN`, `PUBLIC_FIREBASE_PROJECT_ID`, `PUBLIC_FIREBASE_APP_ID`. The site builds and works without them.

## 4. Merge settings on GitHub

Settings, General, Pull Requests: allow **merge commits** (needed for stacked stages), enable "Automatically delete head branches". Optionally require the `Guards` and `Verify` checks on `main`.

## 5. Let the builder verify against sources (recommended)

Builder sessions run in a cloud environment with limited network access. In the environment settings (the cloud environment menu in the session title bar, Edit, Network access) choose "Limited" and add under Allowed domains, keeping "Allow package managers" ticked:

```
vasp.at  www.vasp.at  arxiv.org  export.arxiv.org  doi.org  pmc.ncbi.nlm.nih.gov
firebase.google.com  docs.astro.build  github.com  raw.githubusercontent.com
spglib.readthedocs.io  pymatgen.org  docs.materialsproject.org  abulafia.mt.ic.ac.uk
```

Without them the builder cannot read the VASP wiki or the papers and will mark items "could not verify" instead of guessing (Q-007). The steps for changing network access are at https://code.claude.com/docs/en/cloud-environments#network-access.

## 6. Optional but valuable: your calibration runs

These take minutes and turn guesses into facts. Details in `docs/OPEN_QUESTIONS.md`:

- **Q-004** KSPACING rule: three single-point VASP runs at `KSPACING = 0.3`, `0.28` and `0.30145` on fcc Cu (primitive, a = 3.61), report the mesh VASP chose each time. Same with `vaspkit -task 102` at resolution 0.04.
- **Q-013** run `vaspkit -task 303` on the same cell and compare the path with `Γ-X-U | K-Γ-L-W-X`.
- **Q-008** example outputs for the worked example, as described in `data/author/README.md`.

## 7. The Materials Project key (only at stage M9.1)

The builder writes the pipeline; you run it once on your own machine with `MP_API_KEY` in your shell (never in a file in this repository), then commit the generated data. Instructions are in the stage.
