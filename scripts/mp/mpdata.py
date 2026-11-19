"""Shared code for the Screening Studio data pipeline (M9.1).

Used by fetch.py, build_shards.py, validate.py and make_sample.py. No network access here.
@source S-044 (Materials Project summary fields), S-024 (attribution), S-034 (pymatgen element sets)
"""

from __future__ import annotations

import copy
import gzip
import hashlib
import json
from pathlib import Path
from typing import Any, Callable, Iterable

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
SCHEMA_PATH = HERE / "schema.json"
CACHE_DIR = HERE / ".cache"
PUBLIC_MP = ROOT / "public" / "data" / "mp"
KPATHS = ROOT / "tests" / "reference" / "kpaths.json"

SCHEMA_VERSION = 1

# Fields asked of the summary endpoint. INDEX_FIELDS are the columnar index; SUMMARY_FIELDS are the full record in a shard.
INDEX_FIELDS = [
    "material_id",
    "formula_pretty",
    "elements",
    "nsites",
    "volume",
    "density",
    "energy_above_hull",
    "formation_energy_per_atom",
    "band_gap",
    "is_gap_direct",
    "is_metal",
    "is_magnetic",
    "ordering",
    "total_magnetization",
    "num_magnetic_sites",
    "symmetry",
    "is_stable",
    "theoretical",
]
SUMMARY_FIELDS = [
    "material_id",
    "formula_pretty",
    "chemsys",
    "elements",
    "nelements",
    "nsites",
    "volume",
    "density",
    "energy_above_hull",
    "formation_energy_per_atom",
    "is_stable",
    "band_gap",
    "is_gap_direct",
    "is_metal",
    "is_magnetic",
    "ordering",
    "total_magnetization",
    "num_magnetic_sites",
    "symmetry",
    "theoretical",
]
STARTER_FIELDS = SUMMARY_FIELDS + ["structure"]

# Decimal places kept in the published files (a size choice, D-072). Units: angstrom, g/cm^3, eV/atom, eV, Bohr magneton.
ROUND = {
    "volume": 3,
    "density": 4,
    "energy_above_hull": 4,
    "formation_energy_per_atom": 4,
    "band_gap": 4,
    "total_magnetization": 3,
}
LATTICE_DP = 6
FRAC_DP = 6


# ---------------------------------------------------------------- encoding


def load_schema() -> dict:
    return json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))


def budgets() -> dict:
    return dict(load_schema()["x-budgets"])


def encode(obj: Any) -> bytes:
    """Compact JSON, UTF-8, no trailing newline. The bytes that are hashed are the bytes that are published."""
    return json.dumps(obj, separators=(",", ":"), ensure_ascii=False, allow_nan=False).encode("utf-8")


def gzip_size(data: bytes) -> int:
    return len(gzip.compress(data, compresslevel=9, mtime=0))


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def rnd(value: Any, dp: int) -> Any:
    if value is None:
        return None
    v = round(float(value), dp)
    return 0.0 if v == 0 else v  # no negative zero


# ---------------------------------------------------------------- converting API documents


