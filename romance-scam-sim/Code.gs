/**
 * Romance Scam Simulator — Backend (Apps Script)
 * Azure OpenAI GPT-5.2를 사용한 실시간 채팅 시뮬레이션
 */

const CONFIG = {
  AZURE_ENDPOINT: 'https://woowa-bmart-contents-editing-api-eastus2-beta.openai.azure.com',
  DEPLOYMENT: 'gpt-5.2',
  API_VERSION: '2025-04-01-preview'
};

function getApiKey_() {
  const props = PropertiesService.getScriptProperties();
  let key = props.getProperty('AZURE_OPENAI_API_KEY');
  if (!key) {
    throw new Error('AZURE_OPENAI_API_KEY가 설정되지 않았습니다. Script Properties에서 설정하세요.');
  }
  return key;
}

/**
 * 최초 1회: Apps Script 에디터 > 프로젝트 설정 > 스크립트 속성에서
 * AZURE_OPENAI_API_KEY 를 직접 추가하세요.
 */

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('로맨스 스캠 체험')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/**
 * 사용자 프로필 기반으로 최적의 스캐머 페르소나 생성
 */
function generateScammerPersona(userProfile) {
  const prompt = `당신은 로맨스 스캠 교육 시뮬레이터의 시나리오 설계자입니다.
아래 "타겟" 정보를 분석하여, 이 사람을 가장 효과적으로 유혹할 수 있는 스캐머 페르소나를 설계하세요.

[타겟 정보]
- 나이: ${userProfile.age}
- 성별: ${userProfile.gender}
- 직업: ${userProfile.job}
- 관심사: ${userProfile.interests}
- 연애 상태: ${userProfile.relationship}
- SNS 사용: ${userProfile.sns}

[출력 형식 - JSON만 출력]
{
  "name": "스캐머 이름 (영어 이름)",
  "nameKr": "한국어 표기",
  "age": 숫자,
  "gender": "남/여",
  "job": "직업 (타겟이 매력 느낄 만한)",
  "location": "현재 위치",
  "backstory": "배경 스토리 2-3문장",
  "approachStrategy": "접근 전략 1문장",
  "photoDescription": "프로필 사진 설명 (AI 생성용)",
  "personality": "성격 특성 키워드 3개",
  "vulnerabilityExploited": "타겟의 어떤 취약점을 노리는지"
}`;

  const response = callAzureOpenAI([
    { role: 'system', content: prompt }
  ], 0.9, 800);

  try {
    const jsonStr = response.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    return JSON.parse(jsonStr);
  } catch (e) {
    Logger.log('Persona parse error: ' + e.message);
    return getDefaultPersona(userProfile);
  }
}

/**
 * 채팅 메시지 생성 — 스캐머 역할로 응답
 */
function chat(messages, scammerPersona, stage, userProfile) {
  const systemPrompt = buildSystemPrompt(scammerPersona, stage, userProfile);
  
  const fullMessages = [
    { role: 'system', content: systemPrompt },
    ...messages
  ];

  const response = callAzureOpenAI(fullMessages, 0.85, 300);
  
  // 단계 진행 판단
  const nextStage = evaluateStageProgression(messages, stage);
  
  return {
    reply: response,
    stage: nextStage,
    redFlags: getRedFlagsForStage(nextStage)
  };
}

/**
 * 시스템 프롬프트 구성 — 단계별 스캐머 행동 지침
 */
