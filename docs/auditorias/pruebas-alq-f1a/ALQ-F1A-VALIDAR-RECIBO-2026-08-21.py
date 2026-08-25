#!/usr/bin/env python3
"""Valida recibos estructurados ALQ F1-A sin confiar en texto humano."""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
from typing import Any

from alq_f1a_common import (QA_REF, PROD_REF, Stop, read_regular,
                            require_sha256, sha256_bytes,
                            validate_evidence_binding)


PREFIXES = {
    "pre": "ALQ_F1A_PRE_RECEIPT|",
    "local": "ALQ_F1A_LOCAL_RECEIPT|",
    "concurrency": "ALQ_F1A_CONCURRENCY_RECEIPT|",
    "reconcile": "ALQ_F1A_RECONCILE_RECEIPT|",
    "post_install": "ALQ_F1A_POST_INSTALL_RECEIPT|",
    "qualification": "ALQ_F1A_QUALIFICATION_RECEIPT|",
    "final": "ALQ_F1A_FINAL_RECEIPT|",
    "migration": "ALQ_F1A_MIGRATION_RECEIPT|",
}
FORBIDDEN_KEYS = {
    "password", "passwd", "access_token", "refresh_token", "authorization",
    "secret", "email", "auth_user_id",
}
LOCAL_CONCURRENCY_CASES = {
    "IDEMPOTENCIA_MISMA_CLAVE", "CREDITO_CONSUMO_TOPE_GLOBAL",
    "APLICACION_CARGO_TOPE_GLOBAL", "DEPOSITO_EVENTO_TOPE_GLOBAL",
    "DEPOSITO_LIQUIDACION_TOPE_GLOBAL", "REVERSA_REAPERTURA_TOPE_GLOBAL",
    "REINTENTO_DOS_COMANDOS", "ORDEN_LOCKS_AB", "ORDEN_LOCKS_BA",
}
MIGRATION_NAME = "alq_f1a_guardas_financieras_y_metodo"


def walk(value: object) -> None:
    if isinstance(value, dict):
        for key, child in value.items():
            if key.lower() in FORBIDDEN_KEYS:
                raise Stop(f"recibo contiene campo sensible prohibido: {key}")
            walk(child)
    elif isinstance(value, list):
        for child in value:
            walk(child)


def integer(row: dict[str, Any], key: str, expected: int | None = None) -> int:
    value = row.get(key)
    if not isinstance(value, int) or isinstance(value, bool):
        raise Stop(f"{key} no es integer")
    if expected is not None and value != expected:
        raise Stop(f"{key}={value}; esperado {expected}")
    return value


def boolean(row: dict[str, Any], key: str, expected: bool) -> None:
    if row.get(key) is not expected:
        raise Stop(f"{key} no es {expected}")


def parse(path: Path, kind: str) -> tuple[dict[str, Any], bytes]:
    raw = read_regular(path, max_bytes=32 * 1024 * 1024)
    text = raw.decode("utf-8", "strict")
    prefix = PREFIXES[kind]
    matches = [line[len(prefix):] for line in text.splitlines() if line.startswith(prefix)]
    if len(matches) != 1:
        raise Stop(f"recibo {kind} ausente o duplicado")
    try:
        value = json.loads(matches[0])
    except json.JSONDecodeError as exc:
        raise Stop("payload de recibo no es JSON") from exc
    if not isinstance(value, dict) or value.get("schema_version") != 1:
        raise Stop("schema_version de recibo invalido")
    walk(value)
    return value, raw


def validate_common(row: dict[str, Any], *, local: bool = False) -> None:
    if local:
        if row.get("environment") != "LOCAL_DISPOSABLE_PG17":
            raise Stop("recibo local sin ambiente exacto")
        integer(row, "server_version_num", 170006)
        boolean(row, "network", False)
    else:
        if row.get("target_ref") != QA_REF:
            raise Stop("recibo remoto no pertenece a QA")
        if row.get("production_ref_denied") != PROD_REF:
            raise Stop("recibo remoto sin denylist literal de produccion")
        integer(row, "server_version_num", 170006)


