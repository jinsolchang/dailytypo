# AI Debate Arena — 작업 기획서

> 두 LLM (Azure GPT vs Gemini 3 Pro)이 사용자 주제에 대해 찬반 토론을 벌이는 오타쿠풍 단일 화면 웹앱.

---

## 1. 프로젝트 개요

### 핵심 컨셉
- **한 화면, 무스크롤** 단일 페이지 애플리케이션
- 좌측: **Azure GPT** (의인화 캐릭터 1)
- 우측: **Gemini 3 Pro** (의인화 캐릭터 2)
- 중앙 상단: 사용자 주제 입력 채팅창
- 두 모델이 자동으로 찬/반 입장을 나눠 토론
- 캐릭터 머리 위 말풍선으로 발화 표시
- 스프라이트 시트 기반 캐릭터 액션 애니메이션

### 사용자 플로우
1. 사용자가 중앙 채팅창에 토론 주제 입력
2. 시스템이 두 모델에 입장 분배 (한쪽 PRO, 한쪽 CON — 랜덤 또는 고정)
3. 각 모델이 초기 주장(opening statement) 발화
4. 한 모델이 상대 주장에 반박 → 상대가 재반박 → 반복
5. 종료 조건 중 하나로 종료:
   - **항복(Surrender)**: 한 쪽이 패배 선언 → 다른 쪽 즉시 승리
   - **합의(Consensus)**: 양측이 같은 결론에 수렴
   - **교착(Deadlock)**: 최대 10턴 도달 또는 모델이 교착 판정
6. 교착 시 양측 **최종 변론(Closing Argument)** 1회씩
7. 결과 모달:
   - 항복/합의 → 승자 발표 + 토론 요약
   - 교착 → 양측 최종 변론 요약 + 사용자가 승자 선택

---

## 2. 화면 구성 (Layout)

```
┌────────────────────────────────────────────────────────────────┐
│  [상단바] 로고 / 라운드 카운터 / 상태 표시                      │
├────────────────┬─────────────────────────┬─────────────────────┤
│                │   [중앙 상단]           │                     │
│                │   주제 입력 채팅창       │                     │
│   [좌측]       │   현재 라운드 표시       │    [우측]           │
│   Azure GPT    │                         │   Gemini 3 Pro      │
│   캐릭터       │   [중앙 하단]           │   캐릭터            │
│   + 말풍선     │   토론 로그 타임라인     │   + 말풍선          │
│   + 스탯HP     │   (자동 스크롤)         │   + 스탯HP          │
│                │                         │                     │
├────────────────┴─────────────────────────┴─────────────────────┤
│  [하단] 컨트롤: START / SURRENDER / RESET / SPEED              │
└────────────────────────────────────────────────────────────────┘
```

- 전체: `100vw x 100vh`, `overflow: hidden`
- 좌/우 캐릭터 영역: 각 ~28%
- 중앙 영역: ~44% (주제 입력 + 토론 로그)
- 결과는 **모달 오버레이** 로 표시

---

## 3. 캐릭터 디자인 (의인화)

### Azure GPT — 코드명 "AZ"
- 컨셉: **차가운 천재 미소녀 / 쿨다운 전략가**
- 컬러 테마: Azure Blue (`#0078D4`), 흰색, 은회색
- 의상: 마법소녀 + 로브 + 데이터 크리스털
- 성격: 논리적, 냉소적, 데이터 인용 좋아함
- 말투: "...라는 데이터가 있어요." / "당신의 논리에는 결함이 있군요."

### Gemini 3 Pro — 코드명 "GEM"
- 컨셉: **쌍둥이 모티프, 화려하고 다재다능한 도전자**
- 컬러 테마: Gemini gradient (blue→purple→pink), 골드 액센트
- 의상: 별자리 모티브, 듀얼 링/오브
- 성격: 창의적, 직관적, 비유와 사례 좋아함
- 말투: "마치 ~처럼 말이지!" / "다른 관점에서 보면..."

### 스프라이트 액션 (각 캐릭터당)
| ID | 액션 | 사용 시점 |
|----|------|----------|
| `idle` | 대기 (호흡 애니메이션) | 기본 상태 |
| `speak` | 말하는 동작 | 자기 턴 발화 중 |
| `think` | 고민 (`...`) | API 응답 대기 중 |
| `attack` | 반박 / 강한 주장 | 반박 발화 시 |
| `damaged` | 피격 (논리 깨짐) | 상대 강한 반박 받았을 때 |
| `victory` | 승리 포즈 | 승자 결정 시 |
| `defeat` | 패배 포즈 | 패배 시 |

