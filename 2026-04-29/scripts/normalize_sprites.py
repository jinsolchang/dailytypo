"""모든 스프라이트의 alpha 기준 bbox를 추출해 같은 비율/사이즈로 통일.

- 각 이미지 alpha 비투명 영역만 잘라내고
- 가로:세로 비율을 AZ idle 기준으로 맞춰 통일 크기 캔버스에 중앙 배치
- 결과는 기존 파일 덮어쓰기 (원본은 이미 assets/*_raw/ 에 백업됨)
"""

from __future__ import annotations

import pathlib

from PIL import Image

PROJECT = pathlib.Path(__file__).resolve().parent.parent
ASSETS = PROJECT / "assets"

TARGET_W = 900
TARGET_H = 1200  # 세로가 긴 캐릭터 비율
PADDING_RATIO = 0.04  # 여백

DIRS = ["az", "gem"]


def tight_crop(img: Image.Image) -> Image.Image:
    """투명 배경 기준 bbox 크롭."""
    if img.mode != "RGBA":
        img = img.convert("RGBA")
    bbox = img.getchannel("A").getbbox()
    if bbox is None:
        return img
    return img.crop(bbox)


def fit_to_canvas(img: Image.Image, w: int, h: int) -> Image.Image:
    """투명 배경 w×h 캔버스에 비율 유지하며 최대한 키워 중앙(바닥 정렬) 배치."""
    inner_w = int(w * (1 - 2 * PADDING_RATIO))
    inner_h = int(h * (1 - 2 * PADDING_RATIO))
    iw, ih = img.size
    scale = min(inner_w / iw, inner_h / ih)
    nw, nh = int(iw * scale), int(ih * scale)
    resized = img.resize((nw, nh), Image.LANCZOS)
    canvas = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    # 중앙 정렬 (수평), 바닥 정렬(수직) — 발이 같은 라인에 있으면 일관된 느낌
    x = (w - nw) // 2
    y = h - nh - int(h * PADDING_RATIO)
    canvas.paste(resized, (x, y), resized)
    return canvas


def process(png: pathlib.Path):
    img = Image.open(png)
    cropped = tight_crop(img)
    fitted = fit_to_canvas(cropped, TARGET_W, TARGET_H)
    fitted.save(png, "PNG", optimize=True)
    print(f"  {png.relative_to(PROJECT)}  ({cropped.size} → {fitted.size})")


for d in DIRS:
    base = ASSETS / d
    if not base.exists():
        continue
    print(f"\n[{d}]")
    for p in sorted(base.glob("*.png")):
        process(p)

print("\ndone.")
