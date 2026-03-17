# ================================================================
# Dockerfile — Local TTS Server
# Base: NVIDIA CUDA 12.1 + Ubuntu 22.04
# ================================================================

FROM nvidia/cuda:12.1.0-cudnn8-runtime-ubuntu22.04

ENV DEBIAN_FRONTEND=noninteractive
ENV PYTHONUNBUFFERED=1
WORKDIR /app

# ── 시스템 패키지 ────────────────────────────────────────────────
RUN apt-get update && apt-get install -y \
    python3.11 python3-pip python3.11-dev \
    git ffmpeg libsndfile1 \
    && rm -rf /var/lib/apt/lists/*

# ── PyTorch (CUDA 12.1 버전) ──────────────────────────────────────
RUN pip install --upgrade pip && \
    pip install torch==2.3.0 torchaudio==2.3.0 \
    --index-url https://download.pytorch.org/whl/cu121

# ── 나머지 패키지 ────────────────────────────────────────────────
COPY server/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# ── 서버 코드 복사 ───────────────────────────────────────────────
COPY server/ .

EXPOSE 7851

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "7851"]
