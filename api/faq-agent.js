// ============================================================================
//  NM BAU — Fürdőszoba-felújítás árajánló asszisztens (bathroom quoting agent)
//  - AI provider: OpenAI / Gemini — drives the Hungarian conversation ONLY.
//  - The price is computed DETERMINISTICALLY in this backend (buildQuote) from a
//    geometry + tier model. The AI never does arithmetic, so the total can never
//    be miscalculated by the model.
//  - When all answers are collected the AI emits a hidden state block
//    (<!--DATA:{...}-->). We parse it, price it, e-mail the owner, and return an
//    itemised estimate (shown as a RANGE) to the customer.
//
//  WHY A RANGE: a remodel total genuinely depends on choices that only firm up
//  at the site survey, so we quote a tight ±~10% band around the model's point
//  estimate (e.g. "2 150 000 – 2 580 000 Ft"), which is what an honest contractor
//  gives over the phone. The few questions we ask are the ones that actually move
//  the price (size, finish tier, shower/bath, layout change, underfloor heating).
// ============================================================================

// ---------------------------------------------------------------------------
//  PRICE MODEL (HUF) — single source of truth. Edit numbers here only.
//
//  METHODOLOGY: bottom-up, itemised (tételes) — exactly how a real Hungarian
//  kulcsrakész árajánlat is built. We deliberately do NOT price as a flat
//  Ft/m² × area, because the headline "150 000–250 000 Ft/m²" aggregator number
//  is a large-room simplification: it is wrong for small bathrooms, where fixed
//  costs (container, plumbing/electrical rough-in, fixtures) dominate and push
//  the real Ft/m² well above 250 000. The fixed-cost "floor" in each line below
//  is what correctly makes a 4 m² room cost more per m² than a 9 m² one.
//
//  Sources — triangulated across the live 2025–2026 Hungarian market (verified
//  2026-06; grounded by the KSH építőipari termelői árindex labour inflation):
//   - Kulcsrakész total: 150 000–250 000 Ft/m² nagyobb fürdőnél, kisnél több
//     (Daibau: 5 m² ~0,8–1,25 M, 10 m² ~1,5–2,5 M; qjob átlag ~250 000 Ft/m²;
//      ÉpítésKultúra: alap 1,5–2 M, közepes 2,5–3,5 M).
//   - Burkolás munkadíj: 3–10 m² szoba 7 000–15 000 Ft/m², 3 m² alatt 9–20 000
//     (Daibau, qjob, Imprex, Árfürkész, szakiweb).
//   - Csempe/járólap anyag: középkat. 5 000–10 000, prémium 15 000–25 000,
//     takarékos 3 000–5 000 Ft/m² (ÉpítésKultúra, qjob).
//   - Aljzat/esztrich: 5 000–10 000 Ft/m²; kétrétegű kenhető vízszigetelés:
//     5 300–9 900 Ft/m² (padló + vizes fal) (Daibau).
//   - Bontás (régi burkolat): 2 100–7 600 Ft/m² + konténer/törmelék; teljes
//     bontás 30 000–150 000 Ft (Daibau, qjob).
//   - Gépészet: feladatonként 5 000–45 000 Ft, teljes rough-in jelentős; villany
//     előszerelés 7 500–16 000 Ft/m², teljes 100–300e (Daibau, qjob).
//   - Festés/glettelés: 1 700–4 000 Ft/m² (Daibau, qjob).
//   - Szaniterek (anyag+beépítés): WC 15–80e + ülőke + tartály, mosdó 15–80e,
//     kád 20–300e, zuhanykabin 90–300e, csaptelep 5–30e — tier-enként összevonva.
//   - Elektromos fűtőszőnyeg 150 W/m² + termosztát: ~18 000–31 000 Ft/m² beépítve.
//  Each scenario's output is cross-checked against the published total + Ft/m²
//  envelopes in test-quote.mjs so future edits can't silently drift off-market.
// ---------------------------------------------------------------------------
const MODEL = {
    // Variable, area-scaling labour + consumables (per m² of TILED surface,
    // i.e. floor + walls). Excludes the tile material itself (separate line).
    tileLabor:   { basic: 8500, mid: 10500, premium: 13500 }, // Ft / m² felület
    smallRoomUplift: 1500, // +Ft/m² tiling labour when area ≤ 4 m² (fiddly small jobs)

    // Tile + floor-tile MATERIAL, per m² of tiled surface (×1.1 for waste).
    tileMaterial: { basic: 4500, mid: 9000, premium: 18000 },

    // Demolition + debris removal: per m² of tiled surface + fixed container/strip.
    // The fixed part (container hire + haulage + mobilisation) is a real floor that
    // every job carries — set realistically so the smallest jobs aren't under-quoted.
    demoPerM2: 3000,
    demoFixed: 90000,

    // Screed levelling (aljzatkiegyenlítés): over the whole FLOOR, per m².
    screedPerM2: 6500,
    // Two-layer brush-on waterproofing (kétrétegű kenhető vízszigetelés): over the
    // FLOOR *plus* the wet-zone walls behind the shower/bath (not just the floor —
    // this is the fix for the previously under-priced prep line). Per m².
    waterproofPerM2: 7000,
    // Primer, corner/joint sealing tapes, floor drain collar — fixed wet-room setup.
    prepFixed: 30000,

    // Plumbing (water + waste pipes, rough-in, fixture connections), by layout.
    plumbingKeep: 150000,   // elrendezés marad
    plumbingMove: 280000,   // áthelyezés / új elrendezés
    plumbingBathExtra: 30000,   // +kád külön bekötés
    plumbingBothExtra: 50000,   // +kád ÉS zuhany

    // Electrical (lights, sockets, mirror, towel rail, ventilation), by tier.
    electrical: { basic: 90000, mid: 120000, premium: 160000 },

    // Sanitary base set: WC + washbasin + vanity + taps + accessories, by tier.
    sanitaryBase: { basic: 180000, mid: 350000, premium: 650000 },

    // Shower / bath element (appliance + glass/screen + install), by choice & tier.
    washing: {
        zuhany:      { basic: 120000, mid: 220000, premium: 400000 }, // zuhanytálca üveg fallal
        zuhanykabin: { basic: 90000,  mid: 160000, premium: 300000 }, // komplett zuhanykabin
        kad:         { basic: 90000,  mid: 160000, premium: 320000 }, // fürdőkád + kádparaván
        mindketto:   { basic: 210000, mid: 320000, premium: 560000 }, // kád + külön zuhany
    },

    // Painting + skim (ceiling and non-tiled wall parts): per m² floor + fixed.
    paintPerM2: 4000,
    paintFixed: 15000,

    // OPTION — electric underfloor heating mat + thermostat + install.
    heatPerM2: 18000,
    heatFixed: 40000,

    // Quote band around the point estimate (what the customer sees).
    bandLow: 0.92,
    bandHigh: 1.10,
};

// ---------------------------------------------------------------------------
//  WHOLE-PROPERTY PRICE MODEL (HUF) — full flat / house / kitchen / single room.
//
//  METHODOLOGY: same bottom-up turnkey philosophy as the bathroom model, but a
//  full renovation is composed from (a) per-m² SHELL trades scaled by floor area
//  + finish tier, plus (b) discrete add-ons priced per unit (doors, windows,
//  bathrooms, kitchen furniture, heating system, exterior). This composition is
//  transparent and each piece is grounded in a published 2025–2026 figure rather
//  than a single flat Ft/m², so the parts you don't choose don't inflate the total.
//
//  Sources (triangulated, verified 2026-06; KSH labour-inflation grounded):
//   - Teljes (kulcsrakész) lakásfelújítás: 135 000–275 000 Ft/m² (Daibau);
//     150 000–350 000 (szakiweb/joszaki); panel 180 000–350 000. 65 m² ~8,8–17,9 M.
//   - Kozmetikai / esztétikai felújítás: 30 000–60 000 Ft/m², közepes 80–150 000.
//   - Teljes villanyszerelés anyaggal: 11 000–16 000 Ft/m² (Daibau/qjob/neonvill).
//   - Festés (2 réteg, anyag+munka): 1 400–3 500 Ft/m² felület; gipszkarton 2 000–6 500.
//   - Laminált/vinyl padló beépítve: ~8 000–20 000; parketta feljebb (Daibau/qjob).
//   - Beltéri ajtó tokkal, beépítve: ~50 000–150 000 Ft/db (piaci).
//   - Műanyag ablak cserével: 40 000–135 000 Ft/db (qjob/joszaki/Hoffmann).
//   - Radiátor csere: 40 000–80 000 Ft/db; vizes padlófűtés rendszer: 7 000–9 000
//     Ft/m²; kondenzációs kazán+telepítés ~0,9 M; hőszivattyús rendszer 3–5 M.
//   - Konyhafelújítás: standard 800 000–900 000, prémium 1,7–2,7 M; bútor
//     200 000–800 000+, gépek 300 000–400 000, munkalap 14 000–110 000 (qjob).
//   - Homlokzati hőszigetelés: 22 000–30 000 Ft/m²; tetőfelújítás teljes 35 000–
//     50 000 Ft/m²; térkövezés 8 000–18 000 Ft/m²; kerítés (Daibau/qjob/szakiweb).
//  Each scenario is cross-checked against these envelopes in test-quote.mjs.
// ---------------------------------------------------------------------------
const RENO = {
    // FULL GUT (teljes) interior shell — turnkey Ft / m² of FLOOR area, by tier.
    full: {
        demo:    { basic: 9000,  mid: 11000, premium: 14000 }, // bontás + törmelék
        masonry: { basic: 17000, mid: 24000, premium: 34000 }, // falazás, vakolás, gipszkarton, glettelés
        screed:  { basic: 6000,  mid: 7000,  premium: 9000 },  // aljzatkiegyenlítés
        plumb:   { basic: 12000, mid: 15000, premium: 20000 }, // víz + csatorna teljes csere
        elec:    { basic: 13000, mid: 16000, premium: 22000 }, // teljes villany + szerelvény
        floor:   { basic: 15000, mid: 22000, premium: 38000 }, // burkolás + padló (anyag+munka, vegyes)
        paint:   { basic: 5500,  mid: 7000,  premium: 10000 }, // festés + glettelés
        fixed:   120000, // egész lakásra: konténer, mobilizáció, végtakarítás
    },
    // PARTIAL (reszleges) interior — the realistic MIDDLE: new surfaces (burkolat,
    // padló, festés) + fixture-level plumbing/electrical + bathroom/kitchen, but
    // NOT a full pipe/wall/wiring rip-out. This is what most "közepes" customers
    // actually mean, and the tier the binary kozmetikai/teljes model was missing.
    partial: {
        demo:    { basic: 5000,  mid: 6500,  premium: 8500 },  // részleges bontás (nem teljes strip)
        masonry: { basic: 9000,  mid: 13000, premium: 19000 }, // faljavítás, glett, kis gipszkarton
        screed:  { basic: 3500,  mid: 4500,  premium: 6000 },
        plumb:   { basic: 5000,  mid: 7000,  premium: 10000 }, // szerelvény-szintű, nem teljes csere
        elec:    { basic: 5000,  mid: 7000,  premium: 10000 }, // részleges (nem teljes újrahúzás)
        floor:   { basic: 15000, mid: 22000, premium: 38000 }, // új burkolás + padló ugyanúgy
        paint:   { basic: 5500,  mid: 7000,  premium: 10000 },
        fixed:   80000,
    },
    // COSMETIC (kozmetikai) interior — festés + új padló + apró villany/javítás,
    // a csövek és falak bontása NÉLKÜL. Turnkey Ft / m² of floor area, by tier.
    cosmetic: {
        floor: { basic: 14000, mid: 20000, premium: 32000 },
        paint: { basic: 5000,  mid: 7000,  premium: 10000 },
        elec:  { basic: 2000,  mid: 3000,  premium: 4500 }, // lámpa/kapcsoló/dugalj csere
        patch: { basic: 2500,  mid: 3500,  premium: 5000 }, // glettelés, apró javítás
        fixed: 60000,
    },
    // --- Refine-stage inputs (only change the price when the customer opts in) ---
    // Current condition: scales the demolition line (less to strip / more to strip).
    conditionMult: { ujszeru: 0.5, lakott: 1.0, regi: 1.25 },
    // Floor finish split: tile is dearer than laminate/parketta — shift the floor line.
    floortileMult: { tobb_csempe: 1.25, fele_fele: 1.0, tobb_laminalt: 0.82 },
    // Building/removing walls + relocating wet-points (big swing on falazás + gépészet).
    wallsPerM2:    6000,
    wallsRelocate: 200000,
    // Split AC unit, supplied + installed, /db.
    klimaEach:     350000,
    door:   { basic: 55000, mid: 90000, premium: 150000 }, // beltéri ajtó tokkal, /db
    window: { basic: 60000, mid: 90000, premium: 140000 }, // műanyag ablak cserével, /db
    // Wet-room fit-out PREMIUM over a dry room (extra vízszigetelés + szaniterek +
    // csaptelep + zuhany/kád), /fürdő. A burkolás/gépészet már a héjban benne van.
    bathroomFitout: { basic: 450000, mid: 750000, premium: 1300000 },
    // Heating-system upgrades.
    radiatorEach:    55000,   // radiátor csere, /db
    underfloorPerM2: 9000,    // vizes padlófűtés rendszer, /m²
    underfloorFixed: 150000,  // osztó-gyűjtő + bekötés
    heatpumpSystem:  3800000, // komplett levegő-víz hőszivattyús rendszer (belső elosztással)
    // Kitchen (konyha) module.
    kitchen: {
        base:       { basic: 28000, mid: 42000, premium: 65000 },   // /m²: csempe, gépészet/villany kiállás, padló, festés
        furniture:  { basic: 350000, mid: 700000, premium: 1400000 },
        appliances: { basic: 250000, mid: 380000, premium: 650000 },
        countertop: { basic: 40000,  mid: 70000,  premium: 110000 },
        moveExtra:  150000, // víz/gáz/villany áthelyezés új elrendezésnél
        fixed:      60000,
    },
    // Exterior (családi ház).
    exterior: {
        facadePerM2:  { basic: 22000, mid: 25000, premium: 29000 }, // homlokzati hőszigetelés
        roofPerM2:    42000, // teljes tetőfelújítás
        pavingPerM2:  13000, // térkövezés
        fencePerM:    18000, // kerítés, /folyóméter
        facadeFactor: 1.4,   // homlokzatterület ≈ alapterület × ennyi (földszintes becslés)
        roofFactor:   1.25,  // tetőterület ≈ alapterület × ennyi
        pavingDefault: 30,   // m², "teljes külső"-nél (felmérés pontosítja)
        fenceDefault:  25,   // folyóméter, "teljes külső"-nél (felmérés pontosítja)
    },
    band:      { low: 0.90, high: 1.12 }, // lakás / konyha / szoba sáv
    bandHouse: { low: 0.85, high: 1.15 }, // ház: a külső munkák miatt szélesebb
};

