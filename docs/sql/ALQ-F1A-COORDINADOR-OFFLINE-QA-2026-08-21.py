#!/usr/bin/env python3
"""Coordinador one-shot exclusivamente local para la futura instalacion F1-A.

Este archivo NO invoca MCP, Supabase, PostgreSQL, HTTP ni subprocess. Verifica
bytes y registra evidencia externa. La llamada tool real ocurre fuera de este
proceso siguiendo el runbook auditado.
"""

from __future__ import annotations

import argparse
import ast
import fcntl
import json
import os
import re
import stat
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

COMMON_DIR = Path(__file__).resolve().parents[1] / "pruebas-alq-f1a"
sys.path.insert(0, str(COMMON_DIR))

from alq_f1a_common import (PROD_REF, QA_REF, Stop, create_exclusive,  # noqa: E402
                            fsync_parent, json_bytes, load_json,
                            parse_utc, read_regular, require_run_id, require_sha256,
                            require_official_pg17_asset_url, sha256_bytes,
                            sha256_file, validate_bundle_lock,
                            validate_evidence_binding,
                            write_all)


SOURCE_PATH = "supabase/migrations/_sources/alq_f1a_guardas_financieras_y_metodo.sql"
QA_CASE_SPEC_PATH = "docs/auditorias/pruebas-alq-f1a/ALQ-F1A-CONCURRENCIA-QA-CASE-2026-08-21.json"
MIGRATION_NAME = "alq_f1a_guardas_financieras_y_metodo"
ONCE_PATH = "docs/auditorias/alq-f1a/ALQ-F1A-RUN-QA-2026-08-21.once"
LOG_PATH = "docs/auditorias/alq-f1a/ALQ-F1A-RUN-QA-2026-08-21.output.log"
MIRROR_RE = re.compile(r"^[0-9]+_alq_f1a_guardas_financieras_y_metodo\.sql$")
COMMIT_RE = re.compile(r"^[0-9a-f]{40}(?:[0-9a-f]{24})?$")
TOP_TX_RE = re.compile(r"(?im)^\s*(?:begin|start\s+transaction|commit|rollback)\s*;")
RECEIPT_PREFIXES = {
    "pre": "ALQ_F1A_PRE_RECEIPT|",
    "reconcile": "ALQ_F1A_RECONCILE_RECEIPT|",
    "post_install": "ALQ_F1A_POST_INSTALL_RECEIPT|",
    "qualification": "ALQ_F1A_QUALIFICATION_RECEIPT|",
    "final": "ALQ_F1A_FINAL_RECEIPT|",
    "migration": "ALQ_F1A_MIGRATION_RECEIPT|",
}
INGEST_ORDER = ["apply_response", "reconcile", "post_install", "qualification", "final", "migration"]
SENSITIVE_RE = re.compile(
    rb"(?i)(password|passwd|access[_-]?token|refresh[_-]?token|authorization|gmail_app_password|service[_-]?role[_-]?key|[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})"
)


def now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def exact_keys(row: dict[str, Any], allowed: set[str], label: str) -> None:
    if set(row) != allowed:
        missing = sorted(allowed - set(row))
        extra = sorted(set(row) - allowed)
        raise Stop(f"{label}: claves distintas; faltan={missing}, sobran={extra}")


def repo_root(value: Path | None) -> Path:
    expected = Path(__file__).resolve().parents[3]
    root = expected if value is None else value.resolve(strict=True)
    if root != expected:
        raise Stop("--repo debe ser el repo que contiene este coordinador")
    return root


def artifact_index(lock: dict[str, Any]) -> dict[str, dict[str, Any]]:
    rows = lock.get("artifacts")
    if not isinstance(rows, list):
        raise Stop("bundle lock sin artifacts")
    result: dict[str, dict[str, Any]] = {}
    for row in rows:
        if not isinstance(row, dict) or not isinstance(row.get("path"), str):
            raise Stop("artifact invalido")
        if row["path"] in result:
            raise Stop("artifact duplicado")
        result[row["path"]] = row
    return result


def evidence_run_id(repo: Path, index: dict[str, dict[str, Any]]) -> str:
    """Obtiene el namespace remoto sellado; nunca lo acepta desde CLI/evidencia."""
    source = index.get(SOURCE_PATH)
    spec_row = index.get(QA_CASE_SPEC_PATH)
    if source is None or spec_row is None:
        raise Stop("bundle sin fuente o case spec QA")
    spec = load_json(repo / QA_CASE_SPEC_PATH)
    if spec.get("source_sha256") != source.get("sha256"):
        raise Stop("case spec QA derivo de la fuente")
    return require_run_id(spec.get("run_id"))


