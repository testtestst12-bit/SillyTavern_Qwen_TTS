# SillyTavern_Qwen_TTS
# Local TTS for SillyTavern
> Qwen3-TTS + Chatterbox TTS 로컬 실행 확장

## 📁 프로젝트 구조
```
local-tts-st/
├── extension/                  ← SillyTavern에 넣는 폴더
│   ├── manifest.json           (확장 정보)
│   ├── index.js                (메인 로직: UI + TTS 요청 + 재생)
│   └── style.css               (패널 스타일)
└── docker/                     ← TTS 서버
    ├── Dockerfile
    ├── docker-compose.yml
    └── server/
        ├── main.py             (FastAPI 서버 — 엔드포인트 모음)
        ├── qwen_tts.py         (Qwen3-TTS 래퍼 — 프리셋 + 클로닝)
        ├── chatterbox_tts.py   (Chatterbox 래퍼 — 클로닝)
        └── requirements.txt
```

## 🚀 설치 방법

### 1단계. TTS 서버 실행 (Docker)
```bash
cd docker
docker-compose up -d
```
처음 실행 시 모델 다운로드로 5~10분 소요될 수 있어요.

### 2단계. 확장 설치
`extension/` 폴더를 아래 경로에 복사:
```
SillyTavern/public/scripts/extensions/third-party/local-tts/
```

### 3단계. SillyTavern 재시작 후 활성화
Extensions 탭 → Local TTS → 활성화 체크

---

## 🎛️ 기능 요약

| 기능 | Qwen | Chatterbox |
|------|------|-----------|
| 프리셋 목소리 (9종) | ✅ | ❌ |
| 보이스 클로닝 | ✅ (3초~) | ✅ (10초~) |
| 감정 강도 조절 | ❌ | ✅ |
| VRAM 사용량 | ~1.5GB | ~2GB |

---

## 🌐 서버 API

| 엔드포인트 | 설명 |
|-----------|------|
| `GET  /health` | 서버 상태 & VRAM 사용량 |
| `GET  /models` | 사용 가능한 모델 목록 |
| `POST /switch` | 모델 전환 (VRAM 자동 정리) |
| `POST /tts` | 음성 생성 (WAV 반환) |
| `POST /clone/youtube` | 유튜브 → 목소리 샘플 추출 |
| `DELETE /clone/{id}` | 클로닝 샘플 삭제 |
| `POST /unload` | 모델 언로드 & VRAM 해제 |

---

## 💻 요구사양
- NVIDIA GPU (VRAM 4GB 이상, 권장 8GB)
- Docker Desktop + NVIDIA Container Toolkit (Windows)
- CUDA 12.1 이상
