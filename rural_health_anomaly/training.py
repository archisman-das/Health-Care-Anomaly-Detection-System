"""Training helpers for the rural health anomaly pipeline."""

from __future__ import annotations

import ast
import json
import pickle
import sys
import time
from pathlib import Path
from typing import Any

import joblib
import pandas as pd

from .config import PreprocessingConfig
from .pipeline import build_anomaly_pipeline
from .schema import (
    SCHEMA_LIST_NUMERIC_FEATURES,
    SCHEMA_MULTI_VALUE_FEATURES,
)

_DEFAULT_DATETIME_COLUMNS = ("recorded_at", "specimen_time")
_LIST_COLUMNS = tuple(SCHEMA_MULTI_VALUE_FEATURES + SCHEMA_LIST_NUMERIC_FEATURES)


def _risk_level_from_score(score: float) -> str:
    if score < 0.4:
        return "Low"
    if score < 0.7:
        return "Medium"
    return "High"


def _estimate_object_size_bytes(obj: Any) -> int:
    """Estimate an object's memory footprint recursively."""

    seen: set[int] = set()

    def _walk(value: Any) -> int:
        object_id = id(value)
        if object_id in seen:
            return 0
        seen.add(object_id)

        size = sys.getsizeof(value)
        if hasattr(value, "nbytes"):
            try:
                size = max(size, int(value.nbytes))
            except Exception:
                pass

        if isinstance(value, dict):
            for key, item in value.items():
                size += _walk(key)
                size += _walk(item)
        elif isinstance(value, (list, tuple, set, frozenset)):
            for item in value:
                size += _walk(item)
        elif hasattr(value, "__dict__"):
            size += _walk(vars(value))
        elif hasattr(value, "__slots__"):
            for slot in value.__slots__:  # type: ignore[attr-defined]
                if hasattr(value, slot):
                    size += _walk(getattr(value, slot))

        return int(size)

    return _walk(obj)


def _coerce_list_cell(value: Any) -> Any:
    """Normalize list-like strings into Python lists.

    CSV exports often serialize lists as JSON strings or comma-separated text.
    This helper converts the common representations into actual Python lists so
    downstream preprocessing can expand them consistently.
    """

    if value is None or (isinstance(value, float) and pd.isna(value)):
        return None

    if isinstance(value, (list, tuple, set)):
        return list(value)

    if isinstance(value, str):
        text = value.strip()
        if not text:
            return None

        if text.lower() in {"none", "null", "nan"}:
            return None

        if text.startswith("[") and text.endswith("]"):
            try:
                parsed = ast.literal_eval(text)
                if isinstance(parsed, (list, tuple, set)):
                    return list(parsed)
            except (ValueError, SyntaxError):
                try:
                    parsed = json.loads(text)
                    if isinstance(parsed, list):
                        return parsed
                except json.JSONDecodeError:
                    pass

        if "," in text:
            return [part.strip() for part in text.split(",") if part.strip()]

    return value


def _normalize_scalar_cell(value: Any) -> Any:
    """Normalize common missing-value sentinels in scalar cells."""

    if value is None or (isinstance(value, float) and pd.isna(value)):
        return None

    if isinstance(value, str):
        text = value.strip()
        if not text or text.lower() in {"none", "null", "nan"}:
            return None
        return text

    return value


def _normalize_loaded_frame(data: pd.DataFrame) -> pd.DataFrame:
    """Normalize common CSV/Parquet ingest quirks into schema-friendly types."""

    frame = data.copy()
    frame.columns = [str(column).strip() for column in frame.columns]

    for column in _DEFAULT_DATETIME_COLUMNS:
        if column in frame.columns:
            frame[column] = pd.to_datetime(frame[column], errors="coerce")

    for column in _LIST_COLUMNS:
        if column in frame.columns:
            frame[column] = frame[column].apply(_coerce_list_cell)

    for column in frame.columns:
        if column in _LIST_COLUMNS:
            continue
        if pd.api.types.is_object_dtype(frame[column]) or pd.api.types.is_string_dtype(frame[column]):
            frame[column] = frame[column].apply(_normalize_scalar_cell)

    return frame