def validate_lock(repo: Path, lock_path: Path) -> tuple[dict[str, Any], dict[str, dict[str, Any]]]:
    raw = load_json(lock_path)
    index = artifact_index(raw)
    paths = [Path(relative) for relative in index]
    lock = validate_bundle_lock(lock_path, paths, base_dir=repo)
    index = artifact_index(lock)
    if lock.get("status") != "ALQ_F1A_BUNDLE_LOCKED_OFFLINE":
        raise Stop("bundle lock sin estado final")
    if lock.get("migration_name") != MIGRATION_NAME:
        raise Stop("migration_name no es el literal sellado")
    runtime = lock.get("postgres_runtime")
    if (not isinstance(runtime, dict) or runtime.get("release") != "v2.8.5"
            or runtime.get("postgres_version") != "17.6"
            or runtime.get("server_version_num") != 170006):
        raise Stop("bundle lock sin runtime PG17.6 sellado")
    if set(runtime) != {"release", "postgres_version", "server_version_num",
                        "architecture", "asset_url", "asset_bytes", "asset_sha256"}:
        raise Stop("postgres_runtime del bundle tiene claves distintas")
    if runtime.get("architecture") not in {"arm64", "x86_64", "universal"}:
        raise Stop("arquitectura PG17 invalida")
    if not isinstance(runtime.get("asset_bytes"), int) or runtime["asset_bytes"] <= 0:
        raise Stop("asset_bytes PG17 invalido")
    require_sha256(runtime.get("asset_sha256"), "postgres_runtime.asset_sha256")
    require_official_pg17_asset_url(runtime.get("asset_url"))
    node_runtime = lock.get("node_runtime")
    if (not isinstance(node_runtime, dict)
            or set(node_runtime) != {"version", "binary_sha256"}
            or re.fullmatch(
                r"v[0-9]+\.[0-9]+\.[0-9]+",
                str(node_runtime.get("version", ""))) is None):
        raise Stop("bundle lock sin node runtime versionado")
    require_sha256(node_runtime.get("binary_sha256"), "node_runtime.binary_sha256")
    source_row = index.get(SOURCE_PATH)
    if source_row is None or source_row.get("role") != "forward_source" or source_row.get("will_execute") is not True:
        raise Stop("fuente forward unica ausente o no ejecutable")
    sources = [row for row in index.values() if row.get("role") == "forward_source"]
    if len(sources) != 1:
        raise Stop("debe existir exactamente una autoridad forward")
    evidence_spec_row = index.get(QA_CASE_SPEC_PATH)
    if evidence_spec_row is None or evidence_spec_row.get("role") != "schema":
        raise Stop("case spec QA no esta sellado con role=schema")
    evidence_spec = load_json(repo / QA_CASE_SPEC_PATH)
    if (set(evidence_spec) != {"schema_version", "target_ref",
                              "production_ref_denied", "source_sha256",
                              "run_id", "cases"}
            or evidence_spec.get("schema_version") != 1
            or evidence_spec.get("target_ref") != QA_REF
            or evidence_spec.get("production_ref_denied") != PROD_REF
            or evidence_spec.get("source_sha256") != source_row.get("sha256")):
        raise Stop("case spec QA no liga destino y fuente sellados")
    require_run_id(evidence_spec.get("run_id"))
    coordinator_rel = Path(__file__).resolve().relative_to(repo).as_posix()
    if coordinator_rel not in index or index[coordinator_rel].get("sha256") != sha256_file(Path(__file__)):
        raise Stop("coordinador no esta sellado en el bundle")
    for relative, row in index.items():
        payload = read_regular(repo / relative)
        if relative.endswith(".py"):
            try:
                ast.parse(payload.decode("utf-8", "strict"), filename=relative)
            except (UnicodeDecodeError, SyntaxError) as exc:
                raise Stop(f"Python sin sintaxis valida: {relative}") from exc
        elif relative.endswith(".json"):
            try:
                json.loads(payload.decode("utf-8", "strict"))
            except (UnicodeDecodeError, json.JSONDecodeError) as exc:
                raise Stop(f"JSON sin sintaxis valida: {relative}") from exc
        if row.get("will_execute") is True and row.get("role") in {
                "baseline", "forward_source", "verification_sql", "rollback_sql", "consumer"}:
            if b"${" in payload or b"PENDIENTE_SHA" in payload:
                raise Stop(f"placeholder en artifact ejecutable: {relative}")
            # Los SQL de verificación deben incluir el ref de producción como
            # denylist literal y en el recibo. No es un destino seleccionable:
            # el canal real queda fijado por la atestación MCP project-scoped.
            if row.get("role") != "verification_sql" and PROD_REF.encode("ascii") in payload:
                raise Stop(f"project ref de produccion en artifact ejecutable: {relative}")
        if relative.endswith("ALQ-F1A-99-ROLLBACK-QA-2026-08-21.sql") and row.get("will_execute") is not False:
            raise Stop("99 debe quedar will_execute=false")
    source_text = read_regular(repo / SOURCE_PATH).decode("utf-8", "strict")
    if TOP_TX_RE.search(source_text):
        raise Stop("forward contiene control transaccional top-level")
    mirror_dir = repo / "supabase" / "migrations"
    mirrors = [path for path in mirror_dir.iterdir()
               if path.is_file() and MIRROR_RE.fullmatch(path.name)]
    if mirrors:
        raise Stop("el espejo <V> existe antes de conocer V remoto")
    return lock, index


