# Config Examples

This page collects small JSON examples for tuning the CLI and model stack.

For feature lineage details, see [Feature Provenance](feature_provenance.md).

## Autoencoder Tuning Example

```json
{
  "apply_pca": false,
  "isolation_forest_contamination": 0.05,
  "autoencoder_latent_dim": 8,
  "autoencoder_threshold_percentile": 97.5,
  "autoencoder_dropout": 0.2,
  "autoencoder_learning_rate": 0.001,
  "autoencoder_batch_size": 32
}
```

Suggested starting points:

- `autoencoder_latent_dim`: `8` for compact representations, or `16` if the preprocessed feature space is wide
- `autoencoder_threshold_percentile`: `95.0` for a more sensitive cutoff, `97.5` as a balanced default, or `99.0` if you want to reduce false positives

## Deep SVDD Architecture Choice

```json
{
  "deep_svdd_architecture": "1d_cnn",
  "deep_svdd_nu": 0.05,
  "deep_svdd_pretrain_autoencoder": true
}
```

Use `mlp` when the input is mostly tabular and you want the simplest, fastest baseline.
Use `1d_cnn` when the feature order carries meaning or you want the model to capture short local patterns across adjacent engineered features or visit-history signals.

### CLI Equivalent

The same settings can be passed directly on the train command, for example:

```bash
anomaly-cli train --input data.csv --output model.joblib \
  --deep-svdd-architecture 1d_cnn \
  --deep-svdd-nu 0.05 \
  --deep-svdd-latent-dim 8 \
  --no-deep-svdd-pretrain-autoencoder
```

### Autoencoder CLI Equivalent

You can also tune the standalone autoencoder directly from the train command:

```bash
anomaly-cli train --input data.csv --output model.joblib \
  --autoencoder-latent-dim 8 \
  --autoencoder-threshold-percentile 97.5 \
  --autoencoder-dropout 0.2 \
  --autoencoder-learning-rate 0.001 \
  --autoencoder-batch-size 32
```

## Ensemble Fusion Weights

```json
{
  "ensemble_fusion_weights": {
    "isolation_forest": 0.3,
    "autoencoder": 0.4,
    "deep_svdd": 0.3
  }
}
```

If you leave out a detector, its weight defaults to `0.0`. The ensemble
normalizes the provided weights before fusing the min-max scaled scores.

## Max-Score Voting

```json
{
  "ensemble_fusion_strategy": "max_score_voting",
  "ensemble_max_score_threshold": 0.8
}
```

Use this mode when you want an alert if any detector is strongly activated.
The threshold applies to the per-model scores after min-max normalization.

### CLI Equivalent

You can set the same behavior directly on the train command:

```bash
anomaly-cli train --input data.csv --output model.joblib \
  --ensemble-fusion-strategy max_score_voting \
  --ensemble-max-score-threshold 0.8
```

## Stacking Fusion

```json
{
  "ensemble_fusion_strategy": "stacking"
}
```

Use stacking when you have a small labeled set and want a lightweight
logistic-regression meta-classifier trained on the normalized Isolation Forest,
autoencoder, and Deep SVDD scores.

### Training Note

Stacking requires labeled targets during training, for example:

```python
pipeline.fit(training_df, labels)
```

If the labels live inside the training table, pass `--label-column label` to
the CLI and the training code will use that column as the stacking target.
If the labels are in a separate file, pass `--labels-file labels.csv` and, if
needed, `--labels-column label`.

### Separate Labels Example

```bash
anomaly-cli train --input train.csv --output model.joblib \
  --ensemble-fusion-strategy stacking \
  --labels-file labels.csv \
  --labels-column label
```

## Evaluation Report Bundle

Use `--report-prefix` when you want the evaluator to emit JSON, Markdown, and
HTML files from a single base path:

```bash
anomaly-cli evaluate --input predictions.csv \
  --labels-file labels.csv \
  --labels-column label \
  --report-prefix artifacts/report
```

That command writes:

- `artifacts/report.json`
- `artifacts/report.md`
- `artifacts/report.html`

If you only need one format, you can still use `--output`, `--report-md`, or
`--report-html` directly.

## Runtime Comparison Output

When the scorer runs on a saved model, the scored rows include runtime
metadata that feeds the evaluation report. A compact example looks like this:

```json
{
  "training_time_seconds": 12.84,
  "training_time_ms": 12840.0,
  "model_size_bytes": 48231552,
  "estimated_ram_usage_bytes": 121634816,
  "inference_batch_latency_ms": 18.7,
  "inference_latency_ms_per_patient": 9.4,
  "inference_throughput_rows_per_second": 106.3,
  "critical_for_edge_deployment": true,
  "edge_readiness_status": "ready",
  "edge_readiness_checks": {
    "latency_ok": true,
    "model_size_ok": true,
    "ram_ok": true
  }
}
```

Interpretation:

- `critical_for_edge_deployment` tells you whether the edge-readiness checks
  are present in the report.
- `edge_readiness_status` is `ready`, `needs_optimization`, or `not_ready`.
- The three checks are simple deployment guardrails for latency, model size,
  and RAM footprint.
