"""FastAPI backend for real-time rural health anomaly predictions."""

from __future__ import annotations

import io
import os
from pathlib import Path
from typing import Any

import pandas as pd
from fastapi import Depends, FastAPI, File, Header, HTTPException, UploadFile, status
from fastapi.encoders import jsonable_encoder

from .feedback import append_feedback_records
from .training import load_pipeline, score_records


def _score_payload(pipeline, payload: dict[str, Any] | list[dict[str, Any]]) -> pd.DataFrame:
    frame = pd.DataFrame(payload if isinstance(payload, list) else [payload])
    if frame.empty:
        raise HTTPException(status_code=400, detail="Request body must include at least one patient record.")
    return score_records(pipeline, frame)


async def _score_csv_upload(pipeline, file: UploadFile) -> dict[str, Any]:
    filename = file.filename or ""
    if filename and not filename.lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="Only CSV uploads are supported for CSV batch scoring.")

    contents = await file.read()
    if not contents:
        raise HTTPException(status_code=400, detail="Uploaded CSV file is empty.")

    try:
        frame = pd.read_csv(io.BytesIO(contents))
    except Exception as exc:  # pragma: no cover - handled by API response
        raise HTTPException(status_code=400, detail=f"Unable to parse CSV upload: {exc}") from exc

    if frame.empty:
        raise HTTPException(status_code=400, detail="Uploaded CSV file must contain at least one row.")

    scored = score_records(pipeline, frame)
    return {
        "filename": filename,
        "count": int(len(scored)),
        "predictions": jsonable_encoder(scored.to_dict(orient="records")),
    }


def _build_explanation_rows(
    *,
    feature_names: list[str],
    values: list[float],
    top_k: int,
    feature_map: pd.DataFrame,
    method: str,
) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    feature_lookup = feature_map.set_index("final_feature") if not feature_map.empty and "final_feature" in feature_map.columns else None
    ranked_indices = sorted(range(len(values)), key=lambda idx: abs(values[idx]), reverse=True)[: max(1, int(top_k))]
    for idx in ranked_indices:
        feature_name = feature_names[idx]
        row: dict[str, Any] = {
            "feature": feature_name,
            "shap_value": float(values[idx]),
            "absolute_shap_value": float(abs(values[idx])),
            "method": method,
        }
        if feature_lookup is not None and feature_name in feature_lookup.index:
            meta = feature_lookup.loc[feature_name]
            row["source_columns"] = meta["source_columns"]
            row["feature_type"] = meta.get("feature_type")
        rows.append(row)
    return rows


def _compute_feature_explanation(
    pipeline,
    patient: dict[str, Any],
    *,
    top_k: int = 10,
) -> dict[str, Any]:
    frame = pd.DataFrame([patient])
    preprocessor = pipeline.named_steps["preprocessor"]
    model = pipeline.named_steps["model"]
    transformed_patient = preprocessor.transform(frame)
    feature_names = list(preprocessor.get_feature_names_out())
    feature_map = preprocessor.export_feature_map()
    background_raw = getattr(pipeline, "explain_background_", frame)
    background_transformed = preprocessor.transform(background_raw)

    method = "ablation_fallback"
    values: list[float]

    try:  # pragma: no cover - exercised when shap is available
        import shap  # type: ignore

        explainer = shap.KernelExplainer(lambda x: model.score(x), background_transformed)
        shap_values = explainer.shap_values(transformed_patient, nsamples=min(100, max(20, transformed_patient.shape[1] * 2)))
        if isinstance(shap_values, list):
            shap_values = shap_values[0]
        values = [float(value) for value in shap_values[0].tolist()]
        method = "shap_kernel"
    except Exception:
        reference = background_transformed.mean(axis=0, keepdims=True)
        base_score = float(model.score(transformed_patient)[0])
        values = []
        for idx in range(transformed_patient.shape[1]):
            ablated = transformed_patient.copy()
            ablated[0, idx] = reference[0, idx]
            ablated_score = float(model.score(ablated)[0])
            values.append(base_score - ablated_score)

    rows = _build_explanation_rows(
        feature_names=feature_names,
        values=values,
        top_k=top_k,
        feature_map=feature_map,
        method=method,
    )
    return {
        "method": method,
        "top_k": int(top_k),
        "background_size": int(len(background_raw)),
        "feature_explanations": rows,
    }


def _explain_most_anomalous_record(
    pipeline,
    frame: pd.DataFrame,
    *,
    top_k: int = 10,
) -> dict[str, Any]:
    if frame.empty:
        raise HTTPException(status_code=400, detail="Uploaded CSV file must contain at least one row.")

    scored = score_records(pipeline, frame)
    best_index = int(scored["anomaly_score"].astype(float).idxmax())
    patient = frame.iloc[best_index].to_dict()
    explanation = _compute_feature_explanation(pipeline, patient, top_k=top_k)
    explanation["row_index"] = best_index
    explanation["anomaly_score"] = float(scored.iloc[best_index]["anomaly_score"])
    explanation["risk_level"] = scored.iloc[best_index].get("risk_level")
    explanation["alert_triggered"] = bool(scored.iloc[best_index].get("alert_triggered"))
    return {
        "selected_row_index": best_index,
        "prediction": jsonable_encoder(scored.iloc[best_index].to_dict()),
        "explanation": explanation,
    }