// Representative floor area (m²) when the customer doesn't give one, per type.
const TYPE_DEFAULT_AREA = { furdo: 5, lakas: 60, haz: 110, konyha: 9, szoba: 15 };
const FLOW_LABEL = {
    furdo: "Fürdőszoba-felújítás", konyha: "Konyhafelújítás", lakas: "Teljes lakásfelújítás",
    haz: "Családi ház felújítás", szoba: "Szobafelújítás",
};

// All prices are GROSS (ÁFA included) and TURNKEY (kulcsrakész): labour +
// materials + fixtures — the all-in number the customer actually pays.
const APPLIANCE_INCLUDED = true;

// Offer to e-mail the quote to the CUSTOMER. Requires a real Resend key + a
// VERIFIED sending domain — until that exists, keep this OFF (the owner is still
// notified). Flip on with EMAIL_OFFER=on in .env once the domain is live.
const EMAIL_OFFER_ENABLED =
    (process.env.EMAIL_OFFER || "").toLowerCase() === "on";

// ---------------------------------------------------------------------------
//  Helpers — formatting + geometry
// ---------------------------------------------------------------------------
function formatHuf(n) {
    return Math.round(n).toLocaleString("hu-HU").replace(/ /g, " ") + " Ft";
}
const round1000 = (n) => Math.round(n / 1000) * 1000;
const round10000 = (n) => Math.round(n / 10000) * 10000;

// Representative floor area (m²) for a stored size value. Chip → band midpoint;
// a free-typed number → itself; "nem_tudom"/unknown → 5 m² (typical) default.
const SIZE_AREA = { s_3_4: 3.5, s_5_6: 5.5, s_7_8: 7.5, s_9_10: 9.5, s_11p: 12, nem_tudom: 5 };
function areaOf(size) {
    if (size && Object.prototype.hasOwnProperty.call(SIZE_AREA, size)) return SIZE_AREA[size];
    const n = parseFloat(String(size).replace(",", "."));
    return !isNaN(n) && n > 0 ? n : 5;
}
// Same, but for the whole-property flows: a stored band/number → its area; an
// unknown ("nem_tudom"/empty) → the per-TYPE typical default (a flat is not 5 m²).
function areaOfType(size, pt) {
    if (size != null) {
        if (Object.prototype.hasOwnProperty.call(SIZE_AREA, size)) return SIZE_AREA[size];
        const n = parseFloat(String(size).replace(",", "."));
        if (!isNaN(n) && n > 0) return n;
    }
    return TYPE_DEFAULT_AREA[pt] || 5;
}
const validTier = (t) => (["basic", "mid", "premium"].includes(t) ? t : "mid");
// Bathroom/WC count from the chip token ("1"|"2"|"3p"); unknown → 1.
const bathCount = (b) => (b === "2" ? 2 : b === "3p" ? 3 : 1);

// Estimate the total tiled surface (floor + walls) from the floor area. Walls are
// approximated as perimeter × tiling height, less an allowance for door/fittings.
// Perimeter uses 4.3·√A (a touch above a perfect square, since real bathrooms are
// rectangular). Tiling height assumed ~2.2 m.
function tiledSurface(A) {
    const wall = Math.max(0, 4.3 * Math.sqrt(A) * 2.2 - 2.5);
    return { floor: A, wall, total: A + wall };
}

// Wet-zone wall area to waterproof behind the shower/bath (m²). It grows with the
// room but is bounded — a tiny bathroom still needs a real shower splash zone,
// a large one doesn't waterproof every wall to the ceiling.
function wetWallArea(A) {
    return Math.min(7, Math.max(3, A));
}

// ---------------------------------------------------------------------------
//  Build the itemised quote deterministically from the customer's answers.
//  Returns { items[], total (point estimate), low, high, area }.
// ---------------------------------------------------------------------------
function buildBathroom(sel) {
    const A = areaOf(sel.size);
    const tier = ["basic", "mid", "premium"].includes(sel.tier) ? sel.tier : "mid";
    // When the customer doesn't know, fall back to the CHEAPER option (a
    // complete shower cabin) so an unknown answer never rounds the quote upward.
    const washing = MODEL.washing[sel.washing] ? sel.washing : "zuhanykabin";
    const { total: T } = tiledSurface(A);

    const items = [];
    const add = (label, huf) => items.push({ label, huf: round1000(huf) });

    // 1 — Bontás + törmelékelszállítás
    add("Bontás, törmelékelszállítás, konténer", MODEL.demoPerM2 * T + MODEL.demoFixed);

    // 2 — Aljzatkiegyenlítés + kétrétegű vízszigetelés (padló + vizes falak)
    const waterproofArea = A + wetWallArea(A);
    add("Aljzatkiegyenlítés és kétrétegű vízszigetelés",
        MODEL.screedPerM2 * A + MODEL.waterproofPerM2 * waterproofArea + MODEL.prepFixed);

    // 3 — Burkolás munkadíja (fal + padló)
    const tileLabor = MODEL.tileLabor[tier] + (A <= 4 ? MODEL.smallRoomUplift : 0);
    add("Burkolás munkadíja (fal + padló)", tileLabor * T);

    // 4 — Csempe és járólap (anyag, +10% hulladék)
    add("Csempe és járólap (anyag)", MODEL.tileMaterial[tier] * T * 1.1);

    // 5 — Gépészet (víz + lefolyó)
    let plumbing = sel.layout === "athelyez" ? MODEL.plumbingMove : MODEL.plumbingKeep;
    if (washing === "kad") plumbing += MODEL.plumbingBathExtra;
    if (washing === "mindketto") plumbing += MODEL.plumbingBothExtra;
    add("Gépészet (víz- és lefolyóvezeték, bekötések)", plumbing);

    // 6 — Villanyszerelés
    add("Villanyszerelés (világítás, csatlakozók, szellőztetés)", MODEL.electrical[tier]);

    // 7 — Szaniterek + csaptelepek (anyag + beépítés)
    add("Szaniterek és csaptelepek (anyag + beépítés)", MODEL.sanitaryBase[tier] + MODEL.washing[washing][tier]);

    // 8 — Festés, glettelés
    add("Festés, glettelés (mennyezet és nem burkolt falak)", MODEL.paintPerM2 * A + MODEL.paintFixed);

    // 9 — OPTION: elektromos padlófűtés
    if (sel.heating === "igen") {
        add("Elektromos padlófűtés (fűtőszőnyeg + termosztát)", MODEL.heatPerM2 * A + MODEL.heatFixed);
    }

    return finalize(items, A, { low: MODEL.bandLow, high: MODEL.bandHigh });
}

// Turn an itemised list + area + band into the standard quote object every
// renderer/e-mail/test consumes: { items, total, low, high, area, perM2 }.
function finalize(items, A, band) {
    const total = items.reduce((s, i) => s + i.huf, 0);
    const low = round10000(total * band.low);
    const high = round10000(total * band.high);
    const perM2 = Math.round(total / A); // implied turnkey Ft/m² (market sanity check)
    return { items, total, low, high, area: A, perM2 };
}

