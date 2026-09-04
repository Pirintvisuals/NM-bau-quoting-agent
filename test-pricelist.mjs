// Ties the quoting engine back to the NM Bau Törzsárlista.
// Run: node test-pricelist.mjs   (exits non-zero on any mismatch)
//
// test-quote.mjs checks that the TOTALS land in a sensible band. This file
// checks the thing that band can't see: that the engine is really charging the
// workbook's rates, in the right unit, for the right quantity - and that the
// euro path reads the Austrian column rather than converting the Hungarian one.
import { buildQuote } from './api/faq-agent.js';
import { PRICE_LIST, rate, FT_PER_EUR_FALLBACK } from './api/pricelist.js';

let failed = 0;
const check = (label, got, want) => {
    const ok = got === want;
    if (!ok) failed++;
    console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${label}${ok ? '' : `\n            got ${JSON.stringify(got)}, expected ${JSON.stringify(want)}`}`);
};
const near = (label, got, want, tolPct) => {
    const ok = Math.abs(got - want) <= Math.abs(want) * tolPct;
    if (!ok) failed++;
    console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${label}  (${Math.round(got).toLocaleString('hu-HU')} vs ${Math.round(want).toLocaleString('hu-HU')})`);
};

console.log('\n■ The price list itself');
check('178 items exported', Object.keys(PRICE_LIST).length, 178);
check('every item has a Hungarian price', Object.values(PRICE_LIST).every((i) => i.huf > 0), true);
check('every item has a category', Object.values(PRICE_LIST).every((i) => !!i.cat), true);
check('every item has a unit', Object.values(PRICE_LIST).every((i) => !!i.unit), true);
check('at most 2 items lack an Austrian price', Object.values(PRICE_LIST).filter((i) => i.eur == null).length <= 2, true);

// Spot-check a handful of rates straight off the workbook. If someone re-exports
// the sheet and a number moves, these say so out loud instead of the change
// disappearing into a total.
console.log('\n■ Rates match the workbook');
const spot = [
    ['falak_hidegburkolasa_standard_meretu_lappal', 16000, 60, 'm²'],
    ['padlo_hidegburkolasa_standard_meretu_lappal', 16000, 60, 'm²'],
    ['zuhanytalca_beepitese_es_bekotese', 230000, 850, 'db'],
    ['wc_allvany_beepitese_es_bekotese', 110000, 410, 'db'],
    ['kiszallas', 65000, 240, 'alkalom'],
    ['fugazas', 2000, 5, 'm²'],
    ['epitett_zuhanyzo_kialakitasa', 150000, 560, 'átalány'],
];
for (const [id, huf, eur, unit] of spot) {
    check(`${id} = ${huf.toLocaleString('hu-HU')} Ft / ${eur} EUR per ${unit}`,
        `${rate(id, 'huf')}|${rate(id, 'eur')}|${PRICE_LIST[id].unit}`, `${huf}|${eur}|${unit}`);
}

console.log('\n■ The quote is built from those rates');
// A 6 m² bathroom has ~20.7 m² of wall. Wall + floor tiling alone must therefore
// be about (20.7 + 6) x 16 000, and it has to show up inside the tiling group.
const q = buildQuote({ projectType: 'furdo', size: '6', tier: 'mid', washing: 'zuhany', layout: 'marad' });
const tiling = q.items.find((i) => /Burkolás/.test(i.label));
check('a tiling group exists', !!tiling, true);
// Grouting is not in here: the workbook files Fugázás under BEFEJEZŐ MUNKÁK,
// so it lands in the finishing group, and the engine follows the workbook.
near('tiling group = (wall + floor) x 16 000 Ft', tiling.amount, (20.7 + 6) * 16000, 0.02);
const finishing = q.items.find((i) => /Befejező/.test(i.label));
near('finishing group carries the grouting at 2 000 Ft/m²', finishing.amount, 26.7 * 2000 + 10.5 * 2000, 0.15);
check('the call-out is charged once', q.items.some((i) => i.amount >= 65000 && /Kiszállás/.test(i.label)), true);
check('quote is flagged as labour-only', q.basis, 'labour');
check('quote carries its currency', q.currency, 'huf');
check('line items sum to the total', q.items.reduce((s, i) => s + i.amount, 0), q.total);

console.log('\n■ Euro quotes read the Austrian column, they do not convert');
const qe = buildQuote({ projectType: 'furdo', size: '6', tier: 'mid', washing: 'zuhany', layout: 'marad' }, { currency: 'eur' });
check('currency is eur', qe.currency, 'eur');
check('euro total is a euro-sized number', qe.total > 5000 && qe.total < 20000, true);
// If the engine were simply dividing the Ft total by the fallback ratio, these
// would match exactly. They must NOT: the Austrian column is priced separately.
const converted = q.total / FT_PER_EUR_FALLBACK;
check('euro total differs from a naive conversion', Math.abs(qe.total - converted) > 1, true);
near('but stays in the same ballpark as the list ratio', qe.total, converted, 0.12);

console.log('\n■ A Hungarian postcode must not move an Austrian price');
const bp = { projectType: 'furdo', size: '6', tier: 'mid', washing: 'zuhany', layout: 'marad', postal_code: '1011' };
check('Budapest raises the Ft quote', buildQuote(bp).total > q.total, true);
check('Budapest leaves the EUR quote alone', buildQuote(bp, { currency: 'eur' }).total, qe.total);

console.log('\n■ The options actually move the price');
const base = { projectType: 'furdo', size: '6', tier: 'mid', washing: 'zuhany', layout: 'marad' };
const t = (o) => buildQuote({ ...base, ...o }).total;
check('moving the layout costs more than keeping it', t({ layout: 'athelyez' }) > t({}), true);
check('bath + shower costs more than shower only', t({ washing: 'mindketto' }) > t({ washing: 'zuhany' }), true);
check('premium costs more than basic', t({ tier: 'premium' }) > t({ tier: 'basic' }), true);
check('underfloor heating adds to the price', t({ heating: 'igen' }) > t({ heating: 'nem' }), true);
check('a bigger bathroom costs more', t({ size: '10' }) > t({ size: '4' }), true);

console.log(failed ? `\n✗ ${failed} eltérés\n` : '\n✓ a kalkuláció a törzsárlistával egyezik\n');
process.exit(failed ? 1 : 0);
