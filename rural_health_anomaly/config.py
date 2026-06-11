"""Configuration objects for preprocessing and training."""

from dataclasses import dataclass, field

from .schema import (
    SCHEMA_CATEGORICAL_FEATURES,
    SCHEMA_LIST_NUMERIC_FEATURES,
    SCHEMA_MULTI_VALUE_FEATURES,
    SCHEMA_NUMERIC_FEATURES,
)


@dataclass
class PreprocessingConfig:
    """Configuration for the preprocessing pipeline."""

    patient_id_col: str = "patient_id"
    encounter_time_col: str = "recorded_at"
    numeric_features: list[str] = field(default_factory=lambda: SCHEMA_NUMERIC_FEATURES.copy())
    categorical_features: list[str] = field(default_factory=lambda: SCHEMA_CATEGORICAL_FEATURES.copy())
    multi_value_features: list[str] = field(default_factory=lambda: SCHEMA_MULTI_VALUE_FEATURES.copy())
    list_numeric_features: list[str] = field(default_factory=lambda: SCHEMA_LIST_NUMERIC_FEATURES.copy())
    rolling_windows_days: tuple[int, ...] = (7, 30)
    lag_steps: tuple[int, ...] = (1,)
    interaction_terms: tuple[tuple[str, str], ...] = ()
    scaler: str = "standard"  # "standard" or "minmax"
    apply_pca: bool = True
    pca_feature_threshold: int = 50
    pca_variance_threshold: float = 0.95
    knn_neighbors: int = 5
    ensemble_n_jobs: int = -1
    ensemble_fusion_strategy: str = "weighted_average"
    ensemble_max_score_threshold: float = 0.8
    ensemble_fusion_weights: dict[str, float] | None = None
    isolation_forest_n_estimators: int = 300
    isolation_forest_contamination: float = 0.05
    isolation_forest_max_samples: int | str = "auto"
    isolation_forest_max_features: float = 1.0
    isolation_forest_bootstrap: bool = False
    isolation_forest_random_state: int = 42
    isolation_forest_n_jobs: int = -1
    one_class_svm_nu: float | None = None
    one_class_svm_kernel: str = "rbf"
    one_class_svm_gamma: str | float = "scale"
    local_outlier_factor_n_neighbors: int = 20
    local_outlier_factor_contamination: float | None = None
    local_outlier_factor_n_jobs: int = -1
    autoencoder_latent_dim: int = 8
    autoencoder_dropout: float = 0.2
    autoencoder_learning_rate: float = 1e-3
    autoencoder_batch_size: int = 32
    autoencoder_threshold_percentile: float = 97.5
    autoencoder_validation_fraction: float = 0.2
    autoencoder_max_epochs: int = 80
    autoencoder_patience: int = 10
    autoencoder_l2: float = 1e-5
    autoencoder_random_state: int = 42
    autoencoder_verbose: bool = False
    deep_svdd_nu: float = 0.05
    deep_svdd_center_fixed: bool = True
    deep_svdd_architecture: str = "mlp"
    deep_svdd_latent_dim: int = 8
    deep_svdd_learning_rate: float = 1e-3
    deep_svdd_batch_size: int = 32
    deep_svdd_max_epochs: int = 60
    deep_svdd_validation_fraction: float = 0.2
    deep_svdd_pretrain_autoencoder: bool = True
    deep_svdd_pretrain_epochs: int = 25
    deep_svdd_pretrain_dropout: float = 0.2
    deep_svdd_pretrain_learning_rate: float = 1e-3
    deep_svdd_pretrain_batch_size: int = 32
    deep_svdd_random_state: int = 42
    deep_svdd_verbose: bool = False
