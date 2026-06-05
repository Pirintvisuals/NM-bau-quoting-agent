// Quick calibration check for the bathroom pricing engine. Run: node test-quote.mjs
import { buildQuote } from './api/faq-agent.js';

const fmt = (n) => Math.round(n).toLocaleString('hu-HU') + ' Ft';

const cases = [
    { name: '4 m², basic, zuhanykabin, keep, no heat',
      sel: { size: 's_3_4', tier: 'basic', washing: 'zuhanykabin', layout: 'marad', heating: 'nem' } },
    { name: '6 m², mid, walk-in shower, keep, no heat',
      sel: { size: 's_5_6', tier: 'mid', washing: 'zuhany', layout: 'marad', heating: 'nem' } },
    { name: '9 m², mid, bath+shower, move, underfloor heat',
      sel: { size: '9', tier: 'mid', washing: 'mindketto', layout: 'athelyez', heating: 'igen' } },
    { name: '6 m², premium, walk-in shower, move, heat',
      sel: { size: 's_5_6', tier: 'premium', washing: 'zuhany', layout: 'athelyez', heating: 'igen' } },
    { name: 'unknown everything (nem_tudom defaults)',
      sel: { size: 'nem_tudom', tier: 'nem_tudom', washing: 'nem_tudom', layout: 'nem_tudom', heating: 'nem_tudom' } },
];

for (const c of cases) {
    const q = buildQuote(c.sel);
    console.log(`\n■ ${c.name}  (≈${q.area} m²)`);
    for (const it of q.items) console.log(`   ${it.label.padEnd(52)} ${fmt(it.huf).padStart(14)}`);
    console.log(`   ${'PONT BECSLÉS'.padEnd(52)} ${fmt(q.total).padStart(14)}`);
    console.log(`   → SÁV: ${fmt(q.low)} – ${fmt(q.high)}`);
}
