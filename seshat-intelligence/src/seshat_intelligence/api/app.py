from contextlib import asynccontextmanager
from typing import AsyncIterator

from fastapi import FastAPI

from seshat_intelligence.api.schemas import HealthResponse
from seshat_intelligence.config import Settings, get_settings
from seshat_intelligence.connectors.extraction import router_extractor
from seshat_intelligence.connectors.gdrive import GDriveConnector
from seshat_intelligence.connectors.openapi import add_event_schemas
from seshat_intelligence.connectors.registry import ConnectorRegistry
from seshat_intelligence.connectors.routes import router as connectors_router
from seshat_intelligence.documents.chunking_pool import ChunkingPool
from seshat_intelligence.documents.conversion_pool import ConversionPool
from seshat_intelligence.documents.routes import router as documents_router
from seshat_intelligence.documents.service import ChunkDocument, ConvertDocument
from seshat_intelligence.documents.store import DocumentStore
from seshat_intelligence.reading.engines import PoolEngines
from seshat_intelligence.reading.router import ReadingRouter
from seshat_intelligence.reading.routes import router as reading_router


def create_app(settings: Settings | None = None) -> FastAPI:
    """Wires every domain's own router into one FastAPI app. Each domain
    (documents now, retrieval/evaluation later) owns its own routes/schemas/
    service - this function only mounts them, it doesn't know their internals."""
    settings = settings or get_settings()

    # Each pool's worker processes are spawned lazily (on first use), not
    # here - constructing a pool itself is cheap.
    conversion_pool = ConversionPool(settings.document_provider, settings.conversion_max_workers)
    chunking_pool = ChunkingPool(settings.chunking_max_workers)
    store = DocumentStore(settings.storage_dir)
    engines = PoolEngines(settings.enabled_providers, settings.pdf_provider_policy, settings.conversion_max_workers)
    router = ReadingRouter(
        engines,
        pdf_mode=settings.pdf_mode,
        mode=settings.reading_mode,
        min_chars_per_page=settings.min_chars_per_page,
        min_image_area_ratio=settings.min_image_area_ratio,
    )

    @asynccontextmanager
    async def lifespan(_: FastAPI) -> AsyncIterator[None]:
        yield
        conversion_pool.shutdown()
        chunking_pool.shutdown()
        router.shutdown()
        engines.shutdown()

    app = FastAPI(title="Seshat Intelligence", version="0.1.0", lifespan=lifespan)
    app.state.document_store = store
    app.state.convert_document = ConvertDocument(conversion_pool, store)
    app.state.chunk_document = ChunkDocument(chunking_pool)
    app.state.reading_router = router
    app.state.connector_registry = ConnectorRegistry()
    app.state.connector_registry.register(GDriveConnector(extractor=router_extractor(router)))

    @app.get("/health", response_model=HealthResponse)
    async def health() -> HealthResponse:
        return HealthResponse()

    app.include_router(documents_router)
    app.include_router(reading_router)
    app.include_router(connectors_router)
    base_openapi = app.openapi

    def openapi() -> dict:
        if app.openapi_schema is None:
            app.openapi_schema = add_event_schemas(base_openapi())
        return app.openapi_schema

    app.openapi = openapi  # type: ignore[method-assign]
    return app