// ---------------------------------------------------------------------------
//  Full flat / family-house renovation (lakas | haz). Composed from per-m²
//  shell trades + discrete add-ons (doors, bathrooms, kitchen, windows, heating,
//  klíma, exterior). Grouped into logical, customer-readable lines.
//
//  ESSENTIAL inputs (always asked): size, scope, tier, bathrooms, kitchen.
//  REFINE inputs (opt-in, default = neutral/none so they only ADD when chosen):
//  walls, condition, floortile, windows, heatingsys, klima, (haz) exterior.
//  This makes the early ballpark realistic, then the refine answers move it.
// ---------------------------------------------------------------------------
function buildFullReno(sel, pt) {
    const A = areaOfType(sel.size, pt);
    const tier = validTier(sel.tier);
    // 3-level scope; unknown defaults to the realistic MIDDLE (részleges).
    const scope = ["kozmetikai", "reszleges", "teljes"].includes(sel.scope) ? sel.scope : "reszleges";
    const rooms = Math.max(1, Math.round(A / 18)); // helyiségszám-becslés
    const items = [];
    const add = (label, huf) => { if (huf > 0) items.push({ label, huf: round1000(huf) }); };

    // Refine multipliers (neutral when the refine answer isn't given).
    const condMult = RENO.conditionMult[sel.condition] || 1.0;
    const floorMult = RENO.floortileMult[sel.floortile] || 1.0;

    if (scope === "kozmetikai") {
        const c = RENO.cosmetic;
        add("Bontás, előkészítés, takarítás", (c.fixed + c.patch[tier] * A) * condMult);
        add("Burkolás / új padló (anyag + munka)", c.floor[tier] * A * floorMult);
        add("Festés, glettelés", c.paint[tier] * A);
        add("Villany frissítés (lámpák, kapcsolók, dugaljak)", c.elec[tier] * A);
    } else {
        const f = scope === "teljes" ? RENO.full : RENO.partial;
        const demoLbl = scope === "teljes" ? "Bontás, törmelékelszállítás, konténer" : "Részleges bontás, törmelékelszállítás";
        const wallLbl = scope === "teljes" ? "Falazás, vakolás, gipszkarton, glettelés" : "Faljavítás, glettelés, gipszkarton";
        const mepLbl = scope === "teljes" ? "Gépészet (víz, csatorna) és villanyszerelés" : "Gépészet és villany (részleges)";
        add(demoLbl, f.demo[tier] * A * condMult + f.fixed);
        add(wallLbl, f.masonry[tier] * A);
        add("Aljzatkiegyenlítés és vízszigetelés", f.screed[tier] * A);
        add(mepLbl, (f.plumb[tier] + f.elec[tier]) * A);
        add("Burkolás és padló (anyag + munka)", f.floor[tier] * A * floorMult);
        add("Festés, glettelés", f.paint[tier] * A);
        add(`Beltéri ajtók (${rooms} db)`, RENO.door[tier] * rooms);
    }

    // REFINE — building/removing walls + relocating wet-points.
    if (sel.walls === "igen") add("Falátalakítás és vizes pont áthelyezés", RENO.wallsPerM2 * A + RENO.wallsRelocate);

    // Bathroom(s) fit-out (szaniter + vízszigetelés), per the bathroom count.
    const baths = bathCount(sel.bathrooms);
    add(`Fürdőszoba/WC szaniter és vízszigetelés (${baths} db)`, RENO.bathroomFitout[tier] * baths);

    // New kitchen furniture + worktop (a konyha gépészete/villanya a héjban van).
    if (sel.kitchen === "uj") {
        const k = RENO.kitchen;
        add("Konyhabútor és munkalap", k.furniture[tier] + k.countertop[tier]);
    }

    // REFINE — window replacement (becsült darabszám az alapterületből).
    if (sel.windows === "csere") {
        const wc = Math.max(2, Math.round(A / 12));
        add(`Nyílászárócsere — ablakok (${wc} db)`, RENO.window[tier] * wc);
    }

    // REFINE — heating-system upgrade.
    if (sel.heatingsys === "radiator") add(`Fűtéskorszerűsítés — radiátorcsere (${rooms} db)`, RENO.radiatorEach * rooms);
    else if (sel.heatingsys === "padlofutes") add("Vizes padlófűtés (rendszer + szerelés)", RENO.underfloorPerM2 * A + RENO.underfloorFixed);
    else if (sel.heatingsys === "hoszivattyu") add("Hőszivattyús fűtési rendszer (komplett)", RENO.heatpumpSystem);

    // REFINE — air conditioning.
    if (sel.klima === "igen") add("Klíma (beltéri egység, szereléssel)", RENO.klimaEach);

    // REFINE — exterior works (family house only). Areas estimated from floor area.
    if (pt === "haz" && sel.exterior && sel.exterior !== "nincs" && sel.exterior !== "nem_tudom") {
        const e = RENO.exterior;
        const ex = sel.exterior;
        if (ex === "homlokzat" || ex === "homlokzat_teto" || ex === "teljes") add("Homlokzati hőszigetelés", e.facadePerM2[tier] * A * e.facadeFactor);
        if (ex === "teto" || ex === "homlokzat_teto" || ex === "teljes") add("Tetőfelújítás", e.roofPerM2 * A * e.roofFactor);
        if (ex === "teljes") { add("Térkövezés", e.pavingPerM2 * e.pavingDefault); add("Kerítés, kapu", e.fencePerM * e.fenceDefault); }
    }

    return finalize(items, A, pt === "haz" ? RENO.bandHouse : RENO.band);
}

// ---------------------------------------------------------------------------
//  Kitchen as its own project (konyha).
// ---------------------------------------------------------------------------
function buildKitchen(sel) {
    const A = areaOfType(sel.size, "konyha");
    const tier = validTier(sel.tier);
    const k = RENO.kitchen;
    const items = [];
    const add = (label, huf) => { if (huf > 0) items.push({ label, huf: round1000(huf) }); };

    add("Bontás, burkolás, gépészet- és villanykiállás, padló, festés", k.base[tier] * A + k.fixed);
    if (sel.furniture === "igen") add("Konyhabútor és munkalap", k.furniture[tier] + k.countertop[tier]);
    if (sel.appliances === "igen") add("Beépített gépek (sütő, főzőlap, páraelszívó stb.)", k.appliances[tier]);
    if (sel.layout === "athelyez") add("Víz/gáz/villany pontok áthelyezése", k.moveExtra);

    return finalize(items, A, RENO.band);
}

// ---------------------------------------------------------------------------
//  Single room / space (szoba). roomscope: festes | festes_padlo | teljes.
// ---------------------------------------------------------------------------
function buildRoom(sel) {
    const A = areaOfType(sel.size, "szoba");
    const tier = validTier(sel.tier);
    const rs = ["festes", "festes_padlo", "teljes"].includes(sel.roomscope) ? sel.roomscope : "teljes";
    const c = RENO.cosmetic;
    const items = [];
    const add = (label, huf) => { if (huf > 0) items.push({ label, huf: round1000(huf) }); };

    add("Előkészítés, takarítás", c.fixed);
    add("Festés, glettelés", c.paint[tier] * A);
    if (rs === "festes_padlo" || rs === "teljes") add("Új padló (anyag + munka)", c.floor[tier] * A);
    if (rs === "teljes") {
        add("Villany frissítés (lámpák, kapcsolók, dugaljak)", c.elec[tier] * A);
        add("Beltéri ajtó (1 db)", RENO.door[tier]);
        add("Apró javítások", c.patch[tier] * A);
    }

    return finalize(items, A, RENO.band);
}

// Dispatch to the right pricing engine by project type. No projectType (or
// "furdo") → the original bathroom engine, so existing callers/tests are unchanged.
function buildQuote(sel) {
    const pt = sel && sel.projectType;
    if (pt === "lakas" || pt === "haz") return buildFullReno(sel, pt);
    if (pt === "konyha") return buildKitchen(sel);
    if (pt === "szoba") return buildRoom(sel);
    return buildBathroom(sel);
}

// Exported for unit testing the pricing math (no effect in production).
export { buildQuote, buildBathroom, buildFullReno, buildKitchen, buildRoom, areaOf, areaOfType, tiledSurface };

// ---------------------------------------------------------------------------
//  FLOW CONFIG — every project type asks its OWN question set. The backend drives
//  the order, the chips and the value-mapping, so the right buttons always appear
//  and answers are recorded instantly (not reliant on the AI's one-step-behind
//  state block). The AI only writes the question TEXT.
// ---------------------------------------------------------------------------

// ESSENTIAL project questions, in order. Enough to produce a ballpark range.
// Shared tail (budget, timeline) + contact are appended by fieldOrder().
function projectFields(pt) {
    switch (pt) {
        case "furdo":  return ["size", "tier", "washing", "layout", "heating"];
        case "lakas":  return ["size", "scope", "tier", "bathrooms", "kitchen"];
        case "haz":    return ["size", "scope", "tier", "bathrooms", "kitchen"];
        case "konyha": return ["size", "tier", "furniture", "appliances", "layout"];
        case "szoba":  return ["size", "roomscope", "tier"];
        default:       return [];
    }
}
// OPTIONAL refine questions (only lakas/haz). Asked after contact, behind a gate;
// each one tightens the live estimate. Defaults are neutral so skipping them keeps
// the price honest (low), and answering only ever ADDS the things they actually want.
function refineFields(pt) {
    if (pt === "lakas") return ["walls", "condition", "floortile", "windows", "heatingsys", "klima"];
    if (pt === "haz")   return ["walls", "condition", "floortile", "windows", "heatingsys", "klima", "exterior"];
    return [];
}
const hasRefine = (pt) => refineFields(pt).length > 0;
const TAIL_FIELDS = ["budget", "timeline"];
const CONTACT_FIELDS = ["name", "email", "phone", "postal_code"];

// Full ordered field list for the current state. Until a project type is chosen,
// the only question is projectType. For types with a refine stage, a gate question
// ("shall we refine?") sits after contact; the refine fields are only required
// once the customer opts in (refine_gate === "yes").
function fieldOrder(sel) {
    const pt = sel && sel.projectType;
    if (!pt) return ["projectType"];
    const base = ["projectType", ...projectFields(pt), ...TAIL_FIELDS, ...CONTACT_FIELDS];
    if (!hasRefine(pt)) return base;
    base.push("refine_gate");
    if (sel.refine_gate === "yes") base.push(...refineFields(pt));
    return base;
}
// Fields that count toward the progress bar: the ESSENTIALS + budget + timeline.
// Contact and the optional refine stage are deliberately excluded, so the bar hits
// 100% when the core is done (and refining afterwards is framed as a bonus).
function progressFields(sel) {
    const pt = sel && sel.projectType;
    if (!pt) return ["projectType"];
    return ["projectType", ...projectFields(pt), ...TAIL_FIELDS];
}

// Backend decides when the quote is complete — independent of the AI model.
function isQuoteReady(s) {
    if (!s || typeof s !== "object" || !s.projectType) return false;
    const filled = (k) => s[k] != null && String(s[k]).trim() !== "";
    return fieldOrder(s).every(filled);
}

