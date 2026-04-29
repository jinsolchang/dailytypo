# AI Debate Arena

> Azure GPT vs Gemini 3 Pro — 의인화된 캐릭터들이 토론하는 격투게임풍 단일 화면 웹앱.

## 빠른 시작

```bash
# 로컬 프록시 서버 (API 키는 ~/.kiro/secrets/.env 에서 자동 로드)
/Users/jinsol/Desktop/Codes/.venv/bin/python 2026-04-29/server.py
# → http://localhost:8080/20260429.html
```

프록시가 `/api/debate` 로 요청을 받으면 AZ는 Azure OpenAI, GEM은 Gemini로
라우팅해서 JSON `{speech, intent, confidence}` 를 내려줍니다.
프론트 하단 우측 `MODE` 버튼을 `REAL`로 토글하면 실제 API 사용.
`MOCK` 상태에서는 서버 없이 단일 html 파일만으로도 풀데모 동작합니다.

## 현재 상태 (Phase 1)

- ✅ 단일 화면 (무스크롤) 격투게임 레이아웃
- ✅ 좌(AZ) / 우(GEM) 의인화 캐릭터 (SVG placeholder, 스프라이트 교체용 슬롯)
- ✅ idle / speak / think / attack / damaged / victory / defeat 액션 클래스
- ✅ HP 게이지 + 라운드 카운터 + VS 스플래시 + 임팩트 플래시
- ✅ 토론 상태 머신: OPENING → REBUTTAL × N → CLOSING / END
- ✅ 종료 조건 4종: SURRENDER / CONSENSUS / DEADLOCK / 사용자 판결
- ✅ Mock 응답으로 끝까지 동작 (API 미연결 상태에서 풀데모)

## 다음 작업 (Agent)

자세한 단계는 [`PLAN.md`](./PLAN.md) 의 § 9 체크리스트 참고.

### 1. 캐릭터 스프라이트 교체
현재 SVG로 그려진 placeholder를 실제 스프라이트 PNG로 교체.

`index.html` 안에서 `<svg class="char-svg">` 영역을 찾아 다음과 같이 바꾸면 됨:

```html
<img class="char-svg" src="assets/az/sheet.png" data-action="idle"/>
```

스프라이트 시트 사용 시:
- 각 캐릭터당 1장의 PNG (예: 7프레임 가로 스트립)
- CSS `background-position` step animation
- `idle / speak / think / attack / damaged / victory / defeat` 7가지 액션

### 2. 백엔드 연동
`callDebater()` 함수 (index.html 내부) 에서 MOCK 분기를 실제 API 호출로 교체:

```js
async function callDebater(payload){
  const res = await fetch('/api/debate', {
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify(payload)
  });
  return await res.json();
}
```

서버는 `payload.speaker`에 따라 Azure OpenAI / Gemini 로 분기, 캐릭터 페르소나 system prompt 주입, JSON structured output 강제.

응답 스키마:
```json
{
  "speech": "발화 본문 (30-150자)",
  "intent": "ATTACK | SURRENDER | CONSENSUS | DEADLOCK",
  "confidence": 0.0
}
```

### 3. 모드 토글
하단 우측 `MOCK / REAL` 버튼으로 즉시 전환 가능 (현재 REAL 모드는 throw).

## 단축키 / 컨트롤

| 위치 | 동작 |
|------|------|
| 중앙 입력창 | 주제 입력 후 Enter / START |
| 하단 RESET | 페이지 리로드 |
| 하단 FORCE END | 진행 중 강제로 교착 → 최종 변론 단계 |
| SPEED 1× / 2× / 4× | 애니메이션 / 응답 대기 속도 |
| MODE MOCK / REAL | API 연결 모드 토글 |

## 파일

- `index.html` — 단일 페이지 (CSS/JS 인라인)
- `PLAN.md` — 전체 기획 문서
- `README.md` — 이 파일