def load_tabular_data(path: str | Path) -> pd.DataFrame:
    """Load training or inference data from CSV or Parquet.

    The loader applies a small schema-aware normalization pass so the rest of
    the pipeline can consume list-like fields and timestamps consistently.
    """

    input_path = Path(path)
    suffix = input_path.suffix.lower()

    if suffix == ".csv":
        data = pd.read_csv(input_path, low_memory=False)
        return _normalize_loaded_frame(data)
    if suffix == ".parquet":
        data = pd.read_parquet(input_path)
        return _normalize_loaded_frame(data)

    raise ValueError("Unsupported input format. Use .csv or .parquet.")


def train_anomaly_pipeline(
    data: pd.DataFrame,
    *,
    y: Any | None = None,
    config: PreprocessingConfig | None = None,
):
    """Fit the end-to-end anomaly pipeline on a dataframe."""

    pipeline = build_anomaly_pipeline(config)
    start = time.perf_counter()
    pipeline.fit(data, y)
    elapsed = time.perf_counter() - start
    pipeline.training_time_seconds_ = float(elapsed)
    pipeline.training_time_ms_ = float(elapsed * 1000.0)
    pipeline.training_sample_count_ = int(len(data))
    pipeline.model_serialized_size_bytes_ = int(len(pickle.dumps(pipeline, protocol=pickle.HIGHEST_PROTOCOL)))
    pipeline.model_estimated_ram_usage_bytes_ = int(_estimate_object_size_bytes(pipeline))
    if len(data) > 0:
        sample_size = min(25, len(data))
        pipeline.explain_background_ = data.sample(n=sample_size, random_state=42).copy() if len(data) > sample_size else data.copy()
    return pipeline


def save_pipeline(pipeline, output_path: str | Path) -> None:
    """Persist a trained pipeline to disk."""

    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(pipeline, output_path)


def load_pipeline(path: str | Path):
    """Load a trained pipeline from disk."""

    return joblib.load(Path(path))


def score_records(pipeline, data: pd.DataFrame) -> pd.DataFrame:
    """Return anomaly scores and flags for a batch of records."""

    model = pipeline.named_steps["model"]
    batch_start = time.perf_counter()
    transformed = pipeline.named_steps["preprocessor"].transform(data)
    raw_scores = model.raw_anomaly_score(transformed)
    decision_margin = pipeline.decision_function(data)
    flags = pipeline.predict(data)
    batch_elapsed = time.perf_counter() - batch_start
    per_patient_latency_ms = float((batch_elapsed / max(len(data), 1)) * 1000.0)
    batch_latency_ms = float(batch_elapsed * 1000.0)

    output = data.copy()
    if hasattr(model, "score_components"):
        output = pd.concat([output, model.score_components(transformed)], axis=1)
    if hasattr(model, "estimators_") and "autoencoder" in model.estimators_:
        autoencoder = model.estimators_["autoencoder"]
        output["autoencoder_reconstruction_error"] = autoencoder.reconstruction_error(transformed)
        output["autoencoder_reconstruction_mae"] = autoencoder.reconstruction_mae(transformed)
    if hasattr(model, "estimators_") and "deep_svdd" in model.estimators_:
        deep_svdd = model.estimators_["deep_svdd"]
        output["deep_svdd_distance"] = deep_svdd.latent_distance(transformed)
    output["raw_anomaly_score"] = raw_scores
    output["anomaly_score"] = raw_scores
    output["risk_level"] = output["anomaly_score"].apply(lambda value: _risk_level_from_score(float(value)))
    output["risk_score"] = output["anomaly_score"]
    output["alert_triggered"] = output["risk_level"].isin(["Medium", "High"])
    output["decision_margin"] = decision_margin
    output["anomaly_flag"] = flags
    output["is_anomaly"] = output["anomaly_flag"].map({1: False, -1: True})
    output["training_time_seconds"] = getattr(pipeline, "training_time_seconds_", float("nan"))
    output["training_time_ms"] = getattr(pipeline, "training_time_ms_", float("nan"))
    output["model_size_bytes"] = getattr(pipeline, "model_serialized_size_bytes_", float("nan"))
    output["estimated_ram_usage_bytes"] = getattr(pipeline, "model_estimated_ram_usage_bytes_", float("nan"))
    output["inference_batch_latency_ms"] = batch_latency_ms
    output["inference_latency_ms_per_patient"] = per_patient_latency_ms
    output["inference_throughput_rows_per_second"] = float(len(data) / batch_elapsed) if batch_elapsed > 0 else float("inf")
    return output
