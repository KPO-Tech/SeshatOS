"""Draws the images of the Windows installer (the sidebar and the header of the NSIS pages, dark like the welcome and finish pages: see installer.nsh) from the brand marks.

Run from seshat-desktop/: python scripts/make_installer_art.py
It needs Microsoft Edge (to draw the pages as pictures) and Pillow (to write the 24 bit BMP files NSIS wants).
"""
import pathlib
import subprocess
import sys
import tempfile
import time

from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parent.parent
BRAND = ROOT / "public" / "brand"
OUT = ROOT / "build"
EDGE = next((p for p in (
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
) if pathlib.Path(p).exists()), None)

SIDEBAR = """<!doctype html><meta charset=utf-8><style>
html,body{{margin:0;width:164px;height:314px;overflow:hidden;font-family:'Segoe UI',sans-serif}}
body{{background:radial-gradient(120% 55% at 50% 0%,rgba(234,120,40,.30),transparent 70%),radial-gradient(90% 40% at 100% 100%,rgba(234,120,40,.14),transparent 70%),linear-gradient(175deg,#352f2a 0%,#2b2521 55%,#211c19 100%);position:relative}}
img{{position:absolute;left:34px;top:46px;width:96px;height:96px}}
.name{{position:absolute;left:0;right:0;top:158px;text-align:center;font:400 24px Georgia,serif;color:#f1dec8;letter-spacing:.2px}}
.rule{{position:absolute;left:62px;width:40px;top:198px;height:2px;border-radius:2px;background:#ea7828}}
.tag{{position:absolute;left:0;right:0;top:212px;text-align:center;font:400 11.5px 'Segoe UI',sans-serif;color:#b9a692;line-height:1.5}}
.foot{{position:absolute;left:0;right:0;bottom:16px;text-align:center;font:400 9.5px 'Segoe UI',sans-serif;color:#7d6f62;letter-spacing:.4px}}
</style><img src="file:///{mark}"><div class=name>SeshatOS</div><div class=rule></div>
<div class=tag>Your AI workspace,<br>on your computer</div><div class=foot>SESHAT AI</div>"""

HEADER = """<!doctype html><meta charset=utf-8><style>
html,body{{margin:0;width:150px;height:57px;overflow:hidden;background:#2b2521}}
img{{position:absolute;right:14px;top:8px;width:41px;height:41px}}
</style><img src="file:///{mark}">"""


def shot(html: str, width: int, height: int, target: pathlib.Path) -> None:
    with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as tmp:
        page = pathlib.Path(tmp) / "page.html"
        page.write_text(html, encoding="utf-8")
        png = pathlib.Path(tmp) / "shot.png"
        subprocess.run([
            EDGE, "--headless=new", "--disable-gpu", "--hide-scrollbars", "--force-device-scale-factor=1",
            f"--user-data-dir={tmp}/profile", f"--window-size={width},{height}", f"--screenshot={png}", page.as_uri(),
        ], check=False, capture_output=True, timeout=90)
        # Edge can hand the work to a process that outlives the one started: wait for the file to appear.
        for _ in range(60):
            if png.exists() and png.stat().st_size > 0:
                time.sleep(0.5)
                break
            time.sleep(0.5)
        # Headless Edge leaves a margin in the window it draws: crop to the size asked.
        image = Image.open(png).convert("RGB").crop((0, 0, width, height))
        image.save(target, format="BMP")


def main() -> int:
    if EDGE is None:
        print("Microsoft Edge was not found", file=sys.stderr)
        return 1
    OUT.mkdir(exist_ok=True)
    dark = (BRAND / "mark-on-dark.svg").as_posix()
    shot(SIDEBAR.format(mark=dark), 164, 314, OUT / "installerSidebar.bmp")
    shot(SIDEBAR.format(mark=dark), 164, 314, OUT / "uninstallerSidebar.bmp")
    shot(HEADER.format(mark=dark), 150, 57, OUT / "installerHeader.bmp")
    print("wrote the installer images in", OUT)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
