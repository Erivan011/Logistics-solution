FROM node:24-bookworm-slim AS ui
WORKDIR /build
COPY package.json package-lock.json ./
RUN npm ci
COPY planner-ui ./planner-ui
COPY scripts ./scripts
RUN npm run build:ui

FROM python:3.12-slim
WORKDIR /app
COPY requirements-planner.txt ./
RUN pip install --no-cache-dir -r requirements-planner.txt && useradd -m -u 10001 planner && mkdir /data && chown planner:planner /data
COPY planner ./planner
COPY docs/demo-result.json ./planner/public_demo.json
COPY --from=ui /build/planner-ui/dist ./planner-ui/dist
COPY --from=ui /build/planner/static ./planner/static
ENV DATABASE_URL=sqlite:////data/planner.db PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1
USER planner
EXPOSE 8000
CMD ["python", "-m", "planner.serve"]