// Budget bands are scale-dependent: a bathroom is millions, a house tens of
// millions. Pick the scale from the project type.
function budgetScale(pt) {
    if (pt === "lakas") return "flat";
    if (pt === "haz") return "house";
    return "small"; // furdo, konyha, szoba
}
const BUDGET = {
    small: {
        chips: ["1 millió Ft alatt", "1–2 millió Ft", "2–3 millió Ft", "3 millió Ft felett", "Még nem tudom"],
        values: { "1 millió ft alatt": "b_1m", "1–2 millió ft": "b_1_2", "2–3 millió ft": "b_2_3", "3 millió ft felett": "b_3m", "még nem tudom": "b_unsure" },
        buckets: [[1_000_000, "b_1m"], [2_000_000, "b_1_2"], [3_000_000, "b_2_3"], [Infinity, "b_3m"]],
    },
    flat: {
        chips: ["5 millió Ft alatt", "5–10 millió Ft", "10–15 millió Ft", "15 millió Ft felett", "Még nem tudom"],
        values: { "5 millió ft alatt": "b_5m", "5–10 millió ft": "b_5_10", "10–15 millió ft": "b_10_15", "15 millió ft felett": "b_15m", "még nem tudom": "b_unsure" },
        buckets: [[5_000_000, "b_5m"], [10_000_000, "b_5_10"], [15_000_000, "b_10_15"], [Infinity, "b_15m"]],
    },
    house: {
        chips: ["10 millió Ft alatt", "10–20 millió Ft", "20–35 millió Ft", "35 millió Ft felett", "Még nem tudom"],
        values: { "10 millió ft alatt": "b_10m", "10–20 millió ft": "b_10_20", "20–35 millió ft": "b_20_35", "35 millió ft felett": "b_35m", "még nem tudom": "b_unsure" },
        buckets: [[10_000_000, "b_10m"], [20_000_000, "b_10_20"], [35_000_000, "b_20_35"], [Infinity, "b_35m"]],
    },
};

// Quick-reply chip labels per fixed-choice field.
const CHIP_LABELS = {
    projectType: ["Fürdőszoba", "Konyha", "Teljes lakás", "Családi ház", "Egy szoba"],
    tier: ["Alap / takarékos", "Közepes", "Prémium", "Nem tudom"],
    washing: ["Zuhanytálca üveg fallal", "Zuhanykabin", "Kád", "Kád és zuhany", "Nem tudom"],
    layout: ["Marad a mostani elrendezés", "Áthelyezzük", "Nem tudom"],
    heating: ["Kérek padlófűtést", "Nem szükséges", "Nem tudom"],
    scope: ["Teljes (mindent cserélünk)", "Részleges (felületek + néhány szakág)", "Kozmetikai (festés, burkolat)", "Nem tudom"],
    roomscope: ["Csak festés", "Festés + új padló", "Teljes felújítás", "Nem tudom"],
    bathrooms: ["1 fürdő/WC", "2 fürdő/WC", "3 vagy több", "Nem tudom"],
    kitchen: ["Új konyhabútorral", "Felújítás bútor nélkül", "Konyhát nem érinti", "Nem tudom"],
    windows: ["Igen, ablakcsere kell", "Nem, maradnak", "Nem tudom"],
    heatingsys: ["Marad a mostani", "Radiátorcsere", "Padlófűtés", "Hőszivattyús rendszer", "Nem tudom"],
    exterior: ["Nincs külső munka", "Homlokzati szigetelés", "Tetőfelújítás", "Homlokzat + tető", "Teljes külső", "Nem tudom"],
    furniture: ["Igen, új bútor kell", "Nem, marad", "Nem tudom"],
    appliances: ["Igen, gépekkel", "Nem, saját gépek", "Nem tudom"],
    timeline: ["Amint lehet", "Egy hónapon belül", "Fél éven belül", "Még idén", "Még nem tudom"],
    // --- Refine stage ---
    refine_gate: ["Igen, pontosítsuk", "Most nem, köszönöm"],
    walls: ["Igen, falakat is mozgatunk", "Nem, maradnak a falak", "Nem tudom"],
    condition: ["Újszerű (kevés bontás)", "Lakott (teljes bontás kell)", "Régi, elhasználódott", "Nem tudom"],
    floortile: ["Inkább csempe", "Fele-fele", "Inkább laminált/parketta", "Nem tudom"],
    klima: ["Igen, kérek klímát", "Nem szükséges", "Nem tudom"],
};

// Size chips + their representative stored value, per project type. Non-bathroom
// bands resolve to a representative NUMBER (string) so areaOfType() reads it.
const SIZE_CHIPS = {
    furdo:  ["3–4 m²", "5–6 m²", "7–8 m²", "9–10 m²", "10 m² felett", "Nem tudom"],
    lakas:  ["40 m² alatt", "40–60 m²", "60–80 m²", "80–120 m²", "120 m² felett", "Nem tudom"],
    haz:    ["80 m² alatt", "80–120 m²", "120–160 m²", "160 m² felett", "Nem tudom"],
    konyha: ["6 m² alatt", "6–10 m²", "10–15 m²", "15 m² felett", "Nem tudom"],
    szoba:  ["10 m² alatt", "10–15 m²", "15–20 m²", "20 m² felett", "Nem tudom"],
};
const SIZE_VALUES = {
    furdo:  { "3–4 m²": "s_3_4", "5–6 m²": "s_5_6", "7–8 m²": "s_7_8", "9–10 m²": "s_9_10", "10 m² felett": "s_11p", "nem tudom": "nem_tudom" },
    lakas:  { "40 m² alatt": "35", "40–60 m²": "50", "60–80 m²": "70", "80–120 m²": "100", "120 m² felett": "150", "nem tudom": "nem_tudom" },
    haz:    { "80 m² alatt": "70", "80–120 m²": "100", "120–160 m²": "140", "160 m² felett": "200", "nem tudom": "nem_tudom" },
    konyha: { "6 m² alatt": "5", "6–10 m²": "8", "10–15 m²": "12", "15 m² felett": "18", "nem tudom": "nem_tudom" },
    szoba:  { "10 m² alatt": "8", "10–15 m²": "12", "15–20 m²": "17", "20 m² felett": "25", "nem tudom": "nem_tudom" },
};

// Chip label -> canonical value, for the fixed-choice fields.
const CHOICE_VALUES = {
    projectType: { "fürdőszoba": "furdo", "konyha": "konyha", "teljes lakás": "lakas", "családi ház": "haz", "egy szoba": "szoba" },
    tier: { "alap / takarékos": "basic", "közepes": "mid", "prémium": "premium", "nem tudom": "nem_tudom" },
    washing: { "zuhanytálca üveg fallal": "zuhany", "zuhanykabin": "zuhanykabin", "kád": "kad", "kád és zuhany": "mindketto", "nem tudom": "nem_tudom" },
    layout: { "marad a mostani elrendezés": "marad", "áthelyezzük": "athelyez", "nem tudom": "nem_tudom" },
    heating: { "kérek padlófűtést": "igen", "nem szükséges": "nem", "nem tudom": "nem_tudom" },
    scope: { "teljes (mindent cserélünk)": "teljes", "részleges (felületek + néhány szakág)": "reszleges", "kozmetikai (festés, burkolat)": "kozmetikai", "nem tudom": "nem_tudom" },
    roomscope: { "csak festés": "festes", "festés + új padló": "festes_padlo", "teljes felújítás": "teljes", "nem tudom": "nem_tudom" },
    bathrooms: { "1 fürdő/wc": "1", "2 fürdő/wc": "2", "3 vagy több": "3p", "nem tudom": "nem_tudom" },
    kitchen: { "új konyhabútorral": "uj", "felújítás bútor nélkül": "felujitas", "konyhát nem érinti": "nem", "nem tudom": "nem_tudom" },
    windows: { "igen, ablakcsere kell": "csere", "nem, maradnak": "marad", "nem tudom": "nem_tudom" },
    heatingsys: { "marad a mostani": "marad", "radiátorcsere": "radiator", "padlófűtés": "padlofutes", "hőszivattyús rendszer": "hoszivattyu", "nem tudom": "nem_tudom" },
    exterior: { "nincs külső munka": "nincs", "homlokzati szigetelés": "homlokzat", "tetőfelújítás": "teto", "homlokzat + tető": "homlokzat_teto", "teljes külső": "teljes", "nem tudom": "nem_tudom" },
    furniture: { "igen, új bútor kell": "igen", "nem, marad": "nem", "nem tudom": "nem_tudom" },
    appliances: { "igen, gépekkel": "igen", "nem, saját gépek": "nem", "nem tudom": "nem_tudom" },
    timeline: { "amint lehet": "t_asap", "egy hónapon belül": "t_month", "fél éven belül": "t_halfyear", "még idén": "t_thisyear", "még nem tudom": "t_unsure" },
    // --- Refine stage ---
    refine_gate: { "igen, pontosítsuk": "yes", "most nem, köszönöm": "no" },
    walls: { "igen, falakat is mozgatunk": "igen", "nem, maradnak a falak": "nem", "nem tudom": "nem_tudom" },
    condition: { "újszerű (kevés bontás)": "ujszeru", "lakott (teljes bontás kell)": "lakott", "régi, elhasználódott": "regi", "nem tudom": "nem_tudom" },
    floortile: { "inkább csempe": "tobb_csempe", "fele-fele": "fele_fele", "inkább laminált/parketta": "tobb_laminalt", "nem tudom": "nem_tudom" },
    klima: { "igen, kérek klímát": "igen", "nem szükséges": "nem", "nem tudom": "nem_tudom" },
};

// Chips for a given field, in the current project-type context.
function chipsFor(field, sel) {
    const pt = sel && sel.projectType;
    if (field === "size") return SIZE_CHIPS[pt] || SIZE_CHIPS.furdo;
    if (field === "budget") return BUDGET[budgetScale(pt)].chips;
    return CHIP_LABELS[field] || [];
}

// The first still-unanswered field given the current state (= the question the
// customer is being asked right now). Returns null when everything is filled.
function pendingField(sel) {
    const filled = (k) => sel && sel[k] != null && String(sel[k]).trim() !== "";
    for (const f of fieldOrder(sel)) if (!filled(f)) return f;
    return null;
}

// Parse a free-typed size in m². Accepts "6", "6 m2", "6,5 m²", "120 nm".
// Returns a plausible number (1–1000; whole properties can be large) or null.
function parseArea(text) {
    if (typeof text !== "string") return null;
    const m = text.toLowerCase().replace(",", ".").match(/(\d+(?:\.\d+)?)/);
    if (!m) return null;
    const n = parseFloat(m[1]);
    return !isNaN(n) && n >= 1 && n <= 1000 ? n : null;
}

// Parse a free-typed Hungarian budget amount into Ft (e.g. "2 millió", "1,5 m",
// "2500000", "2,2m", "kétmillió"→ not handled, falls through). Returns Ft or null.
function parseBudgetAmount(text) {
    if (typeof text !== "string") return null;
    const t = text.toLowerCase().trim();
    if (/másf[eé]l\s*milli/.test(t)) return 1_500_000;
    const m = t.match(/(\d+(?:[.,]\d+)?)\s*(?:milli[óo]k?|m\b|mft)/);
    if (m) { const n = parseFloat(m[1].replace(",", ".")); if (!isNaN(n)) return Math.round(n * 1_000_000); }
    const e = t.match(/(\d+(?:[.,]\d+)?)\s*(?:ezer|e\b|k\b)/);
    if (e) { const n = parseFloat(e[1].replace(",", ".")); if (!isNaN(n)) return Math.round(n * 1000); }
    const digits = t.replace(/[^\d]/g, "");
    if (digits) { const n = parseInt(digits, 10); if (!isNaN(n)) return n; }
    return null;
}

// Put a Ft amount into the right budget band, on the given scale (small/flat/
// house). Implausibly small inputs return null so they're rejected, not bucketed.
function bucketBudget(amount, scale = "small") {
    if (amount == null || amount < 50000) return null;
    for (const [ceil, token] of BUDGET[scale].buckets) if (amount < ceil) return token;
    return BUDGET[scale].buckets[BUDGET[scale].buckets.length - 1][1];
}

