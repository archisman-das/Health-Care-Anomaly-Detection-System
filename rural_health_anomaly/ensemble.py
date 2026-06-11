"""Parallel anomaly ensemble estimators."""

from __future__ import annotations

from collections import OrderedDict
from typing import Any

import numpy as np
import pandas as pd
from sklearn.base import BaseEstimator, OutlierMixin, clone
from sklearn.linear_model import LogisticRegression
from sklearn.utils.parallel import Parallel, delayed

from .autoencoder import DeepAutoencoder
from .deep_svdd import DeepSVDD
from .detectors import (
    IsolationForestAnomalyModel,
    LocalOutlierFactorAnomalyModel,
    OneClassSVMAnomalyModel,
)


def _ensure_2d_array(X: Any) -> np.ndarray:
    array = np.asarray(X, dtype=float)
    if array.ndim != 2:
        raise ValueError("Expected a 2D array-like input.")
    return array


def _fit_estimator(estimator, X: np.ndarray):
    return clone(estimator).fit(X)


def _normalized_anomaly_scores(estimator, X: np.ndarray) -> np.ndarray:
    if hasattr(estimator, "score"):
        return np.asarray(estimator.score(X), dtype=float)
    if hasattr(estimator, "reconstruction_error"):
        raw = np.asarray(estimator.reconstruction_error(X), dtype=float)
        if hasattr(estimator, "_training_raw_score_mean_") and hasattr(estimator, "_training_raw_score_std_"):
            return (raw - estimator._training_raw_score_mean_) / estimator._training_raw_score_std_
        return raw
    if hasattr(estimator, "decision_function"):
        raw = -np.asarray(estimator.decision_function(X), dtype=float)
        return raw
    if hasattr(estimator, "score_samples"):
        raw = -np.asarray(estimator.score_samples(X), dtype=float)
        return raw
    raise AttributeError(
        f"{type(estimator).__name__} does not expose score, reconstruction_error, decision_function, or score_samples."
    )


def _minmax_scale(scores: np.ndarray) -> tuple[np.ndarray, float, float]:
    minimum = float(np.min(scores))
    maximum = float(np.max(scores))
    scale = maximum - minimum
    if scale == 0.0 or np.isnan(scale):
        scale = 1.0
    scaled = (scores - minimum) / scale
    return np.clip(scaled, 0.0, 1.0), minimum, maximum


def _coerce_binary_labels(y: Any) -> np.ndarray:
    labels = np.asarray(y)
    if labels.ndim != 1:
        labels = labels.reshape(-1)
    if labels.size == 0:
        raise ValueError("Stacking requires at least one labeled sample.")
    if labels.dtype == bool:
        return labels.astype(int)
    unique_values = set(np.unique(labels).tolist())
    if unique_values.issubset({0, 1}):
        return labels.astype(int)
    if unique_values.issubset({-1, 1}):
        return np.where(labels == -1, 1, 0).astype(int)
    raise ValueError("Stacking labels must be binary, using 1/-1 or 0/1 conventions.")