def future_absent(repo: Path) -> None:
    for relative in (ONCE_PATH, LOG_PATH,
                     "docs/auditorias/alq-f1a/RECIBO-CLOUD-POST-PUBLICACION-ALQ-F1A-2026-08-21.json",
                     "docs/auditorias/alq-f1a/RECIBO-CLOUD-POST-PUBLICACION-ALQ-F1A-2026-08-21.md"):
        path = repo / relative
        if path.exists() or path.is_symlink():
            raise Stop(f"artefacto futuro ya existe en build-check: {relative}")


def validate_publication(repo: Path, lock_path: Path, lock: dict[str, Any],
                         publication_path: Path) -> dict[str, Any]:
    publication = load_json(publication_path)
    exact_keys(publication, {
        "schema_version", "status", "target_ref", "production_ref_denied",
        "bundle_lock_sha256", "source_path", "source_sha256", "commit_sha",
        "artifacts", "audit_report_path", "audit_report_sha256", "issued_utc",
    }, "recibo publicacion")
    expected = {
        "schema_version": 1,
        "status": "ALQ_F1A_CLOUD_PUBLICATION_PASS",
        "target_ref": QA_REF,
        "production_ref_denied": PROD_REF,
        "bundle_lock_sha256": sha256_file(lock_path),
        "source_path": SOURCE_PATH,
        "source_sha256": sha256_file(repo / SOURCE_PATH),
    }
    for key, value in expected.items():
        if publication.get(key) != value:
            raise Stop(f"recibo publicacion: {key} no coincide")
    if not COMMIT_RE.fullmatch(str(publication.get("commit_sha", ""))):
        raise Stop("recibo publicacion sin commit SHA valido")
    if (not isinstance(publication.get("audit_report_path"), str)
            or not publication["audit_report_path"].startswith("docs/auditorias/")
            or not publication["audit_report_path"].endswith(".md")
            or ".." in Path(publication["audit_report_path"]).parts):
        raise Stop("recibo publicacion sin ruta de auditoria Cloud")
    expected_report_sha = require_sha256(
        publication.get("audit_report_sha256"), "audit_report_sha256")
    report_path = repo / publication["audit_report_path"]
    if report_path.is_symlink() or not report_path.is_file():
        raise Stop("informe humano Cloud ausente o symlink")
    try:
        report_path.resolve(strict=True).relative_to(repo.resolve(strict=True))
    except ValueError as exc:
        raise Stop("informe humano Cloud fuera del repo") from exc
    if sha256_file(report_path) != expected_report_sha:
        raise Stop("SHA del informe humano Cloud no coincide con el recibo JSON")
    if not isinstance(publication.get("issued_utc"), str) or "T" not in publication["issued_utc"]:
        raise Stop("recibo publicacion sin issued_utc")
    published = publication.get("artifacts")
    if not isinstance(published, list):
        raise Stop("recibo publicacion sin artifacts")
    pub_index: dict[str, dict[str, Any]] = {}
    for row in published:
        if not isinstance(row, dict) or not isinstance(row.get("path"), str):
            raise Stop("fila de publicacion invalida")
        if row["path"] in pub_index:
            raise Stop("ruta duplicada en recibo publicacion")
        require_sha256(row.get("sha256"), f"publication sha:{row['path']}")
        if not COMMIT_RE.fullmatch(str(row.get("blob_sha", ""))):
            raise Stop(f"blob SHA invalido: {row['path']}")
        pub_index[row["path"]] = row
    bundle_index = artifact_index(lock)
    if set(pub_index) != set(bundle_index):
        raise Stop("recibo publicacion no cubre exactamente el bundle")
    for relative, row in bundle_index.items():
        if pub_index[relative]["sha256"] != row["sha256"]:
            raise Stop(f"SHA publicado no coincide: {relative}")
    return publication