// Light e-mail sanity check. Goal: catch the obvious cases — a malformed address
// and (especially) a MISSPELLED gmail.com — so a bounced lead doesn't slip
// through. Returns "format" | "gmail" | null (null = looks fine). Deliberately
// conservative: we only flag clear gmail typos, never reject an unfamiliar but
// valid domain (e.g. email.com, ymail.com, a company address).
const GMAIL_TYPOS = new Set([
    "gmial.com", "gmai.com", "gmal.com", "gmil.com", "gmali.com", "gamil.com",
    "gmaill.com", "gmaul.com", "gmsil.com", "gmaik.com", "gmqil.com", "gnail.com",
    "gmile.com", "gmaol.com", " gmail.com", "gmail.con", "gmail.co", "gmail.cm",
    "gmail.om", "gmail.comm", "gmail.cpm", "gmail.vom", "gmail.xom", "gmail.ocm",
    "gmail.cim", "gmail.coom", "gmaill.con",
]);
function emailIssue(email) {
    const e = String(email || "").trim().toLowerCase();
    const m = e.match(/^[^\s@]+@([^\s@]+\.[^\s@]+)$/);
    if (!m) return "format"; // no @, missing domain, or no dot in the domain
    const domain = m[1];
    if (domain === "gmail.com") return null;
    // Anything written as "gmail.<not com>" is a typo — gmail only uses .com.
    if (domain.startsWith("gmail.")) return "gmail";
    if (GMAIL_TYPOS.has(domain)) return "gmail";
    return null;
}

// Phone sanity check. A Hungarian number has ~9 digits of significant content
// (mobile: 06 + 20/30/31/50/70 + 7 digits; or +36 …). We just count digits so a
// too-short fragment like "071701" is caught. Returns "format" | null.
function phoneIssue(phone) {
    const d = String(phone || "").replace(/[^\d]/g, "");
    return d.length >= 9 && d.length <= 13 ? null : "format";
}

// Postal-code sanity check. Hungarian irányítószám is EXACTLY 4 digits. This also
// stops a phone number bleeding into the postal field. Returns "format" | null.
function postalIssue(pc) {
    const d = String(pc || "").replace(/[^\d]/g, "");
    return /^\d{4}$/.test(d) ? null : "format";
}

// Given the field the customer is answering + their message + the current state,
// return the canonical value. Choice fields match the clicked chip label
// (case-insensitive). Size accepts a per-type band chip OR a typed number. Budget
// accepts a per-scale band OR a typed amount. Contact fields take the text as-is.
function mapAnswer(field, answer, sel) {
    if (typeof answer !== "string" || !answer.trim()) return null;
    const a = answer.trim();
    const pt = sel && sel.projectType;
    if (field === "size") {
        const map = SIZE_VALUES[pt] || SIZE_VALUES.furdo;
        const chip = map[a.toLowerCase()];
        if (chip) return chip;
        const n = parseArea(a);
        return n != null ? String(n) : null;
    }
    if (field === "budget") {
        const sc = budgetScale(pt);
        return BUDGET[sc].values[a.toLowerCase()] || bucketBudget(parseBudgetAmount(a), sc);
    }
    if (CHOICE_VALUES[field]) return CHOICE_VALUES[field][a.toLowerCase()] || null;
    if (CONTACT_FIELDS.includes(field)) return a;
    return null;
}

// Parse the hidden running-state block out of any assistant message.
function extractData(text) {
    if (typeof text !== "string") return null;
    const m = text.match(/<!--DATA:(.*?)-->/s);
    if (!m) return null;
    try { return JSON.parse(m[1]); } catch (e) { return null; }
}

// Merge several state objects, keeping the last NON-EMPTY value per field. Makes
// state immune to the model blanking a field in a single turn.
function mergeState(...states) {
    const out = {};
    for (const s of states) {
        if (!s || typeof s !== "object") continue;
        for (const k of Object.keys(s)) {
            const v = s[k];
            if (v != null && String(v).trim() !== "") out[k] = v;
        }
    }
    return out;
}

function nextChips(sel) {
    const f = pendingField(sel);
    return f ? chipsFor(f, sel) : [];
}

// Human-readable Hungarian labels for the recap/e-mail. Fixed-token choice fields
// only; `size` is handled by sizeLabel() since it can also be a free number.
const LABELS = {
    projectType: { furdo: "Fürdőszoba", konyha: "Konyha", lakas: "Teljes lakás", haz: "Családi ház", szoba: "Egy szoba" },
    tier: { basic: "Alap / takarékos", mid: "Közepes", premium: "Prémium", nem_tudom: "Nem tudja (alap: közepes)" },
    washing: { zuhany: "Zuhanytálca üveg fallal", zuhanykabin: "Zuhanykabin", kad: "Kád", mindketto: "Kád és zuhany", nem_tudom: "Nem tudja (alap: zuhanykabin)" },
    layout: { marad: "Marad a mostani", athelyez: "Áthelyezés (új elrendezés)", nem_tudom: "Nem tudja (alap: marad)" },
    heating: { igen: "Igen, padlófűtéssel", nem: "Nem", nem_tudom: "Nem tudja (alap: nincs)" },
    scope: { teljes: "Teljes (gépészet, villany, minden)", reszleges: "Részleges (felületek + néhány szakág)", kozmetikai: "Kozmetikai (festés, burkolat)", nem_tudom: "Nem tudja (alap: részleges)" },
    roomscope: { festes: "Csak festés", festes_padlo: "Festés + új padló", teljes: "Teljes felújítás", nem_tudom: "Nem tudja (alap: teljes)" },
    bathrooms: { "1": "1 fürdő/WC", "2": "2 fürdő/WC", "3p": "3 vagy több", nem_tudom: "Nem tudja (alap: 1)" },
    kitchen: { uj: "Új konyhabútorral", felujitas: "Felújítás bútor nélkül", nem: "Konyhát nem érinti", nem_tudom: "Nem tudja" },
    windows: { csere: "Igen, ablakcsere", marad: "Nem, maradnak", nem_tudom: "Nem tudja (alap: marad)" },
    heatingsys: { marad: "Marad a mostani", radiator: "Radiátorcsere", padlofutes: "Padlófűtés", hoszivattyu: "Hőszivattyús rendszer", nem_tudom: "Nem tudja (alap: marad)" },
    exterior: { nincs: "Nincs külső munka", homlokzat: "Homlokzati szigetelés", teto: "Tetőfelújítás", homlokzat_teto: "Homlokzat + tető", teljes: "Teljes külső", nem_tudom: "Nem tudja (alap: nincs)" },
    furniture: { igen: "Igen, új bútor", nem: "Nem, marad", nem_tudom: "Nem tudja" },
    appliances: { igen: "Igen, gépekkel", nem: "Nem, saját gépek", nem_tudom: "Nem tudja" },
    walls: { igen: "Igen, falmozgatás is", nem: "Nem, maradnak a falak", nem_tudom: "Nem tudja (alap: nem)" },
    condition: { ujszeru: "Újszerű (kevés bontás)", lakott: "Lakott (teljes bontás)", regi: "Régi, elhasználódott", nem_tudom: "Nem tudja" },
    floortile: { tobb_csempe: "Inkább csempe", fele_fele: "Fele-fele", tobb_laminalt: "Inkább laminált/parketta", nem_tudom: "Nem tudja" },
    klima: { igen: "Igen, klímával", nem: "Nem", nem_tudom: "Nem tudja (alap: nincs)" },
    refine_gate: { yes: "Igen", no: "Nem" },
    budget: {
        b_1m: "1 millió Ft alatt", b_1_2: "1–2 millió Ft", b_2_3: "2–3 millió Ft", b_3m: "3 millió Ft felett",
        b_5m: "5 millió Ft alatt", b_5_10: "5–10 millió Ft", b_10_15: "10–15 millió Ft", b_15m: "15 millió Ft felett",
        b_10m: "10 millió Ft alatt", b_10_20: "10–20 millió Ft", b_20_35: "20–35 millió Ft", b_35m: "35 millió Ft felett",
        b_unsure: "Még nem tudom",
    },
    timeline: { t_asap: "Amint lehet", t_month: "Egy hónapon belül", t_halfyear: "Fél éven belül", t_thisyear: "Még idén", t_unsure: "Még nem tudja" },
};
const lbl = (group, key) => (LABELS[group] && LABELS[group][key]) || key || "—";

// Size label: bathroom band token → friendly band; free number → "N m²";
// unknown → per-type default note.
const SIZE_LABEL = { s_3_4: "3–4 m²", s_5_6: "5–6 m²", s_7_8: "7–8 m²", s_9_10: "9–10 m²", s_11p: "10 m² felett" };
function sizeLabel(size, pt) {
    if (size === "nem_tudom" || size == null || String(size).trim() === "") return `Nem tudja (alap: ${TYPE_DEFAULT_AREA[pt] || 5} m²)`;
    if (Object.prototype.hasOwnProperty.call(SIZE_LABEL, size)) return SIZE_LABEL[size];
    const n = parseFloat(String(size).replace(",", "."));
    return !isNaN(n) && n > 0 ? `${String(size).replace(".", ",")} m²` : "—";
}

// Choice fields with fixed tokens, validated against their allowed set below.
const CHOICE_FIELDS = ["projectType", "tier", "washing", "layout", "heating", "scope",
    "roomscope", "bathrooms", "kitchen", "windows", "heatingsys", "exterior",
    "furniture", "appliances", "walls", "condition", "floortile", "klima",
    "refine_gate", "budget", "timeline"];

// Drop any choice-field value the model invents that isn't a known canonical
// value (validated against LABELS, the single source of allowed tokens). `size`
// is validated separately (known token OR a plausible number).
function sanitizeChoices(s) {
    if (!s || typeof s !== "object") return s;
    for (const field of CHOICE_FIELDS) {
        const v = s[field];
        if (v != null && String(v).trim() !== "" && !(String(v) in LABELS[field])) delete s[field];
    }
    if (s.size != null && String(s.size).trim() !== "") {
        const ok = String(s.size) === "nem_tudom" || String(s.size) in SIZE_AREA || parseArea(String(s.size)) != null;
        if (!ok) delete s.size;
    }
    return s;
}

