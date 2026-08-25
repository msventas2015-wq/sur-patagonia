#!/usr/bin/env python3
"""Orquesta carreras F1-A en dos backends reales del fixture PG17.6.

El harness no conoce hosts ni contrasenas. Solo acepta el socket Unix de un
fixture sellado bajo /private/tmp. Por defecto valida sin ejecutar.
"""

from __future__ import annotations

import argparse
import json
import os
import signal
import subprocess
import time
import uuid
from pathlib import Path
from typing import Any

from alq_f1a_common import (Stop, clean_pg_env, create_exclusive, json_bytes,
                            load_json, read_regular, require_run_id,
                            require_sha256, require_under_private_tmp,
                            sha256_file, validate_bundle_lock)


ACK = "AUTORIZO_ALQ_F1A_EJECUTAR_CONCURRENCIA_LOCAL_PG17_20260821"
SIDE_PREFIX = "ALQ_F1A_CONCURRENCY_SIDE|"
AGGREGATE_PREFIX = "ALQ_F1A_CONCURRENCY_RECEIPT|"
ALLOWED_SQL_SYNC_TOKENS = (b"pg_advisory", b"for update", b"lock table")
REQUIRED_CASES = {
    "IDEMPOTENCIA_MISMA_CLAVE",
    "DEPOSITO_EVENTO_TOPE_GLOBAL",
    "DEPOSITO_LIQUIDACION_TOPE_GLOBAL",
    "REVERSA_REAPERTURA_TOPE_GLOBAL",
    "CREDITO_CONSUMO_TOPE_GLOBAL",
    "APLICACION_CARGO_TOPE_GLOBAL",
    "REINTENTO_DOS_COMANDOS",
    "ORDEN_LOCKS_AB",
    "ORDEN_LOCKS_BA",
}


def fixture(path: Path) -> tuple[dict[str, Any], Path]:
    row = load_json(path)
    if (row.get("schema_version") != 1
            or row.get("status") != "ALQ_F1A_LOCAL_FIXTURE_READY"
            or row.get("network") is not False):
        raise Stop("fixture receipt invalido")
    require_run_id(row.get("run_id"))
    if row.get("database") != "alq_f1a_fixture" or row.get("user") != "postgres":
        raise Stop("identidad logica del fixture invalida")
    physical = row.get("physical")
    if not isinstance(physical, dict) or physical != {
        "database": "alq_f1a_fixture",
        "server_version_num": 170006,
        "listen_addresses": "",
        "inet_server_addr_is_null": True,
        "data_directory": row.get("data_directory"),
    }:
        raise Stop("identidad fisica del fixture invalida")
    socket_value = row.get("socket_directory")
    psql_value = row.get("psql")
    if not isinstance(socket_value, str) or not isinstance(psql_value, str):
        raise Stop("fixture sin socket/psql")
    require_under_private_tmp(Path(socket_value))
    psql = require_under_private_tmp(Path(psql_value))
    expected = require_sha256(row.get("psql_sha256"), "psql_sha256")
    if psql.is_symlink() or not psql.is_file() or sha256_file(psql) != expected:
        raise Stop("psql local cambio o es inseguro")
    port = row.get("port")
    if not isinstance(port, int) or not (1024 <= port <= 65535):
        raise Stop("puerto local invalido")
    return row, psql


def spec(path: Path) -> list[dict[str, Any]]:
    root = load_json(path)
    if root.get("schema_version") != 1 or not isinstance(root.get("cases"), list):
        raise Stop("case spec invalido")
    if not root["cases"]:
        raise Stop("case spec vacio")
    seen: set[str] = set()
    result: list[dict[str, Any]] = []
    for raw in root["cases"]:
        if not isinstance(raw, dict):
            raise Stop("caso concurrente no es objeto")
        name = raw.get("name")
        if (not isinstance(name, str) or not name.isascii()
                or not name.replace("_", "").isalnum() or name in seen):
            raise Stop(f"nombre de caso invalido/duplicado: {name}")
        seen.add(name)
        for side in ("session_a_sql", "session_b_sql"):
            value = raw.get(side)
            if not isinstance(value, str) or not value:
                raise Stop(f"{name} sin {side}")
        for side in ("expected_status_a", "expected_status_b"):
            if not isinstance(raw.get(side), str) or not raw[side]:
                raise Stop(f"{name} sin {side}")
        expected_successes = raw.get("expected_financial_successes")
        if not isinstance(expected_successes, int) or isinstance(expected_successes, bool):
            raise Stop(f"{name} sin expected_financial_successes integer")
        if expected_successes not in (0, 1):
            raise Stop(f"{name} expected_financial_successes fuera de 0..1")
        timeout = raw.get("timeout_seconds", 45)
        if not isinstance(timeout, int) or not (5 <= timeout <= 120):
            raise Stop(f"{name} timeout fuera de 5..120")
        row = dict(raw)
        row["timeout_seconds"] = timeout
        result.append(row)
    missing = sorted(REQUIRED_CASES - seen)
    if missing:
        raise Stop(f"case spec no cubre concurrencia obligatoria: {missing}")
    return result


