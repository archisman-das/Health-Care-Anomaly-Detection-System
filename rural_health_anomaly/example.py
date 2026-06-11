"""Example training and inference flow for the rural health anomaly package."""

from __future__ import annotations

import numpy as np
import pandas as pd

from . import PreprocessingConfig, build_anomaly_pipeline


def build_training_data() -> pd.DataFrame:
    return pd.DataFrame(
        {
            "patient_id": ["P1", "P1", "P2", "P2", "P3"],
            "recorded_at": [
                "2026-06-01T09:00:00+05:30",
                "2026-06-08T09:00:00+05:30",
                "2026-06-03T10:15:00+05:30",
                "2026-06-10T10:15:00+05:30",
                "2026-06-12T11:30:00+05:30",
            ],
            "age_years": [54, 54, 61, 61, 43],
            "gender": ["female", "female", "male", "male", "female"],
            "location_type": ["clinic", "clinic", "home_visit", "clinic", "clinic"],
            "source_type": ["device", "manual", "device", "device", "manual"],
            "operator_id": ["N1", "N1", "N2", "N2", "N3"],
            "device_id": ["D1", "D1", "D2", "D2", "D3"],
            "measurement_posture": ["sitting", "sitting", "standing", "standing", "sitting"],
            "data_quality_flag": ["ok", "ok", "ok", "suspect", "ok"],
            "malaria_prevalence_level": ["moderate", "moderate", "high", "high", "low"],
            "dengue_prevalence_level": ["high", "high", "moderate", "moderate", "low"],
            "comorbidities": [
                ["diabetes", "hypertension"],
                ["diabetes", "hypertension"],
                ["tb"],
                ["tb"],
                ["hypertension"],
            ],
            "current_medications": [
                ["metformin", "amlodipine"],
                ["metformin", "amlodipine"],
                ["isoniazid"],
                ["isoniazid"],
                ["amlodipine"],
            ],
            "days_between_visits_trend": [[14, 21, 30], [7, 14, 21], [30, 45], [30, 42], [10, 20]],
            "visits_last_90_days": [3, 4, 2, 3, 5],
            "symptom_duration_days": [12, 11, 8, 10, 4],
            "sanitation_index": [0.72, 0.71, 0.55, 0.52, 0.81],
            "nutritional_score": [68, 67, 59, 58, 74],
            "distance_to_nearest_facility_km": [4.6, 4.6, 8.2, 8.2, 2.1],
            "treatment_response_score": [0.80, 0.82, 0.61, 0.58, 0.90],
            "readmission_frequency": [2, 2, 1, 1, 0],
            "drug_adherence_rate": [0.92, 0.94, 0.71, 0.69, 0.98],
            "heart_rate_bpm": [78, 81, 92, 95, 74],
            "systolic_bp_mmhg": [118, 120, 136, 140, 112],
            "diastolic_bp_mmhg": [76, 78, 88, 90, 72],
            "spo2_percent": [97.0, 96.0, 94.0, 93.0, 98.0],
            "body_temperature_c": [36.8, 36.7, 37.4, 37.5, 36.6],
            "respiratory_rate_bpm": [16, 16, 18, 19, 15],
            "weight_kg": [64.2, 64.0, 70.1, 70.0, 58.4],
            "height_cm": [168.0, 168.0, 172.0, 172.0, 160.0],
            "bmi_kg_m2": [22.7, 22.7, 23.7, 23.7, 22.8],
            "glucose_fasting_mg_dl": [92, 110, 140, 138, 88],
            "glucose_postprandial_mg_dl": [128, 142, 180, 176, 120],
            "hb_g_dl": [13.4, 13.3, 12.2, 12.0, 14.0],
            "wbc_count_10e9_l": [6.2, 6.4, 8.1, 8.4, 5.8],
            "platelets_10e9_l": [240, 238, 180, 175, 260],
            "hba1c_percent": [6.1, 6.2, 7.2, 7.3, 5.8],
            "ldl_mg_dl": [102, 100, 128, 130, 95],
            "hdl_mg_dl": [48, 49, 42, 41, 55],
            "triglycerides_mg_dl": [156, 158, 210, 214, 110],
            "alt_u_l": [28, 29, 36, 38, 22],
            "ast_u_l": [24, 25, 33, 34, 20],
            "bilirubin_mg_dl": [0.8, 0.8, 1.1, 1.0, 0.6],
            "creatinine_mg_dl": [1.0, 1.0, 1.2, 1.2, 0.8],
            "bun_mg_dl": [14, 15, 18, 19, 11],
            "egfr_ml_min_1_73m2": [92, 92, 74, 73, 105],
            "sodium_mmol_l": [138, 139, 136, 135, 140],
            "potassium_mmol_l": [4.2, 4.1, 4.7, 4.8, 4.0],
            "calcium_mg_dl": [9.4, 9.5, 9.0, 8.9, 9.8],
            "measurement_context": ["resting", "resting", "follow-up", "follow-up", "baseline"],
            "notes": ["", "", "", "", ""],
        }
    )