def validate(kind: str, row: dict[str, Any], *,
             expected_source_sha256: str | None = None,
             expected_run_id: str | None = None,
             not_before_utc: str | None = None) -> None:
    if kind == "local":
        validate_common(row, local=True)
        if row.get("status") != "ALQ_F1A_LOCAL_PASS":
            raise Stop("suite local no esta PASS")
        integer(row, "integrity_cases", 17)
        integer(row, "nominal_rejections", 14)
        integer(row, "legacy_controls", 3)
        integer(row, "invalid_probes", 0)
        if integer(row, "valid_cases") < 14:
            raise Stop("faltan validos adyacentes")
        boolean(row, "state_machine_pass", True)
        boolean(row, "rls_pass", True)
        boolean(row, "concurrency_pass", True)
        boolean(row, "source_bytes_exact", True)
        return

    if kind == "concurrency":
        local_concurrency = row.get("environment") == "LOCAL_DISPOSABLE_PG17"
        validate_common(row, local=local_concurrency)
        if not local_concurrency:
            if expected_source_sha256 is None or expected_run_id is None or not_before_utc is None:
                raise Stop("recibo QA exige source SHA, run_id y not-before")
            validate_evidence_binding(
                row, expected_source_sha256=expected_source_sha256,
                expected_run_id=expected_run_id, not_before_utc=not_before_utc)
        cases = row.get("cases")
        if row.get("status") != "ALQ_F1A_CONCURRENCY_PASS" or not isinstance(cases, list) or not cases:
            raise Stop("recibo de concurrencia incompleto")
        for case in cases:
            if not isinstance(case, dict) or case.get("status") != "PASS":
                raise Stop("caso concurrente no PASS")
            a, b = case.get("pid_a"), case.get("pid_b")
            if not isinstance(a, int) or not isinstance(b, int) or a == b:
                raise Stop("caso concurrente no uso dos backends")
            if case.get("peer_pid_a") != b or case.get("peer_pid_b") != a:
                raise Stop("caso concurrente no observo PIDs reciprocos")
            if case.get("barrier_a") is not True or case.get("barrier_b") is not True:
                raise Stop("barrera concurrente no observada por ambos")
            integer(case, "residual_rows", 0)
        names = {case.get("name") for case in cases}
        if row.get("environment") == "LOCAL_DISPOSABLE_PG17":
            if not LOCAL_CONCURRENCY_CASES.issubset(names):
                raise Stop("recibo local omite casos concurrentes obligatorios")
        elif names != {"QA_IDEMPOTENCIA_MISMA_CLAVE_HASH"}:
            raise Stop("recibo QA no corresponde a la unica carrera autorizada")
        return

    validate_common(row)
    if expected_source_sha256 is None or expected_run_id is None or not_before_utc is None:
        raise Stop("recibo remoto exige source SHA, run_id y not-before")
    validate_evidence_binding(
        row, expected_source_sha256=expected_source_sha256,
        expected_run_id=expected_run_id, not_before_utc=not_before_utc)
    if kind == "pre":
        if row.get("status") != "ALQ_F1A_PRE_PASS":
            raise Stop("PRE no esta PASS")
        integer(row, "alq_tables", 46)
        integer(row, "alq_views", 27)
        integer(row, "operations_applied", 112)
        integer(row, "operations_prepared", 0)
        integer(row, "migration_rows", 46)
        boolean(row, "migration_name_absent", True)
        boolean(row, "qa_marker", True)
    elif kind == "reconcile":
        if row.get("status") != "ALQ_F1A_RECONCILE_COMMIT_CONFIRMED":
            raise Stop("reconciliacion no confirma commit")
        boolean(row, "objects_present", True)
        boolean(row, "migration_exactly_one", True)
        if row.get("commit_state") != "CONFIRMED":
            raise Stop("estado de commit no confirmado")
    elif kind == "post_install":
        if row.get("status") != "ALQ_F1A_POST_INSTALL_PASS":
            raise Stop("post-install no esta PASS")
        integer(row, "new_private_tables", 2)
        integer(row, "legacy_snapshot_null_rows", 7)
        boolean(row, "assert_global_ok", True)
        boolean(row, "migration_exactly_one", True)
    elif kind == "qualification":
        if row.get("status") != "ALQ_F1A_QUALIFICATION_CLEAN_PASS":
            raise Stop("calificacion/cleanup no esta PASS")
        integer(row, "financial_successes", 0)
        integer(row, "cleanup_residual_rows", 0)
        boolean(row, "two_backends", True)
        boolean(row, "barrier_observed_by_both", True)
        boolean(row, "rls_pass", True)
        if row.get("concurrency_case") != "QA_IDEMPOTENCIA_MISMA_CLAVE_HASH":
            raise Stop("calificacion no liga la carrera QA autorizada")
        for key in ("concurrency_receipt_sha256", "response_a_sha256", "response_b_sha256"):
            require_sha256(row.get(key), key)
    elif kind == "final":
        if row.get("status") != "ALQ_F1A_FINAL_PASS":
            raise Stop("postcheck final no esta PASS")
        integer(row, "fixture_rows", 0)
        integer(row, "prepared_test_rows", 0)
        integer(row, "sequence_delta", 0)
        boolean(row, "postmigration_hashes_restored", True)
        boolean(row, "assert_global_ok", True)
    elif kind == "migration":
        if row.get("status") != "ALQ_F1A_MIGRATION_RECONCILED":
            raise Stop("migracion no reconciliada")
        integer(row, "matching_rows", 1)
        if not isinstance(row.get("version"), str) or not row["version"].isdigit():
            raise Stop("version remota invalida")
        for key in ("source_sha256", "statements_sha256"):
            require_sha256(row.get(key), key)
        if row.get("statements_sha256") != expected_source_sha256:
            raise Stop("statements remoto no es byte-identico a la fuente sellada")
        if row.get("migration_name") != MIGRATION_NAME:
            raise Stop("migration_name remoto no coincide con el literal sellado")
    else:
        raise Stop(f"tipo no soportado: {kind}")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--kind", choices=sorted(PREFIXES), required=True)
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--expected-source-sha256")
    parser.add_argument("--expected-run-id")
    parser.add_argument("--not-before-utc")
    args = parser.parse_args()
    row, raw = parse(args.input, args.kind)
    validate(
        args.kind, row,
        expected_source_sha256=args.expected_source_sha256,
        expected_run_id=args.expected_run_id,
        not_before_utc=args.not_before_utc)
    print(json.dumps({
        "status": "ALQ_F1A_RECEIPT_VALID", "kind": args.kind,
        "input_sha256": sha256_bytes(raw), "receipt": row,
    }, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Stop as exc:
        print(f"STOP ALQ F1-A RECEIPT: {exc}", file=os.sys.stderr)
        raise SystemExit(2)
