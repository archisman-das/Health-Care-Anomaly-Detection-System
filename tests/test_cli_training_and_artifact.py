import argparse
import contextlib
import io
import json
import tempfile
import unittest
from pathlib import Path

import pandas as pd

from rural_health_anomaly.cli import run_predict, run_retrain_feedback, run_train
from rural_health_anomaly.training import _risk_level_from_score, load_pipeline


class CliTrainingAndArtifactTests(unittest.TestCase):
    def _write_csv(self, path: Path, frame: pd.DataFrame) -> None:
        frame.to_csv(path, index=False)

    def _build_training_frame(self) -> pd.DataFrame:
        return pd.DataFrame(
            {
                "patient_id": ["P1", "P1", "P2"],
                "recorded_at": [
                    "2026-06-01T09:00:00+05:30",
                    "2026-06-08T09:00:00+05:30",
                    "2026-06-03T10:15:00+05:30",
                ],
                "age_years": [54, 54, 61],
                "gender": ["female", "female", "male"],
                "location_type": ["clinic", "clinic", "home_visit"],
                "source_type": ["device", "manual", "device"],
                "operator_id": ["N1", "N1", "N2"],
                "device_id": ["D1", "D1", "D2"],
                "measurement_posture": ["sitting", "sitting", "standing"],
                "data_quality_flag": ["ok", "ok", "suspect"],
                "comorbidities": [
                    ["diabetes", "hypertension"],
                    ["diabetes"],
                    ["tb"],
                ],
                "current_medications": [
                    ["metformin", "amlodipine"],
                    ["metformin"],
                    ["isoniazid"],
                ],
                "days_between_visits_trend": [[14, 21, 30], [7, 14], [30, 45]],
                "visits_last_90_days": [3, 4, 2],
                "symptom_duration_days": [12, 11, 8],
                "heart_rate_bpm": [78, 81, 92],
                "systolic_bp_mmhg": [118, 120, 136],
                "diastolic_bp_mmhg": [76, 78, 88],
                "glucose_fasting_mg_dl": [92, 110, 140],
                "measurement_context": ["resting", "resting", "follow-up"],
                "notes": ["", "", ""],
            }
        )

    def _build_inference_frame(self) -> pd.DataFrame:
        return pd.DataFrame(
            {
                "patient_id": ["P3", "P3"],
                "recorded_at": [
                    "2026-06-10T09:00:00+05:30",
                    "2026-06-17T09:00:00+05:30",
                ],
                "age_years": [57, 57],
                "gender": ["female", "female"],
                "location_type": ["clinic", "clinic"],
                "source_type": ["device", "manual"],
                "operator_id": ["N3", "N3"],
                "device_id": ["D3", "D3"],
                "measurement_posture": ["sitting", "sitting"],
                "data_quality_flag": ["ok", "ok"],
                "comorbidities": [["diabetes"], ["diabetes"]],
                "current_medications": [["metformin"], ["metformin"]],
                "days_between_visits_trend": [[10, 20], [7, 14]],
                "visits_last_90_days": [2, 3],
                "symptom_duration_days": [6, 5],
                "heart_rate_bpm": [84, 88],
                "systolic_bp_mmhg": [126, 132],
                "diastolic_bp_mmhg": [80, 84],
                "glucose_fasting_mg_dl": [124, 130],
                "measurement_context": ["follow-up", "follow-up"],
                "notes": ["", ""],
            }
        )

    def test_train_cli_saves_model_and_feature_map(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            tmpdir_path = Path(tmpdir)
            train_path = tmpdir_path / "train.csv"
            model_path = tmpdir_path / "model.joblib"
            feature_map_path = tmpdir_path / "feature_map.csv"
            config_path = tmpdir_path / "config.json"

            self._write_csv(train_path, self._build_training_frame())
            config_path.write_text(
                json.dumps({"apply_pca": False, "knn_neighbors": 2, "scaler": "standard"}),
                encoding="utf-8",
            )

            args = argparse.Namespace(
                input=str(train_path),
                output=str(model_path),
                feature_map=str(feature_map_path),
                config_json=str(config_path),
            )

            with contextlib.redirect_stdout(io.StringIO()):
                run_train(args)

            self.assertTrue(model_path.exists())
            self.assertTrue(feature_map_path.exists())

            pipeline = load_pipeline(model_path)
            self.assertIn("preprocessor", pipeline.named_steps)
            self.assertIn("model", pipeline.named_steps)

            feature_map = pipeline.named_steps["preprocessor"].export_feature_map()
            self.assertIn("source_columns", feature_map.columns)
            self.assertIn("transformation_path", feature_map.columns)
            self.assertGreater(len(feature_map), 0)

    def test_predict_cli_writes_scored_csv(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            tmpdir_path = Path(tmpdir)
            train_path = tmpdir_path / "train.csv"
            infer_path = tmpdir_path / "infer.csv"
            model_path = tmpdir_path / "model.joblib"
            output_path = tmpdir_path / "predictions.csv"
            config_path = tmpdir_path / "config.json"

            self._write_csv(train_path, self._build_training_frame())
            self._write_csv(infer_path, self._build_inference_frame())
            config_path.write_text(
                json.dumps({"apply_pca": False, "knn_neighbors": 2, "scaler": "standard"}),
                encoding="utf-8",
            )

            train_args = argparse.Namespace(
                input=str(train_path),
                output=str(model_path),
                feature_map=None,
                config_json=str(config_path),
            )
            with contextlib.redirect_stdout(io.StringIO()):
                run_train(train_args)

            predict_args = argparse.Namespace(
                model=str(model_path),
                input=str(infer_path),
                output=str(output_path),
            )
            with contextlib.redirect_stdout(io.StringIO()):
                run_predict(predict_args)

            self.assertTrue(output_path.exists())

            scored = pd.read_csv(output_path)
            self.assertIn("isolation_forest_anomaly_score", scored.columns)
            self.assertIn("one_class_svm_anomaly_score", scored.columns)
            self.assertIn("local_outlier_factor_anomaly_score", scored.columns)
            self.assertIn("autoencoder_anomaly_score", scored.columns)
            self.assertIn("autoencoder_reconstruction_error", scored.columns)
            self.assertIn("autoencoder_reconstruction_mae", scored.columns)
            self.assertIn("deep_svdd_distance", scored.columns)
            self.assertIn("raw_anomaly_score", scored.columns)
            self.assertIn("anomaly_score", scored.columns)
            self.assertIn("risk_level", scored.columns)
            self.assertIn("risk_score", scored.columns)
            self.assertIn("alert_triggered", scored.columns)
            self.assertIn("anomaly_flag", scored.columns)
            self.assertIn("is_anomaly", scored.columns)
            self.assertIn("training_time_seconds", scored.columns)
            self.assertIn("training_time_ms", scored.columns)
            self.assertIn("model_size_bytes", scored.columns)
            self.assertIn("estimated_ram_usage_bytes", scored.columns)
            self.assertIn("inference_batch_latency_ms", scored.columns)
            self.assertIn("inference_latency_ms_per_patient", scored.columns)
            self.assertIn("inference_throughput_rows_per_second", scored.columns)
            self.assertEqual(len(scored), 2)

    def test_predict_cli_assigns_risk_levels_from_score_thresholds(self):
        self.assertEqual(_risk_level_from_score(0.0), "Low")
        self.assertEqual(_risk_level_from_score(0.39), "Low")
        self.assertEqual(_risk_level_from_score(0.4), "Medium")
        self.assertEqual(_risk_level_from_score(0.69), "Medium")
        self.assertEqual(_risk_level_from_score(0.7), "High")
        self.assertEqual(_risk_level_from_score(1.0), "High")

    def test_predict_cli_includes_autoencoder_score_columns(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            tmpdir_path = Path(tmpdir)
            train_path = tmpdir_path / "train.csv"
            infer_path = tmpdir_path / "infer.csv"
            model_path = tmpdir_path / "model.joblib"
            output_path = tmpdir_path / "predictions.csv"
            config_path = tmpdir_path / "config.json"

            self._write_csv(train_path, self._build_training_frame())
            self._write_csv(infer_path, self._build_inference_frame())
            config_path.write_text(
                json.dumps(
                    {
                        "apply_pca": False,
                        "autoencoder_latent_dim": 8,
                        "autoencoder_threshold_percentile": 97.5,
                    }
                ),
                encoding="utf-8",
            )

            train_args = argparse.Namespace(
                input=str(train_path),
                output=str(model_path),
                feature_map=None,
                config_json=str(config_path),
            )
            with contextlib.redirect_stdout(io.StringIO()):
                run_train(train_args)

            predict_args = argparse.Namespace(
                model=str(model_path),
                input=str(infer_path),
                output=str(output_path),
            )
            with contextlib.redirect_stdout(io.StringIO()):
                run_predict(predict_args)

            scored = pd.read_csv(output_path)
            self.assertIn("autoencoder_anomaly_score", scored.columns)
            self.assertIn("autoencoder_reconstruction_error", scored.columns)
            self.assertIn("autoencoder_reconstruction_mae", scored.columns)

    def test_retrain_feedback_cli_rebuilds_model_from_clinician_ledger(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            tmpdir_path = Path(tmpdir)
            train_path = tmpdir_path / "train.csv"
            feedback_path = tmpdir_path / "feedback.jsonl"
            output_path = tmpdir_path / "retrained.joblib"
            config_path = tmpdir_path / "config.json"

            self._write_csv(train_path, self._build_training_frame())
            config_path.write_text(
                json.dumps({"apply_pca": False, "knn_neighbors": 2, "scaler": "standard"}),
                encoding="utf-8",
            )

            feedback_record = {
                "patient": self._build_inference_frame().iloc[0].to_dict(),
                "prediction": {"anomaly_score": 0.93, "risk_level": "High"},
                "is_true_positive": True,
                "reviewer": "clinician-a",
                "notes": "Confirmed anomaly during follow-up.",
            }
            feedback_path.write_text(json.dumps(feedback_record) + "\n", encoding="utf-8")

            args = argparse.Namespace(
                input=str(train_path),
                feedback_file=str(feedback_path),
                output=str(output_path),
                config_json=str(config_path),
            )

            with contextlib.redirect_stdout(io.StringIO()):
                run_retrain_feedback(args)

            self.assertTrue(output_path.exists())
            retrained = load_pipeline(output_path)
            self.assertIn("preprocessor", retrained.named_steps)
            self.assertIn("model", retrained.named_steps)


if __name__ == "__main__":
    unittest.main()