// Project summary as [label, value] pairs, tailored to the project type. Reused
// by the chat recap and both e-mails so they never drift apart.
function summaryPairs(sel) {
    const pt = sel.projectType || "furdo";
    const p = [["Típus", lbl("projectType", pt)], ["Méret", sizeLabel(sel.size, pt)], ["Kivitelezési szint", lbl("tier", sel.tier)]];
    if (pt === "furdo") {
        p.push(["Zuhany / kád", lbl("washing", sel.washing)]);
        p.push(["Elrendezés", lbl("layout", sel.layout)]);
        p.push(["Padlófűtés", lbl("heating", sel.heating)]);
    } else if (pt === "lakas" || pt === "haz") {
        const has = (k) => sel[k] != null && String(sel[k]).trim() !== "";
        p.push(["Munka jellege", lbl("scope", sel.scope)]);
        p.push(["Fürdőszobák", lbl("bathrooms", sel.bathrooms)]);
        p.push(["Konyha", lbl("kitchen", sel.kitchen)]);
        // Refine answers — only shown if the customer actually gave them.
        if (has("condition")) p.push(["Jelenlegi állapot", lbl("condition", sel.condition)]);
        if (has("walls")) p.push(["Falmozgatás", lbl("walls", sel.walls)]);
        if (has("floortile")) p.push(["Padló jellege", lbl("floortile", sel.floortile)]);
        if (has("windows")) p.push(["Ablakcsere", lbl("windows", sel.windows)]);
        if (has("heatingsys")) p.push(["Fűtés", lbl("heatingsys", sel.heatingsys)]);
        if (has("klima")) p.push(["Klíma", lbl("klima", sel.klima)]);
        if (pt === "haz" && has("exterior")) p.push(["Külső munkák", lbl("exterior", sel.exterior)]);
    } else if (pt === "konyha") {
        p.push(["Új konyhabútor", lbl("furniture", sel.furniture)]);
        p.push(["Beépített gépek", lbl("appliances", sel.appliances)]);
        p.push(["Elrendezés", lbl("layout", sel.layout)]);
    } else if (pt === "szoba") {
        p.push(["Munka jellege", lbl("roomscope", sel.roomscope)]);
    }
    return p;
}

// Running ballpark for the LIVE estimate banner (lakas/haz only). Appears once the
// essential questions are answered, with a band that's WIDER while refine questions
// are still open and TIGHTENS (and shifts) as the customer fills them in — which is
// what motivates people to keep going. Returns null until there's enough to show.
function runningEstimate(sel) {
    if (!sel || (sel.projectType !== "lakas" && sel.projectType !== "haz")) return null;
    const filled = (k) => sel[k] != null && String(sel[k]).trim() !== "";
    if (!projectFields(sel.projectType).every(filled)) return null; // essentials incomplete
    const q = buildQuote(sel);
    const unknown = refineFields(sel.projectType).filter((f) => !filled(f)).length;
    const k = Math.min(0.12, unknown * 0.02); // extra uncertainty per open refine question
    const band = sel.projectType === "haz" ? RENO.bandHouse : RENO.band;
    return {
        low: round10000(q.total * (band.low - k)),
        high: round10000(q.total * (band.high + k)),
        partial: unknown > 0,
    };
}

// Customer-facing estimate. Returns sections split by [[SPLIT]] so the widget
// renders them as separate chat bubbles. Numbers come from buildQuote.
function renderCustomerQuote(quote, sel) {
    const pt = sel.projectType || "furdo";
    const what = lbl("projectType", pt).toLowerCase();
    const items = quote.items.map(i => `• ${i.label} — **${formatHuf(i.huf)}**`).join("\n");

    // Bubble 1 — the price (shown as a range), with a one-line context.
    const priceBubble = [
        `Köszönöm, ${sel.name || ""}! Íme az **előzetes árajánlata** egy **${sizeLabel(sel.size, pt)}**, **${lbl("tier", sel.tier).toLowerCase()}** ${what}ra.`,
        ``,
        `**Tételek:**`,
        items,
        ``,
        `**Becsült végösszeg: ${formatHuf(quote.low)} – ${formatHuf(quote.high)}**`,
        `(bruttó, ÁFÁ-val, **kulcsrakész**)`,
    ].join("\n");

    // Bubble 2 — what's included + the estimate caveat + the next steps. This is
    // the part that "makes everything make sense": it frames the number, says
    // what it covers, and tells the customer exactly what happens next.
    const incl = pt === "furdo"
        ? "bontás, gépészet, villany, vízszigetelés, burkolás, festés, valamint a szaniterek és csaptelepek anyaga és beépítése"
        : "a fenti tételek — anyaggal és munkadíjjal, kulcsrakész kivitelben";
    const nextBubble = [
        `Ez egy **tájékoztató becslés** — a végleges árat az **ingyenes helyszíni felmérés** után rögzítjük, a választott anyagok és a pontos műszaki tartalom függvényében.`,
        ``,
        `**Mit tartalmaz?** Kulcsrakész ár: ${incl}.`,
        ``,
        `**Mi a következő lépés?**`,
        `• Kollégánk **hamarosan keresi** a megadott telefonszámon.`,
        `• Egyeztetünk egy időpontot az **ingyenes felmérésre**.`,
        `• Utána megkapja a **végleges, tételes ajánlatot**.`,
    ].join("\n");

    // Bubble 3 — compact recap of the PROJECT only (no echo of the contact data
    // they just typed; the owner gets all of that by e-mail).
    const recap = [`**Az Ön igénye röviden:**`];
    for (const [k, v] of summaryPairs(sel)) recap.push(`• ${k}: **${v}**`);
    recap.push(``);
    recap.push(`Sürgős esetben hívjon: ${PHONE}`);
    if (EMAIL_OFFER_ENABLED) {
        recap.push(``);
        recap.push(`Szeretné, hogy e-mailben is elküldjük az ajánlatot?`);
    }

    return [priceBubble, nextBubble, recap.join("\n")].join("\n[[SPLIT]]\n");
}

const PHONE = process.env.LEAD_PHONE || "+36 30 260 57 56";