def _explain_batch_records(
    pipeline,
    patients: list[dict[str, Any]],
    *,
    top_k: int = 10,
) -> dict[str, Any]:
    scored = _score_payload(pipeline, patients)
    results: list[dict[str, Any]] = []
    for index, patient in enumerate(patients):
        explanation = _compute_feature_explanation(pipeline, patient, top_k=top_k)
        results.append(
            {
                "patient_index": index,
                "prediction": jsonable_encoder(scored.iloc[index].to_dict()),
                "explanation": explanation,
            }
        )
    return {"count": len(results), "results": results}


def _model_metadata(app: FastAPI) -> dict[str, Any]:
    model = app.state.pipeline.named_steps["model"]
    preprocessor = app.state.pipeline.named_steps["preprocessor"]
    return {
        "model_path": app.state.model_path,
        "model_type": type(model).__name__,
        "feature_count": len(getattr(preprocessor, "feature_columns_", [])),
        "feature_output_count": len(preprocessor.get_feature_names_out()) if getattr(preprocessor, "fitted_", False) else None,
    }


def _csv_upload_openapi_example(summary: str) -> dict[str, Any]:
    return {
        "requestBody": {
            "content": {
                "multipart/form-data": {
                    "schema": {
                        "type": "object",
                        "properties": {
                            "file": {
                                "type": "string",
                                "format": "binary",
                            }
                        },
                        "required": ["file"],
                    },
                    "examples": {
                        "sampleCsv": {
                            "summary": summary,
                            "value": {
                                "file": (
                                    "patient_id,age_years,glucose_fasting_mg_dl,"
                                    "heart_rate_bpm,systolic_bp_mmhg,diastolic_bp_mmhg\n"
                                    "P001,54,118,84,126,80\n"
                                    "P002,61,176,92,148,94\n"
                                )
                            },
                        }
                    },
                }
            }
        }
    }


def _build_token_dependency(expected_token: str | None):
    def _require_token(x_api_token: str | None = Header(default=None, alias="X-API-Token")) -> None:
        if expected_token is None:
            return
        if x_api_token != expected_token:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Missing or invalid X-API-Token header.",
            )

    return _require_token


