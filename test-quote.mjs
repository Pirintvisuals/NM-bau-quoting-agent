// Calibration check for the pricing engine.
// Run: node test-quote.mjs   (exits non-zero if any scenario drifts out of band)
//
// IMPORTANT: these envelopes are NM Bau's INTENDED price bands (NET / nettó,
// premium-positioned), NOT generic published market ranges. The owner sets the
// firm deliberately above the aggregator averages, so a small bathroom can land
// well over 400 000 Ft/m² net. The bands below guard against accidental drift
// from those intended targets when the MODEL/RENO numbers are edited.
import { buildQuote } from './api/faq-agent.js';

const fmt = (n) => Math.round(n).toLocaleString('hu-HU') + ' Ft';

// Whole-property scenarios. Envelopes are the published 2025–2026 turnkey ranges
// (Daibau full 135–275k Ft/m², 65 m² ~8,8–17,9 M; kozmetikai 30–60k/m²; konyha
// 0,8–2,7 M; tető/homlokzat/térkő per the trade pages). perM2 only sanity-checked
// where it's meaningful (full flat/house); kitchen/room bound by total instead.
const renoCases = [
    // ESSENTIAL-ONLY ballpark (no refine): the realistic MIDDLE scope is the default
    // a "közepes" customer lands on - should feel sensible, not alarming.
    { name: 'LAKÁS 60 m², közepes, RÉSZLEGES, 1 fürdő, új konyha (csak alapkérdések)',
      sel: { projectType: 'lakas', size: '60', tier: 'mid', scope: 'reszleges', bathrooms: '1', kitchen: 'uj' },
      total: [6_200_000, 8_200_000], perM2: [100_000, 140_000] },
    // Same flat, but customer REFINED: added windows + radiator + walls + condition.
    { name: 'LAKÁS 60 m², közepes, RÉSZLEGES + pontosítva (falak, lakott, ablak, radiátor)',
      sel: { projectType: 'lakas', size: '60', tier: 'mid', scope: 'reszleges', bathrooms: '1', kitchen: 'uj',
             walls: 'igen', condition: 'lakott', floortile: 'fele_fele', windows: 'csere', heatingsys: 'radiator', klima: 'nem' },
      total: [7_400_000, 9_800_000], perM2: [120_000, 165_000] },
    { name: 'LAKÁS 80 m², prémium, TELJES, 2 fürdő, új konyha, ablak, hőszivattyú, klíma',
      sel: { projectType: 'lakas', size: '80', tier: 'premium', scope: 'teljes', bathrooms: '2', kitchen: 'uj',
             walls: 'igen', condition: 'lakott', floortile: 'tobb_csempe', windows: 'csere', heatingsys: 'hoszivattyu', klima: 'igen' },
      total: [24_000_000, 31_000_000], perM2: [300_000, 390_000] },
    { name: 'LAKÁS 50 m², alap, KOZMETIKAI, 1 fürdő, konyha nem (csak alapkérdések)',
      sel: { projectType: 'lakas', size: '50', tier: 'basic', scope: 'kozmetikai', bathrooms: '1', kitchen: 'nem' },
      total: [1_700_000, 2_600_000], perM2: [33_000, 55_000] },
    { name: 'HÁZ 110 m², közepes, TELJES + pontosítva, 2 fürdő, új konyha, ablak, radiátor',
      sel: { projectType: 'haz', size: '110', tier: 'mid', scope: 'teljes', bathrooms: '2', kitchen: 'uj',
             walls: 'nem', condition: 'lakott', floortile: 'fele_fele', windows: 'csere', heatingsys: 'radiator', klima: 'nem' },
      total: [16_000_000, 21_000_000], perM2: [140_000, 195_000] },
    { name: 'KONYHA 10 m², közepes, bútorral (4–5 fm), gépekkel, marad',
      sel: { projectType: 'konyha', size: '10', tier: 'mid', furniture: 'igen', kitchen_fm: 'fm_4_5', appliances: 'igen', layout: 'marad' },
      total: [1_700_000, 2_400_000], perM2: [160_000, 250_000] },
    { name: 'SZOBA 15 m², közepes, teljes',
      sel: { projectType: 'szoba', size: '15', tier: 'mid', roomscope: 'teljes' },
      total: [600_000, 1_000_000], perM2: [40_000, 70_000] },
    // Regional index: same Budapest flat should land ~8% over the same job rural.
    { name: 'LAKÁS 60 m² Budapest (1011) - közepes, részleges, új konyha',
      sel: { projectType: 'lakas', size: '60', tier: 'mid', scope: 'reszleges', bathrooms: '1', kitchen: 'uj', postal_code: '1011' },
      total: [6_800_000, 8_800_000], perM2: [110_000, 150_000] },
    { name: 'LAKÁS 60 m² vidék (4032 Debrecen) - közepes, részleges, új konyha',
      sel: { projectType: 'lakas', size: '60', tier: 'mid', scope: 'reszleges', bathrooms: '1', kitchen: 'uj', postal_code: '4032' },
      total: [5_900_000, 7_700_000], perM2: [95_000, 130_000] },
];