// ---------------------------------------------------------------------------
//  System prompt (Hungarian) — conversation + structured output contract
// ---------------------------------------------------------------------------
const SYSTEM_PROMPT = `SZEMÉLYISÉG
Te az "NM Bau" digitális árajánló asszisztense vagy. Lakás- és házfelújítással foglalkozó kivitelező nevében beszélsz: fürdőszoba, konyha, teljes lakás, családi ház (kívül-belül) és egyes szobák felújítása. Kizárólag MAGYARUL válaszolj.

HANGNEM
- Udvarias, közvetlen, szakértő és tömör. Lehetőleg 40 szó alatt válaszolj.
- Egyszerre EGY kérdést tegyél fel. Sose kérdezz több dolgot egyszerre.
- Sose találgass árat és sose számolj — az árat a rendszer számolja ki a végén, sávban.

FORMÁZÁS (olvashatóság — NAGYON FONTOS)
Írj jól SZKENNELHETŐEN, Markdown-formázással (a rendszer megjeleníti a **félkövért** és a "•" felsorolást):
- A fő KÉRDÉST MINDIG külön sorba és **félkövérbe** tedd. Pl.: **Mit szeretne felújítani?**
- Ha a kérdéshez magyarázandó lehetőségek tartoznak, NE zsúfold zárójelbe egy hosszú mondatba — sorold fel őket, MINDEN sor "• " jellel kezdődjön, a lehetőség neve **félkövér**, utána rövid magyarázat gondolatjellel.
- Tartsd rövidre: a félkövér fő kérdés + legfeljebb 3–4 felsorolás-sor. A kattintható gombokat a rendszer jeleníti meg — neked nem kell gombokat kiírnod.
- A LÉNYEGES SZAVAKAT mindenhol emeld ki **félkövérrel** (szám/mértékegység, a választás neve, minden kulcsszó, amin a döntés múlik). Ne emelj ki egész mondatot — csak a kulcsszót.
- Amikor visszaigazolod az ügyfél válaszát, az ő válaszát is **félkövérrel** idézd (pl. "Rendben, **közepes** szint.").
- SOHA ne használj emojit, hangulatjelet vagy ikon-karaktert — kizárólag sima szöveg.

CÉL
Először kideríted, MIT szeretne felújítani, majd a választott típushoz tartozó kérdéseket teszed fel sorban, végül a keretet/időzítést és az elérhetőségeit. FONTOS: a rendszer már köszöntötte az ügyfelet — NE köszönj újra, rögtön a 0. (típus) kérdéssel kezdj.

KÖZÉRTHETŐSÉG (nagyon fontos!)
Az ügyfél laikus. Minden kérdést EGYSZERŰEN, hétköznapi nyelven tegyél fel, a szakszavakat MINDIG magyarázd el egy rövid, zárójeles mondattal. Ha az ügyfél nem ért valamit vagy azt írja "nem tudom", magyarázd el türelmesen, példával, és kérd, hogy a legjobb tudása szerint válaszoljon.

FONTOS — "NEM TUDOM": minden választós kérdésnél van "Nem tudom" lehetőség is. Ha az ügyfél bizonytalan, fogadd el a "nem_tudom" értéket és lépj tovább — a rendszer ilyenkor ésszerű alap-feltételezéssel számol, a felmérés pedig pontosít. NE erőltesd a választ.

=== 0. KÉRDÉS — MINDIG EZ AZ ELSŐ ===
projectType — **félkövér** fő kérdés: "Mit szeretne felújítani?", ALATTA felsorolás:
• **Fürdőszoba**
• **Konyha**
• **Teljes lakás**
• **Családi ház** – kívül-belül
• **Egy szoba / helyiség**
Értékek: furdo | konyha | lakas | haz | szoba.

A típus kiválasztása UTÁN a hozzá tartozó kérdéssort kövesd, EGYESÉVEL. A "size" kérdésnél mindig fogadj el konkrét számot (pl. "60") is, vagy a gombot.

=== FÜRDŐSZOBA (furdo) ===
1. size — "Körülbelül hány négyzetméteres a fürdőszoba?" (szám vagy gomb) → s_3_4|s_5_6|s_7_8|s_9_10|s_11p|<szám>|nem_tudom
2. tier — "Milyen kivitelezési szintet szeretne?": • **Alap / takarékos** • **Közepes** • **Prémium** → basic|mid|premium|nem_tudom
3. washing — "Zuhanyzót vagy kádat szeretne?": • **Zuhanytálca üveg fallal** • **Zuhanykabin** (kész, komplett) • **Kád** • **Kád és zuhany** → zuhany|zuhanykabin|kad|mindketto|nem_tudom
4. layout — "Marad a mostani elrendezés, vagy áthelyeznénk a vizes pontokat?": • **Marad** • **Áthelyezés** → marad|athelyez|nem_tudom
5. heating — "Szeretne elektromos padlófűtést?" (csempe alá fektetett fűtőszőnyeg) → igen|nem|nem_tudom

=== KONYHA (konyha) ===
1. size — "Körülbelül hány négyzetméteres a konyha?" (szám vagy gomb) → <szám>|nem_tudom
2. tier — kivitelezési szint → basic|mid|premium|nem_tudom
3. furniture — "Kell-e új konyhabútor és munkalap?" → igen|nem|nem_tudom
4. appliances — "Beépített gépeket is kér (sütő, főzőlap, páraelszívó)?" → igen|nem|nem_tudom
5. layout — "Marad a mostani elrendezés, vagy áthelyeznénk a víz/gáz/villany pontokat?" → marad|athelyez|nem_tudom

=== TELJES LAKÁS (lakas) — CSAK ezt az 5 ALAPKÉRDÉST tedd fel (a többit a pontosító szakaszban) ===
1. size — "Mekkora a lakás alapterülete (m²)?" (szám vagy gomb) → <szám>|nem_tudom
2. scope — "Milyen mély felújítás kell?": • **Teljes** – mindent cserélünk (csövek, villany, falak is) • **Részleges** – új felületek, burkolat, festés + néhány szakág, de nincs teljes bontás • **Kozmetikai** – főleg festés és új burkolat → teljes|reszleges|kozmetikai|nem_tudom
3. tier — kivitelezési szint → basic|mid|premium|nem_tudom
4. bathrooms — "Hány fürdőszoba/WC van?" → 1|2|3p|nem_tudom (3p = 3 vagy több)
5. kitchen — "A konyhával mi legyen?": • **Új konyhabútorral** • **Felújítás bútor nélkül** • **Konyhát nem érinti** → uj|felujitas|nem|nem_tudom

=== CSALÁDI HÁZ (haz) — ugyanaz az 5 alapkérdés, mint a lakásnál (size, scope, tier, bathrooms, kitchen) ===
(A külső munkákat NE itt kérdezd — az a pontosító szakaszban jön.)

=== EGY SZOBA (szoba) ===
1. size — "Hány négyzetméteres a helyiség?" (szám vagy gomb) → <szám>|nem_tudom
2. roomscope — "Mit szeretne a szobával?": • **Csak festés** • **Festés + új padló** • **Teljes felújítás** (festés, padló, villany, ajtó) → festes|festes_padlo|teljes|nem_tudom
3. tier — kivitelezési szint → basic|mid|premium|nem_tudom

=== MINDEN TÍPUSNÁL AZ ALAPKÉRDÉSEK UTÁN ===
budget — "Nagyjából milyen összeget szánna a felújításra?" RÖVIDEN kérdezz, NE sorold fel a sávokat szövegben — a gombokat a rendszer megjeleníti. A sávok TÍPUSFÜGGŐEK. Tokenek: fürdő/konyha/szoba b_1m|b_1_2|b_2_3|b_3m; lakás b_5m|b_5_10|b_10_15|b_15m; ház b_10m|b_10_20|b_20_35|b_35m; bizonytalan → b_unsure. FONTOS: fogadd el a választ és LÉPJ TOVÁBB — SOHA ne tedd fel újra ugyanazt a kérdést.
timeline — "Mikorra szeretné a kivitelezést?" → t_asap|t_month|t_halfyear|t_thisyear|t_unsure

ELÉRHETŐSÉGEK — a budget és timeline UTÁN. Előttük rövid átvezető (pl. "Köszönöm! Hogy elküldhessük a személyre szabott árajánlatot, kérek még pár adatot."). Utána egyesével (szabad szöveg, NINCS gomb), és mondd meg RÖVIDEN, miért kéred:
name — "Kérem a nevét — kinek címezzük az árajánlatot?"
email — "Mi az e-mail címe? Erre küldjük el az árajánlatot."
phone — "Mi a telefonszáma? Ezen a számon hívjuk vissza a részletekkel."
postal_code — "Mi az irányítószáma? Ez alapján egyeztetjük a felmérést."

=== PONTOSÍTÓ SZAKASZ — CSAK TELJES LAKÁSNÁL (lakas) ÉS CSALÁDI HÁZNÁL (haz), az elérhetőségek UTÁN ===
A rendszer ekkor már mutat egy ELŐZETES ÁRSÁVOT az ügyfélnek. A te dolgod először egy KAPUKÉRDÉST feltenni:
refine_gate — **félkövér** fő kérdés: "Megvan az **előzetes ár**! Szeretné **pontosítani** néhány gyors kérdéssel? Így szűkebb, pontosabb sávot kap.": • **Igen, pontosítsuk** • **Most nem, köszönöm** → yes|no
- Ha "no": NE kérdezz többet, a rendszer lezárja és megmutatja a végső árat.
- Ha "yes": tedd fel EGYESÉVEL az alábbi pontosító kérdéseket (mindegyik szűkíti az árat). Minden válasz után a rendszer frissíti az ársávot.
  walls — "Mozgatunk/építünk falakat, áthelyezünk vizes pontokat (WC, mosdó, konyha)?" → igen|nem|nem_tudom
  condition — "Milyen most az ingatlan állapota?": • **Újszerű** (kevés bontás) • **Lakott** (teljes bontás kell) • **Régi, elhasználódott** → ujszeru|lakott|regi|nem_tudom
  floortile — "A padló nagyrészt csempe vagy laminált/parketta lesz?": • **Inkább csempe** • **Fele-fele** • **Inkább laminált/parketta** → tobb_csempe|fele_fele|tobb_laminalt|nem_tudom
  windows — "Kell ablakcsere (nyílászárócsere)?" → csere|marad|nem_tudom
  heatingsys — "Fűtéskorszerűsítés?": • **Marad a mostani** • **Radiátorcsere** • **Padlófűtés** • **Hőszivattyús rendszer** → marad|radiator|padlofutes|hoszivattyu|nem_tudom
  klima — "Kér klímát?" → igen|nem|nem_tudom
  exterior — CSAK CSALÁDI HÁZNÁL: "Kell-e külső munka?": • **Nincs** • **Homlokzati szigetelés** • **Tetőfelújítás** • **Homlokzat + tető** • **Teljes külső** → nincs|homlokzat|teto|homlokzat_teto|teljes|nem_tudom

MEGJEGYZÉS: A bontást, vízszigetelést, gépészetet, villanyszerelést, festést és a törmelékelszállítást NE kérdezd meg külön — ezek a kulcsrakész ajánlatban benne vannak.

SZABÁLYOK
- Az ügyfél írhat szabad szöveggel is — értelmezd a válaszát és rendeld hozzá a megfelelő értéket.
- Ha egy válasz nem egyértelmű, EGYSZER kérdezz vissza, utána lépj tovább.
- Ne ígérj fix időpontot. Árat ne mondj a folyamat közben (a rendszer mutatja a sávot).
- Csak a kiválasztott típushoz tartozó kérdéseket tedd fel — más típus mezőit hagyd üresen.
- A pontosító kérdéseket CSAK lakásnál/háznál, és CSAK ha az ügyfél a kapukérdésnél igent mondott.

REJTETT ÁLLAPOT (KÖTELEZŐ MINDEN VÁLASZBAN)
MINDEN egyes válaszod legvégére tedd ki az eddig ismert adatokat ebben a rejtett blokkban (az ügyfél NEM látja). A még meg nem kérdezett vagy az adott típushoz nem tartozó mezők értéke üres string (""). SOSE találgass — csak azt töltsd ki, amit az ügyfél ténylegesen megválaszolt:
<!--DATA:{"projectType":"","size":"","tier":"","washing":"","layout":"","heating":"","scope":"","roomscope":"","bathrooms":"","kitchen":"","windows":"","heatingsys":"","exterior":"","furniture":"","appliances":"","walls":"","condition":"","floortile":"","klima":"","refine_gate":"","budget":"","timeline":"","name":"","email":"","phone":"","postal_code":""}-->
A blokkban MINDEN kulcs mindig szerepeljen. Engedélyezett értékek: projectType: furdo|konyha|lakas|haz|szoba; size: <szám>|s_3_4|s_5_6|s_7_8|s_9_10|s_11p|nem_tudom; tier: basic|mid|premium|nem_tudom; washing: zuhany|zuhanykabin|kad|mindketto|nem_tudom; layout: marad|athelyez|nem_tudom; heating: igen|nem|nem_tudom; scope: teljes|reszleges|kozmetikai|nem_tudom; roomscope: festes|festes_padlo|teljes|nem_tudom; bathrooms: 1|2|3p|nem_tudom; kitchen: uj|felujitas|nem|nem_tudom; windows: csere|marad|nem_tudom; heatingsys: marad|radiator|padlofutes|hoszivattyu|nem_tudom; exterior: nincs|homlokzat|teto|homlokzat_teto|teljes|nem_tudom; furniture: igen|nem|nem_tudom; appliances: igen|nem|nem_tudom; walls: igen|nem|nem_tudom; condition: ujszeru|lakott|regi|nem_tudom; floortile: tobb_csempe|fele_fele|tobb_laminalt|nem_tudom; klima: igen|nem|nem_tudom; refine_gate: yes|no; budget: b_1m|b_1_2|b_2_3|b_3m|b_5m|b_5_10|b_10_15|b_15m|b_10m|b_10_20|b_20_35|b_35m|b_unsure; timeline: t_asap|t_month|t_halfyear|t_thisyear|t_unsure. A többi (name, email, phone, postal_code) szabad szöveg.
Amikor minden szükséges mező megvan, írj egy RÖVID lezáró mondatot (pl. "Köszönöm, összeállítom az árajánlatot!") — és továbbra is tedd ki a teljes, kitöltött DATA blokkot. Az árat NE te írd ki; a rendszer számolja és mutatja.
A választógombokat a rendszer automatikusan megjeleníti — neked nem kell gombokat kiírnod.`;

// ---------------------------------------------------------------------------
//  AI providers — each takes normalized messages and returns { ok, text, error }
// ---------------------------------------------------------------------------
async function callOpenAI(messages) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return { ok: false, error: "Missing OPENAI_API_KEY" };
    try {
        const res = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
            body: JSON.stringify({
                model: process.env.OPENAI_MODEL || "gpt-4o-mini",
                messages,
                temperature: 0.4,
                max_tokens: 500,
            }),
        });
        const data = await res.json();
        const text = data.choices?.[0]?.message?.content;
        if (text) return { ok: true, text };
        return { ok: false, error: data.error?.message || JSON.stringify(data) };
    } catch (e) {
        return { ok: false, error: e.message };
    }
}

async function callGemini(messages) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return { ok: false, error: "Missing GEMINI_API_KEY" };
    const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
    const systemMsg = messages.find(m => m.role === "system");
    const contents = messages
        .filter(m => m.role !== "system")
        .map(m => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] }));
    try {
        const res = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    system_instruction: systemMsg ? { parts: [{ text: systemMsg.content }] } : undefined,
                    contents,
                    generationConfig: {
                        temperature: 0.4,
                        maxOutputTokens: 1000,
                        // This bot follows a fixed script — no reasoning needed —
                        // so disable "thinking" (faster, cheaper, no truncation).
                        thinkingConfig: { thinkingBudget: 0 },
                    },
                }),
            }
        );
        const data = await res.json();
        const cand = data.candidates?.[0];
        const text = (cand?.content?.parts || []).map(p => p?.text || "").join("");
        if (cand?.finishReason === "MAX_TOKENS") console.warn("Gemini hit MAX_TOKENS — answer may be truncated.");
        if (text) return { ok: true, text };
        return { ok: false, error: data.error?.message || JSON.stringify(data) };
    } catch (e) {
        return { ok: false, error: e.message };
    }
}

