// Ties the quoting engine back to the NM Bau Törzsárlista.
// Run: node test-pricelist.mjs   (exits non-zero on any mismatch)
//
// test-quote.mjs checks that the TOTALS land in a sensible band. This file
// checks the thing that band can't see: that the engine is really charging the
// workbook's rates, in the right unit, for the right quantity - and that the
// euro path reads the Austrian column rather than converting the Hungarian one.
import { buildQuote, tiledSurface } from './api/faq-agent.js';
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
// 178 rows from the workbook + 1 rate NM Bau confirmed outside it (per-m² wall
// tile removal). Both live in tools/build-pricelist.py.
check('179 items exported', Object.keys(PRICE_LIST).length, 179);
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
near('tiling group = (wall + floor) x 16 000 Ft', tiling.amount, (21.0 + 6) * 16000, 0.02);
const finishing = q.items.find((i) => /Befejező/.test(i.label));
near('finishing group carries the grouting at 2 000 Ft/m²', finishing.amount, 27.0 * 2000 + 10.0 * 2000, 0.15);
// NM Bau dropped the call-out from the quote on 2026-09-08.
check('no call-out is charged', q.items.some((i) => /Kiszállás/.test(i.label)), false);
check('quote is flagged as labour-only', q.basis, 'labour');
check('quote carries its currency', q.currency, 'huf');
check('line items sum to the total', q.items.reduce((s, i) => s + i.amount, 0), q.total);

console.log('\n■ NM Bau answers, 2026-09-08');
{
    // Wall area must reproduce the figures NM Bau gave for real bathrooms.
    for (const [area, want] of [[4, 17], [6, 21], [8, 24]]) {
        near(`${area} m² bathroom has ~${want} m² of wall`, tiledSurface(area).wall, want, 0.03);
    }
    // Wall-tile removal is charged by the m², not by the workbook's lump sum,
    // which NM Bau has only ever used on a bathroom or two.
    check('wall-tile removal is per m²', PRICE_LIST['falicsempe_bontasa_m2'].unit, 'm²');
    check('...at 4 500 Ft/m²', rate('falicsempe_bontasa_m2', 'huf'), 4500);
    const bath = { projectType: 'furdo', size: '6', tier: 'mid', washing: 'zuhany', layout: 'marad', heating: 'nem' };
    // The real proof that the lump sum is gone: demolition now GROWS with the
    // wall area. Between a 4 m² and an 8 m² bathroom the difference must be the
    // extra wall at 4 500 Ft/m², plus the site-protection band stepping S -> M.
    const demoAt = (size) => buildQuote({ ...bath, size }).items.find((i) => /Bontás/.test(i.label)).amount;
    const expected = 4500 * (tiledSurface(8).wall - tiledSurface(4).wall) + (35000 - 25000);
    near('demolition scales with wall area at 4 500 Ft/m²', demoAt('8') - demoAt('4'), expected, 0.1);
    // The two Austrian prices NM Bau corrected.
    check('kvarchomokos tapadóhíd is 15 EUR/m²', rate('fogado_falfelulet_kvarchomokos_tapadohid_kez', 'eur'), 15);
    check('hajlaterősítő szalag is 10 EUR/fm', rate('hajlaterosito_szalag_agyazasa', 'eur'), 10);
    // The extractor fan is no longer assumed.
    check('no extractor fan in a default quote',
        buildQuote(bath).items.some((i) => /Szellőztetés/.test(i.label)), false);
}

console.log('\n■ Subcontracted trades carry no price');
// Painting/skimming and electrical work are done by a subcontractor who quotes
// them separately, so a bathroom quote must never put a number on either.
{
    const all = ['basic', 'mid', 'premium'].flatMap((tier) =>
        ['zuhany', 'zuhanykabin', 'kad', 'mindketto'].map((washing) =>
            buildQuote({ projectType: 'furdo', size: '8', tier, washing, layout: 'athelyez', heating: 'igen' })));
    const labels = [...new Set(all.flatMap((q) => q.items.map((i) => i.label)))];
    check('no painting line in any bathroom quote', labels.some((l) => /Fest|glettel/i.test(l)), false);
    check('no electrical line in any bathroom quote', labels.some((l) => /Villanyszerel/i.test(l)), false);
    check('the trades that ARE ours still appear',
        labels.some((l) => /Burkolás/.test(l)) && labels.some((l) => /csatornaszerelés/.test(l)), true);
}

console.log('\n■ The shower options match what NM Bau actually builds');
{
    const q = (washing, heating) => buildQuote({ projectType: 'furdo', size: '6', tier: 'mid', washing, layout: 'marad', heating: heating || 'nem' });
    // The built, tiled shower was dropped on 2026-09-06: "zuhany" is now a
    // low-profile cultured-marble tray with a glass wall, so it must cost MORE
    // than the same tray inside a ready-made cabin, by the price of the glass.
    const tray = q('zuhany').total, cabin = q('zuhanykabin').total;
    check('tray + glass wall costs more than a cabin', tray > cabin, true);
    check('the gap is the glass wall minus the cabin', tray - cabin, 140000 - 65000);
    check('underfloor heating is offered with the tray too', q('zuhany', 'igen').total > tray, true);
}

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
