import io
import unittest
from contextlib import redirect_stdout

from example_training_inference import (
    build_inference_data,
    build_training_data,
    main as example_main,
)
from rural_health_anomaly import PreprocessingConfig, build_anomaly_pipeline
from rural_health_anomaly.common_interface_demo import main as common_interface_demo_main


class ExamplePipelineTests(unittest.TestCase):
    def test_example_pipeline_trains_and_scores(self):
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
        self.assertFalse(feature_map.empty)
        self.assertIn("final_feature", feature_map.columns)

        scores = pipeline.decision_function(inference_df)
        flags = pipeline.predict(inference_df)

        self.assertEqual(len(scores), len(inference_df))
        self.assertEqual(len(flags), len(inference_df))
        self.assertTrue(set(flags).issubset({1, -1}))

    def test_example_main_runs_without_error(self):
        buffer = io.StringIO()
        with redirect_stdout(buffer):
            example_main()

        output = buffer.getvalue()
        self.assertIn("Feature map:", output)
        self.assertIn("anomaly_score", output)

    def test_common_interface_demo_runs_without_error(self):
        buffer = io.StringIO()
        with redirect_stdout(buffer):
            common_interface_demo_main()

        output = buffer.getvalue()
        self.assertIn("model", output)
        self.assertIn("mean_score", output)
        self.assertIn("deep_svdd", output)


if __name__ == "__main__":
    unittest.main()
