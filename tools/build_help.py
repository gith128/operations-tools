#!/usr/bin/env python3
"""Builds public/help.html from docs/manual.md.

Run after editing the manual:  python3 tools/build_help.py
Check it's up to date:         python3 tools/build_help.py --check   (used by npm run check)
Needs the 'markdown' package:  pip install markdown
The page is static; nothing here runs on Netlify.
"""
import re, html, pathlib, sys, markdown

ROOT = pathlib.Path(__file__).resolve().parent.parent
src = (ROOT / 'docs' / 'manual.md').read_text(encoding='utf-8')
version = re.sub(r'\.0$', '', re.search(r'"version":\s*"(\d+\.\d+\.\d+)', (ROOT / 'package.json').read_text()).group(1))

def slug(value, sep='-'):
    value = value.lower().replace("'", '').replace('’', '')
    return re.sub(r'[^a-z0-9]+', sep, value).strip(sep)

md = markdown.Markdown(extensions=['tables', 'sane_lists', 'toc'], extension_configs={'toc': {'slugify': slug}})
body = md.convert(src)
# Wide tables scroll inside their own box on a phone.
body = body.replace('<table>', '<div class="table-wrap"><table>').replace('</table>', '</table></div>')
# Wrap each main section so it can be styled as a card.
parts = re.split(r'(?=<h2 id=)', body)
body = ''.join(f'<section>{p}</section>' if p.startswith('<h2') else p for p in parts)

sections = [(t['id'], t['name']) for t in md.toc_tokens]
toc = ''.join(f'<a href="#{i}">{html.escape(html.unescape(n))}</a>' for i, n in sections)

page = f'''<!DOCTYPE html>
<html lang="en-AU">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>SA eBikes · Operations Tools v{version} · Help &amp; SOPs</title>
<!-- Built from docs/manual.md by tools/build_help.py. Edit the manual, not this file. -->
<style>
@import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=DM+Mono:wght@400;500&display=swap');
:root{{--bg:#fbfaf7;--bg-elev:#fff;--bg-soft:#f2efe8;--border:#e4ded2;--border-strong:#d4cdbd;--text:#1f2428;--text-dim:#5a6269;--text-muted:#8b8f93}}
*{{box-sizing:border-box;margin:0;padding:0}}
html{{scroll-behavior:smooth;scroll-padding-top:120px}}
body{{background:var(--bg);color:var(--text);font-family:'Syne',sans-serif;font-size:15px;line-height:1.6}}
.head-top{{display:flex;justify-content:space-between;align-items:flex-start;gap:10px;margin-bottom:10px}}
.back-home{{flex:none;display:inline-flex;align-items:center;gap:6px;padding:9px 12px;border-radius:999px;background:var(--bg-elev);border:1.5px solid var(--border);color:var(--text);text-decoration:none;font-size:12px;font-weight:800;box-shadow:0 1px 2px rgba(0,0,0,.04)}}
header{{position:sticky;top:0;z-index:10;background:rgba(251,250,247,.96);backdrop-filter:blur(14px);border-bottom:1px solid var(--border);padding:14px 16px 10px}}
.head-row{{max-width:720px;margin:0 auto}}
.logo{{font-size:17px;font-weight:800;letter-spacing:-.4px}}.logo span{{color:var(--accent-dark)}}
.logo-sub{{font-size:11px;color:var(--text-dim);font-family:'DM Mono',monospace}}
nav.toc{{display:flex;gap:6px;overflow-x:auto;padding-bottom:4px;scrollbar-width:none}}
nav.toc::-webkit-scrollbar{{display:none}}
nav.toc a{{flex:none;padding:6px 12px;border-radius:100px;border:1.5px solid var(--border);background:var(--bg-elev);color:var(--text-dim);font-size:12px;font-weight:700;text-decoration:none;white-space:nowrap}}
nav.toc a.here{{border-color:var(--accent);color:var(--accent-text);background:var(--accent-soft)}}
main{{max-width:720px;margin:0 auto;padding:18px 16px 80px}}
section{{background:var(--bg-elev);border:1.5px solid var(--border);border-radius:16px;padding:20px 18px;margin-bottom:16px;box-shadow:0 1px 2px rgba(0,0,0,.03)}}
h2{{font-size:22px;font-weight:800;letter-spacing:-.3px;margin-bottom:8px}}
h3{{font-size:16px;font-weight:800;margin:22px 0 8px;padding-top:14px;border-top:1px solid var(--border)}}
h3[id^="sop-"]{{color:var(--accent-text)}}
p{{margin:0 0 10px}}
ul,ol{{margin:0 0 12px 22px}} li{{margin:4px 0}} li ul{{margin:4px 0 4px 18px}}
ol>li::marker{{font-family:'DM Mono',monospace;font-weight:500;color:var(--accent-text)}}
code{{font-family:'DM Mono',monospace;font-size:13px;background:var(--bg-soft);padding:1px 5px;border-radius:5px}}
.table-wrap{{overflow-x:auto;margin:6px 0 14px;border:1px solid var(--border);border-radius:10px}}
table{{border-collapse:collapse;width:100%;font-size:13px;min-width:440px}}
th,td{{text-align:left;vertical-align:top;padding:8px 10px;border-bottom:1px solid var(--border)}}
th{{background:var(--bg-soft);font-family:'DM Mono',monospace;font-size:11px;font-weight:500;color:var(--text-dim)}}
tr:last-child td{{border-bottom:none}}
.top{{display:inline-block;margin-top:8px;font-size:12px;color:var(--text-muted);text-decoration:none;font-family:'DM Mono',monospace}}
@media print{{header{{position:static}} nav.toc,.back-home,.top{{display:none}} section{{break-inside:auto;box-shadow:none}}}}
</style>
<link rel="stylesheet" href="/assets/theme.css">
<script src="/assets/theme.js"></script>
</head>
<body>
<header><div class="head-row">
  <div class="head-top">
    <div><div class="logo">SA <span>eBikes</span></div>
    <div class="logo-sub">Help &amp; SOPs · Operations Tools v{version}</div></div>
    <a class="back-home" href="/">← Tools</a>
  </div>
  <nav class="toc">{toc}</nav>
</div></header>
<main>
{body}
</main>
<script>
// Highlight the section chip for the part of the manual on screen.
const chips = [...document.querySelectorAll('nav.toc a')];
const io = new IntersectionObserver(es => es.forEach(e => {{
  if (!e.isIntersecting) return;
  chips.forEach(c => c.classList.toggle('here', c.hash === '#' + e.target.querySelector('h2').id));
  const on = chips.find(c => c.classList.contains('here'));
  if (on) {{ const nav = on.parentElement; nav.scrollLeft = on.offsetLeft - (nav.clientWidth - on.offsetWidth) / 2; }}
}}), {{ rootMargin: '-130px 0px -60% 0px' }});
document.querySelectorAll('main section').forEach(s => io.observe(s));
</script>
</body>
</html>
'''
out = ROOT / 'public' / 'help.html'
if '--check' in sys.argv:
    if not out.exists() or out.read_text(encoding='utf-8') != page:
        print('help.html is out of date: run python3 tools/build_help.py'); sys.exit(1)
    print('help.html is up to date'); sys.exit(0)
out.write_text(page, encoding='utf-8')
print('help.html built:', ', '.join(i for i, _ in sections))
