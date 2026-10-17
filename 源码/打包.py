"""Build the self-contained 未名岛.html using only Python's standard library.

Run: python 源码/打包.py
No installation, network connection, or build server is needed.
"""
from pathlib import Path
from urllib.parse import quote


def build() -> Path:
    source = Path(__file__).resolve().parent
    output = source.parent / "未名岛.html"
    page = (source / "页面.html").read_text(encoding="utf-8")

    def replace_once(old: str, new: str) -> None:
        nonlocal page
        if page.count(old) != 1:
            raise ValueError(f"页面模板应恰好包含一次：{old}")
        page = page.replace(old, new, 1)

    style = (source / "style.css").read_text(encoding="utf-8")
    replace_once('<link rel="stylesheet" href="style.css">', f"<style>\n{style}\n</style>")
    for name in ("scene.js", "audio.js", "app.js"):
        script = (source / name).read_text(encoding="utf-8").replace("</script", r"<\/script")
        replace_once(f'<script defer src="{name}"></script>', f"<script>\n{script}\n</script>")
    icon = quote((source / "icon.svg").read_text(encoding="utf-8"), safe="")
    replace_once('href="icon.svg"', f'href="data:image/svg+xml,{icon}"')
    output.write_text(page, encoding="utf-8", newline="\n")
    return output


if __name__ == "__main__":
    result = build()
    print(f"已打包：{result}")
    print(f"{result.stat().st_size:,} 字节，单文件，双击即可打开。")
