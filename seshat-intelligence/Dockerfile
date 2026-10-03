# syntax=docker/dockerfile:1
# seshat-intelligence for a server: dependencies and models are in the image, so nothing is downloaded when it
# starts and it can run with no network.
#
#   docker build -t seshat-intelligence .                                        CPU, standard profile
#   docker build -t seshat-intelligence-gpu --build-arg TORCH_INDEX=cu130 \
#                --build-arg PROFILE=full .                                       NVIDIA GPU
#   docker run -p 5100:5100 seshat-intelligence
#   docker run --gpus all -p 5100:5100 seshat-intelligence-gpu                   needs the NVIDIA container toolkit
#
# TORCH_INDEX is the PyTorch index torch comes from: "cpu", or "cuNNN" for a CUDA build. Pick one the host driver
# supports (nvidia-smi shows the newest CUDA it can run). PROFILE is the model set: minimal, standard or full.
# Run from the seshat-intelligence directory.

FROM python:3.11-slim AS build

ARG TORCH_INDEX=cpu
ARG PROFILE=standard

# Libraries the PDF and image readers load (OpenCV needs them to import, so the build stage has them too).
RUN apt-get update && apt-get install -y --no-install-recommends libgl1 libglib2.0-0 libxcb1 \
    && rm -rf /var/lib/apt/lists/*

COPY --from=ghcr.io/astral-sh/uv:0.11 /uv /usr/local/bin/uv
ENV UV_LINK_MODE=copy UV_COMPILE_BYTECODE=1

WORKDIR /app
RUN uv venv /opt/venv
ENV VIRTUAL_ENV=/opt/venv PATH=/opt/venv/bin:$PATH

# PyTorch first, from the index that matches the hardware; the lock file would otherwise pick its own build.
RUN uv pip install torch torchvision --index-url https://download.pytorch.org/whl/${TORCH_INDEX}

# The rest from the lock file, without the packages PyTorch already brought.
COPY pyproject.toml uv.lock ./
RUN uv export --frozen --no-hashes --no-emit-project --no-dev \
    | grep -vE '^(cuda-|nvidia-|triton|torch==|torchvision==)' > /tmp/requirements.txt \
    && uv pip install -r /tmp/requirements.txt

COPY src ./src
RUN uv pip install --no-deps .

# The models, into a directory the service reads from. Converting a test page offline proves they work.
ENV SESHAT_INTELLIGENCE_DOCLING_ARTIFACTS_PATH=/models
RUN seshat-intelligence install --no-gpu --device cpu --profile ${PROFILE} --artifacts-path /models --verify

FROM python:3.11-slim

# Libraries the PDF and image readers load.
RUN apt-get update && apt-get install -y --no-install-recommends libgl1 libglib2.0-0 libxcb1 \
    && rm -rf /var/lib/apt/lists/*
RUN useradd --create-home --uid 10001 seshat

COPY --from=build /opt/venv /opt/venv
COPY --from=build /models /models

ENV PATH=/opt/venv/bin:$PATH \
    SESHAT_INTELLIGENCE_HOST=0.0.0.0 \
    SESHAT_INTELLIGENCE_PORT=5100 \
    SESHAT_INTELLIGENCE_DOCLING_ARTIFACTS_PATH=/models \
    SESHAT_INTELLIGENCE_DOCLING_OFFLINE=true \
    HF_HUB_OFFLINE=1

USER seshat
EXPOSE 5100
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s CMD python -c "import urllib.request as u; u.urlopen('http://127.0.0.1:5100/health', timeout=4)"
CMD ["seshat-intelligence", "serve"]
