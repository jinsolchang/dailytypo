# Serving 개발/배포 가이드

공식 문서: https://mlops.ds.woowa.in/serving/how-to-run/

## Prerequisites (로컬 환경)

### pipx
```bash
# macOS
brew install pipx
pipx ensurepath
sudo pipx ensurepath --global
```

### just
`just` 커맨드 러너 설치 필요 (사내 표준 명령 실행 도구)

### 그 외
`copier`, `uv` 등 환경설정 필요

## 서비스 생성
copier 템플릿으로 초기화 → 프롬프트에 따라 필요한 정보 입력 → 서비스 뼈대 자동 생성

## 서비스 구조

```
${PROJECT_NAME}/
├── serving/
│   ├── service.py          # 서비스 로직 정의
│   ├── data_format.py      # 데이터 포맷 정의
│   ├── tests/
│   │   └── test_sample.py  # 테스트 코드 (pytest)
│   └── pyproject.toml      # 프로젝트 설정
```

### 파일 역할
- `service.py`: BentoML 서비스 로직
- `tests/*.py`: pytest 기반 테스트
- `data_format.py`: 입출력 스키마 정의
- `pyproject.toml`: 의존성 및 빌드 설정

## 기준 디렉터리
- 개발의 기준 디렉터리는 **`${PROJECT_NAME}`** (루트)
- 모듈 임포트, `pyproject.toml`의 `includes`/`excludes` 모두 이 기준으로 설정
- 임포트 예시: `from serving.data_format import ABC`

## 개발 절차

### 1. 파이썬 패키지 설치
```bash
just serve-add-packages package1 package2 ...
```
⚠️ 이 명령 외 방법(pip, uv 직접 호출 등)으로 설치 시 에러 발생 가능

### 2. Save model
`serving/save_model.py`를 실행해 bento 모델을 저장
```bash
just serve-save-model
```
- s3, mlflow, huggingface 등에서 **직접 로드**하는 경우 이 단계 생략 가능
  (BiRefNet은 HuggingFace에서 직접 로드하면 생략 가능성 있음)

### 3. 테스트 실행
`tests/` 디렉터리의 pytest 실행

### 4. 서비스 실행
로컬 API 서버 실행

### 5. 호출 테스트
- Swagger UI: `http://127.0.0.1:3000/docs` (로컬만)
- curl:
```bash
curl -X POST 'http://127.0.0.1:3000/${ENDPOINT}' \
  -H 'accept: application/json' \
  -H 'Content-Type: application/json' \
  -d '${INPUT_JSON}'
```

## 배포

### 최초 배포 (1회)
- Beta/Prod 각각 1회 배포 요청 필요
- `#support-aiplatform` → 「도와줘요 AI플랫폼」 워크플로우

### 이후 배포
- **Beta 수동 배포**: master 브랜치로 MR 생성 → MR 파이프라인의 `serving-deploy-beta` ▶️ 실행
- **Prod 자동 배포**: master 브랜치에 MR 머지 시 GitLab CI 자동 실행

### 배포 알림 채널
- Beta: `#alarm-aiplatform-serving-beta`
- Prod: `#alarm-aiplatform-serving`

## 주의사항 (Breaking Changes)
- endpoint 삭제, 파라미터 추가 등 **기존 버전과 호환 불가능한 변경**은 재배포 실패
- 의도된 breaking change면 MR에 `breaking-changes` 라벨 부착
