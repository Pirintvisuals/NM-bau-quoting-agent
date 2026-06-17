// Calibration + market-envelope check for the bathroom pricing engine.
// Run: node test-quote.mjs   (exits non-zero if any scenario drifts off-market)
//
// The envelopes are the published 2025–2026 Hungarian ranges (Daibau, qjob,
// ÉpítésKultúra, szakiweb). Small bathrooms legitimately exceed 250 000 Ft/m²
// because fixed costs dominate, so the per-m² ceiling is size-dependent.
import { buildQuote } from './api/faq-agent.js';

const fmt = (n) => Math.round(n).toLocaleString('hu-HU') + ' Ft';

// Whole-property scenarios. Envelopes are the published 2025–2026 turnkey ranges
// (Daibau full 135–275k Ft/m², 65 m² ~8,8–17,9 M; kozmetikai 30–60k/m²; konyha
// 0,8–2,7 M; tető/homlokzat/térkő per the trade pages). perM2 only sanity-checked
// where it's meaningful (full flat/house); kitchen/room bound by total instead.
const renoCases = [
    // ESSENTIAL-ONLY ballpark (no refine): the realistic MIDDLE scope is the default
    // a "közepes" customer lands on — should feel sensible, not alarming.
    { name: 'LAKÁS 60 m², közepes, RÉSZLEGES, 1 fürdő, új konyha (csak alapkérdések)',
      sel: { projectType: 'lakas', size: '60', tier: 'mid', scope: 'reszleges', bathrooms: '1', kitchen: 'uj' },
      total: [4_500_000, 7_500_000], perM2: [80_000, 130_000] },
    // Same flat, but customer REFINED: added windows + radiator + walls + condition.
    { name: 'LAKÁS 60 m², közepes, RÉSZLEGES + pontosítva (falak, lakott, ablak, radiátor)',
      sel: { projectType: 'lakas', size: '60', tier: 'mid', scope: 'reszleges', bathrooms: '1', kitchen: 'uj',
             walls: 'igen', condition: 'lakott', floortile: 'fele_fele', windows: 'csere', heatingsys: 'radiator', klima: 'nem' },
      total: [6_000_000, 9_500_000], perM2: [100_000, 170_000] },
    { name: 'LAKÁS 80 m², prémium, TELJES, 2 fürdő, új konyha, ablak, hőszivattyú, klíma',
      sel: { projectType: 'lakas', size: '80', tier: 'premium', scope: 'teljes', bathrooms: '2', kitchen: 'uj',
             walls: 'igen', condition: 'lakott', floortile: 'tobb_csempe', windows: 'csere', heatingsys: 'hoszivattyu', klima: 'igen' },
      total: [18_000_000, 30_000_000], perM2: [220_000, 400_000] },
    { name: 'LAKÁS 50 m², alap, KOZMETIKAI, 1 fürdő, konyha nem (csak alapkérdések)',
      sel: { projectType: 'lakas', size: '50', tier: 'basic', scope: 'kozmetikai', bathrooms: '1', kitchen: 'nem' },
      total: [1_000_000, 2_600_000], perM2: [25_000, 70_000] },
    { name: 'HÁZ 110 m², közepes, TELJES + pontosítva, 2 fürdő, új konyha, ablak, radiátor, homlokzat+tető',
      sel: { projectType: 'haz', size: '110', tier: 'mid', scope: 'teljes', bathrooms: '2', kitchen: 'uj',
             walls: 'nem', condition: 'lakott', floortile: 'fele_fele', windows: 'csere', heatingsys: 'radiator', klima: 'nem', exterior: 'homlokzat_teto' },
      total: [18_000_000, 32_000_000], perM2: [160_000, 320_000] },
    { name: 'KONYHA 10 m², közepes, bútorral, gépekkel, marad',
      sel: { projectType: 'konyha', size: '10', tier: 'mid', furniture: 'igen', appliances: 'igen', layout: 'marad' },
      total: [1_200_000, 2_200_000], perM2: [80_000, 260_000] },
    { name: 'SZOBA 15 m², közepes, teljes',
      sel: { projectType: 'szoba', size: '15', tier: 'mid', roomscope: 'teljes' },
      total: [400_000, 950_000], perM2: [25_000, 75_000] },
];

const cases = [
    { name: '4 m², basic, zuhanykabin, keep, no heat',
      sel: { size: 's_3_4', tier: 'basic', washing: 'zuhanykabin', layout: 'marad', heating: 'nem' },
      // 4 m² alap kivitel: Daibau 4–5 m² ~0,75–1,5 M.
      total: [800_000, 1_400_000], perM2: [200_000, 380_000] },
    { name: '6 m², mid, walk-in shower, keep, no heat',
      sel: { size: 's_5_6', tier: 'mid', washing: 'zuhany', layout: 'marad', heating: 'nem' },
      total: [1_300_000, 2_200_000], perM2: [220_000, 360_000] },
    { name: '9 m², mid, bath+shower, move, underfloor heat',
      sel: { size: '9', tier: 'mid', washing: 'mindketto', layout: 'athelyez', heating: 'igen' },
      total: [2_000_000, 3_000_000], perM2: [200_000, 330_000] },
    { name: '6 m², premium, walk-in shower, move, heat',
      sel: { size: 's_5_6', tier: 'premium', washing: 'zuhany', layout: 'athelyez', heating: 'igen' },
      total: [2_400_000, 3_600_000], perM2: [300_000, 560_000] },
    { name: 'unknown everything (nem_tudom defaults)',
      sel: { size: 'nem_tudom', tier: 'nem_tudom', washing: 'nem_tudom', layout: 'nem_tudom', heating: 'nem_tudom' },
      total: [1_200_000, 2_200_000], perM2: [220_000, 360_000] },
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