def build_inference_data() -> pd.DataFrame:
    return pd.DataFrame(
        {
            "patient_id": ["P4", "P4"],
            "recorded_at": [
                "2026-06-14T09:10:00+05:30",
                "2026-06-21T09:10:00+05:30",
            ],
            "age_years": [57, 57],
            "gender": ["female", "female"],
            "location_type": ["clinic", "clinic"],
            "source_type": ["device", "manual"],
            "operator_id": ["N4", "N4"],
            "device_id": ["D4", "D4"],
            "measurement_posture": ["sitting", "sitting"],
            "data_quality_flag": ["ok", "ok"],
            "malaria_prevalence_level": ["moderate", "moderate"],
            "dengue_prevalence_level": ["high", "high"],
            "comorbidities": [["diabetes"], ["diabetes"]],
            "current_medications": [["metformin"], ["metformin"]],
            "days_between_visits_trend": [[14, 21, 30], [7, 14, 21]],
            "visits_last_90_days": [2, 3],
            "symptom_duration_days": [6, 5],
            "sanitation_index": [0.69, 0.70],
            "nutritional_score": [65, 66],
            "distance_to_nearest_facility_km": [5.1, 5.1],
            "treatment_response_score": [0.74, 0.76],
            "readmission_frequency": [1, 1],
            "drug_adherence_rate": [0.88, 0.90],
            "heart_rate_bpm": [84, 88],
            "systolic_bp_mmhg": [126, 132],
            "diastolic_bp_mmhg": [80, 84],
            "spo2_percent": [95.0, 94.0],
            "body_temperature_c": [36.9, 37.1],
            "respiratory_rate_bpm": [17, 18],
            "weight_kg": [66.0, 65.8],
            "height_cm": [165.0, 165.0],
            "bmi_kg_m2": [24.2, 24.1],
            "glucose_fasting_mg_dl": [124, 130],
            "glucose_postprandial_mg_dl": [166, 172],
            "hb_g_dl": [12.8, 12.6],
            "wbc_count_10e9_l": [7.1, 7.2],
            "platelets_10e9_l": [210, 208],
            "hba1c_percent": [6.8, 6.9],
            "ldl_mg_dl": [114, 116],
            "hdl_mg_dl": [46, 45],
            "triglycerides_mg_dl": [172, 176],
            "alt_u_l": [30, 31],
            "ast_u_l": [27, 28],
            "bilirubin_mg_dl": [0.7, 0.7],
            "creatinine_mg_dl": [0.9, 0.9],
            "bun_mg_dl": [13, 13],
            "egfr_ml_min_1_73m2": [88, 87],
            "sodium_mmol_l": [137, 137],
            "potassium_mmol_l": [4.3, 4.2],
            "calcium_mg_dl": [9.2, 9.1],
            "measurement_context": ["follow-up", "follow-up"],
            "notes": ["", ""],
        }
    )


def main() -> None:
    training_df = build_training_data()
    inference_df = build_inference_data()

    config = PreprocessingConfig(
        interaction_terms=(
            ("age_years", "glucose_fasting_mg_dl"),
            ("bmi_kg_m2", "systolic_bp_mmhg"),
            ("drug_adherence_rate", "visits_last_90_days"),
        ),
        scaler="standard",
        apply_pca=True,
    )

    pipeline = build_anomaly_pipeline(config)
    pipeline.fit(training_df)

    feature_map = pipeline.named_steps["preprocessor"].export_feature_map()
    print("\nFeature map:")
    print(feature_map.head(20).to_string(index=False))

    anomaly_scores = pipeline.decision_function(inference_df)
    anomaly_flags = pipeline.predict(inference_df)

    results = inference_df[["patient_id", "recorded_at"]].copy()
    results["anomaly_score"] = anomaly_scores
    results["anomaly_flag"] = anomaly_flags
    results["is_anomaly"] = results["anomaly_flag"].map({1: False, -1: True})

    print(results.to_string(index=False))


if __name__ == "__main__":
    main()
