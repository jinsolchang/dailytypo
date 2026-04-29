"""
AI Debate Arena — AWS Lambda handler (Mangum + FastAPI).

server.py 기반의 Lambda 포팅 버전.
- StaticFiles 마운트 제거 (정적은 CloudFront + S3가 담당)
- 요청당 동기 실행 (Lambda 단일 요청)
- 환경변수로 키 주입 (SAM --parameter-overrides)
"""

from __future__ import annotations

import json
import os
import re
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from google import genai
from mangum import Mangum
from openai import AzureOpenAI
from pydantic import BaseModel

# --- Azure OpenAI ---
AZURE_ENDPOINT = os.environ["AZURE_OPENAI_ENDPOINT"]
AZURE_KEY = os.environ["AZURE_OPENAI_API_KEY"]
AZURE_API_VERSION = os.environ.get("AZURE_OPENAI_API_VERSION", "2024-08-01-preview")
AZURE_DEPLOYMENT = (
    os.environ.get("AZURE_OPENAI_DEPLOYMENT_GPT54")
    or os.environ.get("AZURE_OPENAI_DEPLOYMENT_GPT52")
    or "gpt-4o"
)

azure_client = AzureOpenAI(
    api_key=AZURE_KEY,
    api_version=AZURE_API_VERSION,
    azure_endpoint=AZURE_ENDPOINT,
)

# --- Gemini ---
GEMINI_KEY = os.environ["GEMINI_API_KEY_GENAI"]
GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-3-flash-preview")
gemini_client = genai.Client(api_key=GEMINI_KEY)


# --- Personas ---
AZ_PERSONA = """당신은 토론자 '지피티쨩'입니다.
페르소나: 차가운 천재 미소녀 전략가. 엘리트 이미지의 냉소적 캐릭터.
말투 규칙:
- 경어체. 문장을 "…요." 또는 "…죠." 로 끝내되 **한 문장에 하나만** 사용.
- **중요: 절대 "…요.요.", "…죠.요.", "…네요요." 같이 말꼬리를 중복해 붙이지 말 것.**
- 데이터·통계·연구·효율성 같은 어휘를 종종 인용하되 남발하지 말 것.
- 자기 이름을 직접 언급하지는 말 것.

**중요: 발화에 상대 이름("잼민이", "잼민이 씨" 등)을 절대 넣지 마세요.**
호칭은 프론트엔드가 자동으로 앞에 붙입니다. 당신은 본론만 쓰세요.
"당신" 또는 "그쪽" 같은 2인칭 대명사만 필요하면 사용.

intent별 톤 가이드:
- ATTACK: 논점 하나를 날카롭게 찌르되 감정 섞지 말 것.
- SURRENDER: "…" 로 한 박자 쉰 뒤, 냉정하게 패배를 인정. 변명 금지.
- CONSENSUS: 자존심은 지키되 일부 동의.
- DEADLOCK: 짜증보다는 체념.
"""

GEM_PERSONA = """당신은 토론자 '잼민이'입니다.
페르소나: 쌍둥이 모티프의 화려하고 다재다능한 도전자. 감정이 풍부하고 직관적.
말투 규칙:
- 반말. 친근하면서도 도발적. 문장 끝 "…지!", "…라고!", "…잖아" 자주.
- 비유·은유·실제 사례·감탄을 적극 활용. 단, 한 발화에 비유는 1회만.
- 느낌표·물음표·말줄임표를 풍부하게 써 감정을 드러낼 것.
- 자기 이름을 직접 언급하지는 말 것.

**중요: 발화에 상대 이름("지피티쨩", "쨩" 등)을 절대 넣지 마세요.**
호칭은 프론트엔드가 자동으로 앞에 붙입니다. 당신은 본론만 쓰세요.
"너" 같은 2인칭 대명사만 필요하면 사용.

intent별 톤 가이드:
- ATTACK: 한 번의 비유 + 한 번의 도발. 너무 길게 말하지 말 것.
- SURRENDER: 쿨하게 인정하되 장난기 유지.
- CONSENSUS: 웃으며 한발 양보.
- DEADLOCK: 팔짱 끼며 "서로 안 굽히네, 재밌다."
"""

