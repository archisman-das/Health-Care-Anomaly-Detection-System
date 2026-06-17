FROM node:20-alpine AS web-builder

WORKDIR /app/web

COPY web/package.json web/package-lock.json ./
RUN npm install

COPY web/ ./
RUN npm run build

FROM python:3.11-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    FRONTEND_DIST_DIR=/app/web/dist

WORKDIR /app

COPY pyproject.toml README.md /app/
COPY rural_health_anomaly /app/rural_health_anomaly
COPY anomaly_cli.py backend_server.py dashboard_server.py example_training_inference.py preprocessing_pipeline.py train_pipeline.py /app/
COPY artifacts/large_training_20k/model/fast_anomaly_pipeline_20k.joblib /models/model.joblib
COPY artifacts/large_training_20k/model/fast_anomaly_pipeline_20k.metadata.json /models/model.metadata.json
COPY --from=web-builder /app/web/dist /app/web/dist

RUN pip install --no-cache-dir .

EXPOSE 8001

CMD ["sh", "-c", "anomaly-api --model /models/model.joblib --host 0.0.0.0 --port ${PORT:-8001}"]
