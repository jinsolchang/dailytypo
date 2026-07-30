"""
그날 오후 — 이미지 생성 스크립트
Gemini 이미지 모델로 배경/캐릭터/UFO 생성

사용법:
    python 2026-07-29/gen_images.py all       # 전체
    python 2026-07-29/gen_images.py bg        # 배경만
    python 2026-07-29/gen_images.py char      # 캐릭터만
    python 2026-07-29/gen_images.py ufo       # UFO만
    python 2026-07-29/gen_images.py char_rest # 마스터 기반 파생 캐릭터만
"""

from __future__ import annotations

import argparse
import base64
import os
import pathlib
import time

from dotenv import load_dotenv
from google import genai
from google.genai import types

SCRIPT_DIR = pathlib.Path(__file__).resolve().parent
OUT_DIR = SCRIPT_DIR  # 2026-07-29/ 에 저장

load_dotenv(pathlib.Path.home() / ".kiro" / "secrets" / ".env")
load_dotenv(pathlib.Path.home() / ".claude" / "secrets" / ".env")

KEY = os.environ.get("GEMINI_API_KEY_TEAM") or os.environ["GEMINI_API_KEY_GENAI"]
MODEL = os.environ.get(
    "GEMINI_IMAGE_GEN_DEFAULT_MODEL", "gemini-3.1-flash-image-preview"
)
client = genai.Client(api_key=KEY)

# 공통 스타일 설명 — 90년대 한국 필름 사진
FILM_STYLE = (
    "1990s Korean film photograph style, slightly faded colors, warm sepia tone, "
    "film grain texture, soft vignette edges, natural lighting of a September afternoon, "
    "nostalgic atmosphere, analog photography look, slightly desaturated, "
    "no digital effects, no HDR, no modern aesthetics. Realistic photo."
)

# ── 배경 이미지 ────────────────────────────────────────────
BACKGROUNDS = {
    "playground.png": (
        f"{FILM_STYLE} "
        "A small neighborhood playground in Seoul, South Korea, 1993 September afternoon. "
        "Metal jungle gym on the left, yellow plastic slide on the right, "
        "a green metal seesaw in the center-left foreground. "
        "Sand ground, trees in background, distant apartment buildings visible. "
        "Warm afternoon sunlight casting long shadows. Empty playground, no people. "
        "Wide landscape shot, horizon at lower third. "
        "No text, no watermark, no modern equipment."
    ),
    "sky.png": (
        f"{FILM_STYLE} "
        "View of the sky from lying on a seesaw looking up, Seoul 1993 September afternoon. "
        "Light blue sky with scattered white clouds, golden afternoon light. "
        "Lower right corner shows the upper floors and rooftop of a 1990s Korean apartment building "
        "(회색 아파트, 5-story, typical 주공아파트 style). "
        "The perspective is from below, sky fills most of the frame. "
        "Peaceful, nostalgic. No people visible. No text, no watermark."
    ),
    "elevator.png": (
        f"{FILM_STYLE} "
        "Interior hallway in front of an elevator in a 1990s Korean apartment building. "
        "Narrow corridor, yellowish fluorescent lighting (slightly flickering quality). "
        "Cream-colored concrete walls, worn linoleum floor with simple pattern. "
        "Old metal elevator doors (silver/gray) in center. "
        "Simple black floor indicator display showing number 5 above the door. "
        "Up/down call buttons on the right wall. "
        "Slightly dim, quiet, slightly eerie atmosphere. "
        "No people. No text, no watermark."
    ),
    "door.png": (
        f"{FILM_STYLE} "
        "Close-up of a 1990s Korean apartment front door (현관문). "
        "Steel security door, dark brown/maroon color, typical Korean 방화문 style. "
        "Door number '502' in gold metal digits on the door. "
        "Gold-tone door handle and deadbolt lock visible. "
        "Small doorbell button on the right side of the frame. "
        "Cream-colored wall on the sides. "
        "Slightly low angle view looking straight at the door. "
        "Quiet, slightly ominous atmosphere. No people. No text, no watermark."
    ),
}