def inspect_sql(payload_text: str, label: str) -> None:
    payload = payload_text.encode("utf-8", "strict")
    if len(payload) > 4 * 1024 * 1024:
        raise Stop(f"SQL concurrente excede 4 MiB: {label}")
    lower = payload.lower()
    for token in (b"pg_backend_pid", b"alq_f1a_concurrency_side|", b"alq_f1a_barrier"):
        if token not in lower:
            raise Stop(f"SQL concurrente sin token obligatorio {token!r}: {label}")
    if not any(token in lower for token in ALLOWED_SQL_SYNC_TOKENS):
        raise Stop(f"SQL concurrente no demuestra lock real: {label}")


def parse_side(stdout: str, case: str, side: str, run_id: str,
               expected_status: str) -> dict[str, Any]:
    matches = [line[len(SIDE_PREFIX):] for line in stdout.splitlines()
               if line.startswith(SIDE_PREFIX)]
    if len(matches) != 1:
        raise Stop(f"{case}/{side}: recibo side ausente o duplicado")
    try:
        row = json.loads(matches[0])
    except json.JSONDecodeError as exc:
        raise Stop(f"{case}/{side}: recibo side no JSON") from exc
    if not isinstance(row, dict):
        raise Stop(f"{case}/{side}: recibo side no objeto")
    expected = {
        "schema_version": 1,
        "run_id": run_id,
        "case": case,
        "side": side,
        "status": expected_status,
        "barrier_observed": True,
        "residual_rows": 0,
    }
    for key, value in expected.items():
        if row.get(key) != value:
            raise Stop(f"{case}/{side}: {key}={row.get(key)!r}; esperado {value!r}")
    if not isinstance(row.get("pid"), int) or row["pid"] <= 1:
        raise Stop(f"{case}/{side}: pid invalido")
    if not isinstance(row.get("peer_pid"), int) or row["peer_pid"] <= 1:
        raise Stop(f"{case}/{side}: peer_pid invalido")
    if not isinstance(row.get("financial_success"), bool):
        raise Stop(f"{case}/{side}: financial_success no booleano")
    return row


def psql_argv(psql: Path, fixture_row: dict[str, Any], sql: str,
              run_id: str, case: str, side: str) -> list[str]:
    return [
        str(psql), "-X", "-w", "-A", "-t", "-v", "ON_ERROR_STOP=on",
        "-v", f"RUN_ID={run_id}", "-v", f"CASE_NAME={case}",
        "-v", f"SIDE={side}", "-h", str(fixture_row["socket_directory"]),
        "-p", str(fixture_row["port"]), "-U", "postgres", "-d",
        "alq_f1a_fixture", "-c", sql,
    ]


