// ================================================================
// Local TTS Extension for SillyTavern
// 지원 모델: Qwen3-TTS (프리셋 + 클로닝) / Chatterbox (클로닝)
// ================================================================

import { extension_settings, saveSettingsDebounced } from "/scripts/extensions.js";
import { eventSource, event_types } from "/script.js";
```
const EXT_NAME = "local-tts";
const SERVER_URL = "http://localhost:7851";

// ================================================================
// 기본 설정값
// ================================================================
const defaultSettings = {
    enabled: false,
    model: "qwen",              // "qwen" | "chatterbox"
    serverUrl: SERVER_URL,
    autoStart: true,

    // 공통
    volume: 1.0,
    speed: 1.0,                 // 재생 속도 (0.5x ~ 2.0x)

    // 보이스 클로닝 (Qwen Base / Chatterbox 공통)
    cloneVoiceId: null,         // 유튜브에서 추출한 목소리 ID
    cloneVoiceName: null,       // 유튜브 영상 제목

    // Qwen 전용
    speaker: "Sunny",           // 프리셋 목소리 (클로닝 없을 때 사용)

    // Chatterbox 전용
    exaggeration: 0.5,          // 감정 강도 (0.0 ~ 1.0)
    cfgWeight: 0.5,             // CFG Weight (0.0 ~ 1.0)
};

// ================================================================
// 전역 변수
// ================================================================
let currentAudio = null;        // 현재 재생 중인 오디오 객체

// ================================================================
// 설정 패널 UI 생성
// ================================================================
function addSettingsUI() {
    const html = `
    <div id="local-tts-settings" class="local-tts-panel">

        <!-- 헤더 -->
        <h4>
            <span class="local-tts-icon">🔊</span>
            Local TTS
            <span id="local-tts-status-badge" class="local-tts-badge badge-off">OFF</span>
        </h4>

        <!-- ── 활성화 토글 ── -->
        <div class="local-tts-row">
            <label class="local-tts-toggle-label">
                <input type="checkbox" id="local-tts-enabled">
                <span>TTS 활성화</span>
            </label>
        </div>

        <!-- ── 모델 선택 ── -->
        <div class="local-tts-row">
            <label>모델 선택</label>
            <select id="local-tts-model" class="local-tts-select">
                <option value="qwen">Qwen3-TTS (빠름, 프리셋 + 클로닝)</option>
                <option value="chatterbox">Chatterbox (원어민 발음, 클로닝)</option>
            </select>
        </div>

        <!-- ── 서버 주소 ── -->
        <div class="local-tts-row">
            <label>서버 주소</label>
            <input type="text" id="local-tts-server"
                   class="local-tts-input" placeholder="http://localhost:7851">
        </div>

        <!-- ── 볼륨 ── -->
        <div class="local-tts-row">
            <label>볼륨 <span id="local-tts-volume-val">1.0</span></label>
            <input type="range" id="local-tts-volume"
                   min="0" max="1" step="0.1" class="local-tts-range">
        </div>

        <!-- ── 재생 속도 ── -->
        <div class="local-tts-row">
            <label>재생 속도 <span id="local-tts-speed-val">1.0x</span></label>
            <input type="range" id="local-tts-speed"
                   min="0.5" max="2.0" step="0.25" class="local-tts-range">
            <div class="local-tts-speed-labels">
                <span>0.5x</span><span>1.0x</span><span>1.5x</span><span>2.0x</span>
            </div>
        </div>

        <!-- ── Qwen 전용: 프리셋 목소리 ── -->
        <div id="local-tts-qwen-opts" class="local-tts-section">
            <div class="local-tts-section-title">Qwen 옵션</div>
            <div class="local-tts-row">
                <label>프리셋 목소리 <span class="local-tts-hint">(클로닝 미사용 시)</span></label>
                <select id="local-tts-speaker" class="local-tts-select">
                    <option value="Sunny">Sunny — 여성, 밝음</option>
                    <option value="David">David — 남성, 차분</option>
                    <option value="Emily">Emily — 여성, 부드러움</option>
                    <option value="Alex">Alex — 중성</option>
                    <option value="Luna">Luna — 여성, 따뜻함</option>
                    <option value="Ryan">Ryan — 남성, 활기참</option>
                    <option value="Aria">Aria — 여성, 명확함</option>
                    <option value="John">John — 남성, 안정감</option>
                    <option value="Mia">Mia — 여성, 경쾌함</option>
                </select>
            </div>
        </div>

        <!-- ── Chatterbox 전용: 감정 옵션 ── -->
        <div id="local-tts-chatterbox-opts" class="local-tts-section" style="display:none;">
            <div class="local-tts-section-title">Chatterbox 옵션</div>
            <div class="local-tts-row">
                <label>감정 강도 <span id="local-tts-exaggeration-val">0.5</span></label>
                <input type="range" id="local-tts-exaggeration"
                       min="0" max="1" step="0.05" class="local-tts-range">
            </div>
            <div class="local-tts-row">
                <label>CFG Weight <span id="local-tts-cfg-val">0.5</span></label>
                <input type="range" id="local-tts-cfg"
                       min="0" max="1" step="0.05" class="local-tts-range">
            </div>
        </div>

        <!-- ── 보이스 클로닝 (공통) ── -->
        <div class="local-tts-section">
            <div class="local-tts-section-title">🎤 보이스 클로닝</div>

            <!-- 유튜브 링크 입력 -->
            <div class="local-tts-row">
                <label>유튜브 링크</label>
                <div class="local-tts-url-row">
                    <input type="text" id="local-tts-youtube-url"
                           class="local-tts-input"
                           placeholder="https://www.youtube.com/watch?v=...">
                    <button id="local-tts-youtube-load" class="local-tts-btn btn-primary btn-sm">
                        추출
                    </button>
                </div>
                <span class="local-tts-hint">* 10~15초 구간이 자동 추출돼요 (Qwen: 3초도 가능)</span>
            </div>

            <!-- 클로닝 상태 표시 -->
            <div id="local-tts-clone-status" class="local-tts-clone-status" style="display:none;">
                <span id="local-tts-clone-name"></span>
                <button id="local-tts-clone-clear" class="local-tts-btn btn-secondary btn-xs">
                    초기화
                </button>
            </div>
        </div>

        <!-- ── 버튼 영역 ── -->
        <div class="local-tts-buttons">
            <button id="local-tts-test" class="local-tts-btn btn-primary">연결 테스트</button>
            <button id="local-tts-stop" class="local-tts-btn btn-secondary">재생 중지</button>
        </div>

        <!-- ── 상태 메시지 ── -->
        <div id="local-tts-message" class="local-tts-message"></div>

    </div>`;

    $("#extensions_settings").append(html);
}

// ================================================================
// 설정 로드 (저장된 값 → UI 반영)
// ================================================================
function loadSettings() {
    extension_settings[EXT_NAME] = extension_settings[EXT_NAME] || {};
    // 기본값 위에 저장된 값 덮어쓰기
    Object.assign(
        extension_settings[EXT_NAME],
        { ...defaultSettings, ...extension_settings[EXT_NAME] }
    );

    const s = extension_settings[EXT_NAME];
    $("#local-tts-enabled").prop("checked", s.enabled);
    $("#local-tts-model").val(s.model);
    $("#local-tts-server").val(s.serverUrl);
    $("#local-tts-volume").val(s.volume);
    $("#local-tts-volume-val").text(s.volume);
    $("#local-tts-speed").val(s.speed);
    $("#local-tts-speed-val").text(s.speed + "x");
    $("#local-tts-speaker").val(s.speaker);
    $("#local-tts-exaggeration").val(s.exaggeration);
    $("#local-tts-exaggeration-val").text(s.exaggeration);
    $("#local-tts-cfg").val(s.cfgWeight);
    $("#local-tts-cfg-val").text(s.cfgWeight);

    // 클로닝 목소리 복원
    if (s.cloneVoiceName) {
        $("#local-tts-clone-status").show();
        $("#local-tts-clone-name").text("✅ " + s.cloneVoiceName);
    }

    updateBadge(s.enabled);
    toggleModelOptions(s.model);
}

// ================================================================
// 이벤트 리스너 등록
// ================================================================
function attachEventListeners() {

    // ── 활성화 토글 ──────────────────────────────────────────────
    $("#local-tts-enabled").on("change", function () {
        extension_settings[EXT_NAME].enabled = this.checked;
        updateBadge(this.checked);
        saveSettingsDebounced();
    });

    // ── 모델 선택 ────────────────────────────────────────────────
    $("#local-tts-model").on("change", async function () {
        extension_settings[EXT_NAME].model = this.value;
        toggleModelOptions(this.value);
        saveSettingsDebounced();

        if (extension_settings[EXT_NAME].autoStart) {
            await switchModel(this.value);
        }
    });

    // ── 서버 주소 ────────────────────────────────────────────────
    $("#local-tts-server").on("change", function () {
        extension_settings[EXT_NAME].serverUrl = this.value;
        saveSettingsDebounced();
    });

    // ── 볼륨 ─────────────────────────────────────────────────────
    $("#local-tts-volume").on("input", function () {
        extension_settings[EXT_NAME].volume = parseFloat(this.value);
        $("#local-tts-volume-val").text(this.value);
        saveSettingsDebounced();
    });

    // ── 재생 속도 ─────────────────────────────────────────────────
    $("#local-tts-speed").on("input", function () {
        extension_settings[EXT_NAME].speed = parseFloat(this.value);
        $("#local-tts-speed-val").text(this.value + "x");
        saveSettingsDebounced();
    });

    // ── Qwen: 프리셋 목소리 ───────────────────────────────────────
    $("#local-tts-speaker").on("change", function () {
        extension_settings[EXT_NAME].speaker = this.value;
        saveSettingsDebounced();
    });

    // ── Chatterbox: 감정 강도 ─────────────────────────────────────
    $("#local-tts-exaggeration").on("input", function () {
        extension_settings[EXT_NAME].exaggeration = parseFloat(this.value);
        $("#local-tts-exaggeration-val").text(this.value);
        saveSettingsDebounced();
    });

    // ── Chatterbox: CFG ───────────────────────────────────────────
    $("#local-tts-cfg").on("input", function () {
        extension_settings[EXT_NAME].cfgWeight = parseFloat(this.value);
        $("#local-tts-cfg-val").text(this.value);
        saveSettingsDebounced();
    });

    // ── 유튜브 클로닝 추출 ────────────────────────────────────────
    $("#local-tts-youtube-load").on("click", async () => {
        const url = $("#local-tts-youtube-url").val().trim();
        if (!url) return showMessage("유튜브 링크를 입력해주세요.", "error");

        showMessage("유튜브에서 음성 추출 중... (30초 정도 걸릴 수 있어요)", "info");
        $("#local-tts-youtube-load").prop("disabled", true);

        try {
            const s = extension_settings[EXT_NAME];
            const res = await fetch(`${s.serverUrl}/clone/youtube`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ url }),
            });

            if (!res.ok) throw new Error(await res.text());
            const data = await res.json();

            // 설정에 저장
            extension_settings[EXT_NAME].cloneVoiceId = data.voice_id;
            extension_settings[EXT_NAME].cloneVoiceName = data.title;
            saveSettingsDebounced();

            // UI 업데이트
            $("#local-tts-clone-status").show();
            $("#local-tts-clone-name").text("✅ " + data.title);
            $("#local-tts-youtube-url").val("");
            showMessage("보이스 클로닝 준비 완료!", "success");

        } catch (err) {
            console.error("[Local TTS] 클로닝 오류:", err);
            showMessage("❌ 추출 실패: " + err.message, "error");
        } finally {
            $("#local-tts-youtube-load").prop("disabled", false);
        }
    });

    // ── 클로닝 초기화 ─────────────────────────────────────────────
    $("#local-tts-clone-clear").on("click", async () => {
        const s = extension_settings[EXT_NAME];
        if (s.cloneVoiceId) {
            await fetch(`${s.serverUrl}/clone/${s.cloneVoiceId}`, { method: "DELETE" });
        }
        extension_settings[EXT_NAME].cloneVoiceId = null;
        extension_settings[EXT_NAME].cloneVoiceName = null;
        saveSettingsDebounced();
        $("#local-tts-clone-status").hide();
        showMessage("클로닝 목소리 초기화됨", "info");
    });

    // ── 연결 테스트 ───────────────────────────────────────────────
    $("#local-tts-test").on("click", async () => {
        showMessage("연결 확인 중...", "info");
        const ok = await healthCheck();
        showMessage(
            ok ? "✅ 서버 연결 성공!" : "❌ 연결 실패. Docker가 실행 중인지 확인해주세요.",
            ok ? "success" : "error"
        );
    });

    // ── 재생 중지 ─────────────────────────────────────────────────
    $("#local-tts-stop").on("click", () => {
        stopAudio();
        showMessage("재생 중지됨", "info");
    });
}

// ================================================================
// 모델별 옵션 표시 전환
// ================================================================
function toggleModelOptions(model) {
    if (model === "chatterbox") {
        $("#local-tts-chatterbox-opts").show();
        $("#local-tts-qwen-opts").hide();
    } else {
        $("#local-tts-chatterbox-opts").hide();
        $("#local-tts-qwen-opts").show();
    }
}

// ================================================================
// 상태 배지 업데이트
// ================================================================
function updateBadge(enabled) {
    const badge = $("#local-tts-status-badge");
    badge.text(enabled ? "ON" : "OFF")
         .toggleClass("badge-on", enabled)
         .toggleClass("badge-off", !enabled);
}

// ================================================================
// 모델 전환 요청 (서버에 알림)
// ================================================================
async function switchModel(model) {
    const s = extension_settings[EXT_NAME];
    showMessage(`${model} 모델 전환 중... (처음엔 30초 정도 걸릴 수 있어요)`, "info");

    try {
        const res = await fetch(`${s.serverUrl}/switch`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ model }),
        });
        if (res.ok) showMessage(`✅ ${model} 모델 준비 완료!`, "success");
    } catch {
        showMessage("❌ 모델 전환 실패. 서버 상태를 확인해주세요.", "error");
    }
}

// ================================================================
// 서버 헬스체크
// ================================================================
async function healthCheck() {
    const s = extension_settings[EXT_NAME];
    try {
        const res = await fetch(`${s.serverUrl}/health`, {
            signal: AbortSignal.timeout(3000),
        });
        return res.ok;
    } catch {
        return false;
    }
}

// ================================================================
// 오디오 중지
// ================================================================
function stopAudio() {
    if (currentAudio) {
        currentAudio.pause();
        currentAudio = null;
    }
}

// ================================================================
// TTS 생성 및 재생 (핵심 함수)
// ================================================================
async function speakText(text) {
    const s = extension_settings[EXT_NAME];
    if (!s.enabled || !text.trim()) return;

    // 이전 재생 중지
    stopAudio();

    // 텍스트 전처리: HTML 태그, 특수문자 제거
    const cleanText = text
        .replace(/<[^>]*>/g, "")
        .replace(/[^\p{L}\p{N}\s.,!?'-]/gu, "")
        .trim();

    if (!cleanText) return;

    try {
        // ── 요청 바디 구성 ────────────────────────────────────────
        const body = {
            text: cleanText,
            model: s.model,
            language: "English",
        };

        if (s.model === "qwen") {
            body.speaker = s.speaker ?? "Sunny";
            // 클로닝 목소리가 있으면 프리셋 대신 사용
            if (s.cloneVoiceId) {
                body.voice_id = s.cloneVoiceId;
            }

        } else if (s.model === "chatterbox") {
            body.exaggeration = s.exaggeration;
            body.cfg_weight = s.cfgWeight;
            if (s.cloneVoiceId) {
                body.voice_id = s.cloneVoiceId;
            }
        }

        // ── 서버에 TTS 요청 ───────────────────────────────────────
        const res = await fetch(`${s.serverUrl}/tts`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        });

        if (!res.ok) throw new Error("TTS 서버 오류");

        // ── 오디오 재생 ───────────────────────────────────────────
        const audioBlob = await res.blob();
        const audioUrl = URL.createObjectURL(audioBlob);
        currentAudio = new Audio(audioUrl);
        currentAudio.volume = s.volume;
        currentAudio.playbackRate = s.speed ?? 1.0;
        await currentAudio.play();

        // 재생 끝나면 URL 메모리 해제
        currentAudio.onended = () => URL.revokeObjectURL(audioUrl);

    } catch (err) {
        console.error("[Local TTS] 오류:", err);
        showMessage("❌ TTS 생성 실패. 서버 상태를 확인해주세요.", "error");
    }
}

// ================================================================
// 상태 메시지 표시 (4초 후 자동 사라짐)
// ================================================================
function showMessage(msg, type = "info") {
    $("#local-tts-message")
        .text(msg)
        .removeClass("msg-info msg-success msg-error")
        .addClass(`msg-${type}`);
    setTimeout(() => $("#local-tts-message").text(""), 4000);
}

// ================================================================
// SillyTavern 이벤트 연동
// AI 메시지가 올 때마다 자동으로 TTS 실행
// ================================================================
eventSource.on(event_types.MESSAGE_RECEIVED, async () => {
    const lastMessage = $("#chat .mes").last().find(".mes_text").text();
    await speakText(lastMessage);
});

// ================================================================
// 확장 초기화
// ================================================================
jQuery(async () => {
    addSettingsUI();
    loadSettings();
    attachEventListeners();
    console.log("[Local TTS] 확장 로드 완료 ✅");
});
