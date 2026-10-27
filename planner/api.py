"""Versioned scenarios, immutable planning snapshots and auditable exports."""

import csv
import io
import json
from types import SimpleNamespace
import os
import secrets
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4
from zoneinfo import ZoneInfo
from sqlalchemy.exc import IntegrityError
from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.responses import FileResponse, Response
from fastapi.openapi.docs import get_swagger_ui_html
from fastapi.staticfiles import StaticFiles
from sqlalchemy import JSON, Integer, String, ForeignKey, create_engine, select, update
from threading import BoundedSemaphore
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column
from sqlalchemy.pool import StaticPool
from .demo import demo_scenario
from .models import Scenario, UpdateScenario, PlanRequest, DispatchRequest
from .optimizer import optimize
from .dispatch import prepare_dispatch


class Base(DeclarativeBase):
    pass


class ScenarioRecord(Base):
    __tablename__ = "planning_scenarios"
    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    name: Mapped[str] = mapped_column(String(100))
    version: Mapped[int] = mapped_column(Integer, default=1)
    payload: Mapped[dict] = mapped_column(JSON)
    updated_at: Mapped[str] = mapped_column(String(40))


class RunRecord(Base):
    __tablename__ = "planning_runs"
    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    scenario_id: Mapped[str] = mapped_column(
        ForeignKey("planning_scenarios.id"), index=True
    )
    scenario_version: Mapped[int] = mapped_column(Integer)
    scenario_snapshot: Mapped[dict] = mapped_column(JSON)
    result: Mapped[dict] = mapped_column(JSON)
    created_at: Mapped[str] = mapped_column(String(40))


class DispatchRecord(Base):
    __tablename__ = "planning_dispatches"
    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    run_id: Mapped[str] = mapped_column(ForeignKey("planning_runs.id"), unique=True)
    scenario_id: Mapped[str] = mapped_column(
        ForeignKey("planning_scenarios.id"), index=True
    )
    scenario_version: Mapped[int] = mapped_column(Integer)
    resulting_version: Mapped[int] = mapped_column(Integer)
    idempotency_key: Mapped[str] = mapped_column(String(40), unique=True)
    payload: Mapped[dict] = mapped_column(JSON)
    created_at: Mapped[str] = mapped_column(String(40))


class AuditRecord(Base):
    __tablename__ = "planning_audit"
    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    action: Mapped[str] = mapped_column(String(40))
    resource_id: Mapped[str] = mapped_column(String(40), index=True)
    details: Mapped[dict] = mapped_column(JSON)
    created_at: Mapped[str] = mapped_column(String(40))


def stamp():
    return datetime.now(timezone.utc).isoformat()


def safe_cell(value):
    value = str(value)
    return "'" + value if value.lstrip().startswith(("=", "+", "-", "@")) else value


