#!/usr/bin/env python3
"""Genera el inventario machine-readable de F1-A a partir de bytes locales.

No abre red ni base de datos. La especificacion de entrada enumera rutas
relativas al repo y el rol de cada archivo. El lock no se auto-incluye.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import stat
from pathlib import Path
from typing import Any

from alq_f1a_common import (BUNDLE_ROLES, PROD_REF, QA_REF,
                            REQUIRED_BUNDLE_PATHS, Stop, create_exclusive,
                            json_bytes, load_json, read_regular,
                            require_official_pg17_asset_url,
                            require_sha256, sha256_bytes)


MIGRATION_NAME = "alq_f1a_guardas_financieras_y_metodo"


def resolve_repo_file(repo: Path, value: object) -> tuple[str, Path]:
    if not isinstance(value, str) or not value or value.startswith("/"):
        raise Stop("artifact.path debe ser ruta relativa no vacia")
    lexical = Path(value)
    if ".." in lexical.parts:
        raise Stop(f"artifact.path contiene ..: {value}")
    unresolved = repo / lexical
    if unresolved.is_symlink():
        raise Stop(f"artifact no puede ser symlink: {value}")
    candidate = unresolved.resolve(strict=True)
    try:
        candidate.relative_to(repo)
    except ValueError as exc:
        raise Stop(f"artifact fuera del repo: {value}") from exc
    return lexical.as_posix(), candidate


def artifact_row(repo: Path, raw: object) -> dict[str, Any]:
    if not isinstance(raw, dict):
        raise Stop("artifact de spec no es objeto")
    if set(raw) != {"path", "role", "will_execute"}:
        raise Stop("artifact de spec contiene claves faltantes o extra")
    rel, path = resolve_repo_file(repo, raw.get("path"))
    role = raw.get("role")
    if role not in BUNDLE_ROLES:
        raise Stop(f"role invalido para {rel}: {role}")
    will_execute = raw.get("will_execute")
    if not isinstance(will_execute, bool):
        raise Stop(f"will_execute no booleano: {rel}")
    if role == "rollback_sql" and will_execute:
        raise Stop("rollback SQL debe quedar will_execute=false")
    payload = read_regular(path)
    meta = os.stat(path, follow_symlinks=False)
    if not stat.S_ISREG(meta.st_mode):
        raise Stop(f"artifact no regular: {rel}")
    return {
        "path": rel,
        "role": role,
        "will_execute": will_execute,
        "sha256": sha256_bytes(payload),
        "bytes": len(payload),
        "lines": len(payload.splitlines()),
        "mode": format(stat.S_IMODE(meta.st_mode), "04o"),
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo", type=Path, default=Path.cwd())
    parser.add_argument("--spec", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()

    repo = args.repo.resolve(strict=True)
    spec = load_json(args.spec)
    if set(spec) != {"schema_version", "target_ref", "production_ref_denied",
                     "execution_ack", "migration_name", "postgres_runtime",
                     "node_runtime", "artifacts"}:
        raise Stop("package spec contiene claves faltantes o extra")
    if spec.get("schema_version") != 1:
        raise Stop("package spec schema_version invalido")
    if spec.get("target_ref") != QA_REF:
        raise Stop("package spec no apunta exclusivamente a QA")
    if spec.get("production_ref_denied") != PROD_REF:
        raise Stop("package spec sin denylist literal de produccion")
    if spec.get("migration_name") != MIGRATION_NAME:
        raise Stop("package spec sin migration_name literal")
    ack = spec.get("execution_ack")
    if ack is not None and (not isinstance(ack, str) or not ack.startswith("AUTORIZO_ALQ_F1A_")):
        raise Stop("execution_ack invalido")
    raw_artifacts = spec.get("artifacts")
    if not isinstance(raw_artifacts, list) or not raw_artifacts:
        raise Stop("package spec sin artifacts")
    rows = [artifact_row(repo, raw) for raw in raw_artifacts]
    runtime = spec.get("postgres_runtime")
    if not isinstance(runtime, dict):
        raise Stop("package spec sin postgres_runtime sellado")
    if set(runtime) != {"release", "postgres_version", "server_version_num",
                        "architecture", "asset_url", "asset_bytes", "asset_sha256"}:
        raise Stop("postgres_runtime contiene claves faltantes o extra")
    expected_runtime = {
        "release": "v2.8.5", "postgres_version": "17.6",
        "server_version_num": 170006,
    }
    for key, value in expected_runtime.items():
        if runtime.get(key) != value:
            raise Stop(f"postgres_runtime.{key} no coincide")
    if runtime.get("architecture") not in {"arm64", "x86_64", "universal"}:
        raise Stop("postgres_runtime.architecture invalida")
    require_official_pg17_asset_url(runtime.get("asset_url"))
    if not isinstance(runtime.get("asset_bytes"), int) or runtime["asset_bytes"] <= 0:
        raise Stop("postgres_runtime.asset_bytes invalido")
    require_sha256(runtime.get("asset_sha256"), "postgres_runtime.asset_sha256")
    node_runtime = spec.get("node_runtime")
    if not isinstance(node_runtime, dict):
        raise Stop("package spec sin node_runtime sellado")
    if set(node_runtime) != {"version", "binary_sha256"}:
        raise Stop("node_runtime contiene claves faltantes o extra")
    if not isinstance(node_runtime.get("version"), str) or not re.fullmatch(r"v[0-9]+\.[0-9]+\.[0-9]+", node_runtime["version"]):
        raise Stop("node_runtime.version invalida")
    require_sha256(node_runtime.get("binary_sha256"), "node_runtime.binary_sha256")
    paths = [row["path"] for row in rows]
    if len(paths) != len(set(paths)):
        raise Stop("package spec contiene rutas duplicadas")
    actual_paths = set(paths)
    if actual_paths != REQUIRED_BUNDLE_PATHS:
        missing = sorted(REQUIRED_BUNDLE_PATHS - actual_paths)
        extra = sorted(actual_paths - REQUIRED_BUNDLE_PATHS)
        raise Stop(
            "package spec no coincide con el inventario obligatorio; "
            f"faltan={missing}; sobran={extra}"
        )
    output_abs = args.output.resolve(strict=False)
    try:
        output_rel = output_abs.relative_to(repo).as_posix()
    except ValueError:
        output_rel = ""
    if output_rel and output_rel in paths:
        raise Stop("el bundle lock no puede auto-incluirse")

    lock = {
        "schema_version": 1,
        "status": "ALQ_F1A_BUNDLE_LOCKED_OFFLINE",
        "target_ref": QA_REF,
        "production_ref_denied": PROD_REF,
        "network": False,
        "execution_ack": ack,
        "migration_name": spec.get("migration_name"),
        "postgres_runtime": runtime,
        "node_runtime": node_runtime,
        "artifacts": sorted(rows, key=lambda row: row["path"]),
    }
    create_exclusive(args.output, json_bytes(lock))
    print(json.dumps(lock, ensure_ascii=False, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Stop as exc:
        print(f"STOP ALQ F1-A BUNDLE LOCK: {exc}", file=os.sys.stderr)
        raise SystemExit(2)
