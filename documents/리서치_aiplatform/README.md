# AI Platform 리서치

누끼(배경 제거) API를 사내 AI Platform(mlops.ds.woowa.in)에 올리기 위한 리서치 모음.

## 파일 구성
- `01_배포플랫폼_비교.md` — simploy vs AI Platform 비교, 왜 AI Platform을 선택했는지
- `02_aiplatform_구조.md` — AI Platform 개요, 서비스 개발 프로세스
- `03_serving_가이드.md` — 서빙 프로젝트 구조, 로컬 개발, 배포 절차
- `04_birefnet_서빙_스켈레톤.md` — BiRefNet 누끼 API 초안 구조 (사내 템플릿 초기화 후 작성 예정)

## 결론 요약
- simploy로는 가능하지만 CMDB/GPU 설정/배포 스택 생성까지 해야 해서 "가볍게"에는 안 맞음
- **AI Platform**이 Python/BentoML 기반 ML 서빙에 최적화, GPU 지원, 인프라 관리 불필요
- 진입 경로: `#support-aiplatform` → "서비스 요청" 워크플로우 → copier 템플릿으로 프로젝트 초기화

## 공식 가이드
- https://mlops.ds.woowa.in/
- https://mlops.ds.woowa.in/serving/how-to-run/
- https://mlops.ds.woowa.in/serving/how-to-deploy/

## 관련 Confluence 페이지
- [simploy 정적 웹 배포 정보 정리 (개인 스페이스)](https://cloud.wiki.woowa.in/wiki/spaces/~62b9c0c19e6ba34c99357c14/pages/1039929659)
- [\[우아한개발환경\] AI Platform (TECHSTANDARD)](https://cloud.wiki.woowa.in/wiki/spaces/TECHSTANDARD/pages/757733213)
- [1. EC2 웹 배포 (TECHSTANDARD)](https://cloud.wiki.woowa.in/wiki/spaces/TECHSTANDARD/pages/112770222)
- [dockerCompose 배포 타입 (TECHSTANDARD)](https://cloud.wiki.woowa.in/wiki/spaces/TECHSTANDARD/pages/112788206)
