#!/usr/bin/env python3
"""Ejecuta baseline -> forward -> regresion -> UI -> concurrencia en PG17 local.

El unico destino aceptado es el fixture socket-only sellado. No contiene ni
acepta host remoto, password, project ref o URL de Supabase.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import uuid
from pathlib import Path
from typing import Any

from alq_f1a_common import (PROD_REF, Stop, clean_pg_env, create_exclusive,
                            json_bytes, load_json, read_regular, require_run_id,
                            require_sha256, require_under_private_tmp, run_argv,
                            sha256_file, validate_bundle_lock)


ACK = "AUTORIZO_ALQ_F1A_EJECUTAR_SUITE_LOCAL_PG17_20260821"
CONCURRENCY_ACK = "AUTORIZO_ALQ_F1A_EJECUTAR_CONCURRENCIA_LOCAL_PG17_20260821"
SQL_PREFIX = "ALQ_F1A_LOCAL_SQL_RECEIPT|"
UI_PREFIX = "ALQ_F1A_UI_RECEIPT|"
FINAL_PREFIX = "ALQ_F1A_LOCAL_RECEIPT|"
BASELINE_CONTRACT = "ALQ_F1A_BASELINE_CONTRACT: MATERIALIZED_LOCAL_PG17_V1"


def fixture(path: Path) -> tuple[dict[str, Any], Path]:
    row = load_json(path)
    if (row.get("schema_version") != 1
            or row.get("status") != "ALQ_F1A_LOCAL_FIXTURE_READY"
            or row.get("network") is not False):
        raise Stop("fixture receipt invalido")
    require_run_id(row.get("run_id"))
    physical = row.get("physical")
    if not isinstance(physical, dict) or physical != {
        "database": "alq_f1a_fixture", "server_version_num": 170006,
        "listen_addresses": "", "inet_server_addr_is_null": True,
        "data_directory": row.get("data_directory"),
    }:
        raise Stop("fixture no es el PG17.6 socket-only sellado")
    if row.get("database") != "alq_f1a_fixture" or row.get("user") != "postgres":
        raise Stop("identidad logica del fixture invalida")
    socket_value, psql_value = row.get("socket_directory"), row.get("psql")
    if not isinstance(socket_value, str) or not isinstance(psql_value, str):
        raise Stop("fixture sin socket/psql")
    require_under_private_tmp(Path(socket_value))
    psql = require_under_private_tmp(Path(psql_value))
    if psql.is_symlink() or sha256_file(psql) != require_sha256(row.get("psql_sha256"), "psql_sha256"):
        raise Stop("psql local no coincide con el runtime sellado")
    return row, psql


def psql_base(psql: Path, row: dict[str, Any], app: str) -> tuple[list[str], dict[str, str]]:
    argv = [
        str(psql), "-X", "-w", "-A", "-t", "-v", "ON_ERROR_STOP=on",
        "-h", str(row["socket_directory"]), "-p", str(row["port"]),
        "-U", "postgres", "-d", "alq_f1a_fixture",
    ]
    return argv, clean_pg_env({"PGAPPNAME": app})


def assert_identity(psql: Path, row: dict[str, Any], stage: str) -> str:
    argv, env = psql_base(psql, row, f"alq-f1a-local-id-{stage}")
    sql = """