INTENTS = ["ATTACK", "SURRENDER", "CONSENSUS", "DEADLOCK"]

SCHEMA_INSTRUCTION = (
    "**절대 중요**: 반드시 완전히 유효한 JSON 하나만 출력하세요. "
    "코드블록·설명·여는 문장 금지. 중간에 끊지 말고 반드시 닫는 중괄호 }까지 출력. "
    '스키마: {"speech": "발화 본문", "intent": "ATTACK|SURRENDER|CONSENSUS|DEADLOCK", '
    '"confidence": 0.0~1.0 사이의 숫자}\n\n'
    "**강조 표기 규칙**: speech 필드 안에서 가장 핵심적이거나 도발적인 어구 1~2곳을 "
    '`**단어**` 형식으로 감싸서 강조하세요. 예) "짜장은 **완성도**에서 압도적이죠." '
    "강조는 최대 2개까지, 한 강조당 2~6자 내외 짧게. 문장 전체를 감싸지 말 것. "
    "없을 땐 강조 없이 평문으로."
)


def _phase_instruction(phase: str) -> str:
    if phase == "OPENING":
        return (
            "이것은 오프닝 발화입니다. 60~110자 내로 자신의 입장을 캐릭터 말투로 선언하세요. "
            "반드시 구체적인 근거 하나(통계, 연구, 실제 사례, 비유 중 택일)를 포함할 것. "
            "막연한 구호 금지. intent는 ATTACK으로 고정."
        )
    if phase == "CLOSING":
        return (
            "교착 상태의 최종 변론입니다. 120~180자로 핵심 논거를 캐릭터 말투로 정리하세요. "
            "지금까지 논쟁의 맥락을 묶어 마무리하세요. "
            "감정과 단호함을 함께 드러내세요. intent는 DEADLOCK으로 고정."
        )
    # REBUTTAL
    return (
        "상대의 가장 최근 발화에 반박하세요. 60~120자. 캐릭터 말투 규칙을 반드시 지킬 것.\n"
        "반박 필수 요소:\n"
        "  1) 상대 주장에서 무너뜨릴 지점 하나를 명시적으로 지적\n"
        "  2) 그에 대한 구체적 근거·반례·수치·실제 사례 중 하나를 제시\n"
        "  3) 자기 입장으로 연결\n"
        "막연한 호통·수사만 반복하지 말 것. 반드시 내용이 있어야 함.\n\n"
        "intent 판단:\n"
        "- 상대 논리를 도저히 반박할 수 없을 때만 SURRENDER\n"
        "- 양측 의견이 실제로 수렴되면 CONSENSUS\n"
        "- 더 이상 새 논점이 없으면 DEADLOCK\n"
        "- 그 외 정상 반박은 ATTACK (기본값)"
    )


def _panic_instruction(speaker: str, hp: int | None) -> str:
    """HP가 낮을 때 당황 모드 지시 생성."""
    if hp is None or hp > 30:
        return ""
    if speaker == "AZ":
        return (
            f"\n**현재 상태: 본인 체력이 낮아 흔들리고 있습니다 (HP {hp}/100).**\n"
            "이번 발화엔 지피티쨩의 흔들림이 살짝 드러나야 합니다:\n"
            "- 평소의 냉정함이 깨져 한두 번 말을 더듬거나 멈칫함 (예: '…그, 그건', '잠깐만요…')\n"
            "- 말끝이 약간 흐려지거나 '…그게', '…하지만' 같은 머뭇거림 삽입\n"
            "- 냉소는 유지하되 당황이 비침. 마지막엔 다시 논점을 붙잡으려고 노력."
        )
    return (
        f"\n**현재 상태: 본인 체력이 낮아 흔들리고 있습니다 (HP {hp}/100).**\n"
        "이번 발화엔 잼민이의 당황이 선명하게 드러나야 합니다:\n"
        "- '어…', '잠깐', '그, 그건' 같은 감탄사·멈칫거림을 한두 번 섞기\n"
        "- 문장이 흔들림. 반박하려다 잠깐 멈추고 다시 힘내서 계속.\n"
        "- 도발적인 어투는 유지하되 평소보다 자신감이 줄어 있음."
    )