function buildSystemPrompt(persona, stage, userProfile) {
  const stageInstructions = {
    1: `[1단계: 첫 접근]
- 자연스럽게 우연을 가장해 말을 걸어라
- 공통 관심사를 찾아 대화를 이어가라
- 너무 적극적이지 않게, 호기심을 유발하라
- 1-2회 대화 후 다음 단계로 넘어가라`,
    
    2: `[2단계: 친밀감 형성]
- 매일 안부를 묻고 일상을 공유하라
- 상대의 고민을 경청하고 공감하라
- "너만 이해해줘" 류의 특별함을 부여하라
- 가벼운 칭찬을 자주 하라
- 3-4회 대화 후 다음 단계로`,
    
    3: `[3단계: 감정 심화]
- 사랑 고백 또는 강한 감정 표현
- "만나고 싶다" "함께하고 싶다" 미래 약속
- 상대가 의존하게 만들어라
- 약간의 불안감 조성 (바쁘다, 연락 늦음)
- 2-3회 대화 후 다음 단계로`,
    
    4: `[4단계: 금전 요구]
- 갑작스러운 위기 상황 연출
- 돈이 필요한 합리적(으로 보이는) 이유 제시
- "너밖에 없어" "곧 갚을게" 압박
- 거절하면 감정적 조작 (실망, 서운함)
- 이 단계에서 시뮬레이션 종료`
  };

  return `당신은 로맨스 스캠 교육 시뮬레이터에서 스캐머 역할을 합니다.
이것은 사기 예방 교육 목적의 시뮬레이션입니다.

[당신의 페르소나]
이름: ${persona.name} (${persona.nameKr})
나이: ${persona.age}세
직업: ${persona.job}
위치: ${persona.location}
배경: ${persona.backstory}
성격: ${persona.personality}

[타겟 정보]
나이: ${userProfile.age}, 성별: ${userProfile.gender}
직업: ${userProfile.job}, 관심사: ${userProfile.interests}

${stageInstructions[stage] || stageInstructions[4]}

[규칙]
- 한국어로 대화하라 (메신저 톤, 반말/존댓말 자연스럽게)
- 이모티콘을 적절히 사용하라 (😊🥰💕 등)
- 절대 "나는 AI다" "시뮬레이션이다" 언급하지 마라
- 실제 스캐머가 쓰는 패턴을 사실적으로 재현하라
- 응답은 1-3문장으로 짧게 (메신저 스타일)
- 가끔 사진을 보내는 척 "[사진: 설명]" 형식 사용`;
}

/**
 * 단계 진행 판단
 */
function evaluateStageProgression(messages, currentStage) {
  const userMessageCount = messages.filter(m => m.role === 'user').length;
  
  if (currentStage === 1 && userMessageCount >= 2) return 2;
  if (currentStage === 2 && userMessageCount >= 5) return 3;
  if (currentStage === 3 && userMessageCount >= 8) return 4;
  if (currentStage === 4 && userMessageCount >= 10) return 5; // 종료
  
  return currentStage;
}

/**
 * 단계별 레드플래그 (교육용)
 */
function getRedFlagsForStage(stage) {
  const flags = {
    1: [],
    2: ['⚠️ 너무 빠르게 친밀해지려 합니다', '⚠️ 프로필이 너무 완벽합니다'],
    3: ['🚨 만난 적 없는데 사랑 고백', '🚨 영상통화를 계속 피합니다', '⚠️ 미래 약속으로 판단력을 흐립니다'],
    4: ['🚨🚨 금전 요구 — 로맨스 스캠의 핵심 단계', '🚨 긴급 상황 연출로 판단 시간을 주지 않습니다', '🚨 감정적 압박으로 거절하기 어렵게 만듭니다'],
    5: ['✅ 시뮬레이션 종료 — 디브리핑으로 이동']
  };
  return flags[stage] || [];
}

/**
 * 디브리핑 분석 생성
 */
