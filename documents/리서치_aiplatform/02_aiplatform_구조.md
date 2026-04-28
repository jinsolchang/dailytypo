# AI Platform 구조

## 개요
AI 서비스 개발자와 AI 플랫폼 엔지니어가 함께 AI 서비스를 개발/운영하는 사내 플랫폼.
- 가이드: https://mlops.ds.woowa.in/
- 문의 채널: `#support-aiplatform`

## 특징
- Python 전용 배포 플랫폼
- BentoML 기반 자동 배포
- GPU 리소스 지원
- 자동 스케일링, 모니터링 제공
- Langfuse 연동 (LLM 운영 관리)

## 적합한 경우
- ML/AI 모델 서빙
- FastAPI 기반 API 서버
- LLM 기반 서비스
- 데이터 처리 API

## 서비스 개발 프로세스

```
시작
 └─ #support-aiplatform 「서비스 요청」 워크플로우
     └─ AI 플랫폼 기능 개발 필요?
         ├─ Y → 엔지니어 할당 → 일정 협의
         └─ N → 일정 협의
             └─ 과제 프레임워크 업데이트
                 └─ 서비스 개발
                     └─ #support-aiplatform 「도와줘요」 워크플로우로 배포 요청
                         └─ 배포 완료
```

## 배포 후 제공되는 것
- API 엔드포인트 URL
- Swagger UI (API 문서)
- 데모 페이지 (선택)
- Langfuse 모니터링 대시보드
- Prometheus 메트릭, Grafana 대시보드

## 환경별 URL 패턴
- Beta: `https://{서비스명}.api.beta.ds.woowa.in`
- Prod: `https://{서비스명}.api.ds.woowa.in`

## GitLab 저장소
- `git.baemin.in/mlops/ml-projects` (추정 — 워크플로우에서 확인 필요)

## 실제 운영 중 서비스 예시
- 커머스 리뷰 이미지 검수
- 파트너 커뮤니티 모니터링
- 메뉴 이미지 개선 (Upscaler 모델)
- CX AI Agent
- 개인정보 탐지 모델