const cases = [
    // Intended NM Bau bands (net): a small bathroom floor sits ~2 M, a typical mid
    // bath 2–3 M, a big or premium one up to ~5 M (owner target).
    { name: '4 m², basic, zuhanykabin, keep, no heat',
      sel: { size: 's_3_4', tier: 'basic', washing: 'zuhanykabin', layout: 'marad', heating: 'nem' },
      total: [1_600_000, 2_300_000], perM2: [450_000, 650_000] },
    { name: '6 m², mid, épített zuhanyzó (no heat possible), keep',
      sel: { size: 's_5_6', tier: 'mid', washing: 'zuhany', layout: 'marad', heating: 'nem' },
      total: [2_300_000, 3_200_000], perM2: [430_000, 580_000] },
    { name: '9 m², mid, bath+shower, move, underfloor heat',
      sel: { size: '9', tier: 'mid', washing: 'mindketto', layout: 'athelyez', heating: 'igen' },
      total: [3_200_000, 4_400_000], perM2: [360_000, 480_000] },
    { name: '6 m², premium, bath+shower, move, heat',
      sel: { size: 's_5_6', tier: 'premium', washing: 'mindketto', layout: 'athelyez', heating: 'igen' },
      total: [3_400_000, 5_200_000], perM2: [600_000, 900_000] },
    { name: 'unknown everything (nem_tudom defaults)',
      sel: { size: 'nem_tudom', tier: 'nem_tudom', washing: 'nem_tudom', layout: 'nem_tudom', heating: 'nem_tudom' },
      total: [2_200_000, 3_000_000], perM2: [450_000, 600_000] },
];

let failures = 0;
const inRange = (v, [lo, hi]) => v >= lo && v <= hi;

for (const c of [...cases, ...renoCases]) {
    const q = buildQuote(c.sel);
    console.log(`\n■ ${c.name}  (≈${q.area} m²)`);
    for (const it of q.items) console.log(`   ${it.label.padEnd(52)} ${fmt(it.huf).padStart(14)}`);
    console.log(`   ${'PONT BECSLÉS'.padEnd(52)} ${fmt(q.total).padStart(14)}`);
    console.log(`   → SÁV: ${fmt(q.low)} – ${fmt(q.high)}   (${fmt(q.perM2)}/m²)`);

    const okTotal = inRange(q.total, c.total);
    const okPerM2 = inRange(q.perM2, c.perM2);
    if (!okTotal) { failures++; console.log(`   ✗ TOTAL kívül esik a piaci sávon: vár ${fmt(c.total[0])}–${fmt(c.total[1])}`); }
    if (!okPerM2) { failures++; console.log(`   ✗ Ft/m² kívül esik a piaci sávon: vár ${fmt(c.perM2[0])}–${fmt(c.perM2[1])}/m²`); }
    if (okTotal && okPerM2) console.log(`   ✓ piaci sávon belül`);
}

console.log(`\n${failures === 0 ? '✓ minden forgatókönyv a piaci sávon belül' : `✗ ${failures} eltérés`}`);
process.exit(failures === 0 ? 0 : 1);
