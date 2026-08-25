#!/usr/bin/env python3
"""Utilidades locales, deliberadamente sin red, para el paquete ALQ F1-A.

Este modulo no conoce credenciales ni endpoints.  Solo valida bytes locales,
ejecuta binarios PostgreSQL que el caller ya fijo y escribe evidencia local de
forma fail-closed.
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import stat
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable


SHA256_RE = re.compile(r"^[0-9a-f]{64}$")
RUN_ID_RE = re.compile(r"^[0-9a-f]{32}$")
MODE_RE = re.compile(r"^[0-7]{4}$")
QA_REF = "rsjwqmpseknvydistgfr"
PROD_REF = "wajkfydxutptcvvfwrvq"
PG17_ASSET_URL_RE = re.compile(
    r"^https://github\.com/PostgresApp/PostgresApp/releases/download/v2\.8\.5/[^/?#]+$"
)
BUNDLE_ROLES = {
    "authority", "baseline", "forward_source", "verification_sql",
    "rollback_sql", "consumer", "harness", "schema", "documentation",
    "cloud_input",
}

# Inventario minimo y exacto del paquete que puede llegar al coordinador.  La
# lista vive en codigo (ademas de la documentacion humana) para que un package
# spec recortado no pueda auto-declararse completo.  Agregar o retirar una ruta
# exige cambiar, auditar y volver a sellar este modulo.
REQUIRED_BUNDLE_PATHS = frozenset({
    ".gitignore",
    "admin/alquileres-admin-qa.html",
    "admin/alquileres-franjas-qa.html",
    "docs/auditorias/AUDITORIA-CODEX-AUTORIDAD-ALQ-F1A-PRE-CONSTRUCCION-2026-08-21.md",
    "docs/auditorias/SELLO-CLOUD-ENCARGO-ALQ-F1A-2026-08-21.md",
    "docs/auditorias/alq-f1a/AUDITORIA-CODEX-PRE-EJECUCION-ALQ-F1A-2026-08-21.md",
    "docs/auditorias/alq-f1a/CATALOGO-45-OPERACIONES-ALQ-F1A-2026-08-21.md",
    "docs/auditorias/alq-f1a/CONDICION-RETIRO-RPC-V1-ALQ-F1A-2026-08-21.md",
    "docs/auditorias/alq-f1a/DECISION-ALCANCE-ALQ-F1A-F1B-2026-08-21.md",
    "docs/auditorias/alq-f1a/INVENTARIO-ARTEFACTOS-ALQ-F1A-2026-08-21.md",
    "docs/auditorias/alq-f1a/INVENTARIO-EDGE-FUNCTIONS-ALQ-F1A-2026-08-21.md",
    "docs/auditorias/alq-f1a/MANIFIESTO-BORRADOR-ALQ-F1A-2026-08-21.md",
    "docs/auditorias/alq-f1a/MATRIZ-PRUEBAS-ALQ-F1A-2026-08-21.md",
    "docs/auditorias/alq-f1a/MATRIZ-RLS-ALQ-F1A-2026-08-21.md",
    "docs/auditorias/alq-f1a/REESTIMACION-ALQ-F1A-2026-08-21.md",
    "docs/auditorias/alq-f1a/RUNBOOK-COMPUERTAS-ALQ-F1A-2026-08-21.md",
    "docs/auditorias/pruebas-alq-f1a/ALQ-F1A-CONCURRENCIA-LOCAL-CASES-2026-08-21.json",
    "docs/auditorias/pruebas-alq-f1a/ALQ-F1A-CONCURRENCIA-QA-CASE-2026-08-21.json",
    "docs/auditorias/pruebas-alq-f1a/ALQ-F1A-FIXTURE-PG17-SETUP-2026-08-21.py",
    "docs/auditorias/pruebas-alq-f1a/ALQ-F1A-FIXTURE-PG17-TEARDOWN-2026-08-21.py",
    "docs/auditorias/pruebas-alq-f1a/ALQ-F1A-GENERAR-BUNDLE-LOCK-2026-08-21.py",
    "docs/auditorias/pruebas-alq-f1a/ALQ-F1A-HARNESS-CONCURRENCIA-LOCAL-2026-08-21.py",
    "docs/auditorias/pruebas-alq-f1a/ALQ-F1A-HARNESS-CONCURRENCIA-QA-OFFLINE-2026-08-21.py",
    "docs/auditorias/pruebas-alq-f1a/ALQ-F1A-HARNESS-LOCAL-2026-08-21.py",
    "docs/auditorias/pruebas-alq-f1a/ALQ-F1A-RUNBOOK-MCP-QA-2026-08-21.md",
    "docs/auditorias/pruebas-alq-f1a/ALQ-F1A-SELLAR-RUNTIME-PG17-2026-08-21.py",
    "docs/auditorias/pruebas-alq-f1a/ALQ-F1A-TEST-COMPATIBILIDAD-UI-OFFLINE-2026-08-21.mjs",
    "docs/auditorias/pruebas-alq-f1a/ALQ-F1A-TEST-HARNESSES-OFFLINE-2026-08-21.py",
    "docs/auditorias/pruebas-alq-f1a/ALQ-F1A-VALIDAR-RECIBO-2026-08-21.py",
    "docs/auditorias/pruebas-alq-f1a/README.md",
    "docs/auditorias/pruebas-alq-f1a/alq_f1a_common.py",
    "docs/auditorias/pruebas-alq-f1a/schemas/alq-f1a-apply-transcript.schema.json",
    "docs/auditorias/pruebas-alq-f1a/schemas/alq-f1a-bundle-lock.schema.json",
    "docs/auditorias/pruebas-alq-f1a/schemas/alq-f1a-concurrency-case-spec.schema.json",
    "docs/auditorias/pruebas-alq-f1a/schemas/alq-f1a-connector-attestation.schema.json",
    "docs/auditorias/pruebas-alq-f1a/schemas/alq-f1a-execution-authorization.schema.json",
    "docs/auditorias/pruebas-alq-f1a/schemas/alq-f1a-publication-receipt.schema.json",
    "docs/auditorias/pruebas-alq-f1a/schemas/alq-f1a-qa-concurrency-case-spec.schema.json",
    "docs/auditorias/pruebas-alq-f1a/schemas/alq-f1a-receipt-contract.schema.json",
    "docs/auditorias/sql/ALQ-F1A-00-PRECHECK-READONLY-QA-2026-08-21.sql",
    "docs/auditorias/sql/ALQ-F1A-01-REGRESION-COMPLETA-LOCAL-2026-08-21.sql",
    "docs/auditorias/sql/ALQ-F1A-02-POSTCHECK-INSTALACION-READONLY-QA-2026-08-21.sql",
    "docs/auditorias/sql/ALQ-F1A-03-CALIFICACION-VIVA-Y-CLEANUP-QA-2026-08-21.sql",
    "docs/auditorias/sql/ALQ-F1A-04-POSTCHECK-FINAL-READONLY-QA-2026-08-21.sql",
    "docs/auditorias/sql/ALQ-F1A-99-ROLLBACK-QA-2026-08-21.sql",
    "docs/auditorias/sql/ALQ-F1A-COORDINADOR-OFFLINE-QA-2026-08-21.py",
    "docs/briefs/ADENDA-2-CODEX-PLAN-UNICO-ALQUILERES-V3-FRONTERA-F1A-F1B-2026-08-21.md",
    "docs/briefs/BRIEF-CLOUD-AUDITAR-ENCARGO-ALQ-F1A-QA-2026-08-21.md",
    "docs/briefs/BRIEF-CLOUD-AUDITAR-PAQUETE-ALQ-F1A-QA-2026-08-21.md",
    "docs/briefs/ENCARGO-CODEX-ALQ-F1A-GUARDAS-FINANCIERAS-Y-METODO-QA-2026-08-21.md",
    "supabase/baselines/alq_v1_qa_adoptado_20260821.sql",
    "supabase/migrations/_sources/alq_f1a_guardas_financieras_y_metodo.sql",
})


class Stop(RuntimeError):
    """Fallo cerrado del harness."""


def require_sha256(value: object, label: str = "sha256") -> str:
    if not isinstance(value, str) or SHA256_RE.fullmatch(value) is None:
        raise Stop(f"{label} no es SHA-256 hexadecimal")
    return value


def require_run_id(value: object) -> str:
    if not isinstance(value, str) or RUN_ID_RE.fullmatch(value) is None:
        raise Stop("run_id invalido")
    return value


def require_official_pg17_asset_url(value: object) -> str:
    if not isinstance(value, str) or PG17_ASSET_URL_RE.fullmatch(value) is None:
        raise Stop("asset PG17 no pertenece al release oficial PostgresApp v2.8.5")
    return value


def read_regular(path: Path, *, owner_uid: int | None = None,
                 max_bytes: int = 128 * 1024 * 1024) -> bytes:
    flags = os.O_RDONLY
    if hasattr(os, "O_NOFOLLOW"):
        flags |= os.O_NOFOLLOW
    try:
        fd = os.open(path, flags)
    except OSError as exc:
        raise Stop(f"no se pudo abrir de forma segura: {path}") from exc
    try:
        meta = os.fstat(fd)
        if not stat.S_ISREG(meta.st_mode):
            raise Stop(f"no es archivo regular: {path}")
        expected_uid = os.getuid() if owner_uid is None else owner_uid
        if meta.st_uid != expected_uid:
            raise Stop(f"owner inesperado: {path}")
        if meta.st_size > max_bytes:
            raise Stop(f"archivo excede limite: {path}")
        chunks: list[bytes] = []
        total = 0
        while True:
            chunk = os.read(fd, min(1024 * 1024, max_bytes - total + 1))
            if not chunk:
                break
            total += len(chunk)
            if total > max_bytes:
                raise Stop(f"archivo excede limite: {path}")
            chunks.append(chunk)
        return b"".join(chunks)
    finally:
        os.close(fd)


def sha256_bytes(payload: bytes) -> str:
    return hashlib.sha256(payload).hexdigest()


def sha256_file(path: Path, *, max_bytes: int = 1024 * 1024 * 1024) -> str:
    """Hashea en streaming un archivo regular local sin seguir symlinks."""
    flags = os.O_RDONLY
    if hasattr(os, "O_NOFOLLOW"):
        flags |= os.O_NOFOLLOW
    try:
        fd = os.open(path, flags)
    except OSError as exc:
        raise Stop(f"no se pudo abrir de forma segura para SHA: {path}") from exc
    digest = hashlib.sha256()
    try:
        meta = os.fstat(fd)
        if not stat.S_ISREG(meta.st_mode) or meta.st_uid != os.getuid():
            raise Stop(f"archivo SHA no regular o con owner inesperado: {path}")
        if meta.st_size > max_bytes:
            raise Stop(f"archivo excede limite de SHA: {path}")
        total = 0
        while True:
            chunk = os.read(fd, 1024 * 1024)
            if not chunk:
                break
            total += len(chunk)
            if total > max_bytes:
                raise Stop(f"archivo excede limite de SHA: {path}")
            digest.update(chunk)
    finally:
        os.close(fd)
    return digest.hexdigest()


def load_json(path: Path) -> dict[str, Any]:
    try:
        value = json.loads(read_regular(path).decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise Stop(f"JSON invalido: {path}") from exc
    if not isinstance(value, dict):
        raise Stop(f"JSON raiz no es objeto: {path}")
    return value


def json_bytes(value: object) -> bytes:
    return (json.dumps(value, ensure_ascii=False, sort_keys=True,
                       separators=(",", ":")) + "\n").encode("utf-8")


def write_all(fd: int, payload: bytes) -> None:
    offset = 0
    while offset < len(payload):
        written = os.write(fd, payload[offset:])
        if written <= 0:
            raise Stop("escritura local incompleta")
        offset += written


def fsync_parent(path: Path) -> None:
    fd = os.open(path.parent, os.O_RDONLY)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def create_exclusive(path: Path, payload: bytes, *, mode: int = 0o600) -> None:
    flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL
    if hasattr(os, "O_NOFOLLOW"):
        flags |= os.O_NOFOLLOW
    try:
        fd = os.open(path, flags, mode)
    except FileExistsError as exc:
        raise Stop(f"archivo one-shot ya existe: {path}") from exc
    try:
        os.fchmod(fd, mode)
        write_all(fd, payload)
        os.fsync(fd)
    finally:
        os.close(fd)
    fsync_parent(path)


def require_under_private_tmp(path: Path, *, must_exist: bool = True) -> Path:
    candidate = path.resolve(strict=must_exist)
    root = Path("/private/tmp").resolve(strict=True)
    try:
        candidate.relative_to(root)
    except ValueError as exc:
        raise Stop(f"ruta fuera de /private/tmp: {path}") from exc
    return candidate


def validate_bundle_lock(lock_path: Path, required_paths: Iterable[Path],
                         *, base_dir: Path | None = None,
                         require_complete: bool = True) -> dict[str, Any]:
    paths_to_validate = list(required_paths)
    lock = load_json(lock_path)
    if (lock.get("schema_version") != 1 or lock.get("target_ref") != QA_REF
            or lock.get("status") != "ALQ_F1A_BUNDLE_LOCKED_OFFLINE"
            or lock.get("network") is not False
            or lock.get("migration_name") != "alq_f1a_guardas_financieras_y_metodo"):
        raise Stop("bundle lock incompatible o no QA")
    if lock.get("production_ref_denied") != PROD_REF:
        raise Stop("bundle lock sin denylist de produccion")
    artifacts = lock.get("artifacts")
    if not isinstance(artifacts, list):
        raise Stop("bundle lock sin artifacts")
    indexed: dict[str, dict[str, Any]] = {}
    for row in artifacts:
        if not isinstance(row, dict) or not isinstance(row.get("path"), str):
            raise Stop("artifact invalido en bundle lock")
        if not isinstance(row.get("will_execute"), bool) or not isinstance(row.get("role"), str):
            raise Stop("artifact sin role/will_execute tipados")
        if row["role"] not in BUNDLE_ROLES:
            raise Stop("artifact con role no permitido")
        if (not isinstance(row.get("bytes"), int) or isinstance(row.get("bytes"), bool)
                or not isinstance(row.get("lines"), int) or isinstance(row.get("lines"), bool)
                or row["bytes"] < 0 or row["lines"] < 0
                or not isinstance(row.get("mode"), str)
                or MODE_RE.fullmatch(row["mode"]) is None):
            raise Stop("artifact sin bytes/lineas/modo tipados")
        if row["path"] in indexed:
            raise Stop(f"artifact duplicado: {row['path']}")
        require_sha256(row.get("sha256"), f"sha256:{row['path']}")
        indexed[row["path"]] = row
    if require_complete:
        actual_paths = set(indexed)
        if actual_paths != REQUIRED_BUNDLE_PATHS:
            missing = sorted(REQUIRED_BUNDLE_PATHS - actual_paths)
            extra = sorted(actual_paths - REQUIRED_BUNDLE_PATHS)
            raise Stop(
                "bundle incompleto o expandido fuera del inventario exacto; "
                f"faltan={missing}; sobran={extra}"
            )
        if base_dir is not None:
            supplied = {path.as_posix() for path in paths_to_validate if not path.is_absolute()}
            paths_to_validate.extend(
                Path(relative) for relative in sorted(REQUIRED_BUNDLE_PATHS - supplied)
            )
    for path in paths_to_validate:
        actual_path = path
        key = path.as_posix()
        if base_dir is not None:
            root = base_dir.resolve(strict=True)
            actual_path = path if path.is_absolute() else root / path
            if actual_path.is_symlink():
                raise Stop(f"ruta requerida no puede ser symlink: {path}")
            actual_resolved = actual_path.resolve(strict=True)
            try:
                key = actual_resolved.relative_to(root).as_posix()
            except ValueError as exc:
                raise Stop(f"ruta requerida fuera del repo: {path}") from exc
            actual_path = actual_resolved
        elif actual_path.is_symlink():
            raise Stop(f"ruta requerida no puede ser symlink: {path}")
        if key not in indexed:
            raise Stop(f"ruta no sellada en bundle lock: {key}")
        actual = sha256_file(actual_path)
        if actual != indexed[key]["sha256"]:
            raise Stop(f"SHA cambio: {key}")
        raw = read_regular(actual_path)
        if indexed[key]["bytes"] != len(raw):
            raise Stop(f"bytes cambiaron: {key}")
        lines = len(raw.splitlines())
        if indexed[key]["lines"] != lines:
            raise Stop(f"lineas cambiaron: {key}")
        mode = format(stat.S_IMODE(os.stat(actual_path, follow_symlinks=False).st_mode), "04o")
        if indexed[key]["mode"] != mode:
            raise Stop(f"modo cambio: {key}")
    return lock


def parse_utc(value: object, label: str) -> datetime:
    """Parsea un instante ISO-8601 consciente de zona y lo normaliza a UTC."""
    if not isinstance(value, str) or not value:
        raise Stop(f"{label} ausente")
    candidate = value[:-1] + "+00:00" if value.endswith("Z") else value
    try:
        parsed = datetime.fromisoformat(candidate)
    except ValueError as exc:
        raise Stop(f"{label} no es date-time ISO-8601") from exc
    if parsed.tzinfo is None or parsed.utcoffset() is None:
        raise Stop(f"{label} no declara zona horaria")
    return parsed.astimezone(timezone.utc)


def validate_evidence_binding(
        row: dict[str, Any], *, expected_source_sha256: str,
        expected_run_id: str, not_before_utc: object | None = None,
        now_utc: datetime | None = None,
        max_age_seconds: int = 900) -> datetime:
    """Liga evidencia remota a bytes/run sellados y rechaza evidencia vieja/futura."""
    expected_source = require_sha256(expected_source_sha256, "expected_source_sha256")
    expected_run = require_run_id(expected_run_id)
    if row.get("source_sha256") != expected_source:
        raise Stop("recibo no corresponde al SHA de la fuente sellada")
    if row.get("run_id") != expected_run:
        raise Stop("recibo no corresponde al evidence run_id sellado")
    captured = parse_utc(row.get("captured_utc"), "captured_utc")
    if not_before_utc is not None:
        not_before = parse_utc(not_before_utc, "not_before_utc")
        if captured < not_before:
            raise Stop("recibo anterior al inicio autorizado de esta corrida")
    current = (now_utc or datetime.now(timezone.utc)).astimezone(timezone.utc)
    if (not isinstance(max_age_seconds, int) or isinstance(max_age_seconds, bool)
            or max_age_seconds <= 0):
        raise Stop("max_age_seconds invalido")
    if (current - captured).total_seconds() > max_age_seconds:
        raise Stop(f"recibo tiene mas de {max_age_seconds} segundos")
    if captured > current.replace(microsecond=0) and (captured - current).total_seconds() > 120:
        raise Stop("captured_utc esta mas de 120 segundos en el futuro")
    return captured


def run_argv(argv: list[str], *, env: dict[str, str] | None = None,
             timeout: int = 120, cwd: Path | None = None) -> subprocess.CompletedProcess[str]:
    if not argv or any(not isinstance(item, str) or "\x00" in item for item in argv):
        raise Stop("argv invalido")
    try:
        return subprocess.run(argv, stdin=subprocess.DEVNULL,
                              stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                              text=True, encoding="utf-8", errors="replace",
                              env=env, cwd=cwd, timeout=timeout, check=False)
    except (OSError, subprocess.SubprocessError) as exc:
        raise Stop(f"no se pudo ejecutar {Path(argv[0]).name}: {type(exc).__name__}") from exc


def clean_pg_env(extra: dict[str, str] | None = None) -> dict[str, str]:
    env = dict(os.environ)
    for key in tuple(env):
        if key.startswith("PG") or key in {"PSQLRC", "HISTFILE"}:
            env.pop(key, None)
    env.update({"PGCLIENTENCODING": "UTF8", "HISTFILE": "/dev/null"})
    if extra:
        env.update(extra)
    return env
