#!/usr/bin/env python3
"""Planifica y ensambla evidencia A/B QA; nunca invoca tools ni abre red."""

from __future__ import annotations

import argparse
import json
import os
import re
from pathlib import Path
from typing import Any, Iterable

from alq_f1a_common import (PROD_REF, QA_REF, Stop, create_exclusive,
                            json_bytes, load_json, parse_utc, require_run_id,
                            require_sha256, sha256_bytes,
                            validate_evidence_binding,
                            validate_bundle_lock)


SIDE_PREFIX = "ALQ_F1A_CONCURRENCY_SIDE|"
OUTPUT_PREFIX = "ALQ_F1A_CONCURRENCY_RECEIPT|"
REQUIRED_QA_CASE = "QA_IDEMPOTENCIA_MISMA_CLAVE_HASH"
SOURCE_PATH = "supabase/migrations/_sources/alq_f1a_guardas_financieras_y_metodo.sql"
SENSITIVE_RE = re.compile(
    r"(?i)(password|passwd|access[_-]?token|refresh[_-]?token|authorization|[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})"
)


def spec(path: Path, lock_path: Path) -> dict[str, Any]:
    repo = Path(__file__).resolve().parents[3]
    lock = validate_bundle_lock(lock_path, [path], base_dir=repo)
    row = load_json(path)
    if SENSITIVE_RE.search(json.dumps(row, ensure_ascii=False, sort_keys=True)):
        raise Stop("case spec QA contiene secreto o PII")
    if set(row) != {"schema_version", "target_ref", "production_ref_denied",
                    "source_sha256", "run_id", "cases"}:
        raise Stop("case spec QA contiene claves faltantes o extra")
    if (row.get("schema_version") != 1 or row.get("target_ref") != QA_REF
            or row.get("production_ref_denied") != PROD_REF):
        raise Stop("case spec QA sin destino/denylist exactos")
    artifacts = lock.get("artifacts")
    source_rows = [item for item in artifacts if isinstance(item, dict)
                   and item.get("path") == SOURCE_PATH] if isinstance(artifacts, list) else []
    if len(source_rows) != 1 or row.get("source_sha256") != source_rows[0].get("sha256"):
        raise Stop("case spec QA no corresponde a la fuente forward sellada")
    require_sha256(row.get("source_sha256"), "source_sha256")
    source_sha256 = str(row["source_sha256"])
    require_run_id(row.get("run_id"))
    run_id = str(row["run_id"])
    cases = row.get("cases")
    if not isinstance(cases, list) or not cases:
        raise Stop("case spec QA sin casos")
    seen: set[str] = set()
    for case in cases:
        if not isinstance(case, dict):
            raise Stop("caso QA no es objeto")
        name = case.get("name")
        if not isinstance(name, str) or name in seen:
            raise Stop("caso QA sin nombre unico")
        seen.add(name)
        for key in ("query_a", "query_b", "expected_status_a", "expected_status_b"):
            if not isinstance(case.get(key), str) or not case[key]:
                raise Stop(f"{name} sin {key}")
        for key in ("query_a", "query_b"):
            lower = case[key].lower()
            for token in ("alq_f1a_concurrency_side|", "pg_backend_pid", "alq_f1a_barrier"):
                if token not in lower:
                    raise Stop(f"{name}/{key} sin token {token}")
            if run_id not in case[key]:
                raise Stop(f"{name}/{key} no contiene run_id literal sellado")
            if source_sha256 not in case[key]:
                raise Stop(f"{name}/{key} no contiene source SHA literal sellado")
        if case.get("expected_financial_successes") not in (0, 1):
            raise Stop(f"{name} expected_financial_successes fuera de 0..1")
    if seen != {REQUIRED_QA_CASE}:
        raise Stop(f"case spec QA debe contener solo {REQUIRED_QA_CASE}")
    if cases[0].get("expected_financial_successes") != 0:
        raise Stop("calificacion QA no puede aplicar efectos financieros")
    return row


def strings(value: object) -> Iterable[str]:
    if isinstance(value, str):
        yield value
    elif isinstance(value, list):
        for child in value:
            yield from strings(child)
    elif isinstance(value, dict):
        for child in value.values():
            yield from strings(child)