def validate_attestation(path: Path) -> dict[str, Any]:
    row = load_json(path)
    exact_keys(row, {
        "schema_version", "status", "target_ref", "project_scoped",
        "account_wide_tools_present", "tool_schemas_accept_project_id",
        "required_tools_present", "project_id_accepting_tool_schemas",
        "connector_config_sha256", "tool_catalog_sha256", "captured_utc",
    }, "attestation MCP")
    expected = {
        "schema_version": 1,
        "status": "ALQ_F1A_MCP_PROJECT_SCOPED_ATTESTED",
        "target_ref": QA_REF,
        "project_scoped": True,
        "account_wide_tools_present": False,
        "tool_schemas_accept_project_id": False,
    }
    for key, value in expected.items():
        if row.get(key) != value:
            raise Stop(f"attestation MCP: {key} no coincide")
    if row.get("required_tools_present") != ["apply_migration", "execute_sql", "list_migrations"]:
        raise Stop("attestation MCP no enumera las tres tools requeridas")
    if row.get("project_id_accepting_tool_schemas") != []:
        raise Stop("attestation MCP detecta schema con project_id seleccionable")
    require_sha256(row.get("connector_config_sha256"), "connector_config_sha256")
    require_sha256(row.get("tool_catalog_sha256"), "tool_catalog_sha256")
    if not isinstance(row.get("captured_utc"), str) or "T" not in row["captured_utc"]:
        raise Stop("attestation MCP sin captured_utc")
    return row


def validate_authorization(repo: Path, lock_path: Path, publication_path: Path,
                           attestation_path: Path, auth_path: Path,
                           ack: str | None) -> dict[str, Any]:
    row = load_json(auth_path)
    exact_keys(row, {
        "schema_version", "status", "target_ref", "production_ref_denied",
        "bundle_lock_sha256", "publication_receipt_sha256",
        "connector_attestation_sha256", "source_sha256",
        "coordinator_sha256", "ack", "issuer", "issued_utc",
    }, "autorizacion ejecucion")
    expected = {
        "schema_version": 1,
        "status": "ALQ_F1A_EXECUTION_AUTHORIZED",
        "target_ref": QA_REF,
        "production_ref_denied": PROD_REF,
        "bundle_lock_sha256": sha256_file(lock_path),
        "publication_receipt_sha256": sha256_file(publication_path),
        "connector_attestation_sha256": sha256_file(attestation_path),
        "source_sha256": sha256_file(repo / SOURCE_PATH),
        "coordinator_sha256": sha256_file(Path(__file__)),
    }
    for key, value in expected.items():
        if row.get(key) != value:
            raise Stop(f"autorizacion ejecucion: {key} no coincide")
    literal = row.get("ack")
    if not isinstance(literal, str) or not literal.startswith("AUTORIZO_ALQ_F1A_"):
        raise Stop("autorizacion sin ACK literal F1-A")
    if ack is not None and ack != literal:
        raise Stop("ACK aportado no coincide con autorizacion sellada")
    if row.get("issuer") != "MARIANO":
        raise Stop("autorizacion no fue emitida por Mariano")
    if not isinstance(row.get("issued_utc"), str) or "T" not in row["issued_utc"]:
        raise Stop("autorizacion sin issued_utc")
    return row


def receipt(path: Path, kind: str, *, source_sha256: str,
            evidence_run_id: str, not_before_utc: str) -> dict[str, Any]:
    raw = read_regular(path, max_bytes=32 * 1024 * 1024)
    if SENSITIVE_RE.search(raw):
        raise Stop(f"evidencia {kind} contiene secreto o PII")
    text = raw.decode("utf-8", "strict")
    prefix = RECEIPT_PREFIXES[kind]
    matches = [line[len(prefix):] for line in text.splitlines() if line.startswith(prefix)]
    if len(matches) != 1:
        raise Stop(f"recibo {kind} ausente o duplicado")
    try:
        row = json.loads(matches[0])
    except json.JSONDecodeError as exc:
        raise Stop(f"recibo {kind} no JSON") from exc
    if not isinstance(row, dict) or row.get("schema_version") != 1:
        raise Stop(f"recibo {kind} invalido")
    if (row.get("target_ref") != QA_REF
            or row.get("production_ref_denied") != PROD_REF
            or row.get("server_version_num") != 170006):
        raise Stop(f"recibo {kind} no pertenece al QA/PG17 sellado")
    validate_evidence_binding(
        row, expected_source_sha256=source_sha256,
        expected_run_id=evidence_run_id, not_before_utc=not_before_utc)
    statuses = {
        "pre": "ALQ_F1A_PRE_PASS",
        "reconcile": "ALQ_F1A_RECONCILE_COMMIT_CONFIRMED",
        "post_install": "ALQ_F1A_POST_INSTALL_PASS",
        "qualification": "ALQ_F1A_QUALIFICATION_CLEAN_PASS",
        "final": "ALQ_F1A_FINAL_PASS",
        "migration": "ALQ_F1A_MIGRATION_RECONCILED",
    }
    if row.get("status") != statuses[kind]:
        raise Stop(f"recibo {kind} no esta PASS")
    if kind == "pre":
        expected = {"alq_tables": 46, "alq_views": 27, "operations_applied": 112,
                    "operations_prepared": 0, "migration_rows": 46,
                    "migration_name_absent": True, "qa_marker": True}
    elif kind == "reconcile":
        expected = {"objects_present": True, "migration_exactly_one": True,
                    "commit_state": "CONFIRMED"}
    elif kind == "post_install":
        expected = {"new_private_tables": 2, "legacy_snapshot_null_rows": 7,
                    "assert_global_ok": True, "migration_exactly_one": True}
    elif kind == "qualification":
        expected = {"financial_successes": 0, "cleanup_residual_rows": 0,
                    "two_backends": True, "barrier_observed_by_both": True,
                    "rls_pass": True,
                    "concurrency_case": "QA_IDEMPOTENCIA_MISMA_CLAVE_HASH"}
    elif kind == "final":
        expected = {"fixture_rows": 0, "prepared_test_rows": 0,
                    "sequence_delta": 0, "postmigration_hashes_restored": True,
                    "assert_global_ok": True}
    else:
        expected = {"matching_rows": 1}
        if not isinstance(row.get("version"), str) or not row["version"].isdigit():
            raise Stop("recibo migration sin version numerica")
        require_sha256(row.get("source_sha256"), "source_sha256")
        require_sha256(row.get("statements_sha256"), "statements_sha256")
        if row.get("statements_sha256") != source_sha256:
            raise Stop("statements remoto no es byte-identico a la fuente sellada")
        if row.get("migration_name") != MIGRATION_NAME:
            raise Stop("recibo migration no corresponde al nombre sellado")
    for key, value in expected.items():
        if row.get(key) != value:
            raise Stop(f"recibo {kind}: {key} no coincide")
    if kind == "qualification":
        for key in ("concurrency_receipt_sha256", "response_a_sha256", "response_b_sha256"):
            require_sha256(row.get(key), key)
    return row


