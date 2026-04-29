"""assets/az, assets/gem 의 모든 PNG에서 배경 제거 → 투명 PNG로 덮어쓰기 (원본은 _raw/로 백업)."""

from __future__ import annotations

import pathlib
import shutil
import sys

from rembg import remove

PROJECT = pathlib.Path(__file__).resolve().parent.parent
ASSETS = PROJECT / "assets"
BACKUP_SUFFIX = "_raw"


def process_dir(d: pathlib.Path):
    backup = d.with_name(d.name + BACKUP_SUFFIX)
    backup.mkdir(parents=True, exist_ok=True)
    for p in sorted(d.glob("*.png")):
        bkp = backup / p.name
        # 원본 백업 (한 번만)
        if not bkp.exists():
            shutil.copy2(p, bkp)
        # 누끼
        with open(bkp, "rb") as f:
            src = f.read()
        out = remove(src)
        with open(p, "wb") as f:
            f.write(out)
        print(
            f"  {p.relative_to(PROJECT)}  ({len(src) // 1024} → {len(out) // 1024} KB)"
        )


for name in ("az", "gem"):
    d = ASSETS / name
    if not d.exists():
        print(f"skip {d}", file=sys.stderr)
        continue
    print(f"\n[{name}]")
    process_dir(d)

print("\ndone. backups in assets/*_raw/")