def transcript(path: Path, query: str, case: str, side: str,
               run_id: str, source_sha256: str, expected_status: str,
               not_before_utc: str) -> dict[str, Any]:
    row = load_json(path)
    required = {"schema_version", "origin", "tool", "target_ref", "query_sha256",
                "invocation_id", "raw_response", "raw_response_sha256"}
    if set(row) != required:
        raise Stop(f"{case}/{side}: transcript con claves distintas")
    expected = {"schema_version": 1, "origin": "MCP_TRANSCRIPT_COPIED_BY_CODEX",
                "tool": "execute_sql", "target_ref": QA_REF,
                "query_sha256": sha256_bytes(query.encode("utf-8"))}
    for key, value in expected.items():
        if row.get(key) != value:
            raise Stop(f"{case}/{side}: transcript {key} no coincide")
    if not isinstance(row.get("invocation_id"), str) or len(row["invocation_id"]) < 8:
        raise Stop(f"{case}/{side}: invocation_id invalido")
    digest = require_sha256(row.get("raw_response_sha256"), "raw_response_sha256")
    if sha256_bytes(json_bytes(row["raw_response"])) != digest:
        raise Stop(f"{case}/{side}: raw_response SHA no coincide")
    matches: list[str] = []
    for text in strings(row["raw_response"]):
        matches.extend(line[len(SIDE_PREFIX):] for line in text.splitlines()
                       if line.startswith(SIDE_PREFIX))
    if len(matches) != 1:
        raise Stop(f"{case}/{side}: recibo side ausente o duplicado en respuesta real")
    try:
        receipt = json.loads(matches[0])
    except json.JSONDecodeError as exc:
        raise Stop(f"{case}/{side}: recibo side no JSON") from exc
    expected_receipt = {"schema_version": 1, "run_id": run_id, "case": case,
                        "side": side, "status": expected_status,
                        "barrier_observed": True, "residual_rows": 0}
    if not isinstance(receipt, dict):
        raise Stop(f"{case}/{side}: recibo side no objeto")
    for key, value in expected_receipt.items():
        if receipt.get(key) != value:
            raise Stop(f"{case}/{side}: recibo {key} no coincide")
    validate_evidence_binding(
        receipt, expected_source_sha256=source_sha256,
        expected_run_id=run_id, not_before_utc=not_before_utc)
    for key in ("pid", "peer_pid"):
        if not isinstance(receipt.get(key), int) or receipt[key] <= 1:
            raise Stop(f"{case}/{side}: {key} invalido")
    if not isinstance(receipt.get("financial_success"), bool):
        raise Stop(f"{case}/{side}: financial_success no booleano")
    return receipt


def safe_output(path: Path) -> Path:
    resolved = path.resolve(strict=False)
    repo = Path(__file__).resolve().parents[3]
    private = Path("/private/tmp").resolve()
    if private == resolved or private in resolved.parents:
        return resolved
    try:
        resolved.relative_to(repo)
    except ValueError as exc:
        raise Stop("output fuera del repo o /private/tmp") from exc
    return resolved


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--case-spec", type=Path, required=True)
    parser.add_argument("--bundle-lock", type=Path, required=True)
    parser.add_argument("--case")
    parser.add_argument("--response-a", type=Path)
    parser.add_argument("--response-b", type=Path)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--not-before-utc")
    parser.add_argument("--assemble", action="store_true")
    args = parser.parse_args()
    plan = spec(args.case_spec, args.bundle_lock)
    if not args.assemble:
        if any(value is not None for value in (
                args.response_a, args.response_b, args.output, args.not_before_utc)):
            raise Stop("responses/output solo validos con --assemble")
        print(json.dumps({
            "schema_version": 1, "status": "ALQ_F1A_QA_CONCURRENCY_PLAN_VALID",
            "network": False, "target_ref": QA_REF, "run_id": plan["run_id"],
            "cases": [{"name": case["name"],
                       "query_a_sha256": sha256_bytes(case["query_a"].encode("utf-8")),
                       "query_b_sha256": sha256_bytes(case["query_b"].encode("utf-8"))}
                      for case in plan["cases"]],
        }, indent=2, sort_keys=True))
        return 0
    if (not args.case or args.response_a is None or args.response_b is None
            or args.output is None or not args.not_before_utc):
        raise Stop("--assemble exige case, response-a, response-b, output y not-before-utc")
    selected = [case for case in plan["cases"] if case["name"] == args.case]
    if len(selected) != 1:
        raise Stop("case no existe o esta duplicado")
    case = selected[0]
    a = transcript(args.response_a, case["query_a"], case["name"], "A",
                   plan["run_id"], plan["source_sha256"],
                   case["expected_status_a"], args.not_before_utc)
    b = transcript(args.response_b, case["query_b"], case["name"], "B",
                   plan["run_id"], plan["source_sha256"],
                   case["expected_status_b"], args.not_before_utc)
    if a["pid"] == b["pid"] or a["peer_pid"] != b["pid"] or b["peer_pid"] != a["pid"]:
        raise Stop("A/B no son backends distintos observados reciprocamente")
    successes = int(a["financial_success"]) + int(b["financial_success"])
    if successes != case["expected_financial_successes"]:
        raise Stop("cantidad de exitos financieros no coincide")
    receipt_row = {
        "schema_version": 1, "status": "ALQ_F1A_CONCURRENCY_PASS",
        "environment": "QA", "target_ref": QA_REF,
        "production_ref_denied": PROD_REF, "server_version_num": 170006,
        "network": False,
        "run_id": plan["run_id"], "source_sha256": plan["source_sha256"],
        "captured_utc": max(
            parse_utc(a["captured_utc"], "A.captured_utc"),
            parse_utc(b["captured_utc"], "B.captured_utc"),
        ).isoformat(timespec="seconds"),
        "cases": [{"name": case["name"], "status": "PASS",
                   "pid_a": a["pid"], "pid_b": b["pid"],
                   "peer_pid_a": a["peer_pid"], "peer_pid_b": b["peer_pid"],
                   "barrier_a": True, "barrier_b": True,
                   "financial_successes": successes, "residual_rows": 0}],
    }
    target = safe_output(args.output)
    create_exclusive(target, OUTPUT_PREFIX.encode("ascii") + json_bytes(receipt_row))
    print(OUTPUT_PREFIX + json.dumps(receipt_row, separators=(",", ":"), sort_keys=True))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Stop as exc:
        print(f"STOP ALQ F1-A CONCURRENCIA QA OFFLINE: {exc}", file=os.sys.stderr)
        raise SystemExit(2)