def apply_envelope(path: Path, source_sha: str, *, run_id: str,
                   not_before_utc: str) -> dict[str, Any]:
    raw = read_regular(path, max_bytes=16 * 1024 * 1024)
    if SENSITIVE_RE.search(raw):
        raise Stop("transcripcion apply contiene secreto o PII")
    row = load_json(path)
    exact_keys(row, {
        "schema_version", "origin", "tool", "target_ref", "migration_name",
        "query_sha256", "source_sha256", "run_id", "captured_utc", "invocation_id",
        "result_class", "raw_response", "raw_response_sha256",
    }, "transcripcion apply")
    expected = {
        "schema_version": 1,
        "origin": "MCP_TRANSCRIPT_COPIED_BY_CODEX",
        "tool": "apply_migration",
        "target_ref": QA_REF,
        "migration_name": MIGRATION_NAME,
        "query_sha256": source_sha,
        "source_sha256": source_sha,
    }
    for key, value in expected.items():
        if row.get(key) != value:
            raise Stop(f"transcripcion apply: {key} no coincide")
    validate_evidence_binding(
        row, expected_source_sha256=source_sha,
        expected_run_id=run_id, not_before_utc=not_before_utc)
    if row.get("result_class") not in {"SUCCESS_CONFIRMED", "ERROR_DEFINITE", "RESULT_UNKNOWN"}:
        raise Stop("transcripcion apply sin result_class valido")
    invocation_id = row.get("invocation_id")
    if not isinstance(invocation_id, str) or len(invocation_id) < 8:
        raise Stop("transcripcion apply sin invocation_id")
    raw_response = row.get("raw_response")
    if raw_response is None:
        raise Stop("transcripcion apply sin raw_response embebida")
    raw_response_sha = require_sha256(row.get("raw_response_sha256"), "raw_response_sha256")
    if sha256_bytes(json_bytes(raw_response)) != raw_response_sha:
        raise Stop("raw_response_sha256 no coincide con raw_response canonica")
    return row


def safe_output(repo: Path, path: Path) -> Path:
    candidate = path.resolve(strict=False)
    private = Path("/private/tmp").resolve()
    if candidate == private or private in candidate.parents:
        return candidate
    try:
        candidate.relative_to(repo)
    except ValueError as exc:
        raise Stop("output fuera del repo o /private/tmp") from exc
    return candidate


def log_paths(repo: Path) -> tuple[Path, Path]:
    return repo / ONCE_PATH, repo / LOG_PATH