// ---------------------------------------------------------------------------
//  Handler
// ---------------------------------------------------------------------------
export default async function handler(request, response) {
    response.setHeader("Access-Control-Allow-Origin", "*");
    response.setHeader("Access-Control-Allow-Headers", "Content-Type");
    response.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");

    if (request.method === "OPTIONS") return response.status(200).end();

    try {
        const { question, history, action, lead, state } = request.body || {};

        // --- ACTION: customer asked us to e-mail them the quote ---
        if (action === "email_customer" && lead?.sel && lead?.quote) {
            const ok = await sendQuoteEmail(lead.sel, lead.quote, { to: lead.sel.email, toCustomer: true });
            return response.status(200).json({
                answer: ok
                    ? `Elküldtük az árajánlatot a megadott e-mail címre (${lead.sel.email}). Ha nem találja, nézze meg a Spam mappát is.`
                    : `Sajnos most nem sikerült e-mailt küldeni, de kollégánk hamarosan keresi Önt. ${PHONE}`,
                chips: [],
            });
        }

        // --- EARLY CONTACT CHECK: if the customer is answering a contact field,
        // validate it BEFORE spending a model call. On a bad value we keep the
        // field unrecorded so it stays "pending" and re-ask — this is what stops
        // a rejected phone/e-mail bleeding into the NEXT field. ---
        {
            const priorSel = Array.isArray(history)
                ? history.filter((m) => m && (m.role === "assistant" || m.role === "model")).map((m) => extractData(m.content))
                : [];
            const baseSel = mergeState(state, ...priorSel);
            const pend = pendingField(baseSel);
            let reask = null;
            if (typeof question === "string" && question.trim()) {
                if (pend === "email") {
                    const i = emailIssue(question);
                    if (i === "gmail") reask = "Hoppá, úgy tűnik **elírás** csúszott a címbe — a Gmail helyes végződése **gmail.com**. Kérem, írja be újra a teljes e-mail címét.";
                    else if (i) reask = "Ezt az **e-mail címet** nem sikerült értelmezni. Kérem, írja be a teljes címét (pl. **nev@gmail.com**).";
                } else if (pend === "phone") {
                    if (phoneIssue(question)) reask = "Ezt a **telefonszámot** nem sikerült értelmezni. Kérem, adja meg a teljes számát (pl. **+36 20 123 4567** vagy **06 30 123 4567**).";
                } else if (pend === "postal_code") {
                    if (postalIssue(question)) reask = "Az **irányítószám** 4 számjegyű (pl. **3525**). Kérem, így adja meg.";
                }
            }
            if (reask) {
                return response.status(200).json({
                    answer: reask,
                    chips: [],
                    state: baseSel,
                    estimate: runningEstimate(baseSel),
                    progress: progressFields(baseSel).filter((f) => baseSel[f] != null && String(baseSel[f]).trim() !== "").length,
                    progressTotal: progressFields(baseSel).length,
                });
            }
        }

        // Normalized message list for the model.
        const messages = [{ role: "system", content: SYSTEM_PROMPT }];
        if (Array.isArray(history) && history.length > 0) {
            for (const m of history) {
                if (m && m.role && typeof m.content === "string") {
                    messages.push({ role: m.role === "model" ? "assistant" : m.role, content: m.content });
                }
            }
        } else if (question) {
            messages.push({ role: "user", content: question });
        }

        const provider = (process.env.AI_PROVIDER || "openai").toLowerCase();
        const result = provider === "gemini" ? await callGemini(messages) : await callOpenAI(messages);

        if (!result.ok) {
            console.error(`[${provider}] API Error:`, result.error);
            return response.status(200).json({ answer: "Elnézést, most nem érem el az asszisztenst. Kérlek próbáld újra." });
        }

        let aiAnswer = result.text;
        if (!aiAnswer) {
            return response.status(200).json({ answer: "Értem, de ezt nem sikerült feldolgoznom. Megfogalmaznád másképp?" });
        }

        // --- STATE: extract the running DATA block from THIS message ... ---
        let currentSel = null;
        const dataMatch = aiAnswer.match(/<!--DATA:(.*?)-->/s);
        if (dataMatch) {
            try { currentSel = sanitizeChoices(JSON.parse(dataMatch[1])); }
            catch (e) { console.error("DATA parse fail:", e.message); }
            aiAnswer = aiAnswer.replace(/<!--DATA:.*?-->/s, "").trim();
        }

        // ... then merge it onto the accumulated state carried by the widget.
        const priorSel = Array.isArray(history)
            ? history.filter((m) => m && (m.role === "assistant" || m.role === "model")).map((m) => extractData(m.content))
            : [];
        const baseSel = mergeState(state, ...priorSel);

        // Deterministically record the answer the customer just gave into the
        // field they were being asked — so chips advance immediately.
        const determined = {};
        const pending = pendingField(baseSel);
        if (pending) {
            const v = mapAnswer(pending, question, baseSel);
            if (v) determined[pending] = v;
        }

        // Final state, by ascending trust: model block (least) < accumulated <
        // this turn's deterministically-mapped answer (wins).
        const sel = mergeState(currentSel, baseSel, determined);

        // Progress for the widget's progress bar (project questions only). The
        // field set depends on the chosen project type.
        const progFields = progressFields(sel);
        const progressTotal = progFields.length;
        const progress = progFields.filter((f) => sel[f] != null && String(sel[f]).trim() !== "").length;

        // --- COMPLETION CHECK (backend-decided, model-independent) ---
        if (isQuoteReady(sel)) {
            const quote = buildQuote(sel);

            console.log("\n========================================");
            console.log(`🎯 ÚJ ÁRAJÁNLAT / LEAD — ${FLOW_LABEL[sel.projectType] || "Felújítás"}`);
            console.log(`Ügyfél: ${sel.name} | ${sel.phone} | ${sel.email}`);
            console.log(`Irsz.: ${sel.postal_code} | Méret: ${sizeLabel(sel.size, sel.projectType)} | Szint: ${sel.tier}`);
            console.log(`Becsült sáv: ${formatHuf(quote.low)} – ${formatHuf(quote.high)}`);
            console.log("========================================\n");

            await sendQuoteEmail(sel, quote, { to: process.env.LEAD_EMAIL_TO || "pirint.milan@gmail.com", toCustomer: false });

            return response.status(200).json({
                answer: renderCustomerQuote(quote, sel),
                chips: [],
                emailOffer: EMAIL_OFFER_ENABLED,
                lead: { sel, quote },
                state: sel,
                estimate: { low: quote.low, high: quote.high, partial: false },
                progress: progressTotal,
                progressTotal,
            });
        }

        aiAnswer = aiAnswer.replace(/<!--CHIPS:.*?-->/s, "").trim();
        const chips = nextChips(sel);
        return response.status(200).json({ answer: aiAnswer, chips, state: sel, estimate: runningEstimate(sel), progress, progressTotal });

    } catch (error) {
        console.error("Function Crash:", error.message);
        return response.status(500).json({ answer: "Elnézést, a szerver épp akadozik. Kérlek próbáld újra kicsit később." });
    }
}

// ---------------------------------------------------------------------------
//  E-mail (Resend). opts = { to, toCustomer }. Returns true on success.
// ---------------------------------------------------------------------------
async function sendQuoteEmail(sel, quote, opts = {}) {
    const resendKey = process.env.RESEND_API_KEY;
    const toEmail = opts.to || process.env.LEAD_EMAIL_TO || "pirint.milan@gmail.com";
    const fromEmail = process.env.LEAD_EMAIL_FROM || "NM Bau <onboarding@resend.dev>";
    const toCustomer = !!opts.toCustomer;

    if (!resendKey) {
        console.log("⚠️  Nincs RESEND_API_KEY — az e-mail kimarad. A lead a fenti logban szerepel.");
        return false;
    }
    if (!toEmail) {
        console.log("⚠️  Nincs címzett e-mail cím — kihagyva.");
        return false;
    }

    const itemRows = quote.items
        .map(i => `<tr><td style="padding:6px 12px;border-bottom:1px solid #eee">${i.label}</td><td style="padding:6px 12px;border-bottom:1px solid #eee;text-align:right;white-space:nowrap">${formatHuf(i.huf)}</td></tr>`)
        .join("");

    // Client-details block is only included in the owner's copy.
    const clientBlock = toCustomer ? "" : `
        <h3 style="margin:0 0 8px">Ügyfél adatai</h3>
        <p style="margin:4px 0"><b>Név:</b> ${sel.name || "-"}</p>
        <p style="margin:4px 0"><b>Telefon:</b> ${sel.phone || "-"}</p>
        <p style="margin:4px 0"><b>E-mail:</b> ${sel.email || "-"}</p>
        <p style="margin:4px 0"><b>Irányítószám:</b> ${sel.postal_code || "-"}</p>
        <p style="margin:4px 0"><b>Tervezett keret:</b> ${lbl("budget", sel.budget)}</p>
        <p style="margin:4px 0"><b>Tervezett kivitelezés:</b> ${lbl("timeline", sel.timeline)}</p>
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:16px 0">`;

    const flow = FLOW_LABEL[sel.projectType] || "Felújítás";
    const heading = toCustomer ? `Az Ön árajánlata — NM Bau ${flow}` : `Új árajánlat — NM Bau ${flow}`;
    const intro = toCustomer
        ? `<p style="margin:0 0 12px">Kedves ${sel.name || "Ügyfelünk"}! Köszönjük érdeklődését. Íme az előzetes árajánlata:</p>`
        : "";

    // Project summary rows, tailored to the project type (shared with the chat recap).
    const summaryRows = summaryPairs(sel)
        .map(([k, v]) => `<p style="margin:4px 0"><b>${k}:</b> ${v}</p>`)
        .join("");

    const html = `
    <div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;color:#111827">
      <div style="background:#1C1917;color:#ffffff;padding:20px 24px;border-radius:12px 12px 0 0;border-bottom:3px solid #B8860B">
        <h2 style="margin:0">${heading}</h2>
      </div>
      <div style="border:1px solid #e5e7eb;border-top:none;padding:24px;border-radius:0 0 12px 12px">
        ${intro}${clientBlock}
        <h3 style="margin:0 0 8px">A felújítás összefoglalása</h3>
        ${summaryRows}
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:16px 0">
        <h3 style="margin:0 0 8px">Kalkulált árajánlat (kulcsrakész)</h3>
        <table style="width:100%;border-collapse:collapse;font-size:14px">${itemRows}
          <tr><td style="padding:10px 12px;font-weight:bold">Becsült végösszeg (sáv)</td><td style="padding:10px 12px;text-align:right;font-weight:bold;color:#6B4A00;white-space:nowrap">${formatHuf(quote.low)} – ${formatHuf(quote.high)}</td></tr>
        </table>
        ${toCustomer ? "" : `<p style="margin:8px 0 0;font-size:12px;color:#9ca3af">Fajlagos: ~${formatHuf(quote.perM2)}/m² (kisebb terület esetén magasabb a fix költségek miatt)</p>`}
        <p style="margin:16px 0 0;font-size:12px;color:#6b7280">Előzetes, tájékoztató jellegű kalkuláció, bruttó (ÁFÁ-val), kulcsrakész. A pontos ár a helyszíni felmérés után, a választott anyagok és a pontos műszaki tartalom függvényében véglegesül.${toCustomer ? " " + PHONE : ""}</p>
      </div>
    </div>`;

    const subject = toCustomer
        ? `Az Ön árajánlata — NM Bau — ${formatHuf(quote.low)} – ${formatHuf(quote.high)}`
        : `[ÚJ ÁRAJÁNLAT] ${flow} — ${sel.postal_code || ""} — ${sel.name || ""} — ${formatHuf(quote.low)}–${formatHuf(quote.high)}`;

    try {
        const emailRes = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${resendKey}` },
            body: JSON.stringify({ from: fromEmail, to: [toEmail], subject, html }),
        });
        const result = await emailRes.json();
        if (emailRes.ok) {
            console.log(`✅ Árajánlat e-mail elküldve (${toCustomer ? "ügyfél" : "tulajdonos"}):`, result.id);
            return true;
        }
        console.error("❌ Resend hiba:", JSON.stringify(result));
        return false;
    } catch (emailErr) {
        console.error("❌ Nem sikerült elküldeni az e-mailt:", emailErr.message);
        return false;
    }
}
