#!/usr/bin/env python3
"""Crea el cluster local descartable PG17.6 de ALQ F1-A.

Por defecto solo valida el runtime. No descarga, monta ni instala nada y nunca
abre una conexion remota. La creacion exige --create y el ACK local literal.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import tempfile
import uuid
from datetime import datetime, timezone
from pathlib import Path

from alq_f1a_common import (Stop, clean_pg_env, create_exclusive, json_bytes,
                            load_json, require_official_pg17_asset_url,
                            require_sha256, require_under_private_tmp,
                            run_argv, sha256_file)


ACK = "AUTORIZO_ALQ_F1A_CREAR_FIXTURE_LOCAL_PG17_20260821"
EXPECTED_RELEASE = "v2.8.5"
EXPECTED_VERSION = "17.6"
EXPECTED_SERVER_VERSION_NUM = 170006
REQUIRED_BINARIES = ("postgres", "initdb", "pg_ctl", "psql", "createdb")
ROOT_NAME_RE = re.compile(r"^alq-f1a-pg17-[a-z0-9_-]{8,80}$")


def now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def runtime(runtime_root: Path, receipt_path: Path) -> tuple[dict[str, object], dict[str, Path]]:
    root = require_under_private_tmp(runtime_root)
    receipt = load_json(receipt_path)
    if receipt.get("schema_version") != 1:
        raise Stop("runtime receipt schema_version invalido")
    if (receipt.get("status") != "ALQ_F1A_RUNTIME_PG17_SELLADO"
            or receipt.get("server_version_num") != EXPECTED_SERVER_VERSION_NUM
            or receipt.get("network") is not False):
        raise Stop("runtime receipt sin estado/identidad offline exactos")
    if receipt.get("release") != EXPECTED_RELEASE:
        raise Stop("runtime no es Postgres.app v2.8.5")
    if receipt.get("postgres_version") != EXPECTED_VERSION:
        raise Stop("runtime receipt no declara PostgreSQL 17.6")
    require_sha256(receipt.get("asset_sha256"), "asset_sha256")
    require_official_pg17_asset_url(receipt.get("asset_url"))
    if receipt.get("runtime_root") != str(root):
        raise Stop("runtime receipt no corresponde al runtime-root aportado")
    binary_rows = receipt.get("binaries")
    if not isinstance(binary_rows, dict):
        raise Stop("runtime receipt sin mapa de binaries")

    # Se exige la ruta versionada; nunca Contents/Versions/latest.
    version_root = root / "Postgres.app" / "Contents" / "Versions" / "17"
    if not version_root.is_dir() or version_root.is_symlink():
        raise Stop("runtime versionado 17 ausente o symlink")
    result: dict[str, Path] = {}
    for name in REQUIRED_BINARIES:
        path = version_root / "bin" / name
        if not path.is_file() or path.is_symlink() or not os.access(path, os.X_OK):
            raise Stop(f"binario PG17 invalido: {name}")
        row = binary_rows.get(name)
        if not isinstance(row, dict):
            raise Stop(f"runtime receipt no sella: {name}")
        expected = require_sha256(row.get("sha256"), f"binary_sha256:{name}")
        if sha256_file(path) != expected:
            raise Stop(f"SHA de binario cambio: {name}")
        version = run_argv([str(path), "--version"], timeout=10)
        if version.returncode != 0 or " 17.6" not in version.stdout:
            raise Stop(f"version binaria no es 17.6: {name}")
        result[name] = path
    return receipt, result


def psql(bin_path: Path, socket_dir: Path, port: int, database: str,
         sql: str, *, timeout: int = 30) -> str:
    proc = run_argv([
        str(bin_path), "-X", "-w", "-A", "-t", "-v", "ON_ERROR_STOP=on",
        "-h", str(socket_dir), "-p", str(port), "-U", "postgres", "-d", database,
        "-c", sql,
    ], env=clean_pg_env({"PGAPPNAME": "alq-f1a-local-setup"}), timeout=timeout)
    if proc.returncode != 0:
        raise Stop(f"psql local fallo: {proc.stderr[-1200:]}")
    return proc.stdout


def create_fixture(runtime_root: Path, runtime_receipt: Path,
                   output_receipt: Path | None) -> dict[str, object]:
    runtime_meta, bins = runtime(runtime_root, runtime_receipt)
    run_id = uuid.uuid4().hex
    root = Path(tempfile.mkdtemp(prefix="alq-f1a-pg17-", dir="/private/tmp")).resolve()
    if ROOT_NAME_RE.fullmatch(root.name) is None:
        raise Stop("mkdtemp produjo nombre fuera del contrato")
    data_dir = root / "data"
    socket_dir = root / "socket"
    log_path = root / "postgres.log"
    marker_path = root / ".alq-f1a-fixture-marker.json"
    socket_dir.mkdir(mode=0o700)
    port = 45000 + (int(run_id[:4], 16) % 15000)

    marker = {
        "schema_version": 1,
        "kind": "ALQ_F1A_LOCAL_PG17_FIXTURE",
        "run_id": run_id,
        "root": str(root),
        "data_directory": str(data_dir),
        "socket_directory": str(socket_dir),
        "port": port,
        "owner_uid": os.getuid(),
        "postgres_sha256": sha256_file(bins["postgres"]),
        "pg_ctl": str(bins["pg_ctl"]),
        "pg_ctl_sha256": sha256_file(bins["pg_ctl"]),
        "psql_sha256": sha256_file(bins["psql"]),
    }
    create_exclusive(marker_path, json_bytes(marker))

    init = run_argv([
        str(bins["initdb"]), "-D", str(data_dir), "-U", "postgres",
        "--encoding=UTF8", "--no-locale", "--auth-local=trust",
        "--auth-host=reject", "--no-instructions",
    ], env=clean_pg_env(), timeout=90)
    if init.returncode != 0:
        raise Stop(f"initdb fallo; fixture queda para diagnostico: {init.stderr[-1500:]}")

    options = " ".join([
        f"-k {socket_dir}", f"-p {port}", "-c listen_addresses=''",
        "-c timezone=UTC", "-c log_timezone=UTC", "-c fsync=on",
        "-c synchronous_commit=on", "-c full_page_writes=on",
        "-c unix_socket_permissions=0700",
    ])
    start = run_argv([
        str(bins["pg_ctl"]), "-D", str(data_dir), "-l", str(log_path),
        "-o", options, "-w", "-t", "30", "start",
    ], env=clean_pg_env(), timeout=45)
    if start.returncode != 0:
        raise Stop(f"pg_ctl start fallo; fixture queda para diagnostico: {start.stderr[-1500:]}")

    roles_sql = """