def verify_log(once: Path, log: Path) -> tuple[dict[str, Any], list[dict[str, Any]], str]:
    header = load_json(once)
    run_id = require_run_id(header.get("run_id"))
    require_run_id(header.get("evidence_run_id"))
    require_sha256(header.get("source_sha256"), "source_sha256")
    parse_utc(header.get("created_utc"), "created_utc")
    if header.get("status") != "ALQ_F1A_ONE_SHOT_ARMED":
        raise Stop("one-shot header invalido")
    once_meta = os.stat(once, follow_symlinks=False)
    if (not stat.S_ISREG(once_meta.st_mode) or stat.S_IMODE(once_meta.st_mode) != 0o600
            or once_meta.st_uid != os.getuid()):
        raise Stop("one-shot no es regular 0600 del usuario")
    meta = os.stat(log, follow_symlinks=False)
    if not stat.S_ISREG(meta.st_mode) or stat.S_IMODE(meta.st_mode) != 0o600 or meta.st_uid != os.getuid():
        raise Stop("log no es regular 0600 del usuario")
    raw = read_regular(log).decode("utf-8", "strict")
    rows: list[dict[str, Any]] = []
    previous = sha256_file(once)
    for line in raw.splitlines():
        try:
            row = json.loads(line)
        except json.JSONDecodeError as exc:
            raise Stop("log encadenado contiene linea no JSON") from exc
        if not isinstance(row, dict) or row.get("run_id") != run_id:
            raise Stop("registro de log invalido")
        digest = require_sha256(row.get("record_sha256"), "record_sha256")
        base = dict(row)
        del base["record_sha256"]
        if base.get("prev_record_sha256") != previous:
            raise Stop("cadena del log rota")
        if sha256_bytes(json_bytes(base)) != digest:
            raise Stop("hash de registro del log invalido")
        previous = digest
        rows.append(row)
    return header, rows, previous


def append_record(once: Path, log: Path, run_id: str,
                  event: str, details: dict[str, Any]) -> dict[str, Any]:
    flags = os.O_WRONLY | os.O_APPEND
    if hasattr(os, "O_NOFOLLOW"):
        flags |= os.O_NOFOLLOW
    fd = os.open(log, flags)
    try:
        fcntl.flock(fd, fcntl.LOCK_EX)
        opened, current = os.fstat(fd), os.stat(log, follow_symlinks=False)
        if (opened.st_dev, opened.st_ino) != (current.st_dev, current.st_ino):
            raise Stop("log fue reemplazado durante la apertura")
        header, rows, previous = verify_log(once, log)
        if header["run_id"] != run_id:
            raise Stop("run_id no coincide con one-shot")
        base = {
            "schema_version": 1, "run_id": run_id, "utc": now(),
            "event": event, "details": details, "prev_record_sha256": previous,
        }
        row = dict(base)
        row["record_sha256"] = sha256_bytes(json_bytes(base))
        write_all(fd, json_bytes(row))
        os.fsync(fd)
        return row
    finally:
        try:
            fcntl.flock(fd, fcntl.LOCK_UN)
        finally:
            os.close(fd)


def events(rows: list[dict[str, Any]]) -> list[str]:
    return [str(row.get("event")) for row in rows]


def build_check(repo: Path, lock_path: Path) -> dict[str, Any]:
    lock, index = validate_lock(repo, lock_path)
    future_absent(repo)
    return {
        "schema_version": 1, "status": "F1A_CONSTRUIDO_NO_EJECUTADO",
        "network": False, "target_ref": QA_REF,
        "bundle_lock_sha256": sha256_file(lock_path),
        "source_sha256": index[SOURCE_PATH]["sha256"],
        "evidence_run_id": evidence_run_id(repo, index),
        "artifacts_verified": len(index),
        "execution_ack_sealed": lock.get("execution_ack") is not None,
    }


def readiness(repo: Path, lock_path: Path, publication_path: Path,
              attestation_path: Path, authorization_path: Path) -> dict[str, Any]:
    lock, index = validate_lock(repo, lock_path)
    once, log = log_paths(repo)
    if once.exists() or once.is_symlink() or log.exists() or log.is_symlink():
        raise Stop("one-shot/log ya existen antes de execution-readiness")
    publication = validate_publication(repo, lock_path, lock, publication_path)
    validate_attestation(attestation_path)
    authorization = validate_authorization(
        repo, lock_path, publication_path, attestation_path, authorization_path, None)
    return {
        "schema_version": 1,
        "status": "F1A_PUBLICADO_PENDIENTE_ACK_EJECUCION",
        "network": False, "target_ref": QA_REF,
        "commit_sha": publication["commit_sha"],
        "bundle_lock_sha256": sha256_file(lock_path),
        "publication_receipt_sha256": sha256_file(publication_path),
        "connector_attestation_sha256": sha256_file(attestation_path),
        "authorization_sha256": sha256_file(authorization_path),
        "source_sha256": index[SOURCE_PATH]["sha256"],
        "evidence_run_id": evidence_run_id(repo, index),
        "ack_sha256": sha256_bytes(authorization["ack"].encode("utf-8")),
    }


