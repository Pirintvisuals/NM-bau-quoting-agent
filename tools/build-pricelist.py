# Regenerate api/pricelist.js from AJÁNLAT.xlsx / Törzsárlista.
#
#   python tools/build-pricelist.py [path-to-AJANLAT.xlsx]
#
# api/pricelist.js is GENERATED - never hand-edit it. Anything NM Bau tells us
# that the workbook does not yet say goes in CORRECTIONS or EXTRA_ITEMS below,
# so re-exporting the sheet can never silently undo it.
import json, io, statistics, unicodedata, re, sys, os
import openpyxl

XLSX = sys.argv[1] if len(sys.argv) > 1 else r'C:\Users\pirin\Downloads\AJÁNLAT.xlsx'
OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'api', 'pricelist.js')

# --- Corrections confirmed by NM Bau, applied on top of the workbook ---------
# Each entry says WHO confirmed it and WHEN. Delete an entry once the workbook
# itself carries the corrected number.
CORRECTIONS = {
    # Milán / NM Bau, 2026-09-08: the Austrian prices on these two rows were out
    # of line with the rest of the column (ratios of 800 and 100 Ft/EUR against a
    # list median of 268). The Hungarian side was right in both cases.
    'fogado_falfelulet_kvarchomokos_tapadohid_kez': {'eur': 15.0},   # was 5 EUR/m²
    'hajlaterosito_szalag_agyazasa': {'eur': 10.0},                  # was 20 EUR/fm
}

# --- Items NM Bau prices but the workbook does not list ----------------------
EXTRA_ITEMS = [
    # Milán / NM Bau, 2026-09-08: wall-tile removal is normally charged by the
    # square metre. The workbook's 100 000 Ft "Falicsempe bontása / levésése" is
    # a lump sum they have only used on one or two bathrooms, so it is the wrong
    # default for a calculator. EUR derived from the list median - NOT confirmed.
    dict(id='falicsempe_bontasa_m2', cat='BONTÁS',
         hu='Falicsempe bontása / levésése',
         de='Abbruch / Entfernen der Wandfliesen',
         unit='m²', huf=4500.0, eur=17.0),
]

def slug(s):
    s = unicodedata.normalize('NFKD', s).encode('ascii', 'ignore').decode()
    return re.sub(r'_+', '_', re.sub(r'[^a-zA-Z0-9]+', '_', s).strip('_').lower())[:44].strip('_')

wb = openpyxl.load_workbook(XLSX, data_only=True)
ws = wb['Törzsárlista']
rows, seen = [], {}
for r in ws.iter_rows(min_row=2, max_row=ws.max_row, max_col=11):
    v = [c.value for c in r]
    if not v[2] or not v[6]:
        continue
    hu = str(v[2]).strip()
    sid = slug(hu)
    seen[sid] = seen.get(sid, 0) + 1
    if seen[sid] > 1:
        sid = '%s%d' % (sid, seen[sid])
    rows.append(dict(id=sid, cat=str(v[0]).strip(), hu=hu,
                     de=(str(v[3]).strip() if v[3] else ''),
                     unit=(str(v[4]).strip() if v[4] else ''),
                     huf=float(v[6]),
                     eur=(float(v[7]) if v[7] else None)))

rows.extend(EXTRA_ITEMS)

applied = 0
for r in rows:
    fix = CORRECTIONS.get(r['id'])
    if fix:
        r.update(fix)
        applied += 1
missing = set(CORRECTIONS) - {r['id'] for r in rows}
assert not missing, 'CORRECTIONS refer to unknown items: %s' % sorted(missing)

med = statistics.median(r['huf'] / r['eur'] for r in rows if r['eur'])

HEADER = '''// ---------------------------------------------------------------------------
//  NM BAU TÖRZSÁRLISTA - the real, itemised trade price list.
//
//  GENERATED from AJÁNLAT.xlsx / "Törzsárlista" (the NM Bau master quoting
//  sheet). Do NOT hand-edit: re-export from the workbook instead, so the widget
//  and the sheet can never drift apart. Every rate here is a price NM Bau
//  actually quotes, sourced and dated per line in the workbook (Törő Péter /
//  Patakiné Varga Emília / Bazuba) - which is why the engine now assembles
//  quotes from these items instead of from invented per-m² averages.
//
//  TWO THINGS THAT DECIDE HOW THESE NUMBERS MAY BE USED - confirmed by NM Bau
//  on 2026-09-04:
//
//  1. LABOUR ONLY. "Csak munkadíj, a termék árát nem tartalmazza." The tiles,
//     the WC, the basin, the bath, the shower screen and the taps are NOT in
//     these prices - the customer buys those. Only the four "(anyagköltséggel)"
//     protection items carry their own material. Any quote built from this list
//     is a LABOUR quote and has to say so out loud.
//  2. NO VAT ON TOP. "ÁFA-mentes ár, tehát maximálisan fizetendő összeg
//     (alanyi adómentes)." NM Bau is alanyi adómentes, so a figure here is the
//     final amount payable - not a net price waiting for 27 percent VAT.
//
//  Currency: `huf` is the Hungarian price, `eur` the Austrian one. They are two
//  separately maintained market prices, NOT a conversion of one another - the
//  euro column sits around __MED__ Ft/EUR against a much higher market FX rate, so
//  the Austrian price is the dearer one in real money. Which column is used is
//  decided by the language the customer writes in, not by the location.
// ---------------------------------------------------------------------------

'''.replace('__MED__', str(round(med)))

o = io.open(OUT, 'w', encoding='utf-8', newline='\n')
o.write(HEADER)
o.write('export const PRICE_LIST = {\n')
cur = None
for r in rows:
    if r['cat'] != cur:
        cur = r['cat']
        o.write('\n    // --- %s ---\n' % cur)
    eur = 'null' if r['eur'] is None else ('%g' % r['eur'])
    hu = r['hu'].replace('\\', '').replace('"', '\\"')
    de = r['de'].replace('\\', '').replace('"', '\\"')
    o.write('    "%s": { cat: "%s", huf: %d, eur: %s, unit: "%s", hu: "%s", de: "%s" },\n'
            % (r['id'], r['cat'], int(r['huf']), eur, r['unit'], hu, de))
o.write('};\n\n')
o.write('// The two rows that have no Austrian price yet fall back to this, the\n')
o.write('// median HUF:EUR ratio of the 176 rows that do have one.\n')
o.write('export const FT_PER_EUR_FALLBACK = %.1f;\n\n' % med)
o.write('''// One rate, in the currency being quoted. Throws on an unknown id: a silent 0
// would quietly under-quote the whole job, which is exactly the failure this
// price list exists to remove.
export function rate(id, currency) {
    const it = PRICE_LIST[id];
    if (!it) throw new Error("Ismeretlen torzsarlista tetel: " + id);
    if (currency === "eur") return it.eur != null ? it.eur : it.huf / FT_PER_EUR_FALLBACK;
    return it.huf;
}

// The item's own name, in the customer's language. The workbook carries a real
// German trade name per row; English falls back to Hungarian and is translated
// by the existing label layer.
export function itemName(id, lang) {
    const it = PRICE_LIST[id];
    if (!it) return id;
    return (lang === "de" && it.de) ? it.de : it.hu;
}
''')
o.close()
print('written %d items (%d corrections, %d added), median Ft/EUR = %.1f' % (len(rows), applied, len(EXTRA_ITEMS), med))