do $roles$
begin
  if not exists(select 1 from pg_catalog.pg_roles where rolname='anon') then
    create role anon nologin noinherit;
  end if;
  if not exists(select 1 from pg_catalog.pg_roles where rolname='authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists(select 1 from pg_catalog.pg_roles where rolname='service_role') then
    create role service_role nologin noinherit;
  end if;
end
$roles$;
"""
    psql(bins["psql"], socket_dir, port, "postgres", roles_sql)
    made = run_argv([
        str(bins["createdb"]), "-h", str(socket_dir), "-p", str(port),
        "-U", "postgres", "alq_f1a_fixture",
    ], env=clean_pg_env(), timeout=30)
    if made.returncode != 0:
        raise Stop(f"createdb fallo: {made.stderr[-1200:]}")

    db_marker_sql = f"""
create schema alq_f1a_local;
create table alq_f1a_local.fixture_marca(
  singleton boolean primary key default true check(singleton),
  run_id text not null,
  data_directory text not null,
  socket_directory text not null,
  postgres_sha256 text not null,
  created_at timestamptz not null default clock_timestamp()
);
insert into alq_f1a_local.fixture_marca(
  singleton,run_id,data_directory,socket_directory,postgres_sha256)
values (true,'{run_id}','{data_dir}','{socket_dir}','{marker['postgres_sha256']}');
"""
    psql(bins["psql"], socket_dir, port, "alq_f1a_fixture", db_marker_sql)
    physical = psql(bins["psql"], socket_dir, port, "alq_f1a_fixture", """
select json_build_object(
 'database',current_database(),
 'server_version_num',current_setting('server_version_num')::int,
 'listen_addresses',current_setting('listen_addresses'),
 'inet_server_addr_is_null',inet_server_addr() is null,
 'data_directory',current_setting('data_directory')
)::text;
""").strip()
    try:
        physical_json = json.loads(physical)
    except json.JSONDecodeError as exc:
        raise Stop("recibo fisico PG17 invalido") from exc
    if physical_json != {
        "database": "alq_f1a_fixture",
        "server_version_num": EXPECTED_SERVER_VERSION_NUM,
        "listen_addresses": "",
        "inet_server_addr_is_null": True,
        "data_directory": str(data_dir),
    }:
        raise Stop("cluster local no satisface identidad fisica")

    receipt = {
        "schema_version": 1,
        "status": "ALQ_F1A_LOCAL_FIXTURE_READY",
        "created_utc": now(),
        "run_id": run_id,
        "root": str(root),
        "data_directory": str(data_dir),
        "socket_directory": str(socket_dir),
        "port": port,
        "database": "alq_f1a_fixture",
        "user": "postgres",
        "runtime_release": runtime_meta["release"],
        "runtime_asset_sha256": runtime_meta["asset_sha256"],
        "postgres_sha256": marker["postgres_sha256"],
        "pg_ctl_sha256": marker["pg_ctl_sha256"],
        "psql_sha256": marker["psql_sha256"],
        "pg_ctl": str(bins["pg_ctl"]),
        "psql": str(bins["psql"]),
        "marker_path": str(marker_path),
        "physical": physical_json,
        "network": False,
    }
    target = output_receipt or (root / "fixture-receipt.json")
    if target.parent != root:
        target = require_under_private_tmp(target, must_exist=False)
    create_exclusive(target, json_bytes(receipt))
    return receipt


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--runtime-root", type=Path, required=True)
    parser.add_argument("--runtime-receipt", type=Path, required=True)
    parser.add_argument("--output-receipt", type=Path)
    parser.add_argument("--create", action="store_true")
    parser.add_argument("--ack")
    args = parser.parse_args()
    meta, bins = runtime(args.runtime_root, args.runtime_receipt)
    if not args.create:
        if args.ack is not None:
            raise Stop("--ack solo es valido con --create")
        print(json.dumps({
            "mode": "DRY_RUN_OFFLINE", "network": False,
            "runtime_release": meta["release"],
            "runtime_asset_sha256": meta["asset_sha256"],
            "postgres_sha256": sha256_file(bins["postgres"]),
            "ack_required": ACK,
            "status": "RUNTIME_PG17_VALIDADO_FIXTURE_NO_CREADO",
        }, indent=2, sort_keys=True))
        return 0
    if args.ack != ACK:
        raise Stop("ACK local ausente o distinto")
    print(json.dumps(create_fixture(args.runtime_root, args.runtime_receipt,
                                    args.output_receipt), indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Stop as exc:
        print(f"STOP ALQ F1-A FIXTURE SETUP: {exc}", file=os.sys.stderr)
        raise SystemExit(2)