def arm(repo: Path, args: argparse.Namespace) -> dict[str, Any]:
    lock, index = validate_lock(repo, args.bundle_lock)
    validate_publication(repo, args.bundle_lock, lock, args.publication_receipt)
    validate_attestation(args.connector_attestation)
    authorization = validate_authorization(
        repo, args.bundle_lock, args.publication_receipt,
        args.connector_attestation, args.execution_authorization, args.ack)
    sealed_evidence_run_id = evidence_run_id(repo, index)
    pre = receipt(
        args.pre_evidence, "pre", source_sha256=index[SOURCE_PATH]["sha256"],
        evidence_run_id=sealed_evidence_run_id,
        not_before_utc=authorization["issued_utc"])
    once, log = log_paths(repo)
    if once.exists() or once.is_symlink() or log.exists() or log.is_symlink():
        raise Stop("one-shot/log ya existen; no se rearma")
    run_id = uuid.uuid4().hex
    header = {
        "schema_version": 1, "status": "ALQ_F1A_ONE_SHOT_ARMED",
        "run_id": run_id, "created_utc": now(), "target_ref": QA_REF,
        "evidence_run_id": sealed_evidence_run_id,
        "production_ref_denied": PROD_REF, "migration_name": MIGRATION_NAME,
        "source_sha256": index[SOURCE_PATH]["sha256"],
        "bundle_lock_sha256": sha256_file(args.bundle_lock),
        "publication_receipt_sha256": sha256_file(args.publication_receipt),
        "connector_attestation_sha256": sha256_file(args.connector_attestation),
        "execution_authorization_sha256": sha256_file(args.execution_authorization),
        "ack_sha256": sha256_bytes(authorization["ack"].encode("utf-8")),
        "pre_evidence_sha256": sha256_file(args.pre_evidence),
        "pre_status": pre["status"], "network": False,
    }
    create_exclusive(log, b"")
    create_exclusive(once, json_bytes(header))
    append_record(once, log, run_id, "ARMED", {
        "pre_evidence_sha256": header["pre_evidence_sha256"],
        "source_sha256": header["source_sha256"],
        "evidence_run_id": header["evidence_run_id"],
    })
    return {"status": "ALQ_F1A_ONE_SHOT_ARMED", "run_id": run_id,
            "once": str(once.relative_to(repo)), "log": str(log.relative_to(repo)),
            "network": False}


def mark_attempt(repo: Path, run_id: str) -> dict[str, Any]:
    once, log = log_paths(repo)
    header, rows, _ = verify_log(once, log)
    if header["run_id"] != run_id:
        raise Stop("run_id no coincide")
    if events(rows) != ["ARMED"]:
        raise Stop("apply ya fue intentado o ledger no esta en ARMED")
    row = append_record(once, log, run_id, "APPLY_ATTEMPTED", {
        "migration_name": MIGRATION_NAME,
        "query_sha256": header["source_sha256"],
        "durability": "FSYNC_BEFORE_EXTERNAL_TOOL_CALL",
    })
    return {"status": "ALQ_F1A_APPLY_ATTEMPT_RECORDED", "run_id": run_id,
            "record_sha256": row["record_sha256"], "network": False,
            "next_action": "CALL_APPLY_MIGRATION_ONCE_OUTSIDE_THIS_PROCESS"}


def ingest(repo: Path, run_id: str, step: str, evidence: Path) -> dict[str, Any]:
    once, log = log_paths(repo)
    header, rows, _ = verify_log(once, log)
    if header["run_id"] != run_id:
        raise Stop("run_id no coincide")
    if "APPLY_ATTEMPTED" not in events(rows):
        raise Stop("no se ingiere evidencia antes de APPLY_ATTEMPTED fsynced")
    ingested = [row["details"].get("step") for row in rows
                if row.get("event") == "EVIDENCE_INGESTED"]
    expected = INGEST_ORDER[len(ingested)] if len(ingested) < len(INGEST_ORDER) else None
    if step != expected:
        raise Stop(f"orden de evidencia invalido: {step}; esperado {expected}")
    if step == "apply_response":
        parsed = apply_envelope(
            evidence, header["source_sha256"], run_id=header["run_id"],
            not_before_utc=header["created_utc"])
        classification = parsed["result_class"]
        summary = {"result_class": classification,
                   "invocation_id": parsed["invocation_id"],
                   "raw_response_sha256": parsed["raw_response_sha256"]}
    else:
        parsed = receipt(
            evidence, step, source_sha256=header["source_sha256"],
            evidence_run_id=header["evidence_run_id"],
            not_before_utc=header["created_utc"])
        classification = "READONLY_PASS" if step != "qualification" else "QA_SYNTHETIC_CLEAN_PASS"
        summary = {"receipt_status": parsed["status"]}
    details = {"step": step, "evidence_sha256": sha256_file(evidence),
               "origin": "MCP_TRANSCRIPT_COPIED_BY_CODEX",
               "classification": classification, **summary}
    record = append_record(once, log, run_id, "EVIDENCE_INGESTED", details)
    if step == "apply_response" and classification == "RESULT_UNKNOWN":
        status = "COMMIT_DESCONOCIDO"
        next_action = "RECONCILIACION_READONLY_SIN_RETRY"
    elif step == "apply_response" and classification == "ERROR_DEFINITE":
        status = "APPLY_FALLO_DEFINITIVO"
        next_action = "STOP_SIN_RETRY"
    else:
        status = "EVIDENCE_ACCEPTED"
        next_action = INGEST_ORDER[len(ingested) + 1] if len(ingested) + 1 < len(INGEST_ORDER) else "finalize"
    return {"status": status, "run_id": run_id,
            "record_sha256": record["record_sha256"],
            "next_action": next_action, "network": False}