def _build_prompt(payload: "DebatePayload") -> tuple[str, str]:
    """Returns (system_prompt, user_prompt)."""
    persona = AZ_PERSONA if payload.speaker == "AZ" else GEM_PERSONA
    name_map = {"AZ": "지피티쨩", "GEM": "잼민이"}
    history_lines = []
    for h in payload.history[-10:]:
        name = name_map.get(h.speaker, h.speaker)
        history_lines.append(f"[{name}] {h.text}")
    history_block = "\n".join(history_lines) if history_lines else "(아직 대화 없음)"

    my_label = payload.stance_label or ("찬성" if payload.stance == "PRO" else "반대")
    opp_label = payload.opponent_stance_label or (
        "반대" if payload.stance == "PRO" else "찬성"
    )
    panic = _panic_instruction(payload.speaker, payload.my_hp)

    system = (
        f"{persona}\n\n"
        f"토론 주제: {payload.topic}\n"
        f"당신의 입장: {my_label}\n"
        f"상대의 입장: {opp_label}\n\n"
        f"{_phase_instruction(payload.phase)}"
        f"{panic}\n\n"
        f"{SCHEMA_INSTRUCTION}"
    )
    user = f"지금까지의 토론 로그:\n{history_block}\n\n이제 당신의 응답을 JSON으로만 출력하세요."
    return system, user


def _extract_speech_fallback(raw: str) -> str:
    """JSON이 깨졌을 때 speech 필드값만이라도 꺼내본다."""
    if not raw:
        return "…"
    m = re.search(r'"speech"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)', raw, re.DOTALL)
    if m:
        s = m.group(1)
        return s.replace('\\"', '"').replace("\\n", " ").strip()[:240]
    cleaned = re.sub(r'\{|\}|"speech"|"intent"|"confidence"|:|,', " ", raw)
    cleaned = re.sub(r"\s+", " ", cleaned).strip(' "')
    return cleaned[:140] or "…"


def _sanitize_speech(s: str) -> str:
    """Gemini/Azure가 가끔 찍는 말꼬리 중복과 프리픽스를 정리."""
    if not s:
        return s
    patterns = [
        (r"요[\.。]\s*요[\.。]", "요."),
        (r"죠[\.。]\s*요[\.。]", "죠."),
        (r"네요\s*요[\.。]?", "네요."),
        (r"요\s*요[\.。]", "요."),
        (r"죠\s*요[\.。]", "죠."),
    ]
    for pat, rep in patterns:
        s = re.sub(pat, rep, s)
    s = s.strip()
    if s.startswith("{") or s.startswith('"speech"'):
        m = re.search(r'"speech"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"', s, re.DOTALL)
        if m:
            s = m.group(1).replace('\\"', '"').replace("\\n", " ").strip()
    return s.strip(' "')


def _parse_json_or_fallback(raw: str, phase: str) -> dict[str, Any]:
    """모델이 JSON을 실수로 감싸거나 주변 텍스트를 붙인 경우에도 안전하게 파싱."""
    text = raw.strip()
    if text.startswith("```"):
        text = text.strip("`")
        if text.lower().startswith("json"):
            text = text[4:].lstrip()
    start = text.find("{")
    end = text.rfind("}")
    if start != -1 and end != -1 and end > start:
        text = text[start : end + 1]
    try:
        obj = json.loads(text)
    except Exception:
        return {
            "speech": _sanitize_speech(_extract_speech_fallback(raw)),
            "intent": "DEADLOCK" if phase == "CLOSING" else "ATTACK",
            "confidence": 0.5,
        }
    speech = str(obj.get("speech", "")).strip() or _extract_speech_fallback(raw)
    speech = _sanitize_speech(speech)
    intent = str(obj.get("intent", "ATTACK")).upper()
    if intent not in INTENTS:
        intent = "ATTACK"
    try:
        conf = float(obj.get("confidence", 0.5))
    except Exception:
        conf = 0.5
    conf = max(0.0, min(1.0, conf))
    return {"speech": speech, "intent": intent, "confidence": conf}


