#!/usr/bin/env python3
"""Autoprueba offline del plumbing de evidencia F1-A; no prueba el motor SQL."""

from __future__ import annotations

import ast
import importlib.util
import json
import os
import sys
import tempfile
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.dont_write_bytecode = True
HERE = Path(__file__).resolve().parent
REPO = HERE.parents[2]
sys.path.insert(0, str(HERE))

from alq_f1a_common import (Stop, create_exclusive, json_bytes,  # noqa: E402
                            sha256_bytes, validate_bundle_lock)


PREFIX = "ALQ_F1A_OFFLINE_HARNESS_RECEIPT|"
BANNED_NETWORK_IMPORTS = {"socket", "urllib", "http", "requests", "aiohttp", "supabase"}


def load(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"no se pudo cargar {path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def imports(tree: ast.AST) -> set[str]:
    result: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            result.update(alias.name.split(".")[0] for alias in node.names)
        elif isinstance(node, ast.ImportFrom) and node.module:
            result.add(node.module.split(".")[0])
    return result


def static_checks() -> tuple[int, int]:
    scripts = sorted(HERE.glob("*.py"))
    coordinator = REPO / "docs/auditorias/sql/ALQ-F1A-COORDINADOR-OFFLINE-QA-2026-08-21.py"
    scripts.append(coordinator)
    fstrings = 0
    for path in scripts:
        tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
        bad = imports(tree) & BANNED_NETWORK_IMPORTS
        if bad:
            raise AssertionError(f"import de red en {path}: {sorted(bad)}")
        fstrings += sum(isinstance(node, ast.JoinedStr) for node in ast.walk(tree))
        if path == coordinator and "subprocess" in imports(tree):
            raise AssertionError("coordinador importa subprocess")
    for schema in sorted((HERE / "schemas").glob("*.json")):
        value = json.loads(schema.read_text(encoding="utf-8"))
        if value.get("$schema") != "https://json-schema.org/draft/2020-12/schema":
            raise AssertionError(f"schema sin draft sellado: {schema}")
    return len(scripts), fstrings


def dynamic_checks() -> None:
    validator = load("alq_f1a_receipt_validator", HERE / "ALQ-F1A-VALIDAR-RECIBO-2026-08-21.py")
    qa_concurrency = load(
        "alq_f1a_qa_concurrency",
        HERE / "ALQ-F1A-HARNESS-CONCURRENCIA-QA-OFFLINE-2026-08-21.py")
    coordinator = load("alq_f1a_coordinator", REPO / "docs/auditorias/sql/ALQ-F1A-COORDINADOR-OFFLINE-QA-2026-08-21.py")
    with tempfile.TemporaryDirectory(dir="/private/tmp", prefix="alq-f1a-offline-test-") as raw:
        root = Path(raw)
        concurrent = {
            "schema_version": 1, "status": "ALQ_F1A_CONCURRENCY_PASS",
            "environment": "LOCAL_DISPOSABLE_PG17", "server_version_num": 170006,
            "network": False,
            "cases": [{"name": name, "status": "PASS", "pid_a": 101, "pid_b": 102,
                       "peer_pid_a": 102, "peer_pid_b": 101,
                       "barrier_a": True, "barrier_b": True, "residual_rows": 0}
                      for name in sorted(validator.LOCAL_CONCURRENCY_CASES)],
        }
        validator.validate("concurrency", concurrent)

        response = {"ok": True, "message": "migration applied"}
        captured = datetime.now(timezone.utc).isoformat(timespec="seconds")
        envelope = {
            "schema_version": 1, "origin": "MCP_TRANSCRIPT_COPIED_BY_CODEX",
            "tool": "apply_migration", "target_ref": "rsjwqmpseknvydistgfr",
            "migration_name": "alq_f1a_guardas_financieras_y_metodo",
            "query_sha256": "a" * 64, "source_sha256": "a" * 64,
            "run_id": "b" * 32, "captured_utc": captured,
            "invocation_id": "offline-test-001",
            "result_class": "SUCCESS_CONFIRMED", "raw_response": response,
            "raw_response_sha256": sha256_bytes(json_bytes(response)),
        }
        envelope_path = root / "apply.json"
        create_exclusive(envelope_path, json_bytes(envelope))
        coordinator.apply_envelope(
            envelope_path, "a" * 64, run_id="b" * 32,
            not_before_utc=captured)

        pre = {
            "schema_version": 1, "status": "ALQ_F1A_PRE_PASS",
            "target_ref": "rsjwqmpseknvydistgfr", "server_version_num": 170006,
            "production_ref_denied": "wajkfydxutptcvvfwrvq",
            "source_sha256": "a" * 64, "run_id": "c" * 32,
            "captured_utc": captured, "alq_tables": 46, "alq_views": 27,
            "operations_applied": 112, "operations_prepared": 0,
            "migration_rows": 46, "migration_name_absent": True,
            "qa_marker": True,
        }
        validator.validate(
            "pre", pre, expected_source_sha256="a" * 64,
            expected_run_id="c" * 32, not_before_utc=captured)
        try:
            validator.validate(
                "pre", pre, expected_source_sha256="d" * 64,
                expected_run_id="c" * 32, not_before_utc=captured)
        except Stop:
            pass
        else:
            raise AssertionError("validator acepto evidencia de otra fuente")
        try:
            validator.validate(
                "pre", pre, expected_source_sha256="a" * 64,
                expected_run_id="d" * 32, not_before_utc=captured)
        except Stop:
            pass
        else:
            raise AssertionError("validator acepto evidencia de otro run_id")
        stale = dict(pre)
        stale["captured_utc"] = (
            datetime.now(timezone.utc) - timedelta(minutes=5)
        ).isoformat(timespec="seconds")
        try:
            validator.validate(
                "pre", stale, expected_source_sha256="a" * 64,
                expected_run_id="c" * 32, not_before_utc=captured)
        except Stop:
            pass
        else:
            raise AssertionError("validator acepto evidencia anterior a la corrida")
        too_old = dict(pre)
        too_old["captured_utc"] = (
            datetime.now(timezone.utc) - timedelta(minutes=20)
        ).isoformat(timespec="seconds")
        try:
            validator.validate(
                "pre", too_old, expected_source_sha256="a" * 64,
                expected_run_id="c" * 32,
                not_before_utc=(
                    datetime.now(timezone.utc) - timedelta(hours=1)
                ).isoformat(timespec="seconds"))
        except Stop:
            pass
        else:
            raise AssertionError("validator acepto evidencia con mas de 15 minutos")

        once, log, run_id = root / "run.once", root / "run.log", "b" * 32
        create_exclusive(once, json_bytes({"schema_version": 1,
                                          "status": "ALQ_F1A_ONE_SHOT_ARMED",
                                          "run_id": run_id,
                                          "evidence_run_id": "c" * 32,
                                          "source_sha256": "a" * 64,
                                          "created_utc": captured}))
        create_exclusive(log, b"")
        coordinator.append_record(once, log, run_id, "ARMED", {"test": 1})
        coordinator.append_record(once, log, run_id, "APPLY_ATTEMPTED", {"test": 2})
        _, rows, head = coordinator.verify_log(once, log)
        if len(rows) != 2 or len(head) != 64:
            raise AssertionError("cadena append-only invalida")

        target = Path("docs/auditorias/pruebas-alq-f1a/alq_f1a_common.py")
        payload = (REPO / target).read_bytes()
        lock_path = root / "lock.json"
        create_exclusive(lock_path, json_bytes({
            "schema_version": 1, "status": "ALQ_F1A_BUNDLE_LOCKED_OFFLINE",
            "target_ref": "rsjwqmpseknvydistgfr", "network": False,
            "production_ref_denied": "wajkfydxutptcvvfwrvq",
            "migration_name": "alq_f1a_guardas_financieras_y_metodo",
            "artifacts": [{"path": target.as_posix(), "role": "harness",
                           "will_execute": False, "sha256": sha256_bytes(payload),
                           "bytes": len(payload), "lines": len(payload.splitlines()),
                           "mode": "0644"}],
        }))
        try:
            validate_bundle_lock(lock_path, [target], base_dir=REPO)
        except Stop:
            pass
        else:
            raise AssertionError("bundle truncado se autodeclaro completo")
        validate_bundle_lock(
            lock_path, [target], base_dir=REPO, require_complete=False)

        sensitive_spec = root / "qa-sensitive-spec.json"
        create_exclusive(sensitive_spec, json_bytes({
            "schema_version": 1, "target_ref": "rsjwqmpseknvydistgfr",
            "production_ref_denied": "wajkfydxutptcvvfwrvq",
            "source_sha256": "a" * 64, "run_id": "c" * 32,
            "cases": [], "note": "persona@example.invalid",
        }))
        original_validate = qa_concurrency.validate_bundle_lock
        qa_concurrency.validate_bundle_lock = lambda *args, **kwargs: {
            "artifacts": [{"path": qa_concurrency.SOURCE_PATH, "sha256": "a" * 64}],
        }
        try:
            qa_concurrency.spec(sensitive_spec, lock_path)
        except Stop as exc:
            if "secreto o PII" not in str(exc):
                raise AssertionError("spec QA no fallo por la guarda sensible") from exc
        else:
            raise AssertionError("spec QA acepto PII")
        finally:
            qa_concurrency.validate_bundle_lock = original_validate

        collision = root / "collision"
        create_exclusive(collision, b"first")
        try:
            create_exclusive(collision, b"second")
        except Exception:
            pass
        else:
            raise AssertionError("O_EXCL no rechazo segunda escritura")
        if (os.stat(collision, follow_symlinks=False).st_mode & 0o777) != 0o600:
            raise AssertionError("evidencia no quedo 0600")


def main() -> int:
    script_count, fstrings = static_checks()
    dynamic_checks()
    receipt = {
        "schema_version": 1, "status": "ALQ_F1A_OFFLINE_HARNESS_PASS",
        "network": False, "scripts_parsed": script_count,
        "fstrings_ast_visited": fstrings, "schemas_parsed": len(list((HERE / "schemas").glob("*.json"))),
        "receipt_contract_pass": True, "apply_envelope_hash_pass": True,
        "append_only_chain_pass": True, "bundle_relative_path_pass": True,
        "exclusive_0600_pass": True, "evidence_binding_pass": True,
        "truncated_bundle_rejected": True, "qa_sensitive_spec_stop_pass": True,
    }
    print(PREFIX + json.dumps(receipt, separators=(",", ":"), sort_keys=True))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"STOP ALQ F1-A OFFLINE HARNESS TEST: {exc}", file=os.sys.stderr)
        raise SystemExit(2)