def finalize(repo: Path, run_id: str, output: Path) -> dict[str, Any]:
    once, log = log_paths(repo)
    header, rows, chain_head = verify_log(once, log)
    if header["run_id"] != run_id:
        raise Stop("run_id no coincide")
    ingested_rows = [row for row in rows if row.get("event") == "EVIDENCE_INGESTED"]
    if [row["details"].get("step") for row in ingested_rows] != INGEST_ORDER:
        raise Stop("no estan todas las evidencias en orden")
    apply_class = ingested_rows[0]["details"].get("result_class")
    reconcile_status = ingested_rows[1]["details"].get("receipt_status")
    if apply_class not in {"SUCCESS_CONFIRMED", "RESULT_UNKNOWN"}:
        raise Stop("apply no fue confirmado")
    if reconcile_status != "ALQ_F1A_RECONCILE_COMMIT_CONFIRMED":
        raise Stop("reconciliacion no confirma commit")
    migration_evidence_sha = ingested_rows[-1]["details"]["evidence_sha256"]
    result = {
        "schema_version": 1,
        "status": "INSTALADO_QA_PENDIENTE_ESPEJO_MIGRACION",
        "run_id": run_id, "target_ref": QA_REF,
        "production_ref_denied": PROD_REF,
        "migration_name": MIGRATION_NAME,
        "source_sha256": header["source_sha256"],
        "evidence_run_id": header["evidence_run_id"],
        "bundle_lock_sha256": header["bundle_lock_sha256"],
        "migration_evidence_sha256": migration_evidence_sha,
        "ledger_chain_head": chain_head,
        "apply_attempts": events(rows).count("APPLY_ATTEMPTED"),
        "automatic_retries": 0, "network": False,
    }
    if result["apply_attempts"] != 1:
        raise Stop("cantidad de intentos apply distinta de uno")
    target = safe_output(repo, output)
    create_exclusive(target, json_bytes(result))
    append_record(once, log, run_id, "FINALIZED_PENDING_MIRROR", {
        "receipt_sha256": sha256_file(target),
        "status": result["status"],
    })
    return result


def parser() -> argparse.ArgumentParser:
    root = argparse.ArgumentParser()
    root.add_argument("--repo", type=Path)
    sub = root.add_subparsers(dest="command", required=True)
    check = sub.add_parser("build-check")
    check.add_argument("--bundle-lock", type=Path, required=True)
    ready = sub.add_parser("execution-readiness")
    ready.add_argument("--bundle-lock", type=Path, required=True)
    ready.add_argument("--publication-receipt", type=Path, required=True)
    ready.add_argument("--connector-attestation", type=Path, required=True)
    ready.add_argument("--execution-authorization", type=Path, required=True)
    armed = sub.add_parser("arm")
    armed.add_argument("--bundle-lock", type=Path, required=True)
    armed.add_argument("--publication-receipt", type=Path, required=True)
    armed.add_argument("--connector-attestation", type=Path, required=True)
    armed.add_argument("--execution-authorization", type=Path, required=True)
    armed.add_argument("--pre-evidence", type=Path, required=True)
    armed.add_argument("--ack", required=True)
    attempt = sub.add_parser("mark-apply-attempt")
    attempt.add_argument("--run-id", required=True)
    take = sub.add_parser("ingest")
    take.add_argument("--run-id", required=True)
    take.add_argument("--step", choices=INGEST_ORDER, required=True)
    take.add_argument("--evidence", type=Path, required=True)
    done = sub.add_parser("finalize")
    done.add_argument("--run-id", required=True)
    done.add_argument("--output", type=Path, required=True)
    return root


def main() -> int:
    args = parser().parse_args()
    repo = repo_root(args.repo)
    if args.command == "build-check":
        result = build_check(repo, args.bundle_lock)
    elif args.command == "execution-readiness":
        result = readiness(repo, args.bundle_lock, args.publication_receipt,
                           args.connector_attestation, args.execution_authorization)
    elif args.command == "arm":
        result = arm(repo, args)
    elif args.command == "mark-apply-attempt":
        result = mark_attempt(repo, require_run_id(args.run_id))
    elif args.command == "ingest":
        result = ingest(repo, require_run_id(args.run_id), args.step, args.evidence)
    else:
        result = finalize(repo, require_run_id(args.run_id), args.output)
    print(json.dumps(result, ensure_ascii=False, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Stop as exc:
        print(f"STOP ALQ F1-A COORDINADOR: {exc}", file=os.sys.stderr)
        raise SystemExit(2)