select json_build_object(
 'database',current_database(),
 'server_version_num',current_setting('server_version_num')::int,
 'listen_addresses',current_setting('listen_addresses'),
 'inet_server_addr_is_null',inet_server_addr() is null,
 'fixture_run_id',(select run_id from alq_f1a_local.fixture_marca where singleton)
)::text;
"""
    proc = run_argv(argv + ["-c", sql], env=env, timeout=20)
    if proc.returncode != 0:
        raise Stop(f"identidad local fallo en {stage}: {proc.stderr[-1000:]}")
    try:
        identity = json.loads(proc.stdout.strip())
    except json.JSONDecodeError as exc:
        raise Stop(f"identidad local no JSON en {stage}") from exc
    expected = {
        "database": "alq_f1a_fixture", "server_version_num": 170006,
        "listen_addresses": "", "inet_server_addr_is_null": True,
        "fixture_run_id": row["run_id"],
    }
    if identity != expected:
        raise Stop(f"identidad local derivo en {stage}")
    return proc.stdout


def psql_file(psql: Path, row: dict[str, Any], path: Path, stage: str,
              run_id: str, *, single_transaction: bool) -> tuple[str, str]:
    assert_identity(psql, row, f"before-{stage}")
    argv, env = psql_base(psql, row, f"alq-f1a-local-{stage}-{run_id[:8]}")
    argv += ["-v", f"RUN_ID={run_id}"]
    if single_transaction:
        argv.append("--single-transaction")
    argv += ["-f", str(path)]
    proc = run_argv(argv, env=env, timeout=600)
    if proc.returncode != 0:
        raise Stop(f"{stage} fallo exit={proc.returncode}: {proc.stderr[-1600:]}")
    assert_identity(psql, row, f"after-{stage}")
    return proc.stdout, proc.stderr


def exact_receipt(stdout: str, prefix: str, label: str) -> dict[str, Any]:
    matches = [line[len(prefix):] for line in stdout.splitlines() if line.startswith(prefix)]
    if len(matches) != 1:
        raise Stop(f"{label}: recibo ausente o duplicado")
    try:
        row = json.loads(matches[0])
    except json.JSONDecodeError as exc:
        raise Stop(f"{label}: recibo no JSON") from exc
    if not isinstance(row, dict) or row.get("schema_version") != 1:
        raise Stop(f"{label}: recibo invalido")
    return row


def check_sql_receipt(row: dict[str, Any], run_id: str) -> None:
    expected = {
        "status": "ALQ_F1A_LOCAL_SQL_PASS", "run_id": run_id,
        "integrity_cases": 17, "nominal_rejections": 14,
        "legacy_controls": 3, "invalid_probes": 0,
        "v1_giro_cases": 2,
        "state_machine_pass": True, "rls_pass": True,
        "cleanup_residual_rows": 0, "assert_global_ok": True,
    }
    for key, value in expected.items():
        if row.get(key) != value:
            raise Stop(f"suite SQL: {key}={row.get(key)!r}; esperado {value!r}")
    valid = row.get("valid_cases")
    if not isinstance(valid, int) or isinstance(valid, bool) or valid < 14:
        raise Stop("suite SQL: faltan casos validos adyacentes")


def check_ui_receipt(row: dict[str, Any]) -> None:
    expected = {
        "status": "ALQ_F1A_UI_OFFLINE_PASS", "syntax_pass": True,
        "consumers_checked": 2, "exact_v2_allowlist": True,
        "uuid_per_click": True, "no_automatic_retry": True,
        "explicit_ok_gate": True, "rejected_without_row_handled": True,
        "signatures_pass": True, "stable_refs_pass": True,
        "result_unwrap_pass": True, "durable_state_machine_pass": True,
        "explicit_retry_wired": True, "v1_fallback_pass": True,
        "inflight_dedup_pass": True,
    }
    for key, value in expected.items():
        if row.get(key) != value:
            raise Stop(f"suite UI: {key}={row.get(key)!r}; esperado {value!r}")


def run_ui(node: Path, node_sha: str, node_version: str,
           test: Path) -> tuple[dict[str, Any], str, str]:
    if not node.is_absolute() or node.is_symlink() or not os.access(node, os.X_OK):
        raise Stop("node debe ser binario absoluto, real y ejecutable")
    if sha256_file(node) != require_sha256(node_sha, "expected_node_sha256"):
        raise Stop("SHA de node no coincide")
    version = run_argv([str(node), "--version"], timeout=15)
    if version.returncode != 0 or version.stdout.strip() != node_version:
        raise Stop("version de node no coincide con el bundle")
    proc = run_argv([str(node), str(test)], timeout=120)
    if proc.returncode != 0:
        raise Stop(f"test UI fallo exit={proc.returncode}: {proc.stderr[-1400:]}")
    receipt = exact_receipt(proc.stdout, UI_PREFIX, "suite UI")
    check_ui_receipt(receipt)
    return receipt, proc.stdout, proc.stderr


def check_concurrency_receipt(path: Path) -> dict[str, Any]:
    raw = read_regular(path).decode("utf-8", "strict")
    row = exact_receipt(raw, "ALQ_F1A_CONCURRENCY_RECEIPT|", "concurrencia")
    if row.get("status") != "ALQ_F1A_CONCURRENCY_PASS" or row.get("network") is not False:
        raise Stop("concurrencia local no PASS")
    cases = row.get("cases")
    if not isinstance(cases, list) or not cases:
        raise Stop("concurrencia local sin casos")
    for case in cases:
        if (not isinstance(case, dict) or case.get("status") != "PASS"
                or case.get("barrier_a") is not True or case.get("barrier_b") is not True
                or case.get("pid_a") == case.get("pid_b")
                or case.get("peer_pid_a") != case.get("pid_b")
                or case.get("peer_pid_b") != case.get("pid_a")
                or case.get("residual_rows") != 0):
            raise Stop("caso concurrente no demuestra dos backends limpios")
    return row


def ensure_no_production_bytes(paths: list[Path]) -> None:
    needle = PROD_REF.encode("ascii")
    for path in paths:
        if needle in read_regular(path):
            raise Stop(f"artifact ejecutable contiene project ref de produccion: {path}")


def require_reproducible_local_contract(baseline: Path, regression_sql: Path) -> None:
    """Impide convertir un baseline histórico/compositivo en un PASS local falso."""
    baseline_text = read_regular(baseline).decode("utf-8", "strict")
    include_re = re.compile(r"(?im)^\s*\\i(?:r)?(?:\s|$)")
    tx_re = re.compile(
        r"(?im)^\s*(?:begin(?:\s+isolation\s+level\s+\w+(?:\s+\w+)*)?|commit|rollback)\s*;\s*$"
    )
    blockers = {
        "include psql mutable": include_re.search(baseline_text) is not None,
        "transaccion historica top-level": tx_re.search(baseline_text) is not None,
        "guarda de QA": "private.qa_marca_descartable" in baseline_text,
        "contrato local ausente": BASELINE_CONTRACT not in baseline_text,
        "marca fisica ausente": "alq_f1a_local.fixture_marca" not in baseline_text,
        "stub QA vacio ausente": 'private."qa_marca_descartable"' not in baseline_text,
        "recibo baseline ausente": "ALQ_F1A_BASELINE_READY|PG17.6|46_TABLES|27_VIEWS|45_OPERATIONS|NO_BUSINESS_DATA" not in baseline_text,
    }
    active = sorted(label for label, present in blockers.items() if present)
    if active:
        raise Stop(
            "BASELINE_LOCAL_REPRODUCIBLE_NO_SELLADO: " + ", ".join(active)
        )
    regression_text = read_regular(regression_sql).decode("utf-8", "strict")
    for token in (
        SQL_PREFIX, "ALQ_F1A_LOCAL_SQL_PASS", ":'RUN_ID'",
        "alq_f1a_qualification_context", "alq_f1a_valid_result",
        "alq_f1a_state_result", "alq_f1a_rls_result",
        "alq_f1a_v1_giro_result", "v1_giro_results",
        "-- BEGIN ALQ_F1A_FORWARD_SINGLE_SESSION_SUITE",
        "-- END ALQ_F1A_FORWARD_SINGLE_SESSION_SUITE",
        "ALQ_F1A_FORWARD_SINGLE_SESSION_RECEIPT|",
    ):
        if token not in regression_text:
            raise Stop(f"REGRESION_LOCAL_CONTRATO_NO_SELLADO: falta {token}")
    begin_marker = "-- BEGIN ALQ_F1A_FORWARD_SINGLE_SESSION_SUITE"
    end_marker = "-- END ALQ_F1A_FORWARD_SINGLE_SESSION_SUITE"
    if regression_text.count(begin_marker) != 1 or regression_text.count(end_marker) != 1:
        raise Stop("REGRESION_LOCAL_CONTRATO_NO_SELLADO: marcadores forward no unicos")
    begin_at = regression_text.index(begin_marker)
    end_at = regression_text.index(end_marker, begin_at)
    forward_suite = regression_text[begin_at:end_at]
    forward_required = (
        "f1af1a00-0000-4000-8000-000000000001",
        "alq_f1a_forward_sequence_snapshot",
        "ALQ_F1A_FORWARD_JOURNAL_IDENTITY_CONSUMIDA",
        "journal_identity_unchanged",
        "journal_apply_executed',false",
        "alq_f1a_actor_cleanup",
        "qualification_run_id",
    )
    for token in forward_required:
        if token not in forward_suite:
            raise Stop(f"REGRESION_LOCAL_CONTRATO_NO_SELLADO: forward sin {token}")
    forbidden_forward = {
        "variable psql RUN_ID": ":'RUN_ID'" in forward_suite,
        "nextval explicito": re.search(r"(?i)\bnextval\s*\(", forward_suite) is not None,
        "setval/reset de secuencia": re.search(r"(?i)\bsetval\s*\(", forward_suite) is not None,
        "apply v2 exitoso": re.search(
            r"(?i)\bpublic\.alq_admin_aplicar_v2\s*\(", forward_suite
        ) is not None,
        "recibo local externo": SQL_PREFIX in forward_suite,
        "giro V1 con journal": "alq_f1a_ejecutar_giro_v1_local" in forward_suite,
        "transaccion top-level": tx_re.search(forward_suite) is not None,
    }
    active_forward = sorted(
        label for label, present in forbidden_forward.items() if present
    )
    if active_forward:
        raise Stop(
            "REGRESION_LOCAL_CONTRATO_NO_SELLADO: forward inseguro: "
            + ", ".join(active_forward)
        )
    if "public.alq_admin_aplicar_v2(" not in regression_text[end_at:]:
        raise Stop(
            "REGRESION_LOCAL_CONTRATO_NO_SELLADO: suite full apply no quedo fuera del forward"
        )
    if "alq_f1a_ejecutar_giro_v1_local" not in regression_text[end_at:]:
        raise Stop(
            "REGRESION_LOCAL_CONTRATO_NO_SELLADO: giros V1 no quedaron fuera del forward"
        )
    declared_pass_re = re.compile(
        r"(?i)'(?:valid_cases|v1_giro_cases|state_machine_pass|rls_pass)'"
        r"\s*,\s*(?:\d+|true)"
    )
    if declared_pass_re.search(regression_text):
        raise Stop("REGRESION_LOCAL_CONTRATO_NO_SELLADO: PASS declarativo")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--fixture-receipt", type=Path, required=True)
    parser.add_argument("--bundle-lock", type=Path, required=True)
    parser.add_argument("--baseline", type=Path, required=True)
    parser.add_argument("--forward-source", type=Path, required=True)
    parser.add_argument("--regression-sql", type=Path, required=True)
    parser.add_argument("--ui-test", type=Path, required=True)
    parser.add_argument("--node", type=Path, required=True)
    parser.add_argument("--expected-node-sha256", required=True)
    parser.add_argument("--concurrency-harness", type=Path, required=True)
    parser.add_argument("--concurrency-spec", type=Path, required=True)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--log", type=Path)
    parser.add_argument("--execute", action="store_true")
    parser.add_argument("--ack")
    args = parser.parse_args()

    require_reproducible_local_contract(args.baseline, args.regression_sql)
    fixture_row, psql = fixture(args.fixture_receipt)
    repo = Path(__file__).resolve().parents[3]
    required = [args.baseline, args.forward_source, args.regression_sql,
                args.ui_test, args.concurrency_harness, args.concurrency_spec]
    lock = validate_bundle_lock(args.bundle_lock, required, base_dir=repo)
    runtime = lock.get("postgres_runtime")
    if (not isinstance(runtime, dict)
            or runtime.get("release") != fixture_row.get("runtime_release")
            or runtime.get("asset_sha256") != fixture_row.get("runtime_asset_sha256")
            or runtime.get("server_version_num") != 170006):
        raise Stop("fixture no deriva del runtime sellado en el bundle")
    node_runtime = lock.get("node_runtime")
    if (not isinstance(node_runtime, dict)
            or node_runtime.get("binary_sha256") != args.expected_node_sha256
            or not isinstance(node_runtime.get("version"), str)):
        raise Stop("node no esta sellado por version+SHA en el bundle")
    ensure_no_production_bytes([args.baseline, args.forward_source, args.regression_sql])
    if lock.get("target_ref") is None:  # ya validado; evita lock parcial fabricado
        raise Stop("bundle lock sin target")
    if not args.execute:
        if args.ack is not None or args.output is not None or args.log is not None:
            raise Stop("--ack/--output/--log solo validos con --execute")
        assert_identity(psql, fixture_row, "dry-run")
        print(json.dumps({
            "mode": "DRY_RUN_OFFLINE", "network": False,
            "status": "LOCAL_SUITE_VALIDADA_NO_EJECUTADA",
            "fixture_run_id": fixture_row["run_id"],
            "forward_source_sha256": sha256_file(args.forward_source),
            "ack_required": ACK,
        }, indent=2, sort_keys=True))
        return 0
    if args.ack != ACK or args.output is None or args.log is None:
        raise Stop("ejecucion local exige ACK literal, --output y --log")
    output = require_under_private_tmp(args.output, must_exist=False)
    log_path = require_under_private_tmp(args.log, must_exist=False)
    run_id = uuid.uuid4().hex
    logs: list[str] = []
    for path, stage in ((args.baseline, "baseline"),
                        (args.forward_source, "forward")):
        stdout, stderr = psql_file(psql, fixture_row, path, stage, run_id,
      