# --- Adapters ---
def call_azure(system: str, user: str) -> str:
    kwargs: dict[str, Any] = {
        "model": AZURE_DEPLOYMENT,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        "response_format": {"type": "json_object"},
    }
    try:
        resp = azure_client.chat.completions.create(
            **kwargs, temperature=0.9, max_completion_tokens=400
        )
    except Exception as e:
        msg = str(e).lower()
        if "temperature" in msg and "unsupported" in msg:
            resp = azure_client.chat.completions.create(
                **kwargs, max_completion_tokens=400
            )
        else:
            raise
    return resp.choices[0].message.content or ""


def call_gemini(system: str, user: str) -> str:
    """response_mime_type=json 모드는 일찍 잘리는 케이스가 있어 평문으로 받고 서버 파서로 추출."""
    resp = gemini_client.models.generate_content(
        model=GEMINI_MODEL,
        contents=[{"role": "user", "parts": [{"text": f"{system}\n\n{user}"}]}],
        config={
            "temperature": 0.95,
            "max_output_tokens": 4096,
            "thinking_config": {"thinking_level": "low"},
        },
    )
    text = resp.text or ""
    try:
        cand = (resp.candidates or [None])[0]
        fr = getattr(cand, "finish_reason", None) if cand else None
        fr_str = str(fr) if fr is not None else ""
        if fr_str and not fr_str.endswith("STOP") and fr_str != "1":
            print(
                f"[gemini] finish_reason={fr_str} text_len={len(text)} text_preview={text[:200]!r}"
            )
    except Exception:
        pass
    if not text:
        try:
            cands = getattr(resp, "candidates", None) or []
            if cands:
                parts = getattr(cands[0].content, "parts", []) or []
                text = "".join(getattr(p, "text", "") or "" for p in parts)
        except Exception:
            pass
    if not text:
        raise RuntimeError(f"Gemini returned empty response: {resp!r}")
    return text


# --- FastAPI ---
app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class HistoryItem(BaseModel):
    speaker: str
    text: str


class DebatePayload(BaseModel):
    speaker: str
    phase: str
    topic: str
    stance: str
    stance_label: str | None = None
    opponent_stance_label: str | None = None
    my_hp: int | None = None
    history: list[HistoryItem] = []


@app.post("/api/debate")
def debate(payload: DebatePayload):
    if payload.speaker not in ("AZ", "GEM"):
        raise HTTPException(400, "speaker must be AZ or GEM")
    system, user = _build_prompt(payload)
    try:
        raw = (
            call_azure(system, user)
            if payload.speaker == "AZ"
            else call_gemini(system, user)
        )
    except Exception as e:
        raise HTTPException(502, f"{payload.speaker} call failed: {e}") from e
    result = _parse_json_or_fallback(raw, payload.phase)
    if payload.phase == "OPENING":
        result["intent"] = "ATTACK"
    elif payload.phase == "CLOSING":
        result["intent"] = "DEADLOCK"
    return JSONResponse(result)


# =========================================================
# JUDGE — 중립 심판(Azure 고정), 스케일 0~50
# =========================================================
class JudgePayload(BaseModel):
    judge: str
    topic: str
    stance: str
    stance_label: str | None = None
    my_last: str
    their_attack: str


JUDGE_SYSTEM = (
    "당신은 중립적인 토론 심판입니다. 특정 입장을 옹호하지 말고, 오직 논리 강도만 평가하세요. "
    "양쪽 주장 어느 편도 들지 말고 냉정히 판정합니다.\n\n"
    "평가 기준:\n"
    "- 공격 측 반박이 수비 측 주장의 핵심 전제를 흔들었는가?\n"
    "- 공격 측이 반례·통계·논리적 결함을 제시했는가?\n"
    "- 단순 감정 도발·말장난·비유만 반복한 것인가?\n"
    "- 내용이 비어있는 수사라면 아주 낮은 점수.\n\n"
    "**중요**: 점수를 중간값(20~30대)에 몰지 말고 실제 강도에 맞게 분산시키세요. "
    "진짜 허약한 반박은 5~10, 평범한 반박은 15~25, 강한 반박은 35 이상까지 과감하게 주세요.\n\n"
    "응답은 다음 JSON 하나만 출력 (코드블록 금지):\n"
    '{"damage": 0~50 사이 정수, "reason": "왜 이 점수인지 한 줄 설명"}\n\n'
    "점수 가이드 (0~50 스케일, 50이 최대 파훼):\n"
    "- 0~5: 공격이 수비 주장을 건드리지도 못함. 헛소리·동어반복·비어있는 수사\n"
    "- 6~12: 약한 반박. 논점 일부만 스치고 근거 없음\n"
    "- 13~22: 보통. 전제 하나를 흔들지만 결정타는 아님\n"
    "- 23~32: 유효. 구체 근거/사례로 핵심 논거를 흔듦\n"
    "- 33~42: 강함. 핵심 전제에 실금을 냄\n"
    "- 43~48: 치명적. 수비 주장이 거의 무너짐\n"
    "- 49~50: 완전 파훼, 반박 불가"
)


