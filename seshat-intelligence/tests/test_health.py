from httpx import ASGITransport, AsyncClient

from seshat_intelligence.api.app import create_app
from seshat_intelligence.config import Settings


async def test_health(tmp_path):
    app = create_app(Settings(storage_dir=tmp_path))
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