# ── 캐릭터 마스터 디자인 ──────────────────────────────────
CHAR_MASTER_PROMPT = (
    "Full body character illustration, anime/visual novel style, "
    "South Korean elementary school boy, 3rd grade (about 9 years old), 1993. "
    "Short black hair, slightly messy. Round face, small nose, black eyes. "
    "Wearing a short-sleeve orange T-shirt, dark blue short pants, white socks, black shoes. "
    "Simple cute chibi-ish proportions, clean lineart, flat cel-shading. "
    "Pure white background (#ffffff). No shadow on background. "
    "Character centered, full body from head to toe visible. "
    "No text, no watermark, no accessories."
)

# ── 캐릭터 이미지 (마스터 + 파생) ────────────────────────
CHARACTERS = {
    "char_normal.png": {
        "prompt": CHAR_MASTER_PROMPT
        + (
            " Pose: standing naturally, arms relaxed at sides, "
            "neutral/slightly sleepy expression, mouth gently closed, eyes half-open looking forward."
        ),
        "use_ref": False,
    },
    "char_shocked.png": {
        "prompt": (
            "Keep exact same character design, face, hair, outfit, color palette as the reference. "
            "Re-pose only. "
            "Expression: extremely shocked/surprised — eyes wide open (circle eyes), "
            "mouth wide open in an O shape, both arms raised up and out in surprise, "
            "body slightly leaning back. Anime exaggerated shock expression. "
            "Pure white background."
        ),
        "use_ref": True,
    },
    "char_lying.png": {
        "prompt": (
            "Keep exact same character design, face, hair, outfit, color palette as the reference. "
            "Re-pose only. "
            "Pose: lying on back, side view from the right. Character is horizontal. "
            "Arms resting on belly, legs extended. Eyes half-closed (drowsy/sleepy). "
            "Small 'z z z' speech indication near head. "
            "Pure white background, character lying flat horizontally."
        ),
        "use_ref": True,
    },
    "char_scared.png": {
        "prompt": (
            "Keep exact same character design, face, hair, outfit, color palette as the reference. "
            "Re-pose only. "
            "Expression: scared/frightened — eyes wide, eyebrows furrowed upward in worry, "
            "mouth slightly trembling open, shoulders hunched up, arms pulled in tight to body. "
            "Small sweat drop on forehead. Pure white background."
        ),
        "use_ref": True,
    },
    "char_awkward.png": {
        "prompt": (
            "Keep exact same character design, face, hair, outfit, color palette as the reference. "
            "Re-pose only. "
            "Expression: embarrassed/awkward — looking slightly to the side, "
            "one hand scratching the back of head, mouth in a sheepish crooked grin, "
            "eyes looking away. Small sweat drop. Pure white background."
        ),
        "use_ref": True,
    },
}

# ── UFO ──────────────────────────────────────────────────
UFO = {
    "ufo.png": (
        "A classic flying saucer UFO illustration, 1950s retro sci-fi comic style. "
        "Metallic silver and light blue saucer shape, glowing green and red lights underneath. "
        "Transparent dome on top showing interior glow. "
        "Small light beam cone coming from below. "
        "Illustration style, clean edges, slightly cartoonish. "
        "PURE TRANSPARENT background (PNG with alpha channel). "
        "No ground, no sky, just the UFO floating isolated. "
        "No text, no watermark."
    ),
}


def extract_image_bytes(response) -> bytes | None:
    for cand in getattr(response, "candidates", []) or []:
        content = getattr(cand, "content", None)
        if not content:
            continue
        for part in getattr(content, "parts", []) or []:
            inline = getattr(part, "inline_data", None)
            if inline is None:
                continue
            data = getattr(inline, "data", None)
            if data is None:
                continue
            if isinstance(data, bytes):
                return data
            if isinstance(data, str):
                try:
                    return base64.b64decode(data)
                except Exception:
                    continue
    return None