def create_app(
    model_path: str | Path,
    *,
    title: str = "Rural Health Anomaly API",
    auth_token: str | None = None,
    feedback_store: str | Path | None = None,
) -> FastAPI:
    """Create a FastAPI app backed by a saved anomaly pipeline."""

    resolved_model_path = Path(model_path)
    pipeline = load_pipeline(resolved_model_path)
    auth_dependency = _build_token_dependency(auth_token)

    app = FastAPI(
        title=title,
        version="1.0.0",
        description="Real-time anomaly scoring for rural health patient records.",
    )
    app.state.pipeline = pipeline
    app.state.model_path = str(resolved_model_path)
    app.state.auth_token_enabled = auth_token is not None
    default_feedback_store = resolved_model_path.with_name("feedback_ledger.jsonl")
    app.state.feedback_store_path = str(Path(feedback_store) if feedback_store is not None else default_feedback_store)

    @app.get("/health", dependencies=[Depends(auth_dependency)])
    def health() -> dict[str, Any]:
        return {
            "status": "ok",
            **_model_metadata(app),
        }

    @app.get("/models", dependencies=[Depends(auth_dependency)])
    def models() -> dict[str, Any]:
        return {
            "count": 1,
            "models": [_model_metadata(app)],
        }

    @app.get("/feedback", dependencies=[Depends(auth_dependency)])
    def feedback_overview() -> dict[str, Any]:
        store_path = Path(app.state.feedback_store_path)
        if not store_path.exists():
            return {"path": str(store_path), "count": 0, "exists": False}
        with store_path.open("r", encoding="utf-8") as handle:
            count = sum(1 for line in handle if line.strip())
        return {"path": str(store_path), "count": count, "exists": True}

    @app.post("/predict", dependencies=[Depends(auth_dependency)])
    def predict(patient: dict[str, Any]) -> dict[str, Any]:
        scored = _score_payload(app.state.pipeline, patient)
        record = jsonable_encoder(scored.iloc[0].to_dict())
        return {
            "input": jsonable_encoder(patient),
            "prediction": record,
            "anomaly_score": record.get("anomaly_score"),
            "risk_level": record.get("risk_level"),
            "alert_triggered": record.get("alert_triggered"),
            "is_anomaly": record.get("is_anomaly"),
        }

    @app.post("/batch-predict", dependencies=[Depends(auth_dependency)])
    def batch_predict(patients: list[dict[str, Any]]) -> dict[str, Any]:
        scored = _score_payload(app.state.pipeline, patients)
        return {
            "count": int(len(scored)),
            "predictions": jsonable_encoder(scored.to_dict(orient="records")),
        }

    @app.post(
        "/predict_file",
        dependencies=[Depends(auth_dependency)],
        openapi_extra=_csv_upload_openapi_example("CSV file for batch scoring"),
    )
    async def predict_file(file: UploadFile = File(...)) -> dict[str, Any]:
        return await _score_csv_upload(app.state.pipeline, file)

    @app.post("/batch", dependencies=[Depends(auth_dependency)])
    async def batch(file: UploadFile = File(...)) -> dict[str, Any]:
        return await _score_csv_upload(app.state.pipeline, file)

    @app.post("/explain", dependencies=[Depends(auth_dependency)])
    async def explain(patient: dict[str, Any], top_k: int = 10) -> dict[str, Any]:
        scored = _score_payload(app.state.pipeline, patient)
        record = jsonable_encoder(scored.iloc[0].to_dict())
        explanation = _compute_feature_explanation(app.state.pipeline, patient, top_k=top_k)
        return {
            "input": jsonable_encoder(patient),
            "prediction": record,
            "explanation": explanation,
        }

    @app.post(
        "/explain_file",
        dependencies=[Depends(auth_dependency)],
        openapi_extra=_csv_upload_openapi_example("CSV file for explanation"),
    )
    async def explain_file(file: UploadFile = File(...), top_k: int = 10) -> dict[str, Any]:
        filename = file.filename or ""
        if filename and not filename.lower().endswith(".csv"):
            raise HTTPException(status_code=400, detail="Only CSV uploads are supported for /explain_file.")

        contents = await file.read()
        if not contents:
            raise HTTPException(status_code=400, detail="Uploaded CSV file is empty.")

        try:
            frame = pd.read_csv(io.BytesIO(contents))
        except Exception as exc:  # pragma: no cover - handled by API response
            raise HTTPException(status_code=400, detail=f"Unable to parse CSV upload: {exc}") from exc

        result = _explain_most_anomalous_record(app.state.pipeline, frame, top_k=top_k)
        result["filename"] = filename
        return result

    @app.post("/explain_batch", dependencies=[Depends(auth_dependency)])
    async def explain_batch(
        patients: list[dict[str, Any]],
        top_k: int = 10,
    ) -> dict[str, Any]:
        if not patients:
            raise HTTPException(status_code=400, detail="At least one patient record is required.")
        return _explain_batch_records(app.state.pipeline, patients, top_k=top_k)

    @app.post("/feedback", dependencies=[Depends(auth_dependency)])
    async def feedback(review: dict[str, Any]) -> dict[str, Any]:
        store_path = Path(app.state.feedback_store_path)
        count = append_feedback_records(store_path, [review])
        return {
            "count": count,
            "path": str(store_path),
            "message": "Feedback recorded for periodic retraining.",
        }

    @app.post("/feedback_batch", dependencies=[Depends(auth_dependency)])
    async def feedback_batch(reviews: list[dict[str, Any]]) -> dict[str, Any]:
        if not reviews:
            raise HTTPException(status_code=400, detail="At least one feedback record is required.")
        store_path = Path(app.state.feedback_store_path)
        count = append_feedback_records(store_path, reviews)
        return {
            "count": count,
            "path": str(store_path),
            "message": "Feedback batch recorded for periodic retraining.",
        }

    return app


def main() -> None:
    import argparse
    import uvicorn

    parser = argparse.ArgumentParser(description="Serve the rural health anomaly FastAPI backend.")
    parser.add_argument("--model", required=True, help="Path to a saved anomaly pipeline (.joblib).")
    parser.add_argument(
        "--auth-token",
        default=None,
        help="Optional shared secret required in the X-API-Token header for every request.",
    )
    parser.add_argument(
        "--feedback-store",
        default=None,
        help="Optional JSONL path to append clinician feedback records for periodic retraining.",
    )
    parser.add_argument("--host", default="127.0.0.1", help="Host interface to bind the API server to.")
    parser.add_argument("--port", type=int, default=8001, help="TCP port to serve the API on.")
    parser.add_argument("--reload", action=argparse.BooleanOptionalAction, default=False, help="Enable Uvicorn auto-reload.")
    args = parser.parse_args()

    auth_token = args.auth_token or os.getenv("API_AUTH_TOKEN")
    app = create_app(args.model, auth_token=auth_token, feedback_store=args.feedback_store)
    uvicorn.run(app, host=args.host, port=args.port, reload=args.reload)


if __name__ == "__main__":
    main()