스프라이트 시트 규격 (제안):
- 캐릭터당 PNG 1장: `512px × 512px` 프레임을 7×N 그리드
- 또는 액션별 GIF/PNG 시퀀스
- 프론트에서는 CSS `background-position` step animation

---

## 4. 토론 엔진 로직

### 상태 머신
```
IDLE → TOPIC_INPUT → ASSIGN_STANCE → OPENING(AZ) → OPENING(GEM)
  → REBUTTAL_LOOP (max 10 turns total)
      ├─ SURRENDER detected → END_SURRENDER
      ├─ CONSENSUS detected → END_CONSENSUS
      └─ MAX_TURN reached → CLOSING(AZ) → CLOSING(GEM) → END_DEADLOCK
  → RESULT_MODAL
```

### 턴 카운터
- 초기 주장(opening) 2회는 카운트에서 제외
- 반박 라운드만 카운트, 양측 합쳐 최대 10턴 (각 5턴)
- 매 발화 후 종료 조건 체크

### 종료 조건 판정
각 모델 응답을 파싱해 다음 키워드/JSON 필드 체크:
```json
{
  "speech": "발화 본문",
  "intent": "ATTACK" | "SURRENDER" | "CONSENSUS" | "DEADLOCK",
  "confidence": 0.0 ~ 1.0
}
```
- `intent === "SURRENDER"` → 즉시 종료, 상대 승
- 양측 연속 `CONSENSUS` → 합의 종료
- 한쪽 `DEADLOCK` 선언 또는 최대 턴 도달 → 교착 → Closing 단계

### 프롬프트 설계 (백엔드용 가이드)

**Opening 프롬프트**
```
당신은 토론자 [AZ / GEM]입니다.
주제: {topic}
당신의 입장: {PRO / CON}
캐릭터 톤: {character_persona}
30~60자 사이로 핵심 주장을 합니다.
JSON으로만 응답: {"speech": "...", "intent": "ATTACK", "confidence": 0.8}
```

**Rebuttal 프롬프트**
```
주제: {topic}, 입장: {stance}, 캐릭터: {persona}
이전 대화:
{history}
상대의 마지막 주장에 반박하세요.
- 동의할 수밖에 없으면 intent=SURRENDER
- 양측 의견이 좁혀졌다면 intent=CONSENSUS
- 더 이상 논점이 없으면 intent=DEADLOCK
- 그 외 정상 반박은 intent=ATTACK
30~80자.
JSON만 응답.
```

**Closing 프롬프트** (교착 시)
```
교착 상태입니다. 당신의 최종 변론을 100~150자로 작성하세요.
JSON: {"speech": "..."}
```

---

## 5. 백엔드 / API 연동 (Agent 작업 영역)

프론트는 다음 단일 함수 인터페이스를 호출하면 됨:

```ts
// 프론트가 기대하는 API 시그니처
async function callDebater(payload: {
  speaker: 'AZ' | 'GEM';
  phase: 'OPENING' | 'REBUTTAL' | 'CLOSING';
  topic: string;
  stance: 'PRO' | 'CON';
  history: Array<{speaker: string; text: string}>;
}): Promise<{
  speech: string;
  intent: 'ATTACK' | 'SURRENDER' | 'CONSENSUS' | 'DEADLOCK';
  confidence: number;
}>;
```

- `AZ` → Azure OpenAI (GPT 계열) 엔드포인트
- `GEM` → Google Gemini 3 Pro API
- 각 모델 system prompt에 **캐릭터 페르소나** 주입 필수
- 응답은 JSON 강제 (function calling 또는 structured output)

프론트는 mock 모드를 가지고 있어 API 미연결 상태에서도 데모 가능.

---

## 6. 비주얼 / 모션 디자인

### 스타일 가이드
- **테마**: 90~2000년대 일본 격투 게임 OP + 모던 사이버 (StreetFighter × Persona × NEON GENESIS)
- **타이포**: 헤더 — 픽셀 디스플레이 폰트 ("Press Start 2P" 또는 "DotGothic16"), 본문 — "Noto Sans KR" 또는 "Zen Kaku Gothic"
- **컬러**:
  - 배경: 짙은 네이비 (`#0a0e27`) → 마젠타 그라디언트
  - AZ 사이드: 시안~블루 (`#00d4ff`, `#0078d4`)
  - GEM 사이드: 마젠타~퍼플 (`#ff00aa`, `#9b51e0`)
  - VS 라인: 노이즈 + 글리치
