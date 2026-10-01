import uvicorn

from seshat_intelligence.config import get_settings


def main() -> None:
    settings = get_settings()
    uvicorn.run("seshat_intelligence.api.app:create_app", factory=True, host=settings.host, port=settings.port)


if __name__ == "__main__":
    main()
