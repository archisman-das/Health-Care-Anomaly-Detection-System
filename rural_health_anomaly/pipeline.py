"""Model pipeline builders."""

from __future__ import annotations

from sklearn.pipeline import Pipeline

from .config import PreprocessingConfig
from .ensemble import ParallelAnomalyEnsemble
from .preprocessing import HealthcarePreprocessor


def _build_anomaly_ensemble(config: PreprocessingConfig) -> ParallelAnomalyEnsemble:
    """Build the parallel anomaly ensemble from config."""

    return ParallelAnomalyEnsemble(
        contamination=config.isolation_forest_contamination,
        n_jobs=config.ensemble_n_jobs,
        fusion_strategy=config.ensemble_fusion_strategy,
        max_score_threshold=config.ensemble_max_score_threshold,
        fusion_weights=config.ensemble_fusion_weights,
        isolation_forest_n_estimators=config.isolation_forest_n_estimators,
        isolation_forest_max_samples=config.isolation_forest_max_samples,
        isolation_forest_max_features=config.isolation_forest_max_features,
        isolation_forest_bootstrap=config.isolation_forest_bootstrap,
        isolation_forest_random_state=config.isolation_forest_random_state,
        isolation_forest_n_jobs=config.isolation_forest_n_jobs,
        one_class_svm_nu=config.one_class_svm_nu,
        one_class_svm_kernel=config.one_class_svm_kernel,
        one_class_svm_gamma=config.one_class_svm_gamma,
        local_outlier_factor_n_neighbors=config.local_outlier_factor_n_neighbors,
        local_outlier_factor_contamination=config.local_outlier_factor_contamination,
        local_outlier_factor_n_jobs=config.local_outlier_factor_n_jobs,
        autoencoder_latent_dim=config.autoencoder_latent_dim,
        autoencoder_dropout=config.autoencoder_dropout,
        autoencoder_learning_rate=config.autoencoder_learning_rate,
        autoencoder_batch_size=config.autoencoder_batch_size,
        autoencoder_threshold_percentile=config.autoencoder_threshold_percentile,
        autoencoder_validation_fraction=config.autoencoder_validation_fraction,
        autoencoder_max_epochs=config.autoencoder_max_epochs,
        autoencoder_patience=config.autoencoder_patience,
        autoencoder_l2=config.autoencoder_l2,
        autoencoder_random_state=config.autoencoder_random_state,
        autoencoder_verbose=config.autoencoder_verbose,
        deep_svdd_nu=config.deep_svdd_nu,
        deep_svdd_center_fixed=config.deep_svdd_center_fixed,
        deep_svdd_architecture=config.deep_svdd_architecture,
        deep_svdd_latent_dim=config.deep_svdd_latent_dim,
        deep_svdd_learning_rate=config.deep_svdd_learning_rate,
        deep_svdd_batch_size=config.deep_svdd_batch_size,
        deep_svdd_max_epochs=config.deep_svdd_max_epochs,
        deep_svdd_validation_fraction=config.deep_svdd_validation_fraction,
        deep_svdd_pretrain_autoencoder=config.deep_svdd_pretrain_autoencoder,
        deep_svdd_pretrain_epochs=config.deep_svdd_pretrain_epochs,
        deep_svdd_pretrain_dropout=config.deep_svdd_pretrain_dropout,
        deep_svdd_pretrain_learning_rate=config.deep_svdd_pretrain_learning_rate,
        deep_svdd_pretrain_batch_size=config.deep_svdd_pretrain_batch_size,
        deep_svdd_random_state=config.deep_svdd_random_state,
        deep_svdd_verbose=config.deep_svdd_verbose,
    )


def build_anomaly_pipeline(
    config: PreprocessingConfig | None = None,
    estimator=None,
) -> Pipeline:
    """Build a scikit-learn Pipeline with preprocessing plus anomaly model."""

    config = config or PreprocessingConfig()
    estimator = estimator or _build_anomaly_ensemble(config)

    return Pipeline(
        steps=[
            ("preprocessor", HealthcarePreprocessor(config)),
            ("model", estimator),
        ]
    )