def generate(prompt: str, ref_path: pathlib.Path | None = None) -> bytes:
    contents: list = []
    if ref_path is not None and ref_path.exists():
        ref_bytes = ref_path.read_bytes()
        contents.append(types.Part.from_bytes(data=ref_bytes, mime_type="image/png"))
    contents.append(prompt)

    resp = client.models.generate_content(
        model=MODEL,
        contents=contents,
        config=types.GenerateContentConfig(
            response_modalities=["IMAGE"],
        ),
    )
    img = extract_image_bytes(resp)
    if img is None:
        raise RuntimeError(f"No image in response. Model: {MODEL}")
    return img


def save(data: bytes, path: pathlib.Path):
    path.write_bytes(data)
    print(f"  ✓ {path.name} ({len(data) // 1024} KB)")


def run_bg():
    print("\n── 배경 이미지 생성 ──")
    for fname, prompt in BACKGROUNDS.items():
        out = OUT_DIR / fname
        if out.exists():
            print(f"  skip (exists): {fname}")
            continue
        print(f"  생성 중: {fname}")
        try:
            data = generate(prompt)
            save(data, out)
        except Exception as e:
            print(f"  ERROR {fname}: {e}")
        time.sleep(2)


def run_char():
    print("\n── 캐릭터 생성 (마스터 먼저) ──")
    master_path = OUT_DIR / "char_normal.png"

    # 마스터 (char_normal) 먼저
    if not master_path.exists():
        spec = CHARACTERS["char_normal.png"]
        print("  생성 중: char_normal.png")
        try:
            data = generate(spec["prompt"])
            save(data, master_path)
        except Exception as e:
            print(f"  ERROR char_normal.png: {e}")
        time.sleep(2)
    else:
        print("  skip (exists): char_normal.png")

    # 파생 캐릭터
    for fname, spec in CHARACTERS.items():
        if fname == "char_normal.png":
            continue
        out = OUT_DIR / fname
        if out.exists():
            print(f"  skip (exists): {fname}")
            continue
        print(f"  생성 중: {fname}")
        ref = master_path if spec["use_ref"] else None
        try:
            data = generate(spec["prompt"], ref_path=ref)
            save(data, out)
        except Exception as e:
            print(f"  ERROR {fname}: {e}")
        time.sleep(2)


def run_ufo():
    print("\n── UFO 생성 ──")
    for fname, prompt in UFO.items():
        out = OUT_DIR / fname
        if out.exists():
            print(f"  skip (exists): {fname}")
            continue
        print(f"  생성 중: {fname}")
        try:
            data = generate(prompt)
            save(data, out)
        except Exception as e:
            print(f"  ERROR {fname}: {e}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument(
        "stage",
        choices=["all", "bg", "char", "char_rest", "ufo"],
        default="all",
        nargs="?",
    )
    ap.add_argument("--model", help="모델 override")
    args = ap.parse_args()

    global MODEL
    if args.model:
        MODEL = args.model

    print(f"Model: {MODEL}")
    print(f"Output: {OUT_DIR}")

    if args.stage in ("all", "bg"):
        run_bg()
    if args.stage in ("all", "char"):
        run_char()
    if args.stage == "char_rest":
        # 마스터 있으면 파생만
        for fname, spec in CHARACTERS.items():
            if not spec["use_ref"]:
                continue
            out = OUT_DIR / fname
            if out.exists():
                print(f"  skip: {fname}")
                continue
            print(f"  생성 중: {fname}")
            ref = OUT_DIR / "char_normal.png"
            try:
                data = generate(spec["prompt"], ref_path=ref)
                save(data, out)
            except Exception as e:
                print(f"  ERROR {fname}: {e}")
            time.sleep(2)
    if args.stage in ("all", "ufo"):
        run_ufo()

    print("\n완료!")


if __name__ == "__main__":
    main()
