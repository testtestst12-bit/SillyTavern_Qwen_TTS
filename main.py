# ================================================================
# main.py — FastAPI TTS 서버
#
# 엔드포인트:
#   GET  /health           서버 & 모델 상태 확인
#   GET  /models           사용 가능한 모델 목록
#   POST /switch           모델 전환 (VRAM 자동 정리)
#   POST /tts              음성 생성 (WAV 스트리밍 반환)
#   POST /clone/youtube    유튜브 → 목소리 샘플 추출
#   DELETE /clone/{id}     클로닝 샘플 삭제
#   POST /unload           모델 언로드 & VRAM 해제
# ================================================================

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
import io, torch

app = FastAPI(title="Local TTS Server", version="1.0.0")

# SillyTavern 브라우저에서 요청 허용 (CORS)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ================================================================
# 모델 상태
# ================================================================
current_model = None            # 현재 로드된 모델 인스턴스
current_model_name = None       # "qwen" | "chatterbox"

# ================================================================
# 요청 스키마 (Pydantic)
# ================================================================
class TTSRequest(BaseModel):
    text: str
    model: str = "qwen"             # "qwen" | "chatterbox"
    language: str = "English"

    # 보이스 클로닝 (공통)
    voice_id: str = None

    # Qwen 전용
    speaker: str = "Sunny"          # 프리셋 목소리
    ref_text: str = ""              # 클로닝 샘플 텍스트 (선택)

    # Chatterbox 전용
    exaggeration: float = 0.5
    cfg_weight: float = 0.5

class SwitchRequest(BaseModel):
    model: str

class YoutubeCloneRequest(BaseModel):
    url: str

# ================================================================
# 모델 로드 / 언로드 헬퍼
# ================================================================
def load_model(name: str):
    """모델 이름으로 인스턴스 생성"""
    if name == "qwen":
        from qwen_tts import QwenTTS
        return QwenTTS()
    elif name == "chatterbox":
        from chatterbox_tts import ChatterboxTTS
        return ChatterboxTTS()
    raise HTTPException(status_code=400, detail=f"알 수 없는 모델: {name}")

def unload_current():
    """현재 모델 언로드 & VRAM 해제"""
    global current_model, current_model_name
    if current_model:
        current_model.unload()
        current_model = None
        current_model_name = None
        torch.cuda.empty_cache()
        print("[Server] VRAM 해제 완료")

# ================================================================
# 엔드포인트
# ================================================================

@app.get("/health")
async def health():
    """서버 상태 & 현재 로드된 모델 확인"""
    return {
        "status": "ok",
        "loaded_model": current_model_name,
        "cuda_available": torch.cuda.is_available(),
        "vram_used_mb": round(
            torch.cuda.memory_allocated() / 1024**2, 1
        ) if torch.cuda.is_available() else 0,
    }

@app.get("/models")
async def list_models():
    """사용 가능한 모델 목록"""
    return {"models": ["qwen", "chatterbox"]}

@app.post("/switch")
async def switch_model(req: SwitchRequest):
    """모델 전환 (이전 모델 VRAM 해제 후 새 모델 로드)"""
    global current_model, current_model_name

    if current_model_name == req.model:
        return {"status": "already_loaded", "model": req.model}

    print(f"[Server] 모델 전환: {current_model_name} → {req.model}")
    unload_current()
    current_model = load_model(req.model)
    current_model_name = req.model

    return {"status": "ok", "model": req.model}

@app.post("/tts")
async def generate_tts(req: TTSRequest):
    """음성 생성 — WAV 스트리밍 반환"""
    global current_model, current_model_name

    # 다른 모델이 로드돼 있으면 자동 전환
    if current_model_name != req.model:
        print(f"[Server] 자동 전환: {current_model_name} → {req.model}")
        unload_current()
        current_model = load_model(req.model)
        current_model_name = req.model

    # ── 모델별 파라미터 구성 ─────────────────────────────────────
    kwargs = {
        "text": req.text,
        "language": req.language,
    }

    if req.model == "qwen":
        kwargs["speaker"] = req.speaker
        if req.voice_id:
            kwargs["voice_id"] = req.voice_id
            kwargs["ref_text"] = req.ref_text

    elif req.model == "chatterbox":
        kwargs["exaggeration"] = req.exaggeration
        kwargs["cfg_weight"] = req.cfg_weight
        if req.voice_id:
            kwargs["voice_id"] = req.voice_id

    # ── 음성 생성 ────────────────────────────────────────────────
    audio_bytes = current_model.generate(**kwargs)

    return StreamingResponse(
        io.BytesIO(audio_bytes),
        media_type="audio/wav",
        headers={"Content-Disposition": "inline; filename=tts.wav"},
    )

@app.post("/clone/youtube")
async def clone_from_youtube(req: YoutubeCloneRequest):
    """유튜브 링크 → 목소리 샘플 추출 (10~15초)"""
    import yt_dlp, uuid, subprocess
    from pathlib import Path

    voice_id = str(uuid.uuid4())[:8]
    out_dir = Path("/tmp/clone_voices")
    out_dir.mkdir(exist_ok=True)

    raw_path = out_dir / f"{voice_id}_raw.%(ext)s"
    clip_path = out_dir / f"{voice_id}.wav"

    # ── 유튜브 오디오 다운로드 ───────────────────────────────────
    ydl_opts = {
        "format": "bestaudio/best",
        "outtmpl": str(raw_path),
        "postprocessors": [{
            "key": "FFmpegExtractAudio",
            "preferredcodec": "wav",
        }],
        "quiet": True,
    }

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(req.url, download=True)
            title = info.get("title", "Unknown")[:40]

        raw_wav = out_dir / f"{voice_id}_raw.wav"

        # ── 5초~17초 구간 자르기 (인트로 스킵) ──────────────────
        subprocess.run([
            "ffmpeg", "-y",
            "-i", str(raw_wav),
            "-ss", "5",         # 5초부터 시작
            "-t", "12",         # 12초 추출
            "-ar", "24000",     # 24kHz 리샘플링
            "-ac", "1",         # 모노
            str(clip_path),
        ], check=True, capture_output=True)

        # 원본 삭제 (용량 절약)
        raw_wav.unlink(missing_ok=True)

        print(f"[Clone] 완료: {title} → {clip_path}")
        return {"voice_id": voice_id, "title": title}

    except Exception as e:
        clip_path.unlink(missing_ok=True)
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/clone/{voice_id}")
async def delete_clone(voice_id: str):
    """클로닝 샘플 삭제"""
    from pathlib import Path
    Path(f"/tmp/clone_voices/{voice_id}.wav").unlink(missing_ok=True)
    return {"status": "ok", "deleted": voice_id}

@app.post("/unload")
async def unload_model():
    """모델 언로드 & VRAM 해제"""
    unload_current()
    return {"status": "ok", "message": "모델 언로드 완료"}
