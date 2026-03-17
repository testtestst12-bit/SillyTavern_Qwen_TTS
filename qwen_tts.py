# ================================================================
# qwen_tts.py — Qwen3-TTS 래퍼
#
# 두 가지 모드:
#   1. 프리셋 목소리  → Qwen3-TTS-0.6B-CustomVoice 모델 사용
#   2. 보이스 클로닝  → Qwen3-TTS-0.6B-Base 모델 사용 (지연 로딩)
# ================================================================

import io, torch
import soundfile as sf

# 사용 가능한 프리셋 목소리 목록
PRESET_VOICES = [
    "Sunny", "David", "Emily", "Alex", "Luna",
    "Ryan", "Aria", "John", "Mia",
]

class QwenTTS:
    def __init__(self):
        print("[Qwen] CustomVoice 모델 로드 중...")
        from qwen_tts import Qwen3TTSModel

        # 프리셋 목소리용 모델 (항상 로드)
        self.custom_model = Qwen3TTSModel.from_pretrained(
            "Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice",
            device_map="cuda:0",
            dtype=torch.bfloat16,
        )

        # 클로닝용 모델 (필요할 때만 로드 → VRAM 절약)
        self.base_model = None
        print("[Qwen] CustomVoice 로드 완료!")

    # ── 클로닝용 Base 모델 지연 로딩 ─────────────────────────────
    def _load_base_model(self):
        if self.base_model is None:
            print("[Qwen] Base 모델 로드 중... (클로닝용)")
            from qwen_tts import Qwen3TTSModel
            self.base_model = Qwen3TTSModel.from_pretrained(
                "Qwen/Qwen3-TTS-12Hz-0.6B-Base",
                device_map="cuda:0",
                dtype=torch.bfloat16,
            )
            print("[Qwen] Base 모델 로드 완료!")

    # ── 음성 생성 (핵심 메서드) ───────────────────────────────────
    def generate(
        self,
        text: str,
        language: str = "English",
        speaker: str = "Sunny",     # 프리셋 목소리 이름
        voice_id: str = None,       # 클로닝 목소리 ID (있으면 클로닝 모드)
        ref_text: str = "",         # 클로닝 샘플 텍스트 (없어도 동작함)
        **kwargs,
    ) -> bytes:

        if voice_id:
            # ── 클로닝 모드 ──────────────────────────────────────
            from pathlib import Path
            sample_path = Path(f"/tmp/clone_voices/{voice_id}.wav")

            if not sample_path.exists():
                raise FileNotFoundError(f"클로닝 샘플 파일 없음: {voice_id}")

            self._load_base_model()
            wavs, sr = self.base_model.generate_voice_clone(
                text=text,
                ref_audio=str(sample_path),
                ref_text=ref_text,      # 비어있어도 동작함
                language=language,
            )
        else:
            # ── 프리셋 모드 ──────────────────────────────────────
            if speaker not in PRESET_VOICES:
                print(f"[Qwen] 알 수 없는 목소리 '{speaker}', Sunny로 대체")
                speaker = "Sunny"

            wavs, sr = self.custom_model.generate_custom_voice(
                text=text,
                speaker=speaker,
                language=language,
            )

        # WAV bytes로 변환해서 반환
        buf = io.BytesIO()
        sf.write(buf, wavs[0], sr, format="WAV")
        buf.seek(0)
        return buf.read()

    # ── 언로드 (VRAM 해제) ────────────────────────────────────────
    def unload(self):
        if self.custom_model:
            del self.custom_model
            self.custom_model = None
        if self.base_model:
            del self.base_model
            self.base_model = None
        torch.cuda.empty_cache()
        print("[Qwen] 언로드 완료 — VRAM 해제됨")
