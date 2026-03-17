# ================================================================
# chatterbox_tts.py — Chatterbox TTS 래퍼
#
# 기능:
#   - 보이스 클로닝 (10~15초 샘플)
#   - 감정 강도 조절 (exaggeration)
#   - CFG Weight 조절
# ================================================================

import io, torch
import torchaudio

class ChatterboxTTS:
    def __init__(self):
        print("[Chatterbox] 모델 로드 중...")
        from chatterbox.tts import ChatterboxTTS as CB
        self.model = CB.from_pretrained(device="cuda")
        self.sample_rate = 24000
        print("[Chatterbox] 로드 완료!")

    # ── 음성 생성 (핵심 메서드) ───────────────────────────────────
    def generate(
        self,
        text: str,
        language: str = "English",  # Chatterbox는 영어 특화
        exaggeration: float = 0.5,  # 감정 강도
        cfg_weight: float = 0.5,    # CFG Weight
        voice_id: str = None,       # 클로닝 목소리 ID
        **kwargs,
    ) -> bytes:

        # 클로닝 샘플 경로 확인
        audio_prompt = None
        if voice_id:
            from pathlib import Path
            sample_path = Path(f"/tmp/clone_voices/{voice_id}.wav")
            if sample_path.exists():
                audio_prompt = str(sample_path)
                print(f"[Chatterbox] 클로닝 샘플 사용: {sample_path}")
            else:
                print(f"[Chatterbox] 클로닝 샘플 없음 ({voice_id}), 기본 목소리로 대체")

        wav = self.model.generate(
            text,
            audio_prompt_path=audio_prompt,
            exaggeration=exaggeration,
            cfg_weight=cfg_weight,
        )

        # WAV bytes로 변환해서 반환
        buf = io.BytesIO()
        torchaudio.save(buf, wav, self.sample_rate, format="wav")
        buf.seek(0)
        return buf.read()

    # ── 언로드 (VRAM 해제) ────────────────────────────────────────
    def unload(self):
        del self.model
        self.model = None
        torch.cuda.empty_cache()
        print("[Chatterbox] 언로드 완료 — VRAM 해제됨")
