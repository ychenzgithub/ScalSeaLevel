"""Render the link-preview image (assets/social-card.png, 1200 x 630) from the page header.

Serve the site first (python3 -m http.server 8000 in the repository folder), then run
    python analysis/make_social_card.py http://127.0.0.1:8000/ assets/social-card.png
Needs playwright with Google Chrome. The tile notes are shortened from the page's own text, so rerun this after
rebuilding the data.
"""
import sys
import asyncio
from playwright.async_api import async_playwright

URL, OUT = sys.argv[1], sys.argv[2]
W, H = 1200, 630

CSS = """
.lede, .byrow, .companion, .toc, .stamp, .controls-band, .stripes-fig figcaption, main, footer { display: none !important; }
.hero .wrap { gap: 16px !important; max-width: none !important; padding-left: 44px !important; padding-right: 44px !important; }
h1 { font-size: 2.75rem !important; }
.tile { padding: 12px 14px 14px !important; }
.tile .note { display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
"""

# Shorten each tile note to its first sentence or two; keep the record month on the "now" tile.
SHORTEN = """() => {
  const sentences = s => s.match(/.*?\\.(?=\\s|$)/g) || [s];
  const notes = [...document.querySelectorAll('.tile .note')];
  notes.forEach((el, i) => {
    const s = sentences(el.textContent.trim());
    let t = s[0].replace(/, compared with normal for the season/, '').trim();
    if (i === 0) {
      const rec = el.textContent.match(/record was ([^,]+), in ([^.]+)\\./);
      if (rec) t += ` Previous highest month: ${rec[1]}, ${rec[2]}.`;
    } else if (i === 1 || i === 3) {
      if (s[1]) t += ' ' + s[1].trim();
    }
    el.textContent = t;
  });
  const eb = document.querySelector('.eyebrow');
  eb.textContent = eb.textContent.trim() + ' · ychenzgithub.github.io/ScalSeaLevel';
  window.dispatchEvent(new Event('resize'));
}"""


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(channel="chrome", headless=True)
        pg = await b.new_page(viewport={"width": W, "height": H}, device_scale_factor=1)
        await pg.goto(URL, wait_until="domcontentloaded", timeout=60000)
        await pg.wait_for_function("document.querySelector('#stripes svg') !== null && document.fonts.status === 'loaded'",
                                   timeout=30000)
        await pg.wait_for_timeout(1500)
        await pg.add_style_tag(content=CSS)
        await pg.evaluate(SHORTEN)
        await pg.wait_for_timeout(1200)
        # Center the header block vertically in the card.
        h = await pg.evaluate("document.querySelector('.hero .wrap').getBoundingClientRect().height")
        pad = max(24, (H - h) / 2)
        await pg.add_style_tag(content=f".hero {{ padding: {pad:.0f}px 0 0 !important; }}")
        await pg.wait_for_timeout(300)
        bottom = await pg.evaluate("document.querySelector('.tiles').getBoundingClientRect().bottom")
        print(f"content height {h:.0f}px, bottom {bottom:.0f}px of {H}")
        if bottom > H:
            print("warning: content is taller than the card")
        await pg.screenshot(path=OUT, clip={"x": 0, "y": 0, "width": W, "height": H})
        await b.close()

asyncio.run(main())