def to_plain(obj: Any) -> Any:
    """Turn whatever the client returned (dicts, pydantic models, pymatgen objects, enums, MPID) into plain JSON data."""
    if obj is None or isinstance(obj, (bool, int, float, str)):
        return obj
    if isinstance(obj, dict):
        return {str(k): to_plain(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [to_plain(v) for v in obj]
    if type(obj).__name__ in ("MPID", "AlphaID"):
        return str(obj)
    if hasattr(obj, "as_dict"):
        return to_plain(obj.as_dict())
    if hasattr(obj, "model_dump"):
        # MPID fields dump to an internal alphabetic form; read them as strings first.
        out = {}
        for name in type(obj).model_fields:
            out[name] = to_plain(getattr(obj, name, None))
        return out
    if hasattr(obj, "value") and type(obj).__class__.__name__ in ("EnumMeta", "EnumType"):
        return to_plain(obj.value)
    return str(obj)


def structure_from_dict(s: dict) -> dict | None:
    """pymatgen Structure.as_dict() to {lattice, species, frac}. Returns None for partial occupancy."""
    lattice = [[rnd(x, LATTICE_DP) for x in row] for row in s["lattice"]["matrix"]]
    species, frac = [], []
    for site in s["sites"]:
        sp = site["species"]
        if len(sp) != 1 or abs(float(sp[0].get("occu", 1)) - 1) > 1e-8:
            return None
        species.append(str(sp[0]["element"]))
        frac.append([rnd(x, FRAC_DP) for x in site["abc"]])
    return {"lattice": lattice, "species": species, "frac": frac}


def _crystal_system(v: Any) -> str:
    return str(v).capitalize()


def summary_from_doc(d: dict) -> dict:
    sym = d.get("symmetry") or {}
    out = {
        "material_id": str(d["material_id"]),
        "formula_pretty": d["formula_pretty"],
        "chemsys": d["chemsys"],
        "elements": [str(e) for e in d["elements"]],
        "nelements": int(d["nelements"]),
        "nsites": int(d["nsites"]),
        "volume": rnd(d["volume"], ROUND["volume"]),
        "density": rnd(d["density"], ROUND["density"]),
        "energy_above_hull": rnd(d["energy_above_hull"], ROUND["energy_above_hull"]),
        "formation_energy_per_atom": rnd(d.get("formation_energy_per_atom"), ROUND["formation_energy_per_atom"]),
        "is_stable": bool(d["is_stable"]),
        "band_gap": rnd(d["band_gap"], ROUND["band_gap"]),
        "is_gap_direct": d.get("is_gap_direct"),
        "is_metal": d.get("is_metal"),
        "is_magnetic": d.get("is_magnetic"),
        "ordering": d.get("ordering"),
        "total_magnetization": rnd(d.get("total_magnetization"), ROUND["total_magnetization"]),
        "num_magnetic_sites": d.get("num_magnetic_sites"),
        "symmetry": {
            "crystal_system": _crystal_system(sym.get("crystal_system")),
            "symbol": str(sym.get("symbol")),
            "number": int(sym.get("number")),
            "point_group": str(sym.get("point_group")),
        },
        "theoretical": bool(d["theoretical"]),
    }
    return out


REQUIRED_NON_NULL = ["material_id", "formula_pretty", "elements", "nsites", "volume", "density",
                     "energy_above_hull", "band_gap", "symmetry", "is_stable", "theoretical"]


def usable(d: dict) -> str | None:
    """Why a document cannot go in the index, or None if it can."""
    for f in REQUIRED_NON_NULL:
        if d.get(f) is None:
            return f"missing {f}"
    sym = d["symmetry"]
    if not isinstance(sym, dict) or sym.get("number") is None or sym.get("symbol") is None:
        return "missing symmetry"
    if float(d["energy_above_hull"]) < 0 or float(d["band_gap"]) < 0 or int(d["nsites"]) < 1:
        return "value out of range"
    return None


# ---------------------------------------------------------------- filters (same meaning as the API's range filters)


def matches(d: dict, flt: dict) -> bool:
    """Apply a config filter block locally: used by the mock client and the sample generator."""
    def within(v, rng):
        return v is not None and rng[0] <= v <= rng[1]

    if "energy_above_hull" in flt and not within(d.get("energy_above_hull"), flt["energy_above_hull"]):
        return False
    if "num_sites" in flt and not within(d.get("nsites"), flt["num_sites"]):
        return False
    if "num_elements" in flt and not within(d.get("nelements"), flt["num_elements"]):
        return False
    if "band_gap" in flt and not within(d.get("band_gap"), flt["band_gap"]):
        return False
    if "exclude_elements" in flt and set(d.get("elements", [])) & set(flt["exclude_elements"]):
        return False
    if "is_stable" in flt and d.get("is_stable") != flt["is_stable"]:
        return False
    if "theoretical" in flt and d.get("theoretical") != flt["theoretical"]:
        return False
    return True


# ---------------------------------------------------------------- building a dataset


def _pack_shards(entries: list[dict], target: int, max_bytes: int, db_version: str) -> list[list[dict]]:
    """Greedy: keep adding entries (already sorted) while the shard stays at or under the gzip target."""
    shards: list[list[dict]] = []
    cur: list[dict] = []
    for e in entries:
        trial = cur + [e]
        size = gzip_size(encode(_shard_doc(db_version, "000", trial)))
        if cur and size > target:
            shards.append(cur)
            cur = [e]
        else:
            cur = trial
    if cur:
        shards.append(cur)
    for s in shards:
        if gzip_size(encode(_shard_doc(db_version, "000", s))) > max_bytes:
            raise ValueError(f"one starter entry ({s[0]['material_id']}) is larger than the shard maximum of {max_bytes} gzipped bytes")
    return shards


def _shard_doc(db_version: str, shard_id: str, entries: list[dict]) -> dict:
    return {"schemaVersion": SCHEMA_VERSION, "dbVersion": db_version, "shard": shard_id, "entries": entries}


def build_dataset(
    *,
    index_docs: Iterable[dict],
    starter_docs: Iterable[dict],
    db_version: str,
    synthetic: bool,
    licence: str,
    attribution: str,
    source: dict,
    generated: str,
    shard_target: int | None = None,
) -> dict[str, bytes]:
    """Return {relative path: bytes} for manifest.json, index.json and s/NNN.json. Pure: writes nothing."""
    b = budgets()
    target = shard_target or b["shardGzipTargetBytes"]
    skipped: dict[str, int] = {}

    def skip(reason: str) -> None:
        skipped[reason] = skipped.get(reason, 0) + 1

    rows: dict[str, dict] = {}
    for raw in index_docs:
        d = to_plain(raw)
        why = usable(d)
        if why:
            skip(why)
            continue
        mid = str(d["material_id"])
        if mid in rows:
            skip("duplicate id")
            continue
        rows[mid] = d

    starters: list[dict] = []
    seen: set[str] = set()
    for raw in starter_docs:
        d = to_plain(raw)
        mid = str(d.get("material_id"))
        if mid not in rows:
            skip("starter not in index")
            continue
        if mid in seen:
            continue
        st = structure_from_dict(d["structure"]) if d.get("structure") else None
        if st is None:
            skip("starter without an ordered structure")
            continue
        full = {**rows[mid], **{k: v for k, v in d.items() if v is not None}}
        summary = summary_from_doc(full)
        if len(st["species"]) != summary["nsites"]:
            skip("structure site count differs from nsites")
            continue
        seen.add(mid)
        starters.append({"material_id": mid, "structure": st, "summary": summary})

    # Stable order: chemical system, then id. Neighbouring shards then hold related materials.
    def id_key(mid: str):
        pre, _, num = mid.partition("-")
        return (pre, int(num) if num.isdigit() else 0, mid)

    starters.sort(key=lambda e: (e["summary"]["chemsys"], id_key(e["material_id"])))
    packed = _pack_shards(starters, target, b["shardGzipMaxBytes"], db_version) if starters else []
    shard_of: dict[str, str] = {}
    files: dict[str, bytes] = {}
    for n, entries in enumerate(packed):
        sid = f"{n:03d}"
        for e in entries:
            shard_of[e["material_id"]] = sid
        files[f"s/{sid}.json"] = encode(_shard_doc(db_version, sid, entries))

    ids = sorted(rows, key=id_key)
    symbols: list[str] = []
    sym_ix: dict[str, int] = {}
    groups: list[dict] = []
    grp_ix: dict[tuple, int] = {}
    cols: dict[str, list] = {k: [] for k in INDEX_FIELDS if k != "symmetry"}
    cols["spacegroup"] = []
    cols["shard"] = []
    for mid in ids:
        d = rows[mid]
        s = summary_from_doc({**d, "chemsys": d.get("chemsys") or "-".join(sorted(d["elements"])),
                              "nelements": d.get("nelements") or len(d["elements"])})
        el = []
        for e in s["elements"]:
            if e not in sym_ix:
                sym_ix[e] = len(symbols)
                symbols.append(e)
            el.append(sym_ix[e])
        sg = s["symmetry"]
        key = (sg["number"], sg["symbol"], sg["crystal_system"])
        if key not in grp_ix:
            grp_ix[key] = len(groups)
            groups.append({"number": sg["number"], "symbol": sg["symbol"], "crystalSystem": sg["crystal_system"]})
        for k in cols:
            if k == "elements":
                cols[k].append(el)
            elif k == "spacegroup":
                cols[k].append(grp_ix[key])
            elif k == "shard":
                cols[k].append(shard_of.get(mid))
            else:
                cols[k].append(s[k])
    index = {
        "schemaVersion": SCHEMA_VERSION,
        "dbVersion": db_version,
        "count": len(ids),
        "symbols": symbols,
        "spaceGroups": groups,
        "columns": cols,
    }
    files["index.json"] = encode(index)

    listing = [
        {"path": p, "sha256": sha256(data), "bytes": len(data), "gzipBytes": gzip_size(data)}
        for p, data in sorted(files.items(), key=lambda kv: (kv[0] != "index.json", kv[0]))
    ]
    src = dict(source)
    if skipped:
        src["skipped"] = dict(sorted(skipped.items()))
    manifest = {
        "schemaVersion": SCHEMA_VERSION,
        "synthetic": bool(synthetic or source.get("mock")),
        "dbVersion": db_version,
        "generated": generated,
        "count": len(ids),
        "starterCount": len(starters),
        "shardTargetGzipBytes": target,
        "licence": licence,
        "attribution": attribution,
        "source": src,
        "files": listing,
    }
    files["manifest.json"] = encode(manifest)
    return files


def write_dataset(files: dict[str, bytes], out_dir: Path) -> None:
    for rel, data in files.items():
        p = out_dir / rel
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_bytes(data)


# ---------------------------------------------------------------- validation

Error = dict  # {"code": str, "message": str}


def _schema_errors(schema: dict, name: str, value: Any, where: str) -> list[Error]:
    import jsonschema

    sub = copy.deepcopy(schema)
    sub["$ref"] = f"#/$defs/{name}"
    v = jsonschema.Draft202012Validator(sub)
    out = []
    for e in sorted(v.iter_errors(value), key=lambda e: list(e.absolute_path)):
        path = "/".join(str(p) for p in e.absolute_path)
        out.append({"code": "schema", "message": f"{where}: /{path}: {e.message}"})
    return out


def validate_files(read: Callable[[str], bytes | None], budget_override: dict | None = None) -> list[Error]:
    """Validate one dataset. `read(rel)` returns a file's bytes or None. Mirrors src/lib/mp/validate.ts."""
    schema = load_schema()
    b = {**schema["x-budgets"], **(budget_override or {})}
    errs: list[Error] = []

    def err(code: str, msg: str) -> None:
        errs.append({"code": code, "message": msg})

    def parse(rel: str):
        raw = read(rel)
        if raw is None:
            err("missing-file", f"{rel} is missing")
            return None, None
        try:
            return json.loads(raw.decode("utf-8")), raw
        except (UnicodeDecodeError, json.JSONDecodeError) as e:
            err("json", f"{rel}: not valid JSON ({e})")
            return None, raw

    manifest, _ = parse("manifest.json")
    if manifest is None:
        return errs
    m_errs = _schema_errors(schema, "manifest", manifest, "manifest.json")
    errs += m_errs
    if m_errs:
        return errs

    listed = {f["path"]: f for f in manifest["files"]}
    if "index.json" not in listed:
        err("missing-file", "manifest.json does not list index.json")
    total_gzip = 0
    raws: dict[str, bytes] = {}
    for rel, f in listed.items():
        raw = read(rel)
        if raw is None:
            err("missing-file", f"{rel} is listed in the manifest but missing")
            continue
        raws[rel] = raw
        if sha256(raw) != f["sha256"]:
            err("hash-mismatch", f"{rel}: SHA-256 does not match the manifest")
        if len(raw) != f["bytes"]:
            err("size-mismatch", f"{rel}: {len(raw)} bytes, manifest says {f['bytes']}")
        gz = gzip_size(raw)
        total_gzip += gz
        if rel == "index.json" and gz > b["indexGzipBytes"]:
            err("over-budget", f"index.json is {gz} bytes gzipped, budget {b['indexGzipBytes']}")
        if rel.startswith("s/") and gz > b["shardGzipMaxBytes"]:
            err("over-budget", f"{rel} is {gz} bytes gzipped, maximum {b['shardGzipMaxBytes']}")
    if total_gzip > b["totalGzipBytes"]:
        err("over-budget", f"dataset is {total_gzip} bytes gzipped, budget {b['totalGzipBytes']}")

    if (manifest["dbVersion"] == "sample" or manifest["source"]["mock"]) and manifest["synthetic"] is not True:
        err("synthetic-mismatch", "sample or mock data must have synthetic: true")

    if "index.json" not in raws:
        return errs
    try:
        index = json.loads(raws["index.json"].decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as e:
        err("json", f"index.json: not valid JSON ({e})")
        return errs
    i_errs = _schema_errors(schema, "index", index, "index.json")
    errs += i_errs
    if i_errs:
        return errs

    n = index["count"]
    cols = index["columns"]
    if index["dbVersion"] != manifest["dbVersion"]:
        err("db-version", "index.json dbVersion differs from the manifest")
    if manifest["count"] != n:
        err("count", f"manifest count {manifest['count']} but index count {n}")
    for k, arr in cols.items():
        if len(arr) != n:
            err("column-length", f"column {k} has {len(arr)} values, expected {n}")
    if len(set(index["symbols"])) != len(index["symbols"]):
        err("duplicate-symbol", "symbols has duplicates")
    ids = cols["material_id"]
    dup = sorted({x for x in ids if ids.count(x) > 1}) if len(set(ids)) != len(ids) else []
    for x in dup:
        err("duplicate-id", f"material_id {x} appears more than once")
    for i, el in enumerate(cols["elements"]):
        if any(e >= len(index["symbols"]) for e in el):
            err("bad-lookup", f"row {i}: element index out of range")
    for i, g in enumerate(cols["spacegroup"]):
        if g >= len(index["spaceGroups"]):
            err("bad-lookup", f"row {i}: space-group index out of range")

    starter_rows = {ids[i]: s for i, s in enumerate(cols["shard"]) if s is not None and i < len(ids)}
    if manifest["starterCount"] != len(starter_rows):
        err("count", f"manifest starterCount {manifest['starterCount']} but {len(starter_rows)} index rows have a shard")
    shard_ids = sorted(set(starter_rows.values()))
    shard_files = sorted(p[2:5] for p in listed if p.startswith("s/"))
    if shard_ids != shard_files:
        err("shard-files", f"index refers to shards {shard_ids} but the manifest lists {shard_files}")

    row_of = {x: i for i, x in enumerate(ids)}
    found: dict[str, str] = {}
    for sid in shard_files:
        rel = f"s/{sid}.json"
        if rel not in raws:
            continue
        try:
            shard = json.loads(raws[rel].decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as e:
            err("json", f"{rel}: not valid JSON ({e})")
            continue
        s_errs = _schema_errors(schema, "shard", shard, rel)
        errs += s_errs
        if s_errs:
            continue
        if shard["shard"] != sid:
            err("shard-files", f"{rel} says it is shard {shard['shard']}")
        if shard["dbVersion"] != manifest["dbVersion"]:
            err("db-version", f"{rel} dbVersion differs from the manifest")
        for e in shard["entries"]:
            mid = e["material_id"]
            if mid in found:
                err("duplicate-id", f"{mid} appears in shard {found[mid]} and {sid}")
            found[mid] = sid
            if e["summary"]["material_id"] != mid:
                err("entry", f"{rel}: {mid} has a summary for {e['summary']['material_id']}")
            st = e["structure"]
            if len(st["species"]) != len(st["frac"]) or len(st["species"]) != e["summary"]["nsites"]:
                err("entry", f"{rel}: {mid} site count does not match nsites")
            if mid not in row_of:
                err("entry", f"{rel}: {mid} is not in the index")
            elif starter_rows.get(mid) != sid:
                err("entry", f"{rel}: {mid} is in shard {sid} but the index says {starter_rows.get(mid)}")
            elif cols["nsites"][row_of[mid]] != e["summary"]["nsites"]:
                err("entry", f"{rel}: {mid} nsites differs from the index")
    for mid, sid in starter_rows.items():
        if mid not in found:
            err("missing-shard-entry", f"{mid} is marked for shard {sid} but has no entry there")
    return errs


def validate_dir(d: Path, budget_override: dict | None = None) -> list[Error]:
    def read(rel: str) -> bytes | None:
        p = d / rel
        return p.read_bytes() if p.is_file() else None

    return validate_files(read, budget_override)


# ---------------------------------------------------------------- synthetic documents (mock client and sample)

# Obviously made-up property values: round steps that repeat with the entry number.
_EHULL = [0.0, 0.0, 0.01, 0.02, 0.05, 0.1]


def synthetic_docs(prefix: str = "sample", n: int = 30) -> list[dict]:
    """Documents shaped like summary-endpoint results, built from the first n test structures in kpaths.json.

    Structure-derived fields (formula, volume, density, symmetry) are computed by pymatgen from the test cell.
    Every property value (energies, gaps, magnetism, stability) is synthetic and must never be shown as real.
    """
    from pymatgen.core import Lattice, Structure
    from pymatgen.symmetry.analyzer import SpacegroupAnalyzer

    data = json.loads(KPATHS.read_text(encoding="utf-8"))["structures"]
    out = []
    for i, (_name, rec) in enumerate(list(data.items())[:n]):
        inp = rec["input"]
        s = Structure(Lattice(inp["lattice_rows"]), inp["atomic_numbers"], inp["frac_coords"])
        sga = SpacegroupAnalyzer(s, symprec=0.1)
        comp = s.composition
        els = sorted({str(e) for e in comp.elements})
        gap = (i % 8) * 0.5
        mag = i % 5 == 3
        ehull = _EHULL[i % len(_EHULL)]
        out.append({
            "material_id": f"{prefix}-{i + 1:04d}",
            "formula_pretty": comp.reduced_formula,
            "chemsys": "-".join(els),
            "elements": els,
            "nelements": len(els),
            "nsites": len(s),
            "volume": s.volume,
            "density": float(s.density),
            "energy_above_hull": ehull,
            "formation_energy_per_atom": round(-0.1 * (i % 10), 1),
            "is_stable": ehull == 0.0,
            "band_gap": gap,
            "is_gap_direct": None if gap == 0 else i % 2 == 0,
            "is_metal": gap == 0,
            "is_magnetic": mag,
            "ordering": "FM" if mag else "NM",
            "total_magnetization": 2.0 if mag else 0.0,
            "num_magnetic_sites": 1 if mag else 0,
            "symmetry": {
                "crystal_system": sga.get_crystal_system(),
                "symbol": sga.get_space_group_symbol(),
                "number": sga.get_space_group_number(),
                "point_group": sga.get_point_group_symbol(),
            },
            "theoretical": i % 3 == 2,
            "structure": s.as_dict(),
        })
    return out


def pick_fields(d: dict, fields: list[str] | None) -> dict:
    return dict(d) if not fields else {k: d.get(k) for k in fields}

