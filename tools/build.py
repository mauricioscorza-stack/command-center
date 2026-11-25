"""Monta command-center.html a partir de src/app.src.html + Scorza Design (design/).
Uso: python3 tools/build.py
"""
import json, re, pathlib
ROOT = pathlib.Path(__file__).resolve().parent.parent
D = ROOT / 'design'

t = json.loads((D / 'tokens.json').read_text())
themes = [x['id'] for x in t['color']['themes']]
def val(v, th):
    if isinstance(v, str): return v if th == themes[0] else None
    return v.get(th)
def css_val(v):
    m = re.fullmatch(r'\{(.+)\}', v); return f'var(--{m.group(1)})' if m else v
out = []
for i, th in enumerate(themes):
    sel = ':root, [data-theme="%s"]' % th if i == 0 else '[data-theme="%s"]' % th
    lines = []
    for fam in ['color', 'shadow']:
        for tok in t[fam]['tokens']:
            v = val(tok['value'], th)
            if v is None and i > 0: continue
            if v is None: v = tok['value'].get(themes[0])
            lines.append(f"--{tok['name']}: {css_val(v)};")
    out.append(sel + ' {' + ' '.join(lines) + '}')
root = []
for fam in ['spacing', 'radius', 'effect', 'duration', 'easing']:
    for tok in t[fam]['tokens']: root.append(f"--{tok['name']}: {tok['value']};")
for k, v in t['type']['families'].items(): root.append(f"--font-{k}: {v};")
out.append(':root {' + ' '.join(root) + '}')
tokcss = '\n'.join(out)

bundle = re.sub(r'^@import[^\n]*\n', '', (D / 'bundle.css').read_text())

icons = json.loads((D / 'icons.json').read_text())
icons.update({  # Lucide
  'download': '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/>',
  'external': '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3"/>',
  'upload': '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/>',
})

src = (ROOT / 'src' / 'app.src.html').read_text()
html = src.replace('/*TOKENS*/', tokcss).replace('/*BUNDLE*/', bundle).replace('/*ICONS*/', json.dumps(icons, ensure_ascii=False))
(ROOT / 'command-center.html').write_text(html)
print('command-center.html', len(html) // 1024, 'KB')
