"""Genera las tres ilustraciones del paso a paso para iPhone (public/site/ios-1..3.svg).
Son dibujos esquemáticos de Safari y de la pantalla de inicio, no capturas reales de iOS."""
import os

W = 'M3 7a2 2 0 0 1 2-2h13v4M3 7v11a2 2 0 0 0 2 2h15V9H5a2 2 0 0 1-2-2ZM16 14.5h.01'
FONT = "-apple-system,BlinkMacSystemFont,'Inter','Segoe UI',sans-serif"


def svg(body, bg='#eef2f9'):
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 380" role="img" font-family="{FONT}">
<defs>
<linearGradient id="nv" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0b4aa8"/><stop offset="1" stop-color="#021a42"/></linearGradient>
<filter id="sh" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="6" stdDeviation="8" flood-color="#04132e" flood-opacity="0.22"/></filter>
</defs>
<rect width="300" height="380" rx="26" fill="{bg}"/>
{body}
</svg>'''


def badge(x, y, n):
    return f'<g><circle cx="{x}" cy="{y}" r="15" fill="#3d7bff"/><text x="{x}" y="{y + 5.5}" text-anchor="middle" font-size="16" font-weight="700" fill="#fff">{n}</text></g>'


# Paso 1: barra de Safari con el botón Compartir resaltado
s1 = svg(f'''
<rect x="22" y="22" width="256" height="170" rx="16" fill="#fff" filter="url(#sh)"/>
<rect x="38" y="42" width="120" height="12" rx="6" fill="#dfe6f2"/>
<rect x="38" y="64" width="210" height="8" rx="4" fill="#eef2f9"/><rect x="38" y="80" width="180" height="8" rx="4" fill="#eef2f9"/>
<rect x="38" y="104" width="224" height="64" rx="12" fill="url(#nv)"/>
<text x="52" y="132" font-size="11" fill="#fff" opacity="0.7">Patrimonio neto</text>
<text x="52" y="156" font-size="20" font-weight="700" fill="#fff">13.106,44 €</text>
<rect x="14" y="214" width="272" height="44" rx="22" fill="#fff" filter="url(#sh)"/>
<text x="150" y="241" text-anchor="middle" font-size="13" fill="#4b5876">creative-lestudio.github.io</text>
<rect x="0" y="286" width="300" height="94" rx="0" fill="#f7f8fc"/>
<g stroke="#8a94a6" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round">
<path d="M48 318l-8 8 8 8"/><path d="M92 318l8 8-8 8"/>
<rect x="206" y="316" width="22" height="18" rx="3"/><path d="M211 316v-4h12v4"/>
<rect x="244" y="316" width="22" height="18" rx="4"/>
</g>
<circle cx="150" cy="326" r="27" fill="#3d7bff" opacity="0.16"/><circle cx="150" cy="326" r="20" fill="#3d7bff" opacity="0.28"/>
<g stroke="#0a63ff" stroke-width="2.6" fill="none" stroke-linecap="round" stroke-linejoin="round">
<path d="M142 326v10a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-10"/><path d="M150 332v-17M144 321l6-6 6 6"/></g>
{badge(150, 286, 1)}
<text x="150" y="366" text-anchor="middle" font-size="13" font-weight="650" fill="#0a63ff">Toca «Compartir»</text>
''')


def row(y, label, hl=False, icon=''):
    fill = '#e7f0ff' if hl else '#fff'
    stroke = 'stroke="#3d7bff" stroke-width="2"' if hl else ''
    col = '#0a63ff' if hl else '#1c2540'
    wt = '650' if hl else '500'
    return f'<rect x="22" y="{y}" width="256" height="44" rx="12" fill="{fill}" {stroke}/><text x="42" y="{y + 27}" font-size="14" font-weight="{wt}" fill="{col}">{label}</text>{icon}'


def plus(y):
    return f'<g stroke="#0a63ff" stroke-width="2" fill="none" stroke-linecap="round"><rect x="240" y="{y + 11}" width="22" height="22" rx="5"/><path d="M251 {y + 17}v10M246 {y + 22}h10"/></g>'


# Paso 2: hoja de compartir con «Añadir a pantalla de inicio»
s2 = svg(f'''
<rect x="10" y="40" width="280" height="330" rx="22" fill="#f7f8fc" filter="url(#sh)"/>
<rect x="132" y="50" width="36" height="5" rx="2.5" fill="#c9d1e0"/>
<rect x="22" y="66" width="40" height="40" rx="10" fill="url(#nv)"/>
<g stroke="#fff" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round" transform="translate(30 74) scale(0.95)"><path d="{W}"/></g>
<text x="72" y="84" font-size="14" font-weight="650" fill="#1c2540">Finanzas</text>
<text x="72" y="102" font-size="11" fill="#8a94a6">creative-lestudio.github.io</text>
{row(122, 'Copiar')}
{row(172, 'Añadir a favoritos')}
{row(222, 'Añadir a pantalla de inicio', True, plus(222))}
{row(272, 'Buscar en la página')}
{badge(150, 28, 2)}
<text x="150" y="344" text-anchor="middle" font-size="12.5" font-weight="650" fill="#0a63ff">Si no lo ves, desliza hacia arriba</text>
''')

# Paso 3: pantalla de inicio con el icono de Finanzas
colors = ['#9db4d8', '#c4b5e8', '#f0b9a0', '#a8d5c2']
tiles = ''
for j in range(2):
    for i, c in enumerate(colors):
        if (j, i) == (1, 1):
            continue
        tiles += f'<rect x="{30 + i * 62}" y="{60 + j * 84}" width="52" height="52" rx="13" fill="{c}" opacity="0.85"/>'
s3 = svg(f'''
<defs><linearGradient id="wp" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#cfe0ff"/><stop offset="1" stop-color="#8fb0f0"/></linearGradient></defs>
<rect width="300" height="380" rx="26" fill="url(#wp)"/>
{tiles}
<circle cx="116" cy="162" r="44" fill="#3d7bff" opacity="0.2"/>
<rect x="92" y="144" width="52" height="52" rx="13" fill="url(#nv)" filter="url(#sh)"/>
<g stroke="#fff" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round" transform="translate(103 155) scale(1.25)"><path d="{W}"/></g>
<text x="118" y="212" text-anchor="middle" font-size="12" font-weight="650" fill="#04132e">Finanzas</text>
<rect x="30" y="296" width="240" height="64" rx="26" fill="#fff" opacity="0.55"/>
{badge(150, 238, 3)}
<text x="150" y="284" text-anchor="middle" font-size="13" font-weight="650" fill="#04132e">¡Listo! Ábrela desde tu inicio</text>
''', bg='#8fb0f0')

out = os.path.join(os.path.dirname(__file__), '..', 'public', 'site')
for n, s in enumerate([s1, s2, s3], 1):
    open(os.path.join(out, f'ios-{n}.svg'), 'w').write(s)
print('ok')