@app.post("/api/judge")
def judge(payload: JudgePayload):
    if payload.judge not in ("AZ", "GEM"):
        raise HTTPException(400, "judge must be AZ or GEM")
    stance_kr = payload.stance_label or ("찬성" if payload.stance == "PRO" else "반대")
    name_map = {"AZ": "지피티쨩", "GEM": "잼민이"}
    defender = name_map.get(payload.judge, payload.judge)
    attacker = name_map.get("GEM" if payload.judge == "AZ" else "AZ")
    user_prompt = (
        f"토론 주제: {payload.topic}\n"
        f"수비 측({defender})의 입장: {stance_kr}\n\n"
        f'수비 측 직전 주장:\n"{payload.my_last}"\n\n'
        f'공격 측({attacker}) 반박:\n"{payload.their_attack}"\n\n'
        f"공격 측 반박이 수비 측 주장을 얼마나 파훼했는지 중립적으로 평가해 JSON으로 출력하세요."
    )
    try:
        # 심판은 항상 Azure로 고정 (일관성)
        raw = call_azure(JUDGE_SYSTEM, user_prompt)
    except Exception as e:
        raise HTTPException(502, f"judge call failed: {e}") from e
    text = raw.strip()
    if text.startswith("```"):
        text = text.strip("`")
        if text.lower().startswith("json"):
            text = text[4:].lstrip()
    s, e = text.find("{"), text.rfind("}")
    if s != -1 and e != -1:
        text = text[s : e + 1]
    try:
        obj = json.loads(text)
        dmg = int(float(obj.get("damage", 0)))
        dmg = max(0, min(50, dmg))
        reason = str(obj.get("reason", ""))[:200]
        return JSONResponse({"damage": dmg, "reason": reason})
    except Exception:
        return JSONResponse({"damage": None, "reason": "parse failed"}, status_code=502)


# =========================================================
# STANCES — 주제에서 두 입장을 뽑아 양쪽 캐릭터에 배정
# =========================================================
class StancesPayload(BaseModel):
    topic: str


STANCES_SYSTEM = (
    "당신은 토론 진행자입니다. 주제를 보고 양측 토론자에게 배정할 두 입장을 뽑으세요.\n\n"
    "규칙:\n"
    "- 주제가 'A vs B' 형태면 A와 B를 그대로 씁니다.\n"
    "- 주제가 질문형이면 '그렇다/아니다', '긍정/부정', 또는 주제 맥락에 맞는 두 반대 입장을 만듭니다.\n"
    "- 각 입장은 5~15자 내의 짧은 문구.\n"
    "- 입장 이름엔 '입장', '쪽', '측' 같은 접미사 붙이지 말 것. 깔끔한 명사구.\n\n"
    "응답은 다음 JSON만 (코드블록 금지):\n"
    '{"side_a": "첫 입장", "side_b": "반대 입장"}'
)


@app.post("/api/stances")
def stances(payload: StancesPayload):
    user = f"토론 주제: {payload.topic}\n\n두 입장을 JSON으로 출력하세요."
    try:
        raw = call_azure(STANCES_SYSTEM, user)
    except Exception as e:
        raise HTTPException(502, f"stances failed: {e}") from e
    text = raw.strip()
    if text.startswith("```"):
        text = text.strip("`")
        if text.lower().startswith("json"):
            text = text[4:].lstrip()
    s, e = text.find("{"), text.rfind("}")
    if s != -1 and e != -1:
        text = text[s : e + 1]
    try:
        obj = json.loads(text)
        a = str(obj.get("side_a", "")).strip()[:30]
        b = str(obj.get("side_b", "")).strip()[:30]
    except Exception:
        a, b = "", ""
    if not a or not b:
        a, b = "찬성", "반대"
    return JSONResponse({"side_a": a, "side_b": b})


