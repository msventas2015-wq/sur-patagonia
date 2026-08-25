#!/usr/bin/env python3
"""Detiene y destruye unicamente un fixture local ALQ F1-A validado."""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
from datetime import datetime, timezone
from pathlib import Path

from alq_f1a_common import (Stop, clean_pg_env, create_exclusive, json_bytes,
                            load_json, require_run_id, require_sha256,
                            require_under_private_tmp, run_argv, sha256_file)


ACK = "AUTORIZO_ALQ_F1A_DESTRUIR_FIXTURE_LOCAL_PG17_20260821"
ROOT_RE = re.compile(r"^alq-f1a-pg17-[a-z0-9_-]{8,80}$")


def now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def validate(receipt_path: Path) -> tuple[dict[str, object], Path, Path, Path]:
    receipt = load_json(receipt_path)
    if receipt.get("schema_version") != 1 or receipt.get("status") != "ALQ_F1A_LOCAL_FIXTURE_READY":
        raise Stop("fixture receipt invalido")
    run_id = require_run_id(receipt.get("run_id"))
    root_value = receipt.get("root")
    if not isinstance(root_value, str):
        raise Stop("fixture receipt sin root")
    root = require_under_private_tmp(Path(root_value))
    if ROOT_RE.fullmatch(root.name) is None or root.is_symlink():
        raise Stop("root del fixture fuera del contrato")
    marker_value = receipt.get("marker_path")
    if not isinstance(marker_value, str):
        raise Stop("fixture receipt sin marker_path")
    marker_path = Path(marker_value)
    if marker_path.parent != root or marker_path.name != ".alq-f1a-fixture-marker.json":
        raise Stop("marker fuera del root exacto")
    marker = load_json(marker_path)
    if (marker.get("kind") != "ALQ_F1A_LOCAL_PG17_FIXTURE"
            or marker.get("run_id") != run_id
            or marker.get("root") != str(root)
            or marker.get("owner_uid") != os.getuid()):
        raise Stop("marker local no coincide")
    data_dir = Path(str(receipt.get("data_directory")))
    socket_dir = Path(str(receipt.get("socket_directory")))
    if data_dir.parent != root or socket_dir.parent != root:
        raise Stop("data/socket fuera del root")
    for path in (root, data_dir, socket_dir):
        if path.is_symlink() or os.stat(path, follow_symlinks=False).st_uid != os.getuid():
            raise Stop(f"ruta insegura: {path}")
    pg_ctl_value = receipt.get("pg_ctl")
    if not isinstance(pg_ctl_value, str):
        raise Stop("fixture receipt sin pg_ctl")
    pg_ctl = require_under_private_tmp(Path(pg_ctl_value))
    expected_postgres = require_sha256(receipt.get("postgres_sha256"), "postgres_sha256")
    expected_pg_ctl = require_sha256(receipt.get("pg_ctl_sha256"), "pg_ctl_sha256")
    if marker.get("postgres_sha256") != expected_postgres:
        raise Stop("hash runtime del marker no coincide")
    if marker.get("pg_ctl") != str(pg_ctl) or marker.get("pg_ctl_sha256") != expected_pg_ctl:
        raise Stop("pg_ctl del receipt no coincide con el marker de creacion")
    if not pg_ctl.is_file() or pg_ctl.is_symlink() or not os.access(pg_ctl, os.X_OK):
        raise Stop("pg_ctl inseguro")
    if sha256_file(pg_ctl) != expected_pg_ctl:
        raise Stop("SHA de pg_ctl cambio desde la creacion del fixture")
    return receipt, root, data_dir, pg_ctl


def destroy(receipt_path: Path, output_receipt: Path | None) -> dict[str, object]:
    receipt, root, data_dir, pg_ctl = validate(receipt_path)
    status = run_argv([str(pg_ctl), "-D", str(data_dir), "status"],
                      env=clean_pg_env(), timeout=15)
    was_running = status.returncode == 0
    if was_running:
        stopped = run_argv([str(pg_ctl), "-D", str(data_dir), "-m", "fast",
                            "-w", "-t", "30", "stop"],
                           env=clean_pg_env(), timeout=45)
        if stopped.returncode != 0:
            raise Stop(f"no se pudo detener fixture: {stopped.stderr[-1200:]}")
    status_after = run_argv([str(pg_ctl), "-D", str(data_dir), "status"],
                            env=clean_pg_env(), timeout=15)
    if status_after.returncode == 0:
        raise Stop("fixture sigue activo; no se borra")

    run_id = require_run_id(receipt.get("run_id"))
    tomb = root.with_name(f"{root.name}.destroy-{run_id[:8]}")
    if tomb.exists() or tomb.is_symlink():
        raise Stop("tombstone ya existe")
    os.rename(root, tomb)
    if tomb.parent != Path("/private/tmp") or not tomb.name.startswith("alq-f1a-pg17-"):
        raise Stop("tombstone inesperado; no se borra")
    shutil.rmtree(tomb)
    if tomb.exists() or root.exists():
        raise Stop("fixture no fue eliminado por completo")

    result = {
        "schema_version": 1,
        "status": "ALQ_F1A_LOCAL_FIXTURE_DESTROYED",
        "destroyed_utc": now(),
        "run_id": run_id,
        "root": str(root),
        "was_running": was_running,
        "network": False,
    }
    if output_receipt is not None:
        target = require_under_private_tmp(output_receipt, must_exist=False)
        create_exclusive(target, json_bytes(result))
    return result


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--fixture-receipt", type=Path, required=True)
    parser.add_argument("--output-receipt", type=Path)
    parser.add_argument("--destroy", action="store_true")
    parser.add_argument("--ack")
    args = parser.parse_args()
    receipt, root, data_dir, pg_ctl = validate(args.fixture_receipt)
    if not args.destroy:
        if args.ack is not None:
            raise Stop("--ack solo es valido con --destroy")
        print(json.dumps({
            "mode": "DRY_RUN_OFFLINE", "network": False,
            "status": "FIXTURE_VALIDADO_NO_DESTRUIDO",
            "run_id": receipt["run_id"], "root": str(root),
            "data_directory": str(data_dir), "pg_ctl_sha256": sha256_file(pg_ctl),
            "ack_required": ACK,
        }, indent=2, sort_keys=True))
        return 0
    if args.ack != ACK:
        raise Stop("ACK local ausente o distinto")
    print(json.dumps(destroy(args.fixture_receipt, args.output_receipt),
                     indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Stop as exc:
        print(f"STOP ALQ F1-A FIXTURE TEARDOWN: {exc}", file=os.sys.stderr)
        raise SystemExit(2)