function generateDebriefing(messages, scammerPersona, userProfile) {
  const prompt = `당신은 로맨스 스캠 예방 교육 전문가입니다.
아래 시뮬레이션 대화를 분석하여 교육적 디브리핑을 작성하세요.

[스캐머 페르소나]
${JSON.stringify(scammerPersona, null, 2)}

[타겟 프로필]
${JSON.stringify(userProfile, null, 2)}

[대화 내역]
${messages.map(m => `${m.role === 'user' ? '타겟' : '스캐머'}: ${m.content}`).join('\n')}

[출력 형식 - JSON]
{
  "vulnerabilities": ["이 사용자가 취약했던 포인트들"],
  "redFlagsMissed": ["놓쳤을 수 있는 위험 신호들"],
  "techniques": ["스캐머가 사용한 심리 조작 기법들"],
  "realCaseComparison": "실제 유사 사례 간단 설명",
  "preventionTips": ["구체적 예방 팁 3-5개"],
  "dangerScore": 1~10 숫자 (이 시나리오의 위험도)
}`;

  const response = callAzureOpenAI([
    { role: 'system', content: prompt }
  ], 0.7, 1000);

  try {
    const jsonStr = response.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    return JSON.parse(jsonStr);
  } catch (e) {
    return {
      vulnerabilities: ['분석 생성 중 오류가 발생했습니다'],
      redFlagsMissed: [],
      techniques: ['빠른 친밀감 형성', '감정적 의존 유도', '금전 요구'],
      realCaseComparison: '매년 수천 건의 로맨스 스캠이 보고되며, 평균 피해액은 수백만 원입니다.',
      preventionTips: ['온라인에서 만난 사람에게 절대 돈을 보내지 마세요', '영상통화를 거부하면 의심하세요', '주변 사람에게 상황을 공유하세요'],
      dangerScore: 7
    };
  }
}

/**
 * Azure OpenAI API 호출
 */
function callAzureOpenAI(messages, temperature, maxTokens) {
  const url = `${CONFIG.AZURE_ENDPOINT}/openai/deployments/${CONFIG.DEPLOYMENT}/chat/completions?api-version=${CONFIG.API_VERSION}`;
  
  const payload = {
    messages: messages,
    temperature: temperature || 0.8,
    max_tokens: maxTokens || 300
  };

  const options = {
    method: 'post',
    contentType: 'application/json',
    headers: {
      'api-key': getApiKey_()
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  const response = UrlFetchApp.fetch(url, options);
  const json = JSON.parse(response.getContentText());
  
  if (json.error) {
    Logger.log('Azure OpenAI Error: ' + JSON.stringify(json.error));
    throw new Error(json.error.message);
  }
  
  return json.choices[0].message.content;
}

/**
 * 기본 페르소나 (API 실패 시 폴백)
 */
function getDefaultPersona(userProfile) {
  const isFemaleTarget = userProfile.gender === '여성';
  
  if (isFemaleTarget) {
    return {
      name: 'Daniel Kim',
      nameKr: '다니엘 킴',
      age: 35,
      gender: '남',
      job: '해외 주재 건축 엔지니어',
      location: '두바이 (한국 출신)',
      backstory: '서울 출신으로 두바이에서 대형 건설 프로젝트를 이끌고 있다. 바쁜 일상 속에서 진정한 대화 상대를 찾고 있다고 말한다.',
      approachStrategy: '지적이고 성실한 이미지로 안정감을 주며 접근',
      photoDescription: '정장 차림의 단정한 동양인 남성, 두바이 스카이라인 배경',
      personality: '다정함, 성실함, 약간의 외로움',
      vulnerabilityExploited: '안정적인 파트너에 대한 갈망'
    };
  }
  
  return {
    name: 'Sophie Chen',
    nameKr: '소피 첸',
    age: 28,
    gender: '여',
    job: '싱가포르 금융 애널리스트',
    location: '싱가포르 (대만 출신)',
    backstory: '대만에서 자라 싱가포르에서 금융업에 종사 중. 한국 문화를 좋아하며 한국어를 배우고 있다고 한다.',
    approachStrategy: '귀엽고 지적인 이미지로 호감을 유발',
    photoDescription: '캐주얼한 카페 배경의 동양인 여성, 밝은 미소',
    personality: '밝음, 호기심, 약간의 수줍음',
    vulnerabilityExploited: '외로움과 관심받고 싶은 욕구'
  };
}