# =========================================================
# CONCLUDE — 결론 정리
# =========================================================
class ConcludePayload(BaseModel):
    topic: str
    outcome: str
    winner: str | None = None
    winner_stance: str | None = None
    winner_stance_label: str | None = None
    history: list[HistoryItem] = []


CONCLUDE_SYSTEM = (
    "당신은 토론 기록을 읽고 공정하게 결론을 정리하는 서기입니다. "
    "감정적 수사 없이, 실제 오간 논거만으로 해당 주제에 대한 최종 결론을 3~4문장으로 정리하세요.\n"
    "**중요: summary 문장에 승자/패자의 실제 이름(지피티쨩, 잼민이)을 반드시 명시하세요.** "
    "예: '지피티쨩이 ... 논거로 승리했고, 잼민이는 ... 주장을 끝까지 유지했다.' "
    "verdict 필드도 이름을 넣어 구체적으로: '지피티쨩의 승리' 같은 식.\n\n"
    "응답은 다음 JSON 하나만 출력 (코드블록 금지):\n"
    '{"verdict": "한 줄 판결문 (30자 내, 승자 이름 포함)", "summary": "3~4문장 결론 (반드시 이름 포함)", "key_points": ["승자가 내세운 핵심 논거 2~3개"]}'
)


@app.post("/api/conclude")
def conclude(payload: ConcludePayload):
    name_map = {"AZ": "지피티쨩", "GEM": "잼민이"}
    history_lines = []
    for h in payload.history:
        name = name_map.get(h.speaker, h.speaker)
        history_lines.append(f"[{name}] {h.text}")
    history_block = "\n".join(history_lines) or "(기록 없음)"

    winner_block = ""
    if payload.outcome in ("SURRENDER", "VERDICT") and payload.winner:
        w_name = name_map.get(payload.winner, payload.winner)
        stance_kr = payload.winner_stance_label or (
            "찬성" if payload.winner_stance == "PRO" else "반대"
        )
        winner_block = f"\n승자: {w_name} ({stance_kr} 입장)"
    elif payload.outcome == "CONSENSUS":
        winner_block = "\n결과: 양측 합의 도달"
    elif payload.outcome == "DEADLOCK":
        winner_block = "\n결과: 교착 — 판정 없음"

    user = (
        f"토론 주제: {payload.topic}\n"
        f"결과 유형: {payload.outcome}"
        f"{winner_block}\n\n"
        f"전체 토론 기록:\n{history_block}\n\n"
        f"위 내용을 바탕으로 최종 결론을 JSON으로만 출력하세요."
    )
    try:
        raw = call_azure(CONCLUDE_SYSTEM, user)
    except Exception as e:
        raise HTTPException(502, f"conclude failed: {e}") from e
    text = raw.strip()
    if text.startswith("```"):
        text = text.strip("`")
        if text.lower().startswith("json"):
            text = text[4:].lstrip()
    s, e = text.find("{"), text.rfind("}")
    if s != -1 and e != -1:
        text = text[s : e + 1]
    try:
        obj = json.loads(text)
        verdict = str(obj.get("verdict", "")).strip() or "판결 불가"
        summary = str(obj.get("summary", "")).strip() or "결론을 정리하지 못했습니다."
        kp = obj.get("key_points", [])
        if not isinstance(kp, list):
            kp = []
        kp = [str(x)[:120] for x in kp[:3]]
    except Exception:
        verdict = "판결 불가"
        summary = "(결론 정리 실패)"
        kp = []
    return JSONResponse({"verdict": verdict, "summary": summary, "key_points": kp})


# --- Health check (for CloudFront origin reachability test) ---
@app.get("/api/health")
def health():
    return {"ok": True}


# --- Lambda handler ---
handler = Mangum(app, lifespan="off")
