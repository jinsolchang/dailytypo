"""
AI Debate Arena — 캐릭터 스프라이트 생성 (Gemini 3 Pro Image / nano-banana-pro)

사용법:
    # 1) 먼저 idle 마스터 포트레이트만 생성
    python scripts/gen_characters.py idle

    # 2) 마스터가 마음에 들면 나머지 6액션 파생 (마스터 이미지 참조해서)
    python scripts/gen_characters.py actions

    # 3) 모두 다시 처음부터
    python scripts/gen_characters.py all

생성물은 assets/az/*.png, assets/gem/*.png
"""

from __future__ import annotations

import argparse
import base64
import os
import pathlib
import sys

from dotenv import load_dotenv
from google import genai
from google.genai import types

SCRIPT_DIR = pathlib.Path(__file__).resolve().parent
PROJECT_DIR = SCRIPT_DIR.parent
ASSETS_DIR = PROJECT_DIR / "assets"

load_dotenv(pathlib.Path.home() / ".kiro" / "secrets" / ".env")
load_dotenv(PROJECT_DIR / ".env")

KEY = os.environ["GEMINI_API_KEY_GENAI"]
# nano-banana-pro 이미지 모델 (Gemini 3 Pro Image Preview)
MODEL = os.environ.get("GEMINI_IMAGE_MODEL", "gemini-3-pro-image-preview")
client = genai.Client(api_key=KEY)


CHAR_DESIGN = {
    "AZ": {
        "dir": "az",
        "design": (
            "Portrait of a cold genius girl character named 'AZ', in stylized anime/JRPG key art style. "
            "Long silvery-blue hair with subtle azure gradient tips, sharp confident eyes in pale cyan, "
            "lightly cynical expression. Wearing an elegant high-collared tech-magic robe in azure blue "
            "and white with silver trim and geometric data-rune embroidery. Floating translucent cyan "
            "data crystals and glowing holographic sigils hover near her shoulders. Standing pose, head "
            "slightly tilted, arms relaxed. Crisp clean lineart, cel-shaded coloring, vibrant but "
            "disciplined palette dominated by azure #22c8ff, deep blue #0078d4, silver and white. "
            "Full body character design, centered composition, pure neutral gray background "
            "(#1a1e2e) with subtle vignette. No text, no logos, no border. Character fills ~70% of frame."
        ),
    },
    "GEM": {
        "dir": "gem",
        "design": (
            "Portrait of a flamboyant twin-star challenger character named 'GEM', in stylized anime/JRPG "
            "key art style. Two-tone hair split down the middle: right half vivid magenta-pink, left half "
            "royal purple, ending in golden tips. Playful confident expression, bright eyes with star-shaped "
            "highlights. Wearing a bold asymmetric idol-mage outfit with constellation motifs, gold accents, "
            "and flowing ribbons in magenta and purple. Two small twin orbs — one pink, one gold — float "
            "beside her. Dynamic standing pose, one hand raised with a sparkle effect. Crisp clean lineart, "
            "cel-shaded coloring with vibrant palette: magenta #ff3ea5, violet #9b51e0, gold #ffb84d. "
            "Full body character design, centered composition, pure neutral gray background (#1a1e2e) with "
            "subtle vignette. No text, no logos, no border. Character fills ~70% of frame."
        ),
    },
}