def terminate(proc: subprocess.Popen[str]) -> None:
    if proc.poll() is not None:
        return
    try:
        os.killpg(proc.pid, signal.SIGTERM)
        proc.wait(timeout=3)
    except (ProcessLookupError, subprocess.TimeoutExpired):
        try:
            os.killpg(proc.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass


def run_case(psql: Path, fixture_row: dict[str, Any], case: dict[str, Any],
             run_id: str) -> dict[str, Any]:
    name = str(case["name"])
    scripts = {"A": str(case["session_a_sql"]), "B": str(case["session_b_sql"])}
    env = clean_pg_env({"PGAPPNAME": f"alq-f1a-local-concurrency-{run_id[:8]}"})
    procs: dict[str, subprocess.Popen[str]] = {}
    try:
        for side in ("A", "B"):
            procs[side] = subprocess.Popen(
                psql_argv(psql, fixture_row, scripts[side], run_id, name, side),
                stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
                stderr=subprocess.PIPE, text=True, encoding="utf-8",
                errors="replace", env=env, start_new_session=True,
            )
        deadline = time.monotonic() + int(case["timeout_seconds"])
        outputs: dict[str, tuple[str, str, int]] = {}
        for side in ("A", "B"):
            remaining = max(0.1, deadline - time.monotonic())
            try:
                stdout, stderr = procs[side].communicate(timeout=remaining)
            except subprocess.TimeoutExpired as exc:
                raise Stop(f"{name}/{side}: timeout; procesos detenidos") from exc
            outputs[side] = (stdout, stderr, int(procs[side].returncode or 0))
        for side, (_, stderr, code) in outputs.items():
            if code != 0:
                raise Stop(f"{name}/{side}: psql exit={code}: {stderr[-1000:]}")
        a = parse_side(outputs["A"][0], name, "A", run_id,
                       str(case["expected_status_a"]))
        b = parse_side(outputs["B"][0], name, "B", run_id,
                       str(case["expected_status_b"]))
        if a["pid"] == b["pid"]:
            raise Stop(f"{name}: ambas sesiones reportaron el mismo backend")
        if a["peer_pid"] != b["pid"] or b["peer_pid"] != a["pid"]:
            raise Stop(f"{name}: las sesiones no observaron reciprocamente sus PIDs")
        successes = int(a["financial_success"]) + int(b["financial_success"])
        if successes != case["expected_financial_successes"]:
            raise Stop(f"{name}: exitos financieros={successes}; esperado={case['expected_financial_successes']}")
        return {
            "name": name, "status": "PASS", "pid_a": a["pid"],
            "pid_b": b["pid"], "peer_pid_a": a["peer_pid"],
            "peer_pid_b": b["peer_pid"],
            "barrier_a": True, "barrier_b": True,
            "financial_successes": successes, "residual_rows": 0,
        }
    finally:
        for proc in procs.values():
            terminate(proc)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--fixture-receipt", type=Path, required=True)
    parser.add_argument("--bundle-lock", type=Path, required=True)
    parser.add_argument("--case-spec", type=Path, required=True)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--execute", action="store_true")
    parser.add_argument("--ack")
    args = parser.parse_args()

    fixture_row, psql = fixture(args.fixture_receipt)
    cases = spec(args.case_spec)
    required = [args.case_spec]
    repo = Path(__file__).resolve().parents[3]
    lock = validate_bundle_lock(args.bundle_lock, required, base_dir=repo)
    runtime = lock.get("postgres_runtime")
    if (not isinstance(runtime, dict)
            or runtime.get("release") != fixture_row.get("runtime_release")
            or runtime.get("asset_sha256") != fixture_row.get("runtime_asset_sha256")
            or runtime.get("server_version_num") != 170006):
        raise Stop("fixture no deriva del runtime sellado en el bundle")
    for case in cases:
        inspect_sql(str(case["session_a_sql"]), f"{case['name']}/A")
        inspect_sql(str(case["session_b_sql"]), f"{case['name']}/B")

    if not args.execute:
        if args.ack is not None or args.output is not None:
            raise Stop("--ack/--output solo validos con --execute")
        print(json.dumps({
            "mode": "DRY_RUN_OFFLINE", "network": False,
            "status": "CONCURRENCY_VALIDADA_NO_EJECUTADA",
            "fixture_run_id": fixture_row["run_id"],
            "cases": [case["name"] for case in cases], "ack_required": ACK,
        }, indent=2, sort_keys=True))
        return 0
    if args.ack != ACK or args.output is None:
        raise Stop("ejecucion local exige ACK literal y --output")
    output = require_under_private_tmp(args.output, must_exist=False)
    run_id = uuid.uuid4().hex
    results = [run_case(psql, fixture_row, case, run_id) for case in cases]
    receipt = {
        "schema_version": 1, "status": "ALQ_F1A_CONCURRENCY_PASS",
        "environment": "LOCAL_DISPOSABLE_PG17", "server_version_num": 170006,
        "network": False, "run_id": run_id,
        "fixture_run_id": fixture_row["run_id"], "cases": results,
    }
    create_exclusive(output, (AGGREGATE_PREFIX.encode("ascii")
                              + json_bytes(receipt)))
    print(AGGREGATE_PREFIX + json.dumps(receipt, separators=(",", ":"), sort_keys=True))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Stop as exc:
        print(f"STOP ALQ F1-A CONCURRENCIA LOCAL: {exc}", file=os.sys.stderr)
        raise SystemExit(2)
