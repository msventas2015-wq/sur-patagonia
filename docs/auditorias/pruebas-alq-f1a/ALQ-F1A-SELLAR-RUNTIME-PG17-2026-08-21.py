#!/usr/bin/env python3
"""Genera el recibo local checksum-pinned de Postgres.app 2.8.5/PG17.6.

No descarga ni monta el asset. El SHA esperado debe provenir del manifiesto
auditado; este programa se limita a comprobar bytes ya presentes.
"""

from __future__ import annotations

import argparse
import json
import os
from datetime import datetime, timezone
from pathlib import Path

from alq_f1a_common import (Stop, create_exclusive, json_bytes, require_sha256,
                            require_official_pg17_asset_url,
                            require_under_private_tmp, run_argv, sha256_file)


BINARIES = ("postgres", "initdb", "pg_ctl", "psql", "createdb")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--asset", type=Path, required=True)
    parser.add_argument("--expected-asset-sha256", required=True)
    parser.add_argument("--asset-url", required=True)
    parser.add_argument("--runtime-root", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()

    asset = require_under_private_tmp(args.asset)
    runtime_root = require_under_private_tmp(args.runtime_root)
    output = require_under_private_tmp(args.output, must_exist=False)
    expected = require_sha256(args.expected_asset_sha256, "expected_asset_sha256")
    asset_url = require_official_pg17_asset_url(args.asset_url)
    actual = sha256_file(asset)
    if actual != expected:
        raise Stop("SHA del asset PG17 no coincide con el manifiesto")
    version_root = runtime_root / "Postgres.app" / "Contents" / "Versions" / "17"
    if not version_root.is_dir() or version_root.is_symlink():
        raise Stop("runtime root no contiene Contents/Versions/17 real")
    rows: dict[str, object] = {}
    for name in BINARIES:
        path = version_root / "bin" / name
        if not path.is_file() or path.is_symlink() or not os.access(path, os.X_OK):
            raise Stop(f"binario ausente/inseguro: {name}")
        proc = run_argv([str(path), "--version"], timeout=10)
        if proc.returncode != 0 or " 17.6" not in proc.stdout:
            raise Stop(f"{name} no es PostgreSQL 17.6")
        rows[name] = {"sha256": sha256_file(path), "version": proc.stdout.strip()}
    receipt = {
        "schema_version": 1,
        "status": "ALQ_F1A_RUNTIME_PG17_SELLADO",
        "generated_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "release": "v2.8.5",
        "postgres_version": "17.6",
        "server_version_num": 170006,
        "asset_name": asset.name,
        "asset_url": asset_url,
        "asset_bytes": asset.stat().st_size,
        "asset_sha256": actual,
        "runtime_root": str(runtime_root),
        "binaries": rows,
        "network": False,
    }
    create_exclusive(output, json_bytes(receipt))
    print(json.dumps(receipt, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Stop as exc:
        print(f"STOP ALQ F1-A RUNTIME: {exc}", file=os.sys.stderr)
        raise SystemExit(2)