ACTIONS = {
    # key → (prompt_suffix, use_ref=True)
    "idle": (
        "Neutral idle standing pose, breathing quietly, calm expression. Full body.",
        False,  # idle은 마스터 자체 (ref 없이 처음부터)
    ),
    "speak": (
        "Same character, exactly same face/outfit/palette as reference. Now in a speaking pose — mouth "
        "slightly open, one hand gestured at chest level explaining. Confident, mid-sentence. Full body.",
        True,
    ),
    "think": (
        "Same character, exactly same face/outfit/palette as reference. Now thinking — head tilted down "
        "a bit, one finger touching chin, eyes looking to the side in contemplation. Small '...' thought "
        "bubble near head. Full body.",
        True,
    ),
    "attack": (
        "Same character, exactly same face/outfit/palette as reference. Now in a dramatic attack pose — "
        "arm thrust forward with a bold motion effect (energy burst), eyes sharp and fierce, body leaning "
        "forward, foot planted. Dynamic action. Full body.",
        True,
    ),
    "damaged": (
        "Same character, exactly same face/outfit/palette as reference. Now in a damaged pose — staggering "
        "back a step, slight wince, shoulders recoiling, one arm up to guard. Small dust puff at feet. "
        "Full body.",
        True,
    ),
    "victory": (
        "Same character, exactly same face/outfit/palette as reference. Now in a triumphant victory pose — "
        "one arm raised in the air, confident smile, magical light particles swirling around. Stars or "
        "sparkles in background. Full body.",
        True,
    ),
    "defeat": (
        "Same character, exactly same face/outfit/palette as reference. Now in a defeated pose — kneeling "
        "on one knee, head bowed, shoulders slumped, one hand on the floor for support. Desaturated mood, "
        "soft gray tint. Full body.",
        True,
    ),
}


def save_png(data: bytes, path: pathlib.Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "wb") as f:
        f.write(data)
    print(f"  saved → {path.relative_to(PROJECT_DIR)} ({len(data) // 1024} KB)")


def extract_image_bytes(response) -> bytes | None:
    """google-genai SDK 응답에서 첫 번째 이미지 바이트 추출."""
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
            # SDK 버전에 따라 bytes 또는 base64 문자열
            if isinstance(data, bytes):
                return data
            if isinstance(data, str):
                try:
                    return base64.b64decode(data)
                except Exception:
                    continue
    return None


def generate_from_prompt(prompt: str, ref_bytes: bytes | None = None) -> bytes:
    """텍스트 (+ 옵션 참조 이미지) 로 이미지 생성."""
    contents: list = []
    if ref_bytes is not None:
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
        raise RuntimeError(f"No image in response: {resp!r}")
    return img


def load_png(path: pathlib.Path) -> bytes:
    with open(path, "rb") as f:
        return f.read()


def gen_idle(char_key: str) -> pathlib.Path:
    spec = CHAR_DESIGN[char_key]
    out = ASSETS_DIR / spec["dir"] / "idle.png"
    print(f"\n[{char_key}] idle master → {out.relative_to(PROJECT_DIR)}")
    prompt = spec["design"] + "\nPose: " + ACTIONS["idle"][0]
    img = generate_from_prompt(prompt)
    save_png(img, out)
    return out


def gen_action(char_key: str, action: str) -> pathlib.Path:
    spec = CHAR_DESIGN[char_key]
    suffix, use_ref = ACTIONS[action]
    out = ASSETS_DIR / spec["dir"] / f"{action}.png"
    ref_path = ASSETS_DIR / spec["dir"] / "idle.png"
    if use_ref and not ref_path.exists():
        raise FileNotFoundError(f"idle master missing: {ref_path}. Run `idle` first.")
    print(f"\n[{char_key}] {action} → {out.relative_to(PROJECT_DIR)}")
    ref = load_png(ref_path) if use_ref else None
    prompt = (
        "Keep exact same character identity, face, hair, outfit, and color palette as the reference image. "
        "Re-pose only.\n" + suffix
        if use_ref
        else spec["design"] + "\nPose: " + suffix
    )
    img = generate_from_prompt(prompt, ref_bytes=ref)
    save_png(img, out)
    return out


def run(stage: str):
    ASSETS_DIR.mkdir(exist_ok=True)
    if stage in ("idle", "all"):
        gen_idle("AZ")
        gen_idle("GEM")
    if stage in ("actions", "all"):
        for ch in ("AZ", "GEM"):
            for act in ACTIONS:
                if act == "idle" and stage == "actions":
                    continue  # idle 스킵
                gen_action(ch, act)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument(
        "stage",
        choices=["idle", "actions", "all"],
        help="idle 마스터만 / 파생 액션들만 / 모두",
    )
    ap.add_argument("--model", default=MODEL, help="이미지 모델 이름 override")
    args = ap.parse_args()
    MODEL = args.model  # noqa
    try:
        run(args.stage)
    except Exception as e:
        print(f"\nERROR: {e}", file=sys.stderr)
        sys.exit(1)
