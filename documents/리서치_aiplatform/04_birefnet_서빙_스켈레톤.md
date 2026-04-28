# BiRefNet 누끼 API 스켈레톤 초안

> ⚠️ 이 문서는 **초안**. 실제 구현은 사내 copier 템플릿으로 초기화한 뒤
> 그 안에 맞춰서 작성해야 함. 임의로 구조를 만들면 pyproject/justfile 컨벤션이
> 어긋나서 배포 시 문제 발생 가능.

## 프로젝트 메타
- 서비스명(예): `bgremove` 또는 `birefnet-bgremove`
- 용도: 이미지 업로드 → 배경 제거된 PNG(투명 배경) 반환
- 모델: BiRefNet (HuggingFace: `ZhengPeng7/BiRefNet` 또는 `onnx-community/BiRefNet-ONNX`)
- GPU: A40 또는 A100 권장 (이미지당 1~3초)

## API 엔드포인트 초안

### POST `/remove_bg`
- 입력: 이미지 바이트 또는 URL (data_format.py에서 정의)
- 출력: 투명 배경 PNG 바이트
- 옵션: 해상도, 마스크 반환 여부 등

## service.py 초안 (BentoML 2.x)

```python
# serving/service.py
import bentoml
from PIL import Image
import io

from serving.data_format import RemoveBgInput, RemoveBgOutput


@bentoml.service(
    resources={"gpu": 1},           # GPU 1장 할당
    traffic={"timeout": 60},
)
class BgRemover:
    def __init__(self) -> None:
        from transformers import AutoModelForImageSegmentation
        import torch

        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        self.model = AutoModelForImageSegmentation.from_pretrained(
            "ZhengPeng7/BiRefNet",
            trust_remote_code=True,
        ).to(self.device).eval()

    @bentoml.api
    def remove_bg(self, image: Image.Image) -> Image.Image:
        # 전처리 → 추론 → 마스크 합성 → RGBA 반환
        rgba = self._process(image)
        return rgba

    def _process(self, image: Image.Image) -> Image.Image:
        # BiRefNet 공식 usage 참조하여 구현
        ...
```

## data_format.py 초안

```python
# serving/data_format.py
from pydantic import BaseModel
from PIL import Image

# BentoML은 PIL.Image를 입출력으로 직접 지원하므로
# 간단한 케이스는 pydantic 모델 없이도 가능
# 옵션이 필요하면 아래처럼 정의

class RemoveBgOptions(BaseModel):
    max_size: int = 1024
    return_mask: bool = False
```

## 패키지 설치 (초기화 이후)

```bash
just serve-add-packages \
  torch \
  transformers \
  pillow \
  einops \
  timm \
  kornia
```

## 테스트 초안

```python
# serving/tests/test_remove_bg.py
from PIL import Image
from serving.service import BgRemover


def test_remove_bg_returns_rgba():
    service = BgRemover()
    img = Image.new("RGB", (256, 256), "white")
    result = service.remove_bg(img)
    assert result.mode == "RGBA"
```

## 다음 액션
1. `#support-aiplatform` 「서비스 요청」 워크플로우 제출
   - 서비스명, 용도(BiRefNet 누끼 API), GPU 필요, 예상 트래픽 명시
2. 엔지니어 할당되면 copier 템플릿으로 프로젝트 초기화
3. 위 스켈레톤을 템플릿 구조에 맞춰 이식
4. 로컬에서 `just serve-run` (또는 사내 표준 just 커맨드)으로 동작 확인
5. Beta 배포 요청 → 검증 → Prod 배포

## 미확정 / 확인 필요
- 사내 copier 템플릿 정확한 커맨드 (가이드 rendered 페이지 접근 제한으로 미확인)
- `just serve-run` 등 just 타겟 전체 목록
- GPU 리소스 할당 문법 정확한 버전 (BentoML 1.x vs 2.x)
- 모델 가중치 저장 경로 권장 패턴 (s3 vs huggingface 직접 로드)
→ 엔지니어 할당 후 첫 미팅에서 확인