def create_app(database_url=None, *, seed=True, api_token=None):
    if database_url is None:
        database_url = os.getenv("DATABASE_URL")
        if not database_url:
            Path("planner/data").mkdir(parents=True, exist_ok=True)
            database_url = "sqlite:///planner/data/planner.db"
    # Hosted providers supply PostgreSQL URLs without an explicit driver.
    # psycopg v3 is installed; SQLAlchemy defaults to psycopg2 otherwise.
    if database_url.startswith(("postgres://", "postgresql://")):
        database_url = "postgresql+psycopg://" + database_url.split("://", 1)[1]
    options = {}
    if database_url.startswith("sqlite"):
        options["connect_args"] = {"check_same_thread": False}
        if ":memory:" in database_url:
            options["poolclass"] = StaticPool
    engine = create_engine(database_url, **options)
    Base.metadata.create_all(engine)
    token = os.getenv("PLANNER_API_TOKEN", "") if api_token is None else api_token
    with Session(engine) as session:
        if seed and not session.scalar(select(ScenarioRecord.id).limit(1)):
            demo = demo_scenario()
            session.add(
                ScenarioRecord(
                    id="demo-sp",
                    name=demo.name,
                    payload=demo.model_dump(mode="json"),
                    version=1,
                    updated_at=stamp(),
                )
            )
            session.commit()

    @asynccontextmanager
    async def lifespan(app):
        yield
        engine.dispose()

    app = FastAPI(
        title="RoutePlan API",
        version="3.1.0",
        lifespan=lifespan,
        description="Simulação logística com VRPTW, FEFO e cenários versionados. Dados demonstrativos; distâncias estimadas.",
        docs_url=None,
        redoc_url=None,
    )
    app.state.engine = engine
    slots = BoundedSemaphore(2)

    def session_dependency():
        with Session(engine) as session:
            yield session

    def guard(
        request: Request,
        credentials: HTTPAuthorizationCredentials | None = Depends(
            HTTPBearer(auto_error=False)
        ),
    ):
        if token:
            auth = request.headers.get("authorization", "")
            if not secrets.compare_digest(auth, "Bearer " + token):
                raise HTTPException(401, "Informe o token de acesso da operação.")
        if request.method not in ("GET", "HEAD", "OPTIONS"):
            origin = request.headers.get("origin")
            from urllib.parse import urlparse

            if request.headers.get("sec-fetch-site") == "cross-site" or (
                origin and urlparse(origin).netloc != request.headers.get("host")
            ):
                raise HTTPException(403, "Origem não permitida.")

    @app.middleware("http")
    async def headers(request, call_next):
        length = request.headers.get("content-length", "")
        if length.isdigit() and int(length) > 262144:
            return Response("Request too large", 413)
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "no-referrer"
        response.headers["Cache-Control"] = "no-store"
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'"
        )
        if request.url.path == "/docs":
            response.headers["Content-Security-Policy"] = (
                "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'"
            )
        return response

    def get_scenario(session, id):
        item = session.get(ScenarioRecord, id)
        if item is None:
            raise HTTPException(404, "Cenário não encontrado.")
        return item

    def audit(session, action, resource_id, details):
        session.add(
            AuditRecord(
                id=str(uuid4()),
                action=action,
                resource_id=resource_id,
                details=details,
                created_at=stamp(),
            )
        )

    def scenario_view(item):
        return {
            "id": item.id,
            "version": item.version,
            "updated_at": item.updated_at,
            "scenario": item.payload,
        }

    @app.get("/api/health")
    def health():
        return {
            "status": "ok",
            "version": "3.1.0",
            "authentication_required": bool(token),
        }

    def public_demo_run():
        bundled = Path(__file__).resolve().parent / "public_demo.json"
        source = (
            bundled
            if bundled.is_file()
            else Path(__file__).resolve().parents[1] / "docs" / "demo-result.json"
        )
        return json.loads(source.read_text(encoding="utf-8"))

    @app.get("/api/demo")
    def public_demo():
        # Publish only the fixed synthetic artifact, never the operation database.
        return {"data": public_demo_run()}

    @app.get("/api/demo/export.csv")
    def public_demo_csv():
        return csv_response(SimpleNamespace(**public_demo_run()))

    @app.get("/api/scenarios", dependencies=[Depends(guard)])
    def scenarios(session: Session = Depends(session_dependency)):
        return {
            "data": [
                scenario_view(item)
                for item in session.scalars(
                    select(ScenarioRecord).order_by(ScenarioRecord.updated_at.desc())
                )
            ]
        }

    @app.post("/api/scenarios", status_code=201, dependencies=[Depends(guard)])
    def create_scenario(
        value: Scenario, session: Session = Depends(session_dependency)
    ):
        item = ScenarioRecord(
            id=str(uuid4()),
            name=value.name,
            payload=value.model_dump(mode="json"),
            version=1,
            updated_at=stamp(),
        )
        session.add(item)
        audit(session, "scenario_created", item.id, {"version": 1})
        session.commit()
        return {"data": scenario_view(item)}

    @app.put("/api/scenarios/{id}", dependencies=[Depends(guard)])
    def replace_scenario(
        id: str, value: UpdateScenario, session: Session = Depends(session_dependency)
    ):
        get_scenario(session, id)
        changed = session.execute(
            update(ScenarioRecord)
            .where(
                ScenarioRecord.id == id,
                ScenarioRecord.version == value.expected_version,
            )
            .values(
                name=value.scenario.name,
                payload=value.scenario.model_dump(mode="json"),
                version=value.expected_version + 1,
                updated_at=stamp(),
            )
        )
        if changed.rowcount != 1:
            raise HTTPException(
                409, "Cenário alterado em outra sessão. Recarregue antes de salvar."
            )
        audit(
            session,
            "scenario_updated",
            id,
            {
                "previous_version": value.expected_version,
                "version": value.expected_version + 1,
            },
        )
        session.commit()
        return {"data": scenario_view(get_scenario(session, id))}

    @app.post(
        "/api/scenarios/{id}/plan", status_code=201, dependencies=[Depends(guard)]
    )
    def plan(
        id: str, value: PlanRequest, session: Session = Depends(session_dependency)
    ):
        item = get_scenario(session, id)
        if item.version != value.expected_version:
            raise HTTPException(
                409, "A versão mudou. Recarregue para planejar os dados atuais."
            )
        version = item.version
        snapshot = item.payload
        # Release read transaction before bounded CPU work. Snapshot is immutable JSON.
        session.commit()
        if not slots.acquire(blocking=False):
            raise HTTPException(
                429,
                "Há dois cálculos em execução. Aguarde e tente novamente.",
                headers={"Retry-After": "3"},
            )
        try:
            result = optimize(Scenario.model_validate(snapshot), value.max_seconds)
        finally:
            slots.release()
        run = RunRecord(
            id=str(uuid4()),
            scenario_id=id,
            scenario_version=version,
            scenario_snapshot=snapshot,
            result=result,
            created_at=stamp(),
        )
        session.add(run)
        audit(
            session,
            "plan_created",
            id,
            {"run_id": run.id, "scenario_version": version, "verified": True},
        )
        session.commit()
        return {
            "data": {
                "id": run.id,
                "scenario_id": id,
                "scenario_version": version,
                "created_at": run.created_at,
                "result": result,
                "scenario_snapshot": snapshot,
            }
        }

    @app.get("/api/runs", dependencies=[Depends(guard)])
    def runs(session: Session = Depends(session_dependency)):
        items = session.scalars(
            select(RunRecord).order_by(RunRecord.created_at.desc()).limit(50)
        )
        return {
            "data": [
                {
                    "id": r.id,
                    "scenario_id": r.scenario_id,
                    "scenario_version": r.scenario_version,
                    "created_at": r.created_at,
                    "name": r.scenario_snapshot["name"],
                    "metrics": r.result["plan"]["metrics"],
                }
                for r in items
            ]
        }

    def dispatch_view(entry):
        return {
            "id": entry.id,
            "run_id": entry.run_id,
            "scenario_id": entry.scenario_id,
            "scenario_version": entry.scenario_version,
            "resulting_version": entry.resulting_version,
            "created_at": entry.created_at,
            **entry.payload,
        }

    @app.get("/api/dispatches", dependencies=[Depends(guard)])
    def dispatches(session: Session = Depends(session_dependency)):
        entries = session.scalars(
            select(DispatchRecord).order_by(DispatchRecord.created_at.desc()).limit(100)
        )
        return {"data": [dispatch_view(entry) for entry in entries]}

    @app.post("/api/runs/{id}/dispatch", status_code=201, dependencies=[Depends(guard)])
    def confirm_dispatch(
        id: str,
        value: DispatchRequest,
        response: Response,
        session: Session = Depends(session_dependency),
    ):
        key = str(value.idempotency_key)

        def replay():
            entry = session.scalar(
                select(DispatchRecord).where(DispatchRecord.idempotency_key == key)
            )
            if entry:
                if (
                    entry.run_id != id
                    or entry.scenario_version != value.expected_scenario_version
                ):
                    raise HTTPException(
                        409,
                        "Esta chave de confirmação já foi usada para outra solicitação.",
                    )
                response.status_code = 200
                return {
                    "data": {
                        "dispatch": dispatch_view(entry),
                        "scenario": scenario_view(
                            get_scenario(session, entry.scenario_id)
                        ),
                        "replayed": True,
                    }
                }
            return None

        previous = replay()
        if previous:
            return previous
        run = session.get(RunRecord, id)
        if run is None:
            raise HTTPException(404, "Execução não encontrada.")
        if session.scalar(select(DispatchRecord.id).where(DispatchRecord.run_id == id)):
            raise HTTPException(409, "Este plano já teve a expedição confirmada.")
        current = get_scenario(session, run.scenario_id)
        if (
            current.version != value.expected_scenario_version
            or current.version != run.scenario_version
        ):
            raise HTTPException(
                409,
                "O cenário mudou desde o cálculo. Gere um novo plano antes de expedir.",
            )
        scenario = Scenario.model_validate(current.payload)
        if scenario.planning_date != datetime.now(ZoneInfo("America/Sao_Paulo")).date():
            raise HTTPException(
                409,
                "A expedição só pode ser confirmada na data do planejamento. Atualize a data e recalcule.",
            )
        try:
            updated, details = prepare_dispatch(scenario, run.result)
        except (ValueError, AssertionError, KeyError):
            raise HTTPException(
                409,
                "O plano ou a separação de lotes não passou na verificação. Recalcule antes de expedir.",
            )
        old_version = current.version
        changed = session.execute(
            update(ScenarioRecord)
            .where(
                ScenarioRecord.id == current.id, ScenarioRecord.version == old_version
            )
            .values(payload=updated, version=old_version + 1, updated_at=stamp())
        )
        if changed.rowcount != 1:
            session.rollback()
            previous = replay()
            if previous:
                return previous
            raise HTTPException(
                409,
                "Outra operação alterou o cenário. Recarregue para conferir o estoque atual.",
            )
        entry = DispatchRecord(
            id=str(uuid4()),
            run_id=id,
            scenario_id=current.id,
            scenario_version=old_version,
            resulting_version=old_version + 1,
            idempotency_key=key,
            payload={"scenario_name": scenario.name, **details},
            created_at=stamp(),
        )
        session.add(entry)
        audit(
            session,
            "dispatch_confirmed",
            current.id,
            {
                "dispatch_id": entry.id,
                "run_id": id,
                "version_before": old_version,
                "version_after": old_version + 1,
                "order_count": details["order_count"],
                "unit_count": details["unit_count"],
            },
        )
        try:
            session.commit()
        except IntegrityError:
            session.rollback()
            previous = replay()
            if previous:
                return previous
            raise HTTPException(
                409,
                "O plano já foi confirmado por outra solicitação. Recarregue o histórico.",
            )
        return {
            "data": {
                "dispatch": dispatch_view(entry),
                "scenario": scenario_view(get_scenario(session, entry.scenario_id)),
                "replayed": False,
            }
        }

    @app.get("/api/runs/{id}", dependencies=[Depends(guard)])
    def run_detail(id: str, session: Session = Depends(session_dependency)):
        run = session.get(RunRecord, id)
        if not run:
            raise HTTPException(404, "Execução não encontrada.")
        return {
            "data": {
                "id": run.id,
                "scenario_id": run.scenario_id,
                "scenario_version": run.scenario_version,
                "created_at": run.created_at,
                "result": run.result,
                "scenario_snapshot": run.scenario_snapshot,
            }
        }

    @app.get("/api/runs/{id}/export.csv", dependencies=[Depends(guard)])
    def export(id: str, session: Session = Depends(session_dependency)):
        run = session.get(RunRecord, id)
        if not run:
            raise HTTPException(404, "Execução não encontrada.")
        return csv_response(run)

    def csv_response(run):
        stream = io.StringIO(newline="")
        writer = csv.writer(stream, delimiter=";")
        writer.writerow(
            [
                "Execução",
                "Veículo",
                "Pedido",
                "Destino",
                "Chegada (min após 08h)",
                "Quantidade",
                "Produto",
                "Lotes FEFO",
            ]
        )
        orders = {o["id"]: o for o in run.scenario_snapshot["orders"]}
        for route in run.result["plan"]["routes"]:
            for stop in route["stops"]:
                order = orders[stop["order_id"]]
                lots = [
                    f'{a["batch_id"]}: {a["quantity"]}'
                    for a in run.result["allocations"]
                    if a["order_id"] == order["id"]
                ]
                writer.writerow(
                    [
                        safe_cell(x)
                        for x in [
                            run.id,
                            route["vehicle_id"],
                            order["id"],
                            order["destination"],
                            stop["arrival_min"],
                            order["quantity"],
                            order["product_id"],
                            " | ".join(lots),
                        ]
                    ]
                )
        return Response(
            "\ufeff" + stream.getvalue(),
            media_type="text/csv; charset=utf-8",
            headers={
                "Content-Disposition": 'attachment; filename="plano-logistico.csv"'
            },
        )

    @app.get("/api/audit", dependencies=[Depends(guard)])
    def events(session: Session = Depends(session_dependency)):
        rows = session.scalars(
            select(AuditRecord).order_by(AuditRecord.created_at.desc()).limit(100)
        )
        return {
            "data": [
                {
                    "id": x.id,
                    "action": x.action,
                    "resource_id": x.resource_id,
                    "details": x.details,
                    "created_at": x.created_at,
                }
                for x in rows
            ]
        }

    swagger = Path(__file__).resolve().parent / "static" / "swagger"
    if swagger.is_dir():
        app.mount(
            "/api-docs/assets", StaticFiles(directory=swagger), name="swagger-assets"
        )

        @app.get("/docs", include_in_schema=False)
        def docs():
            return get_swagger_ui_html(
                openapi_url="/openapi.json",
                title="RoutePlan API",
                swagger_js_url="/api-docs/assets/swagger-ui-bundle.js",
                swagger_css_url="/api-docs/assets/swagger-ui.css",
                swagger_favicon_url="",
            )

    # Built frontend is served by the same process: no exposed DB and no CORS wildcard.
    dist = Path(__file__).resolve().parents[1] / "planner-ui" / "dist"
    if dist.is_dir():
        app.mount("/assets", StaticFiles(directory=dist / "assets"), name="assets")

        @app.get("/", include_in_schema=False)
        def index():
            return FileResponse(dist / "index.html")

    return app


app = create_app()