class ParallelAnomalyEnsemble(BaseEstimator, OutlierMixin):
    """Fit five anomaly detectors in parallel and fuse their scores."""

    def __init__(
        self,
        *,
        contamination: float = 0.05,
        n_jobs: int = -1,
        fusion_strategy: str = "weighted_average",
        max_score_threshold: float = 0.8,
        fusion_weights: dict[str, float] | None = None,
        isolation_forest_n_estimators: int = 300,
        isolation_forest_max_samples: int | str = "auto",
        isolation_forest_max_features: float = 1.0,
        isolation_forest_bootstrap: bool = False,
        isolation_forest_random_state: int = 42,
        isolation_forest_n_jobs: int = -1,
        one_class_svm_nu: float | None = None,
        one_class_svm_kernel: str = "rbf",
        one_class_svm_gamma: str | float = "scale",
        local_outlier_factor_n_neighbors: int = 20,
        local_outlier_factor_contamination: float | None = None,
        local_outlier_factor_n_jobs: int = -1,
        autoencoder_latent_dim: int = 8,
        autoencoder_dropout: float = 0.2,
        autoencoder_learning_rate: float = 1e-3,
        autoencoder_batch_size: int = 32,
        autoencoder_threshold_percentile: float = 97.5,
        autoencoder_validation_fraction: float = 0.2,
        autoencoder_max_epochs: int = 80,
        autoencoder_patience: int = 10,
        autoencoder_l2: float = 1e-5,
        autoencoder_random_state: int = 42,
        autoencoder_verbose: bool = False,
        deep_svdd_nu: float = 0.05,
        deep_svdd_center_fixed: bool = True,
        deep_svdd_architecture: str = "mlp",
        deep_svdd_latent_dim: int = 8,
        deep_svdd_learning_rate: float = 1e-3,
        deep_svdd_batch_size: int = 32,
        deep_svdd_max_epochs: int = 60,
        deep_svdd_validation_fraction: float = 0.2,
        deep_svdd_pretrain_autoencoder: bool = True,
        deep_svdd_pretrain_epochs: int = 25,
        deep_svdd_pretrain_dropout: float = 0.2,
        deep_svdd_pretrain_learning_rate: float = 1e-3,
        deep_svdd_pretrain_batch_size: int = 32,
        deep_svdd_random_state: int = 42,
        deep_svdd_verbose: bool = False,
    ):
        self.contamination = contamination
        self.n_jobs = n_jobs
        self.fusion_strategy = fusion_strategy
        self.max_score_threshold = max_score_threshold
        self.fusion_weights = fusion_weights
        self.isolation_forest_n_estimators = isolation_forest_n_estimators
        self.isolation_forest_max_samples = isolation_forest_max_samples
        self.isolation_forest_max_features = isolation_forest_max_features
        self.isolation_forest_bootstrap = isolation_forest_bootstrap
        self.isolation_forest_random_state = isolation_forest_random_state
        self.isolation_forest_n_jobs = isolation_forest_n_jobs
        self.one_class_svm_nu = one_class_svm_nu
        self.one_class_svm_kernel = one_class_svm_kernel
        self.one_class_svm_gamma = one_class_svm_gamma
        self.local_outlier_factor_n_neighbors = local_outlier_factor_n_neighbors
        self.local_outlier_factor_contamination = local_outlier_factor_contamination
        self.local_outlier_factor_n_jobs = local_outlier_factor_n_jobs
        self.autoencoder_latent_dim = autoencoder_latent_dim
        self.autoencoder_dropout = autoencoder_dropout
        self.autoencoder_learning_rate = autoencoder_learning_rate
        self.autoencoder_batch_size = autoencoder_batch_size
        self.autoencoder_threshold_percentile = autoencoder_threshold_percentile
        self.autoencoder_validation_fraction = autoencoder_validation_fraction
        self.autoencoder_max_epochs = autoencoder_max_epochs
        self.autoencoder_patience = autoencoder_patience
        self.autoencoder_l2 = autoencoder_l2
        self.autoencoder_random_state = autoencoder_random_state
        self.autoencoder_verbose = autoencoder_verbose
        self.deep_svdd_nu = deep_svdd_nu
        self.deep_svdd_center_fixed = deep_svdd_center_fixed
        self.deep_svdd_architecture = deep_svdd_architecture
        self.deep_svdd_latent_dim = deep_svdd_latent_dim
        self.deep_svdd_learning_rate = deep_svdd_learning_rate
        self.deep_svdd_batch_size = deep_svdd_batch_size
        self.deep_svdd_max_epochs = deep_svdd_max_epochs
        self.deep_svdd_validation_fraction = deep_svdd_validation_fraction
        self.deep_svdd_pretrain_autoencoder = deep_svdd_pretrain_autoencoder
        self.deep_svdd_pretrain_epochs = deep_svdd_pretrain_epochs
        self.deep_svdd_pretrain_dropout = deep_svdd_pretrain_dropout
        self.deep_svdd_pretrain_learning_rate = deep_svdd_pretrain_learning_rate
        self.deep_svdd_pretrain_batch_size = deep_svdd_pretrain_batch_size
        self.deep_svdd_random_state = deep_svdd_random_state
        self.deep_svdd_verbose = deep_svdd_verbose

    def _build_estimators(self):
        nu = self.one_class_svm_nu if self.one_class_svm_nu is not None else self.contamination
        return OrderedDict(
            [
                (
                    "isolation_forest",
                    IsolationForestAnomalyModel(
                        n_estimators=self.isolation_forest_n_estimators,
                        contamination=self.contamination,
                        max_samples=self.isolation_forest_max_samples,
                        max_features=self.isolation_forest_max_features,
                        bootstrap=self.isolation_forest_bootstrap,
                        random_state=self.isolation_forest_random_state,
                        n_jobs=self.isolation_forest_n_jobs,
                    ),
                ),
                (
                    "one_class_svm",
                    OneClassSVMAnomalyModel(
                        nu=nu,
                        kernel=self.one_class_svm_kernel,
                        gamma=self.one_class_svm_gamma,
                    ),
                ),
                (
                    "local_outlier_factor",
                    LocalOutlierFactorAnomalyModel(
                        n_neighbors=self.local_outlier_factor_n_neighbors,
                        contamination=(
                            self.local_outlier_factor_contamination
                            if self.local_outlier_factor_contamination is not None
                            else self.contamination
                        ),
                        n_jobs=self.local_outlier_factor_n_jobs,
                    ),
                ),
                (
                    "autoencoder",
                    DeepAutoencoder(
                        latent_dim=self.autoencoder_latent_dim,
                        dropout=self.autoencoder_dropout,
                        learning_rate=self.autoencoder_learning_rate,
                        batch_size=self.autoencoder_batch_size,
                        threshold_percentile=self.autoencoder_threshold_percentile,
                        validation_fraction=self.autoencoder_validation_fraction,
                        max_epochs=self.autoencoder_max_epochs,
                        patience=self.autoencoder_patience,
                        l2=self.autoencoder_l2,
                        random_state=self.autoencoder_random_state,
                        verbose=self.autoencoder_verbose,
                    ),
                ),
                (
                    "deep_svdd",
                    DeepSVDD(
                        nu=self.deep_svdd_nu,
                        center_fixed=self.deep_svdd_center_fixed,
                        architecture=self.deep_svdd_architecture,
                        latent_dim=self.deep_svdd_latent_dim,
                        learning_rate=self.deep_svdd_learning_rate,
                        batch_size=self.deep_svdd_batch_size,
                        max_epochs=self.deep_svdd_max_epochs,
                        validation_fraction=self.deep_svdd_validation_fraction,
                        pretrain_autoencoder=self.deep_svdd_pretrain_autoencoder,
                        pretrain_epochs=self.deep_svdd_pretrain_epochs,
                        pretrain_dropout=self.deep_svdd_pretrain_dropout,
                        pretrain_learning_rate=self.deep_svdd_pretrain_learning_rate,
                        pretrain_batch_size=self.deep_svdd_pretrain_batch_size,
                        random_state=self.deep_svdd_random_state,
                        verbose=self.deep_svdd_verbose,
                    ),
                ),
            ]
        )

    def _fit_single(self, name: str, estimator, X: np.ndarray):
        fitted = _fit_estimator(estimator, X)
        return name, fitted

    def fit(self, X, y=None):
        X = _ensure_2d_array(X)
        base_estimators = self._build_estimators()

        fitted_pairs = Parallel(n_jobs=self.n_jobs)(
            delayed(self._fit_single)(name, estimator, X) for name, estimator in base_estimators.items()
        )
        self.estimators_ = OrderedDict(fitted_pairs)
        self.component_names_ = list(self.estimators_)

        self.component_stats_: dict[str, dict[str, float]] = {}
        component_anomaly_scores: list[np.ndarray] = []
        for name, estimator in self.estimators_.items():
            scores = _normalized_anomaly_scores(estimator, X)
            scaled, minimum, maximum = _minmax_scale(scores)
            self.component_stats_[name] = {"min": minimum, "max": maximum}
            component_anomaly_scores.append(scaled)

        component_matrix = np.column_stack(component_anomaly_scores)
        self.fusion_strategy_ = self.fusion_strategy
        if self.fusion_strategy_ not in {"weighted_average", "max_score_voting", "stacking"}:
            raise ValueError(
                "fusion_strategy must be 'weighted_average', 'max_score_voting', or 'stacking'"
            )

        self.fusion_weights_ = self._resolve_fusion_weights()
        if self.fusion_strategy_ == "weighted_average":
            fused = component_matrix @ np.array([self.fusion_weights_[name] for name in self.component_names_], dtype=float)
            self.offset_ = float(np.quantile(fused, 1 - self.contamination))
        elif self.fusion_strategy_ == "max_score_voting":
            fused = np.max(component_matrix, axis=1)
            self.offset_ = float(self.max_score_threshold)
        else:
            if y is None:
                raise ValueError("Stacking fusion requires labeled training targets passed to fit(X, y).")
            labels = _coerce_binary_labels(y)
            if labels.shape[0] != X.shape[0]:
                raise ValueError("Stacking labels must have the same number of rows as X.")

            stacking_features = self._stacking_feature_matrix(component_matrix)
            self.stacking_meta_model_ = LogisticRegression(
                solver="lbfgs",
                max_iter=1000,
                class_weight="balanced",
            )
            self.stacking_meta_model_.fit(stacking_features, labels)
            fused = self.stacking_meta_model_.predict_proba(stacking_features)[:, 1]
            self.offset_ = 0.5

        self.training_raw_anomaly_score_ = fused
        return self

    def _stacking_feature_matrix(self, component_matrix: np.ndarray) -> np.ndarray:
        if component_matrix.shape[1] < 5:
            raise ValueError("Stacking requires the full five-detector score matrix.")
        indices = [self.component_names_.index(name) for name in ("isolation_forest", "autoencoder", "deep_svdd")]
        return component_matrix[:, indices]

    def _resolve_fusion_weights(self) -> dict[str, float]:
        default_weights = {
            "isolation_forest": 0.3,
            "one_class_svm": 0.0,
            "local_outlier_factor": 0.0,
            "autoencoder": 0.4,
            "deep_svdd": 0.3,
        }
        if self.fusion_weights is None:
            return {name: default_weights.get(name, 0.0) for name in self.component_names_}

        resolved = {name: float(self.fusion_weights.get(name, 0.0)) for name in self.component_names_}
        weight_sum = float(sum(resolved.values()))
        if weight_sum <= 0.0 or np.isnan(weight_sum):
            return {name: 1.0 / len(self.component_names_) for name in self.component_names_}
        return {name: weight / weight_sum for name, weight in resolved.items()}

    def _component_anomaly_matrix(self, X) -> np.ndarray:
        if not hasattr(self, "estimators_"):
            raise RuntimeError("Ensemble must be fit before scoring.")

        X = _ensure_2d_array(X)
        columns: list[np.ndarray] = []
        for name, estimator in self.estimators_.items():
            scores = _normalized_anomaly_scores(estimator, X)
            scaled, _, _ = _minmax_scale(scores)
            columns.append(scaled)
        return np.column_stack(columns)

    def score_components(self, X) -> pd.DataFrame:
        matrix = self._component_anomaly_matrix(X)
        return pd.DataFrame(
            matrix,
            columns=[f"{name}_anomaly_score" for name in self.component_names_],
        )

    def raw_anomaly_score(self, X) -> np.ndarray:
        matrix = self._component_anomaly_matrix(X)
        if self.fusion_strategy_ == "stacking":
            if not hasattr(self, "stacking_meta_model_"):
                raise RuntimeError("Stacking fusion requires a fitted meta-classifier.")
            features = self._stacking_feature_matrix(matrix)
            return self.stacking_meta_model_.predict_proba(features)[:, 1]
        if self.fusion_strategy_ == "max_score_voting":
            return np.max(matrix, axis=1)
        weights = np.array([self.fusion_weights_[name] for name in self.component_names_], dtype=float)
        return matrix @ weights

    def score(self, X) -> np.ndarray:
        return self.raw_anomaly_score(X)

    def score_samples(self, X) -> np.ndarray:
        return -self.score(X)

    def decision_function(self, X) -> np.ndarray:
        return self.offset_ - self.raw_anomaly_score(X)

    def predict(self, X) -> np.ndarray:
        return np.where(self.decision_function(X) >= 0, 1, -1)