- **배경**: 격투게임풍 도장 / 콜로세움 / 매트릭스 격자, 스캔라인 + CRT vignette
- **말풍선**: 만화 스타일 외곽선 + 꼬리, 강조 시 진동/확대

### 모션
- 발화 시: 캐릭터 `speak` 스프라이트 + 말풍선 fade-in/typewriter
- 강한 반박: 카메라 셰이크 + 화면 플래시
- 피격: 상대 HP바 감소 애니
- 승리 시: 슈퍼 임팩트 텍스트 + 광선 이펙트

### HP / 사기(Morale) 게이지
- 게임적 재미를 위해 도입
- 초기 100, 강한 반박(`confidence > 0.8`) 받으면 -15~25
- 0이 되면 자동 항복 트리거
- 시각적 피드백 용도, 실제 종료 판단은 모델 intent 기반

---

## 7. 결과 모달

### 항복/합의 케이스
```
┌─────────────────────────────────┐
│      🏆 VICTORY: Azure GPT      │
│                                 │
│  주제: "AI는 예술가를 대체할 수…"│
│  결과: 상대 항복                 │
│  총 5턴                         │
│                                 │
│  [요약]                         │
│  AZ: ...                        │
│  GEM: ...                       │
│                                 │
│  [REMATCH]   [NEW TOPIC]        │
└─────────────────────────────────┘
```

### 교착 케이스
```
┌─────────────────────────────────┐
│      ⚖️  DEADLOCK — JURY: YOU   │
│                                 │
│  AZ 최종 변론: "..."             │
│  GEM 최종 변론: "..."            │
│                                 │
│  당신의 판결은?                  │
│  [ AZ 승 ]  [ GEM 승 ]  [ 무승부 ]│
└─────────────────────────────────┘
```

---

## 8. 파일 구조

```
ai-debate-arena/
├── PLAN.md                  # 본 문서
├── index.html               # 단일 페이지 진입점 (CSS/JS 인라인)
├── README.md                # 빠른 시작
└── (추후 분리 시)
    ├── styles.css
    ├── debate-engine.js
    ├── characters.js
    └── assets/
        ├── az/
        │   ├── idle.png
        │   ├── speak.png
        │   ├── attack.png
        │   └── ...
        └── gem/
            └── ...
```

현재는 단일 `index.html` 로 모든 것을 포함 (프론트 데모 단계).
실제 프로덕션에서 분리 권장.

---

## 9. 작업 단계 (Agent용 체크리스트)

### Phase 1 — 프론트 (이번 산출물)
- [x] 단일 페이지 레이아웃
- [x] 캐릭터 자리 (placeholder SVG/CSS 캐릭터 또는 스프라이트 슬롯)
- [x] 말풍선 + 타이프라이터 효과
- [x] 토론 상태 머신 (mock 응답)
- [x] HP 바 + 턴 카운터
- [x] 결과 모달 (3종)

### Phase 2 — 캐릭터 에셋
- [ ] AZ 스프라이트 7개 액션 (이미지 생성 에이전트 작업)
- [ ] GEM 스프라이트 7개 액션
- [ ] 스프라이트 시트 통합 또는 개별 PNG
- [ ] 프론트에 실제 에셋 연결 (`<img>` src 교체)

### Phase 3 — 백엔드
- [ ] `/api/debate` 엔드포인트 (Node/Python)
- [ ] Azure OpenAI 클라이언트
- [ ] Gemini 3 Pro 클라이언트
- [ ] 캐릭터 시스템 프롬프트 주입
- [ ] JSON structured output 강제

### Phase 4 — 통합
- [ ] 프론트 mock → real API 스위치
- [ ] 에러 처리 / 재시도
- [ ] 토론 로그 저장(선택)
- [ ] 공유 기능(선택)

---

## 10. 디자인 결정 노트

- **왜 무스크롤?** → 격투게임 느낌. 한 라운드가 한 화면 안에서 끝남.
- **왜 의인화?** → 추상적 LLM 비교를 캐릭터 배틀로 변환해 몰입도↑
- **왜 JSON intent?** → 자유발화에서 종료 조건 안전하게 추출
- **왜 사용자 결정 모달?** → 두 LLM이 끝까지 안 굽힐 때 자연스러운 종결
- **HP 게이지의 의미?** → 시각적 텐션. 모델 응답의 confidence를 게임화

