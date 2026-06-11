from __future__ import annotations

import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

from rural_health_anomaly import PreprocessingConfig
from rural_health_anomaly.edge_export import export_edge_bundle
from rural_health_anomaly.example import build_training_data
from rural_health_anomaly.training import train_anomaly_pipeline


class EdgeExportTests(unittest.TestCase):
    @unittest.skipUnless(
        importlib.util.find_spec("onnx") is not None and importlib.util.find_spec("skl2onnx") is not None,
        "onnx export dependencies are not installed",
    )
    def test_export_edge_bundle_writes_manifest_and_onnx_files(self):
        config = PreprocessingConfig(
            apply_pca=False,
            deep_svdd_pretrain_autoencoder=False,
        )
        pipeline = train_anomaly_pipeline(build_training_data(), config=config)

        with tempfile.TemporaryDirectory() as tmpdir:
            output_dir = Path(tmpdir)
            exported = export_edge_bundle(pipeline, output_dir)

            manifest_path = output_dir / "edge_bundle_manifest.json"
            isolation_path = output_dir / "isolation_forest.onnx"
            autoencoder_path = output_dir / "autoencoder.onnx"
            deep_svdd_path = output_dir / "deep_svdd.onnx"
            preprocessor_path = output_dir / "preprocessor.joblib"

            self.assertTrue(manifest_path.exists())
            self.assertTrue(isolation_path.exists())
            self.assertTrue(autoencoder_path.exists())
            self.assertTrue(deep_svdd_path.exists())
            self.assertTrue(preprocessor_path.exists())
            self.assertTrue((output_dir / "feature_map.csv").exists())
            self.assertTrue((output_dir / "feature_map.json").exists())

            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            self.assertIn("artifacts", manifest)
            self.assertIn("isolation_forest", manifest["artifacts"])
            self.assertIn("autoencoder", manifest["artifacts"])
            self.assertIn("deep_svdd", manifest["artifacts"])
            self.assertEqual(Path(exported["manifest"]).name, manifest_path.name)
            self.assertEqual(Path(exported["autoencoder_onnx"]).name, autoencoder_path.name)


if __name__ == "__main__":
    unittest.main()
