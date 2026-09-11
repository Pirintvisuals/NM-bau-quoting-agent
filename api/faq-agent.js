// ============================================================================
//  NM BAU - Fürdőszoba-felújítás árajánló asszisztens (bathroom quoting agent)
//  - AI provider: OpenAI / Gemini - drives the Hungarian conversation ONLY.
//  - The price is computed DETERMINISTICALLY in this backend (buildQuote) from a
//    geometry + tier model. The AI never does arithmetic, so the total can never
//    be miscalculated by the model.
//  - When all answers are collected the AI emits a hidden state block
//    (<!--DATA:{...}-->). We parse it, price it, e-mail the owner, and return an
//    itemised estimate (shown as a RANGE) to the customer.
//
//  WHY RANGES: a remodel total genuinely depends on choices that only firm up at
//  the site survey, so EVERY line is quoted as a realistic "kb." range whose width
//  is per-trade (fixtures swing a lot, demolition little), and the headline total
//  is the SUM of those item ranges (e.g. "2 150 000 – 3 330 000 Ft"). All amounts
//  are NET (nettó) - no gross/VAT figure is shown. The few questions we ask are the
//  ones that actually move the price (size, finish tier, shower/bath, layout, heat).
// ============================================================================

// ---------------------------------------------------------------------------
//  PRICE MODEL (HUF) - single source of truth. Edit numbers here only.
//
//  METHODOLOGY: bottom-up, itemised (tételes) - exactly how a real Hungarian
//  kulcsrakész árajánlat is built. We deliberately do NOT price as a flat
//  Ft/m² × area, because the headline "150 000–250 000 Ft/m²" aggregator number
//  is a large-room simplification: it is wrong for small bathrooms, where fixed
//  costs (container, plumbing/electrical rough-in, fixtures) dominate and push
//  the real Ft/m² well above 250 000. The fixed-cost "floor" in each line below
//  is what correctly makes a 4 m² room cost more per m² than a 9 m² one.
//
//  Sources - triangulated across the live 2025–2026 Hungarian market (verified
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
//     kád 20–300e, zuhanykabin 90–300e, csaptelep 5–30e - tier-enként összevonva.
//   - Elektromos fűtőszőnyeg 150 W/m² + termosztát: ~18 000–31 000 Ft/m² beépítve.
//  Each scenario's output is cross-checked against the published total + Ft/m²
//  envelopes in test-quote.mjs so future edits can't silently drift off-market.
//
//  NOTE (2026-09-04): MODEL is now the FALLBACK model, used only by the whole-
//  flat / house / kitchen / room flows. The bathroom flow no longer uses it - it
//  is assembled from the real NM Bau Törzsárlista in pricelist.js. Where a rate
//  below overlaps the price list, it has been reset to the price list's value.
// ---------------------------------------------------------------------------
import { PRICE_LIST, rate, FT_PER_EUR_FALLBACK } from "./pricelist.js";
import { waitUntil } from "@vercel/functions";

// The old bathroom model's constants lived here - per-m² averages for tiling,
// plumbing, sanitaryware and so on. Every one of them was replaced on
// 2026-09-04 by a real Törzsárlista rate (see pricelist.js), leaving the block
// with no references at all, so it is gone. The whole-property flows use RENO.

// ---------------------------------------------------------------------------
//  WHOLE-PROPERTY PRICE MODEL (HUF) - full flat / house / kitchen / single room.
//
//  METHODOLOGY: same bottom-up turnkey philosophy as the bathroom model, but a
//  full renovation is composed from (a) per-m² SHELL trades scaled by floor area
//  + finish tier, plus (b) discrete add-ons priced per unit (doors, windows,
//  bathrooms, kitchen furniture, heating system). This composition is
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
//   - Beltéri ajtó tokkal, beépítve: ~65 000–180 000 Ft/db (qjob 2026: dekorfólia
//     ~44e + beépítés 24,5–50e; CPL 75–100e; furnér 140–180e).
//   - Műanyag ablak cserével: 40 000–135 000 Ft/db (qjob/joszaki/Hoffmann).
//   - Radiátor csere: 40 000–80 000 Ft/db; vizes padlófűtés rendszer: 7 000–9 000
//     Ft/m²; kondenzációs kazán+telepítés ~0,9 M; komplett levegő-víz hőszivattyús
//     rendszer 3,1–6,25 M (Daibau/qjob 2026: ~2,7M egység + 0,6–1,2M szerelés + kieg.).
//   - Konyhafelújítás: standard 800 000–900 000, prémium 1,7–2,7 M; bútor
//     200 000–800 000+, gépek 300 000–400 000, munkalap 14 000–110 000 (qjob).
//   - Homlokzati hőszigetelés: 22 000–30 000 Ft/m²; tetőfelújítás teljes 35 000–
//     50 000 Ft/m²; térkövezés 8 000–18 000 Ft/m²; kerítés (Daibau/qjob/szakiweb).
//  Each scenario is cross-checked against these envelopes in test-quote.mjs.
// ---------------------------------------------------------------------------
const RENO = {
    // FULL GUT (teljes) interior shell - turnkey Ft / m² of FLOOR area, by tier.
    full: {
        demo:    { basic: 10500, mid: 13000, premium: 16500 }, // bontás + törmelék
        masonry: { basic: 20000, mid: 28000, premium: 40000 }, // falazás, vakolás, gipszkarton, glettelés
        screed:  { basic: 7000,  mid: 8000,  premium: 10500 }, // aljzatkiegyenlítés
        plumb:   { basic: 14000, mid: 18000, premium: 24000 }, // víz + csatorna teljes csere
        elec:    { basic: 15000, mid: 19000, premium: 26000 }, // teljes villany + szerelvény
        floor:   { basic: 17500, mid: 26000, premium: 44000 }, // burkolás + padló (anyag+munka, vegyes)
        paint:   { basic: 6500,  mid: 8000,  premium: 11500 }, // festés + glettelés
        fixed:   150000, // egész lakásra: konténer, mobilizáció, végtakarítás
    },
    // PARTIAL (reszleges) interior - the realistic MIDDLE: new surfaces (burkolat,
    // padló, festés) + fixture-level plumbing/electrical + bathroom/kitchen, but
    // NOT a full pipe/wall/wiring rip-out. This is what most "közepes" customers
    // actually mean, and the tier the binary kozmetikai/teljes model was missing.
    partial: {
        demo:    { basic: 6000,  mid: 7800,  premium: 10000 }, // részleges bontás (nem teljes strip)
        masonry: { basic: 10500, mid: 15500, premium: 22500 }, // faljavítás, glett, kis gipszkarton
        screed:  { basic: 4000,  mid: 5300,  premium: 7000 },
        plumb:   { basic: 6000,  mid: 8400,  premium: 12000 }, // szerelvény-szintű, nem teljes csere
        elec:    { basic: 6000,  mid: 8400,  premium: 12000 }, // részleges (nem teljes újrahúzás)
        floor:   { basic: 17500, mid: 26000, premium: 44000 }, // új burkolás + padló ugyanúgy
        paint:   { basic: 6500,  mid: 8000,  premium: 11500 },
        fixed:   100000,
    },
    // COSMETIC (kozmetikai) interior - festés + új padló + apró villany/javítás,
    // a csövek és falak bontása NÉLKÜL. Turnkey Ft / m² of floor area, by tier.
    cosmetic: {
        floor: { basic: 16500, mid: 24000, premium: 38000 },
        paint: { basic: 6000,  mid: 8000,  premium: 11500 },
        elec:  { basic: 2400,  mid: 3600,  premium: 5400 }, // lámpa/kapcsoló/dugalj csere
        patch: { basic: 3000,  mid: 4200,  premium: 6000 }, // glettelés, apró javítás
        fixed: 75000,
    },
    // --- Refine-stage inputs (only change the price when the customer opts in) ---
    // Current condition: scales the demolition line (less to strip / more to strip).
    conditionMult: { ujszeru: 0.5, lakott: 1.0, regi: 1.25 },
    // Floor finish split: tile is dearer than laminate/parketta - shift the floor line.
    floortileMult: { tobb_csempe: 1.25, fele_fele: 1.0, tobb_laminalt: 0.82 },
    // Building/removing walls + relocating wet-points (big swing on falazás + gépészet).
    wallsPerM2:    7000,
    wallsRelocate: 240000,
    // Split AC unit, supplied + installed, /db.
    klimaEach:     400000,
    door:   { basic: 78000, mid: 108000, premium: 175000 }, // beltéri ajtó tokkal, /db (alap: ~44e dekorfólia + ~25e beépítés)
    window: { basic: 72000, mid: 105000, premium: 165000 }, // műanyag ablak cserével, /db
    // Wet-room fit-out PREMIUM over a dry room (extra vízszigetelés + szaniterek +
    // csaptelep + zuhany/kád), /fürdő. A burkolás/gépészet már a héjban benne van.
    bathroomFitout: { basic: 650000, mid: 1050000, premium: 1700000 },
    // Heating-system upgrades.
    radiatorEach:    65000,   // radiátor csere, /db
    underfloorPerM2: 10500,   // vizes padlófűtés rendszer, /m²
    underfloorFixed: 180000,  // osztó-gyűjtő + bekötés
    heatpumpSystem:  4600000, // komplett levegő-víz hőszivattyús rendszer (belső elosztással): ~2,7M egység + 0,6–1,2M szerelés + 0,3–0,8M kiegészítők
    // Kitchen (konyha) module. Cabinets + worktop priced per FOLYÓMÉTER (running
    // metre) - the accurate driver - instead of floor m². A typical kitchen ≈ 4 fm.
    kitchen: {
        base:          { basic: 33000, mid: 49000, premium: 75000 }, // /m²: csempe, gépészet/villany kiállás, padló, festés
        furniturePerM: { basic: 130000, mid: 205000, premium: 390000 }, // konyhabútor /folyóméter
        countertopPerM:{ basic: 14000,  mid: 26000,  premium: 52000 },  // munkalap /folyóméter
        appliances:    { basic: 290000, mid: 440000, premium: 750000 },
        moveExtra:     180000, // víz/gáz/villany áthelyezés új elrendezésnél
        fixed:         75000,
    },
    band:      { low: 0.90, high: 1.12 }, // lakás / konyha / szoba sáv
    bandHouse: { low: 0.85, high: 1.15 }, // ház: nagyobb projekt, szélesebb sáv
};

// Representative floor area (m²) when the customer doesn't give one, per type.
const TYPE_DEFAULT_AREA = { furdo: 5, lakas: 60, haz: 110, konyha: 9, szoba: 15 };
const FLOW_LABEL = {
    furdo: "Fürdőszoba-felújítás", konyha: "Konyhafelújítás", lakas: "Teljes lakásfelújítás",
    haz: "Családi ház felújítás", szoba: "Szobafelújítás",
};

// All prices are NET (nettó, ÁFA NÉLKÜL) and TURNKEY (kulcsrakész): labour +
// materials + fixtures. The customer is shown net figures only - no gross/VAT.
const APPLIANCE_INCLUDED = true;

// Offer to e-mail the quote to the CUSTOMER. Requires a real Resend key + a
// VERIFIED sending domain - until that exists, keep this OFF (the owner is still
// notified). Flip on with EMAIL_OFFER=on in .env once the domain is live.
const EMAIL_OFFER_ENABLED =
    (process.env.EMAIL_OFFER || "").toLowerCase() === "on";

// ---------------------------------------------------------------------------
//  Helpers - formatting + geometry
// ---------------------------------------------------------------------------
function formatHuf(n) {
    return Math.round(n).toLocaleString("hu-HU").replace(/ /g, " ") + " Ft";
}

// Which price column the customer is quoted from. NM Bau maintains a Hungarian
// and an Austrian price for every line item, and the switch between them is the
// LANGUAGE the customer writes in, not where the property is: a Hungarian
// conversation is quoted in Ft, a German or English one in euro off the
// Austrian column. (Milan's call, 2026-09-04 - the language is what the
// customer actually reveals, and it is already detected for the reply.)
function currencyFor(lang) {
    return normLang(lang) === "hu" ? "huf" : "eur";
}

// Format an amount in the quote's currency. Euro amounts are whole euros - a
// renovation estimate quoted to the cent would be false precision.
function formatMoney(n, cur) {
    if (cur === "eur") return Math.round(n).toLocaleString("de-AT").replace(/ /g, " ") + " EUR";
    return formatHuf(n);
}
const round1000 = (n) => Math.round(n / 1000) * 1000;
const round10000 = (n) => Math.round(n / 10000) * 10000;

// Every line is quoted as a realistic "kb." range, not a single number. The band
// WIDTH is per-item, because the real-world uncertainty differs by trade: fixtures
// (szaniter) swing a lot with the customer's choices, demolition far less. The
// total range the customer sees is simply the sum of the per-item ranges.
const ITEM_BAND_DEFAULT = 0.15;
const ITEM_BAND = {
    demo: 0.15, prep: 0.12, tileLabor: 0.14, tileMaterial: 0.22,
    plumbing: 0.18, electrical: 0.18, sanitary: 0.30, paint: 0.14, heat: 0.12,
    // whole-property lines
    shell: 0.18, floor: 0.18, doors: 0.18, bathroom: 0.25, kitchen: 0.22,
    windows: 0.18, heatsys: 0.20, klima: 0.15, walls: 0.20,
};
// Build one itemised line with its own range. `kind` selects the band width.
// Money granularity per currency. Rounding Ft to the nearest 1 000 is sensible;
// doing the same to euros would round a 240 EUR call-out charge to zero.
const MONEY = {
    huf: { item: 1000, total: 10000 },
    eur: { item: 5, total: 10 },
};
const roundTo = (n, step) => Math.round(n / step) * step;

function makeItem(label, amount, kind, cur = "huf") {
    const step = (MONEY[cur] || MONEY.huf).item;
    const h = roundTo(amount, step);
    const frac = (kind != null && ITEM_BAND[kind] != null) ? ITEM_BAND[kind] : ITEM_BAND_DEFAULT;
    return { label, amount: h, low: roundTo(h * (1 - frac), step), high: roundTo(h * (1 + frac), step) };
}

// ---------------------------------------------------------------------------
//  Bill - collects Törzsárlista line items and rolls them up into the trade
//  groups the customer sees. The workbook's own send-out view does exactly this:
//  it shows a total per munkacsoport and hides the individual unit prices, so
//  the customer gets a readable quote and NM Bau keeps its rate card private.
// ---------------------------------------------------------------------------

// Category -> the band to apply and the order it appears in. The band widths
// themselves are the existing ITEM_BAND values, NOT re-derived for the price
// list. The headline range still came out narrower than the old model's (34%
// against 43% on a 6 m² mid bath) simply because the mix changed: the old total
// was dominated by two wide material lines (szaniter ±30%, csempe ±22%) that no
// longer exist here. Worth revisiting - with fixed rates the remaining
// uncertainty is really "which items will the survey add", not "what does a
// trade cost", so these bands are wider than the data now justifies.
const CATEGORY_META = {
    "BONTÁS ELŐKÉSZÍTÉSE": { order: 1, band: "demo", merge: "BONTÁS" },
    "BONTÁS": { order: 1, band: "demo" },
    "VÍZ- ÉS CSATORNASZERELÉS": { order: 2, band: "plumbing" },
    "FŰTÉSSZERELÉS": { order: 3, band: "heatsys" },
    "LÉGTECHNIKA": { order: 4, band: "electrical" },
    "ELŐKÉSZÍTÉS / KŐMŰVES MUNKÁK": { order: 5, band: "prep" },
    "SZÁRAZÉPÍTÉSZET": { order: 6, band: "prep" },
    "FALPANEL": { order: 7, band: "tileLabor" },
    "MIKROCEMENT": { order: 7, band: "tileLabor" },
    "HIDEGBURKOLÁS": { order: 8, band: "tileLabor" },
    "VINYL BURKOLÁS": { order: 8, band: "floor" },
    "FESTÉS / GLETTELÉS": { order: 9, band: "paint" },
    "VILLANYSZERELÉS": { order: 10, band: "electrical" },
    "SZERELVÉNYEZÉS": { order: 11, band: "sanitary" },
    "BEFEJEZŐ MUNKÁK": { order: 12, band: "paint" },
    "EGYÉB": { order: 13, band: "demo" },
};
// Customer-facing group names. The raw workbook categories are internal ALL-CAPS
// trade headings; these are what actually goes in front of a customer.
const GROUP_LABEL = {
    "BONTÁS": "Bontás, elszállítás, munkaterület védelme",
    "VÍZ- ÉS CSATORNASZERELÉS": "Víz- és csatornaszerelés",
    "FŰTÉSSZERELÉS": "Fűtésszerelés",
    "LÉGTECHNIKA": "Szellőztetés",
    "ELŐKÉSZÍTÉS / KŐMŰVES MUNKÁK": "Előkészítés, kőműves munka, vízszigetelés",
    "SZÁRAZÉPÍTÉSZET": "Szárazépítészet",
    "FALPANEL": "Falpanel",
    "MIKROCEMENT": "Mikrocement",
    "HIDEGBURKOLÁS": "Burkolás munkadíja",
    "VINYL BURKOLÁS": "Vinyl padló fektetése",
    "FESTÉS / GLETTELÉS": "Festés, glettelés",
    "VILLANYSZERELÉS": "Villanyszerelés",
    "SZERELVÉNYEZÉS": "Szerelvényezés, szaniterek beépítése",
    "BEFEJEZŐ MUNKÁK": "Befejező munkák",
    "EGYÉB": "Kiszállás",
};

// Trades NM Bau currently puts out to a subcontractor. The work still happens,
// but the subcontractor prices it, so the widget must not put a number on it -
// it would be quoting someone else's rate. Named in the customer copy as an
// explicit exclusion rather than silently dropped. (Milán, 2026-09-06.)
const SUBCONTRACTED_CATEGORIES = ["FESTÉS / GLETTELÉS", "VILLANYSZERELÉS"];

class Bill {
    constructor(cur = "huf") { this.cur = cur; this.lines = []; }
    // qty defaults to 1 for the per-job (átalány / db) items; area- and
    // metre-based items pass a real quantity.
    add(id, qty = 1) {
        if (!(qty > 0)) return this;
        // Subcontracted work is skipped here rather than at the call site, so a
        // trade cannot creep back into the price by adding one more item to it.
        const it = PRICE_LIST[id];
        if (it && SUBCONTRACTED_CATEGORIES.includes(it.cat)) return this;
        this.lines.push({ id, qty, amount: rate(id, this.cur) * qty });
        return this;
    }
    // Roll the individual rates up into trade groups, in trade order.
    toItems() {
        const groups = new Map();
        for (const ln of this.lines) {
            const cat = PRICE_LIST[ln.id].cat;
            const meta = CATEGORY_META[cat] || { order: 99, band: null };
            const key = meta.merge || cat;
            const g = groups.get(key) || { key, order: meta.order, band: (CATEGORY_META[key] || meta).band, amount: 0 };
            g.amount += ln.amount;
            groups.set(key, g);
        }
        return [...groups.values()]
            .sort((a, b) => a.order - b.order)
            .map((g) => makeItem(GROUP_LABEL[g.key] || g.key, g.amount, g.band, this.cur));
    }
}

// ===========================================================================
//  SECURITY HELPERS - this endpoint is public and spends real money (LLM API +
//  Resend e-mail), so the goal is to make abuse (cost-draining floods, e-mail
//  spam relay, prompt/HTML injection) impractical. These are app-level controls;
//  for go-live also enable Vercel WAF rate-limiting / BotID at the platform edge.
// ===========================================================================

// HTML-escape any user-controlled string before it goes into an e-mail body.
function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
        ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// Render a chat history array as HTML for the OWNER e-mail, so he can read the
// conversation exactly as the customer saw it. Everything is escaped, newlines
// are preserved, and the model's own control blocks (<!--DATA:...-->,
// <!--CHIPS:...-->) plus the [[SPLIT]] bubble markers are stripped out.
// Chip clicks arrive as ordinary "user" messages, so a click-only conversation
// renders exactly like a typed one.
function transcriptHtml(rows) {
    if (!Array.isArray(rows)) return "";
    return rows
        .filter((m) => m && typeof m.content === "string" && m.content.trim())
        .map((m) => {
            const who = (m.role === "assistant" || m.role === "model") ? "Asszisztens" : "Ügyfél";
            const clean = m.content
                .replace(/<!--DATA:.*?-->/gs, "")
                .replace(/<!--CHIPS:.*?-->/gs, "")
                .replace(/\[\[SPLIT\]\]/g, "\n\n")
                .trim();
            if (!clean) return "";
            return `<p style="margin:0 0 10px"><b>${who}:</b><br>${esc(clean).replace(/\n/g, "<br>")}</p>`;
        })
        .join("");
}

// Same transcript as plain text, for the text/plain part of the owner e-mail.
function transcriptText(rows) {
    if (!Array.isArray(rows)) return "";
    return rows
        .filter((m) => m && typeof m.content === "string" && m.content.trim())
        .map((m) => {
            const who = (m.role === "assistant" || m.role === "model") ? "Asszisztens" : "Ügyfél";
            const clean = m.content
                .replace(/<!--DATA:.*?-->/gs, "")
                .replace(/<!--CHIPS:.*?-->/gs, "")
                .replace(/\[\[SPLIT\]\]/g, "\n")
                .replace(/\*\*/g, "")
                .trim();
            return clean ? `${who}:\n${clean}\n` : "";
        })
        .filter(Boolean)
        .join("\n");
}

// How many turns the customer actually took. The widget opens every conversation
// with a hidden kickoff line, so 1 means "opened the chat and did nothing".
function customerTurns(rows) {
    if (!Array.isArray(rows)) return 0;
    return rows.filter((m) => m && m.role === "user" && typeof m.content === "string" && m.content.trim()).length;
}

// Best-effort client IP from the proxy headers Vercel sets.
function clientIp(req) {
    const xf = req.headers && (req.headers["x-forwarded-for"] || req.headers["x-real-ip"]);
    if (typeof xf === "string" && xf.trim()) return xf.split(",")[0].trim();
    return (req.socket && req.socket.remoteAddress) || "unknown";
}

// In-memory fixed-window rate limiter. Per-instance only (Vercel may run several),
// so it's a best-effort first line, not a hard guarantee - pair with platform WAF.
const RL_BUCKETS = new Map();
function rateLimit(key, limit, windowMs) {
    const now = Date.now();
    let b = RL_BUCKETS.get(key);
    if (!b || now > b.resetAt) { b = { count: 0, resetAt: now + windowMs }; RL_BUCKETS.set(key, b); }
    b.count++;
    if (RL_BUCKETS.size > 10000) { // opportunistic cleanup so the map can't grow forever
        for (const [k, v] of RL_BUCKETS) if (now > v.resetAt) RL_BUCKETS.delete(k);
    }
    return b.count <= limit ? { ok: true } : { ok: false, retryAfter: Math.max(1, Math.ceil((b.resetAt - now) / 1000)) };
}

// Abuse limits (per IP). Generous enough for a real customer conversation, tight
// enough that a script can't drain the LLM budget or blast e-mails.
const RL_CHAT = { limit: Number(process.env.RL_CHAT_PER_MIN) || 30, windowMs: 60_000 };
const RL_EMAIL = { limit: Number(process.env.RL_EMAIL_PER_HOUR) || 5, windowMs: 60 * 60_000 };
// Owner transcript copies + the self-test both go to the OWNER's own address
// only, so these are about inbox noise, not about protecting third parties.
const RL_TRANSCRIPT = { limit: Number(process.env.RL_TRANSCRIPT_PER_HOUR) || 20, windowMs: 60 * 60_000 };
const RL_SELFTEST = { limit: Number(process.env.RL_SELFTEST_PER_HOUR) || 6, windowMs: 60 * 60_000 };

// Payload shape/size caps - reject oversized or malformed bodies before we ever
// call the model (token-cost protection) and strip client-injected system turns.
const MAX_QUESTION_LEN = 2000;
const MAX_HISTORY_MSGS = 40;
const MAX_MSG_LEN = 8000;
const ALLOWED_ROLES = new Set(["user", "assistant", "model"]); // NB: no "system"
function validateChatInput(question, history) {
    if (question != null && (typeof question !== "string" || question.length > MAX_QUESTION_LEN)) return "A kérdés túl hosszú.";
    if (history != null) {
        if (!Array.isArray(history) || history.length > MAX_HISTORY_MSGS) return "Érvénytelen előzmény.";
        for (const m of history) {
            if (!m || typeof m !== "object") return "Érvénytelen előzmény.";
            if (typeof m.content !== "string" || m.content.length > MAX_MSG_LEN) return "Érvénytelen előzmény.";
            if (!ALLOWED_ROLES.has(m.role)) return "Érvénytelen előzmény."; // blocks injected system prompts
        }
    }
    return null;
}

// Restrictive CORS: the widget embeds on arbitrary client sites, so we allow any
// origin BUT send no credentials (there are none) and never reflect cookies. If
// ALLOWED_ORIGINS is set (comma-separated), we lock the API to those origins.
function applyCors(req, res) {
    const allow = (process.env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean);
    const origin = (req.headers && req.headers.origin) || "";
    let value = "*";
    if (allow.length) value = allow.includes(origin) ? origin : allow[0];
    res.setHeader("Access-Control-Allow-Origin", value);
    if (allow.length) res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("Access-Control-Max-Age", "86400");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "no-store");
}

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
// Room perimeter for a floor area, assuming the 1:1.5-ish proportions of a real
// bathroom: 2*(w+h) where w*h = A. Checked against the wall areas NM Bau quoted
// on 2026-09-08 - 4 m² -> 17 m², 6 m² -> 21 m², 8 m² -> 24 m² of wall - which
// this reproduces to within 0.2 m².
const ROOM_PERIMETER_K = 4.08;
// Tiled height. NM Bau gave two figures per room, the second ~19% higher: tiling
// to 2.1 m and tiling to the ceiling. The lower one is the default here, so the
// quote never assumes the more expensive job on the customer's behalf.
const TILE_HEIGHT_M = 2.1;

function roomPerimeter(A) {
    return ROOM_PERIMETER_K * Math.sqrt(A);
}
function tiledSurface(A) {
    const wall = Math.max(0, roomPerimeter(A) * TILE_HEIGHT_M);
    return { floor: A, wall, total: A + wall };
}

// Wet-zone wall area to waterproof behind the shower/bath (m²). It grows with the
// room but is bounded - a tiny bathroom still needs a real shower splash zone,
// a large one doesn't waterproof every wall to the ceiling.

// The old parametric bathroom model lived here. It was replaced on 2026-09-04 by
// buildBathroom() further down, which assembles the same quote from the real
// Törzsárlista line items instead of invented per-m² averages.

// Turn an itemised list (each line already carries its own low/high range) + area
// into the standard quote object every renderer/e-mail/test consumes. The total
// range is the SUM of the per-item ranges, so the headline band and the breakdown
// are always consistent. All amounts are NET (nettó).
function finalize(items, A, cur = "huf") {
    const step = (MONEY[cur] || MONEY.huf).total;
    const total = items.reduce((s, i) => s + i.amount, 0);
    const low = roundTo(items.reduce((s, i) => s + i.low, 0), step);
    const high = roundTo(items.reduce((s, i) => s + i.high, 0), step);
    const perM2 = Math.round(total / A); // implied labour rate per m² (sanity check)
    return { items, total, low, high, area: A, perM2, currency: cur };
}

// Regional cost index from the Hungarian postal code. Labour (≈half of a turnkey
// total) swings ~15–20% by region - Budapest highest, the eastern/southern Alföld
// lowest - so the same flat shouldn't quote identically in Zugló and in a village.
// Applied to the WHOLE quote, the net effect on the total stays a modest ±~8%.
// Verified spread: Budapest ~70–75k Ft/m² labour vs kisvárosok ~55–65k (qjob/Daibau).
// Austrian postcodes are ALSO 4 digits (1010 Wien, 8010 Graz), so a raw digit
// match would silently price a Vienna job as Budapest. If the answer carries any
// Austria signal we skip the Hungarian index and stay on the baseline.
const AT_LOCATION = /(ausztria|austria|österreich|oesterreich|osztrák|\bAT\b|\bA-\s?\d{4}\b|wien|vienna|bécs|graz|linz|salzburg|innsbruck|klagenfurt|villach|\bwels\b|sankt pölten|st\.? pölten|dornbirn|wiener neustadt|steyr|feldkirch|bregenz|eisenstadt|leoben|krems|amstetten|kufstein|schwechat|neusiedl|oberwart|güssing|jennersdorf|mattersburg|hallein|braunau|traun|mödling|tulln|hollabrunn|burgenland|steiermark|tirol|vorarlberg|kärnten|niederösterreich|oberösterreich)/i;

function regionMultiplier(postal) {
    const raw = String(postal || "");
    if (AT_LOCATION.test(raw)) return 1.0; // Austrian job → no Hungarian region index
    const d = raw.replace(/\D/g, "");
    // Now that a town name is a valid answer, catch the one that actually moves
    // the price when it arrives without a postcode.
    if (!/^\d{4}$/.test(d)) return /(budapest|\bbp\b)/i.test(raw) ? 1.08 : 1.0;
    const f = d[0];
    if (f === "1") return 1.08;               // Budapest
    if (f === "2" || f === "8" || f === "9") return 1.03; // Pest agglomeráció + nyugat-Dunántúl + Balaton
    if (f === "3" || f === "4" || f === "5") return 0.94; // észak-kelet + Alföld (alacsonyabb munkadíj)
    return 1.0;                               // 6xxx, 7xxx - országos átlag körül
}

// Apply the regional index to a finished quote: scale each line so the breakdown
// still sums to the total, then recompute the band-based range. No-op at mult 1.0
// (so the unit tests, which pass no postal code, are unaffected).
function withRegion(quote, postal) {
    const mult = regionMultiplier(postal);
    if (mult === 1.0) return quote;
    const items = quote.items.map((i) => ({
        label: i.label,
        amount: round1000(i.amount * mult),
        low: round1000(i.low * mult),
        high: round1000(i.high * mult),
    }));
    return finalize(items, quote.area);
}

// ---------------------------------------------------------------------------
//  Full flat / family-house renovation (lakas | haz). Composed from per-m²
//  shell trades + discrete add-ons (doors, bathrooms, kitchen, windows, heating,
//  klíma). Grouped into logical, customer-readable lines.
//
//  ESSENTIAL inputs (always asked): size, scope, tier, bathrooms, kitchen.
//  REFINE inputs (opt-in, default = neutral/none so they only ADD when chosen):
//  walls, condition, floortile, windows, heatingsys, klima.
//  This makes the early ballpark realistic, then the refine answers move it.
// ---------------------------------------------------------------------------
function buildFullReno(sel, pt) {
    const A = areaOfType(sel.size, pt);
    const tier = validTier(sel.tier);
    // 3-level scope; unknown defaults to the realistic MIDDLE (részleges).
    const scope = ["kozmetikai", "reszleges", "teljes"].includes(sel.scope) ? sel.scope : "reszleges";
    const rooms = Math.max(1, Math.round(A / 18)); // helyiségszám-becslés
    const items = [];
    const add = (label, huf, kind) => { if (huf > 0) items.push(makeItem(label, huf, kind)); };

    // Refine multipliers (neutral when the refine answer isn't given).
    const condMult = RENO.conditionMult[sel.condition] || 1.0;
    const floorMult = RENO.floortileMult[sel.floortile] || 1.0;

    if (scope === "kozmetikai") {
        const c = RENO.cosmetic;
        add("Bontás, előkészítés, takarítás", (c.fixed + c.patch[tier] * A) * condMult, "shell");
        add("Burkolás / új padló (anyag + munka)", c.floor[tier] * A * floorMult, "floor");
        add("Festés, glettelés", c.paint[tier] * A, "paint");
        add("Villany frissítés (lámpák, kapcsolók, dugaljak)", c.elec[tier] * A, "electrical");
    } else {
        const f = scope === "teljes" ? RENO.full : RENO.partial;
        const demoLbl = scope === "teljes" ? "Bontás, törmelékelszállítás, konténer" : "Részleges bontás, törmelékelszállítás";
        const wallLbl = scope === "teljes" ? "Falazás, vakolás, gipszkarton, glettelés" : "Faljavítás, glettelés, gipszkarton";
        const mepLbl = scope === "teljes" ? "Gépészet (víz, csatorna) és villanyszerelés" : "Gépészet és villany (részleges)";
        add(demoLbl, f.demo[tier] * A * condMult + f.fixed, "demo");
        add(wallLbl, f.masonry[tier] * A, "shell");
        add("Aljzatkiegyenlítés és vízszigetelés", f.screed[tier] * A, "prep");
        add(mepLbl, (f.plumb[tier] + f.elec[tier]) * A, "plumbing");
        add("Burkolás és padló (anyag + munka)", f.floor[tier] * A * floorMult, "floor");
        add("Festés, glettelés", f.paint[tier] * A, "paint");
        add(`Beltéri ajtók (${rooms} db)`, RENO.door[tier] * rooms, "doors");
    }

    // REFINE - building/removing walls + relocating wet-points.
    if (sel.walls === "igen") add("Falátalakítás és vizes pont áthelyezés", RENO.wallsPerM2 * A + RENO.wallsRelocate, "walls");

    // Bathroom(s) fit-out (szaniter + vízszigetelés), per the bathroom count.
    const baths = bathCount(sel.bathrooms);
    add(`Fürdőszoba/WC szaniter és vízszigetelés (${baths} db)`, RENO.bathroomFitout[tier] * baths, "bathroom");

    // New kitchen furniture + worktop (a konyha gépészete/villanya a héjban van).
    // Flat/house flow doesn't ask cabinet length, so assume a typical ~4 fm run.
    if (sel.kitchen === "uj") {
        const k = RENO.kitchen;
        add("Konyhabútor és munkalap (vízkiállás-igazítással)", (k.furniturePerM[tier] + k.countertopPerM[tier]) * 4, "kitchen");
    }

    // REFINE - window replacement (becsült darabszám az alapterületből).
    if (sel.windows === "csere") {
        const wc = Math.max(2, Math.round(A / 12));
        add(`Nyílászárócsere - ablakok (${wc} db)`, RENO.window[tier] * wc, "windows");
    }

    // REFINE - heating-system upgrade.
    if (sel.heatingsys === "radiator") add(`Fűtéskorszerűsítés - radiátorcsere (${rooms} db)`, RENO.radiatorEach * rooms, "heatsys");
    else if (sel.heatingsys === "padlofutes") add("Vizes padlófűtés (rendszer + szerelés)", RENO.underfloorPerM2 * A + RENO.underfloorFixed, "heatsys");
    else if (sel.heatingsys === "hoszivattyu") add("Hőszivattyús fűtési rendszer (komplett)", RENO.heatpumpSystem, "heatsys");

    // REFINE - air conditioning.
    if (sel.klima === "igen") add("Klíma (beltéri egység, szereléssel)", RENO.klimaEach, "klima");

    return finalize(items, A);
}

// ---------------------------------------------------------------------------
//  Kitchen as its own project (konyha).
// ---------------------------------------------------------------------------
function buildKitchen(sel) {
    const A = areaOfType(sel.size, "konyha");
    const tier = validTier(sel.tier);
    const k = RENO.kitchen;
    const items = [];
    const add = (label, huf, kind) => { if (huf > 0) items.push(makeItem(label, huf, kind)); };

    add("Bontás, burkolás, gépészet- és villanykiállás, padló, festés", k.base[tier] * A + k.fixed, "shell");
    if (sel.furniture === "igen") {
        // Cabinets + worktop scale with RUNNING METRES (folyóméter), the accurate
        // driver - not floor m². Unknown → ~4 fm (a typical kitchen run).
        const fm = KITCHEN_FM_METRES[sel.kitchen_fm] || 4;
        add(`Konyhabútor és munkalap (${String(fm).replace(".", ",")} fm)`, (k.furniturePerM[tier] + k.countertopPerM[tier]) * fm, "kitchen");
    }
    if (sel.appliances === "igen") add("Beépített gépek (sütő, főzőlap, páraelszívó stb.)", k.appliances[tier], "kitchen");
    if (sel.layout === "athelyez") add("Víz/gáz/villany pontok áthelyezése (vízkiállás)", k.moveExtra, "plumbing");

    return finalize(items, A);
}
// Kitchen cabinet run length (folyóméter) per stored token.
const KITCHEN_FM_METRES = { fm_2_3: 2.5, fm_3_4: 3.5, fm_4_5: 4.5, fm_5_6: 5.5, fm_6p: 7, nem_tudom: 4 };

// ---------------------------------------------------------------------------
//  Single room / space (szoba). roomscope: festes | festes_padlo | teljes.
// ---------------------------------------------------------------------------
function buildRoom(sel) {
    const A = areaOfType(sel.size, "szoba");
    const tier = validTier(sel.tier);
    const rs = ["festes", "festes_padlo", "teljes"].includes(sel.roomscope) ? sel.roomscope : "teljes";
    const c = RENO.cosmetic;
    const items = [];
    const add = (label, huf, kind) => { if (huf > 0) items.push(makeItem(label, huf, kind)); };

    add("Előkészítés, takarítás", c.fixed, "shell");
    add("Festés, glettelés", c.paint[tier] * A, "paint");
    if (rs === "festes_padlo" || rs === "teljes") add("Új padló (anyag + munka)", c.floor[tier] * A, "floor");
    if (rs === "teljes") {
        add("Villany frissítés (lámpák, kapcsolók, dugaljak)", c.elec[tier] * A, "electrical");
        add("Beltéri ajtó (1 db)", RENO.door[tier], "doors");
        add("Apró javítások", c.patch[tier] * A, "shell");
    }

    return finalize(items, A);
}

// Dispatch to the right pricing engine by project type. No projectType (or
// "furdo") → the original bathroom engine, so existing callers/tests are unchanged.
//  WHAT THE NUMBER MEANS - `quote.basis`:
//    "labour"  - munkadíj only, materials bought by the customer. This is what
//                the Törzsárlista prices, and what NM Bau actually invoices.
//    "turnkey" - the old blended model, materials included in the rate.
//  The bathroom flow is "labour" (rebuilt from the price list, 2026-09-04). The
//  flat / house / kitchen / room flows are still "turnkey": their rates are
//  blended "anyag + munka" figures that cannot be split without inventing the
//  split, and the price list does not cover kitchen units, windows, heat pumps
//  or air conditioning (NM Bau prices those individually). The customer copy
//  reads `basis` and says which one it is, so neither flow can overclaim.
function buildQuote(sel, opts) {
    const cur = (opts && opts.currency) === "eur" ? "eur" : "huf";
    const pt = sel && sel.projectType;
    let q;
    if (pt === "lakas" || pt === "haz") q = convertQuote(buildFullReno(sel, pt), cur, "turnkey");
    else if (pt === "konyha") q = convertQuote(buildKitchen(sel), cur, "turnkey");
    else if (pt === "szoba") q = convertQuote(buildRoom(sel), cur, "turnkey");
    else { q = buildBathroom(sel, cur); q.basis = "labour"; }
    // The regional index is a HUNGARIAN labour-market adjustment (Budapest vs
    // Alföld). The Austrian euro column is its own market price, so a Hungarian
    // postcode must never scale it.
    if (cur === "eur") return q;
    const r = withRegion(q, sel && sel.postal_code);
    r.basis = q.basis;
    return r;
}

// The flows still on the old model are computed in Ft. When the conversation is
// in German or English we owe the customer a euro figure, so convert at the
// price list's OWN median HUF:EUR ratio - the same relationship NM Bau applied
// when they set their Austrian column, rather than a market FX rate.
// LIMITATION: that ratio was measured on labour rates, so a converted turnkey
// quote is rougher than the bathroom flow's real per-item Austrian pricing.
function convertQuote(q, cur, basis) {
    if (cur !== "eur") { q.basis = basis; return q; }
    const step = MONEY.eur.item;
    const items = q.items.map((i) => ({
        label: i.label,
        amount: roundTo(i.amount / FT_PER_EUR_FALLBACK, step),
        low: roundTo(i.low / FT_PER_EUR_FALLBACK, step),
        high: roundTo(i.high / FT_PER_EUR_FALLBACK, step),
    }));
    const out = finalize(items, q.area, "eur");
    out.basis = basis;
    return out;
}

// ---------------------------------------------------------------------------
//  BATHROOM - assembled line by line from the real Törzsárlista.
//
//  This is the piece that used to be guesswork. Instead of inventing per-m²
//  averages, every line below is a quantity against a rate NM Bau actually
//  charges. LABOUR ONLY: the tiles, WC, basin, bath, screen and taps are the
//  customer's own purchase (confirmed by NM Bau 2026-09-04), so this total is a
//  munkadíj total and the customer copy says so.
//
//  The customer answers only five things, so anything not asked is taken at the
//  most common configuration for a full bathroom gut - a genuine renovation
//  always carries these trades. What is deliberately NOT in here, per NM Bau on
//  2026-09-08: the DN100 extractor fan (few customers ask for one), the call-out
//  charge, and anything electrical (subcontracted, quoted separately). `tier` cannot move a RATE (the price list has
//  one price per job), so it moves the SPEC instead: what a basic, mid and
//  premium bathroom actually contains.
// ---------------------------------------------------------------------------
function buildBathroom(sel, cur = "huf") {
    const A = areaOf(sel.size);
    const tier = ["basic", "mid", "premium"].includes(sel.tier) ? sel.tier : "mid";
    // Unknown washing choice falls back to the CHEAPEST fit-out so an "I don't
    // know" never rounds the quote upward.
    const washing = ["zuhany", "zuhanykabin", "kad", "mindketto"].includes(sel.washing) ? sel.washing : "zuhanykabin";
    const moved = sel.layout === "athelyez";
    const { wall, total: T } = tiledSurface(A);
    const perimeter = roomPerimeter(A);            // for the running-metre items
    const wetWall = Math.min(9, Math.max(4, A));   // tanked wall area behind shower/bath

    const B = new Bill(cur);
    const hasShower = washing !== "kad";
    const hasBath = washing === "kad" || washing === "mindketto";
    // "zuhany" is now a low-profile cultured-marble tray with a glass wall, not
    // a built tiled shower - NM Bau stopped building those (2026-09-06). Both
    // shower options therefore get a tray; only the enclosure differs.
    const glassWall = washing === "zuhany";        // tálca + szabadonálló üvegfal
    const concealedWc = tier !== "basic";          // fali WC + beépített tartály

    // --- Site protection: the workbook sizes this S/M/L/XL by job size ---
    B.add(A <= 4 ? "takarasi_munkak_utvonalvedelem_porvedo_ajto"
        : A <= 8 ? "takarasi_munkak_utvonalvedelem_porvedo_ajto2"
        : A <= 12 ? "takarasi_munkak_utvonalvedelem_porvedo_ajto3"
        : "takarasi_munkak_utvonalvedelem_porvedo_ajto4");

    // --- Bontás ---
    // Per m² of wall. The workbook's 100 000 Ft lump sum for the same work is a
    // one-off NM Bau has used on a bathroom or two, not the normal charge
    // (Milán, 2026-09-08). The floor-tile row is still the lump sum - no m² rate
    // for it has been confirmed yet.
    B.add("falicsempe_bontasa_m2", wall);
    B.add("jarolap_padlolap_bontasa");
    B.add("mosdo_es_alsoszekreny_bontasa_elszallitassal");
    B.add("wc_bontasa_elszallitassal");
    if (hasShower) B.add("meglevo_zuhanyzo_bontasa_eltavolitasa_es_csa");
    if (hasBath) B.add("meglevo_kad_bontasa_eltavolitasa_es_csatlako");
    B.add("radiator_bontasa_elszallitassal");
    B.add("furdoszobai_kiegeszitok_bontasa_elszallitass");
    B.add("tukor_bontasa_elszallitassal");
    B.add("hulladek_es_leszerelt_szaniterek_osszegyujte");

    // --- Víz- és csatornaszerelés ---
    B.add("mosdo_hideg_melegviz_es_csatornakiallas_kial");
    if (hasShower) B.add("hideg_es_melegviz_kiallas_kialakitasa_zuhany");
    if (hasBath) B.add("hideg_es_melegviz_kiallas_kialakitasa_kadcsa");
    // "Alapszerelés" and "beépítés/felszerelés" are separate jobs, and a WC needs
    // both (Milán, 2026-09-08): the rough-in forms the waste pipe and the cold
    // feed, the fitting puts the ceramic on it. Priced as a pair either way -
    // a frame + pan for the concealed cistern, a rough-in + unit for a monoblock.
    B.add(concealedWc ? "wc_allvany_beepitese_es_bekotese" : "monoblokkos_tartalyos_wc_alapszerelese_hideg");
    if (hasShower) B.add("zuhanytalca_beepitese_es_bekotese");
    if (hasBath) B.add("kad_beepitese_es_bekotese");
    B.add("mosogep_hidegviz_es_csatornakiallas_kialakit");
    // Moving the layout means re-routing the supply, not just reconnecting it.
    if (moved) B.add("kad_zuhany_vizvezetek_athelyezese_megtoldasa");
    if (tier === "premium") B.add("egymedences_mosdo_dupla_mosdo_vizvezetek_ath");

    // --- Fűtés + szellőzés ---
    if (tier === "basic") {
        B.add("radiator_csereje");
    } else {
        B.add("torolkozoszarito_radiator_alapszereles");
        B.add("torolkozoszarito_radiator_felszerelese");
    }
    if (sel.heating === "igen") B.add("elektromos_futokabel_fektetese_jarolap_ala", A);

    // --- Előkészítés / kőműves ---
    B.add("falfeluletek_es_aljzatbeton_melyalapozasa", T);
    B.add("fogado_falfeluletek_kezi_simitovakolasa", wall);
    B.add("aljzatbeton_onterulo_aljzatkiegyenlitese", A);
    B.add("kenheto_vizszigeteles_kialakitasa_a_zuhanyte", A + wetWall);
    B.add("hajlaterosito_szalag_agyazasa", perimeter);
    B.add("falhornyok_visszajavitasa");
    if (hasShower) B.add("zuhanytalca_perem_vizszigetelese");
    if (concealedWc) B.add("wc_allvany_dobozolasa_impregnalt_gipszkarton");
    if (hasBath) B.add("akril_kad_elotetfal_falazasa_ytongbol");
    if (tier === "premium") {
        B.add("melyitett_polc_niche_kialakitasa_a_zuhanyter");
    }

    // --- Hidegburkolás ---
    B.add("falak_hidegburkolasa_standard_meretu_lappal", wall);
    B.add("padlo_hidegburkolasa_standard_meretu_lappal", A);
    B.add("fugazas", T);
    if (hasBath) B.add("kad_elotetfal_hidegburkolasa");

    // --- Festés (a mennyezet, ami nem burkolt) ---
    B.add("falfelulet_glettelese", A);
    B.add("peneszedesgatlo_latex_festes_2_retegben", A);

    // --- Villanyszerelés ---
    B.add("foldelt_dugalj_kialakitasa", tier === "premium" ? 3 : 2);
    B.add("kapcsolhato_mennyezeti_lampa_kiallas_kialaki");
    B.add("allando_aramellatas_kialakitasa_mosdoszekren");

    // --- Szerelvényezés ---
    if (concealedWc) {
        B.add("wc_csesze_felszerelese");
        B.add("wc_nyomolap_felszerelese");
    } else {
        B.add("monoblokkos_tartalyos_wc_beepitese");
    }
    B.add("mosdoszekreny_felszerelese");
    B.add("mosdocsaptelep_felszerelese");
    if (hasShower) B.add("zuhanycsaptelep_es_zuhanyszett_felszerelese");
    if (hasBath) B.add("kadcsaptelep_felszerelese");
    if (glassWall) B.add("zuhanyfal_szabadonallo_uvegfal_felszerelese");
    else if (hasShower) B.add("zuhanykabin_felszerelese");
    if (hasBath) B.add("kadparavan_felszerelese");
    B.add("tukros_szekreny_felszerelese");
    B.add("furdoszobai_wc_kiegeszitok_felszerelese");

    // --- Befejező + kiszállás ---
    B.add("szaniter_szilikonozas_hezagtomites", perimeter * 0.7);

    return finalize(B.toItems(), A, cur);
}

// Exported for unit testing the pricing math (no effect in production).
export { detectMessageLang, conversationLang, renderCustomerQuote, locationIssue, regionMultiplier, buildQuote, buildBathroom, buildFullReno, buildKitchen, buildRoom, areaOf, areaOfType, tiledSurface, budgetBandsFor, resolveBudget };

// ---------------------------------------------------------------------------
//  FLOW CONFIG - every project type asks its OWN question set. The backend drives
//  the order, the chips and the value-mapping, so the right buttons always appear
//  and answers are recorded instantly (not reliant on the AI's one-step-behind
//  state block). The AI only writes the question TEXT.
// ---------------------------------------------------------------------------

// ESSENTIAL project questions, in order. Enough to produce a ballpark range.
// Shared tail (budget, timeline) + contact are appended by fieldOrder(). A couple
// of fields are conditional on earlier answers (e.g. kitchen cabinet length only
// matters if the customer wants new furniture), so this takes the state too.
function projectFields(pt, sel = {}) {
    switch (pt) {
        // The built, tiled shower used to rule out electric underfloor heating and
        // the question was skipped for it. NM Bau stopped building those
        // (2026-09-06) - a low-profile tray sits on the same floor as everything
        // else, so underfloor heating is on the table again for every option.
        case "furdo":  return ["size", "tier", "washing", "layout", "heating"];
        case "lakas":  return ["size", "scope", "tier", "bathrooms", "kitchen"];
        case "haz":    return ["size", "scope", "tier", "bathrooms", "kitchen"];
        case "konyha": return ["size", "tier", "furniture",
            ...(sel.furniture === "igen" ? ["kitchen_fm"] : []), "appliances", "layout"];
        case "szoba":  return ["size", "roomscope", "tier"];
        default:       return [];
    }
}
// OPTIONAL refine questions (only lakas/haz). Asked after contact, behind a gate;
// each one tightens the live estimate. Defaults are neutral so skipping them keeps
// the price honest (low), and answering only ever ADDS the things they actually want.
function refineFields(pt) {
    if (pt === "lakas") return ["walls", "condition", "floortile", "windows", "heatingsys", "klima"];
    if (pt === "haz")   return ["walls", "condition", "floortile", "windows", "heatingsys", "klima"];
    return [];
}
const hasRefine = (pt) => refineFields(pt).length > 0;
const TAIL_FIELDS = ["timeline"];
// Contact order is deliberate, lowest friction first: the name is safe to give,
// the postal code feels like it benefits them ("do you cover my area?"), and the
// phone number - the one people balk at - comes last, at maximum sunk cost.
const CONTACT_FIELDS = ["name", "postal_code", "email", "phone"];
// Budget is asked LAST - after the essentials, contact and any refine questions -
// and it is OPTIONAL. Asking "what's your budget?" early reads as a filter and
// scares people off before they've seen anything; by the end they've invested a
// few minutes and it's a fair question. Skipping it costs nothing: the price is
// computed from the project answers, never from the budget.
const BUDGET_FIELD = "budget";

// Full ordered field list for the current state. Until a project type is chosen,
// the only question is projectType. For types with a refine stage, a gate question
// ("shall we refine?") sits after contact; the refine fields are only required
// once the customer opts in (refine_gate === "yes"). Budget always comes last.
function fieldOrder(sel) {
    const pt = sel && sel.projectType;
    if (!pt) return ["projectType"];
    const base = ["projectType", ...projectFields(pt, sel), ...TAIL_FIELDS, ...CONTACT_FIELDS];
    if (hasRefine(pt)) {
        base.push("refine_gate");
        if (sel.refine_gate === "yes") base.push(...refineFields(pt));
    }
    base.push(BUDGET_FIELD);
    return base;
}
// Fields that count toward the progress bar: the ESSENTIALS + timeline. Contact,
// the optional refine stage and the optional budget question are deliberately
// excluded, so the bar hits 100% when the core is done (and everything after is
// framed as a bonus).
function progressFields(sel) {
    const pt = sel && sel.projectType;
    if (!pt) return ["projectType"];
    return ["projectType", ...projectFields(pt, sel), ...TAIL_FIELDS];
}

// Backend decides when the quote is complete - independent of the AI model.
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
const BUDGET_UNSURE_LABEL = "Még nem tudom";

// Round a Ft amount to a "nice" round million figure for a budget chip label.
function niceMillion(ft) {
    const m = ft / 1_000_000;
    const step = m < 10 ? 0.5 : m < 30 ? 1 : 5;
    return Math.max(step, Math.round(m / step) * step);
}
const fmtM = (m) => (Number.isInteger(m) ? String(m) : m.toFixed(1).replace(".", ","));

// ADAPTIVE budget bands. Instead of a fixed per-type list, the offered amounts are
// sized from the running ballpark computed from what the customer has ALREADY told
// us (size, scope/tier, fixtures, ...). So a small basic job and a big premium one
// never see the same options - the bands bracket the deterministic estimate. Falls
// back to the fixed per-type scale only if the ballpark can't be computed yet.
function budgetBandsFor(sel, lang = "hu") {
    const w = BUDGET_WORDS[normLang(lang)] || BUDGET_WORDS.hu;
    const cur = currencyFor(lang);
    const u = budgetUnit(lang, cur);
    let center = null;
    try {
        const pt = sel && sel.projectType;
        const filled = (k) => sel[k] != null && String(sel[k]).trim() !== "";
        if (pt && projectFields(pt, sel).every(filled)) center = buildQuote(sel, { currency: currencyFor(lang) }).total;
    } catch (e) { center = null; }

    if (!center || !isFinite(center) || center <= 0) {
        const sc = budgetScale(sel && sel.projectType);
        return { adaptive: false, chips: fixedBudgetChips(sc, lang, cur), scale: sc };
    }

    const t1 = budgetStep(center * 0.85, cur);
    let t2 = budgetStep(center * 1.05, cur);
    let t3 = budgetStep(center * 1.35, cur);
    const bump = (m) => cur === "eur" ? m + 500 : m + (m < 10 ? 0.5 : m < 30 ? 1 : 5);
    if (t2 <= t1) t2 = bump(t1);
    if (t3 <= t2) t3 = bump(t2);

    const chips = [
        w.under(budgetText(t1, cur), u),
        w.range(budgetText(t1, cur), budgetText(t2, cur), u),
        w.range(budgetText(t2, cur), budgetText(t3, cur), u),
        w.over(budgetText(t3, cur), u),
        w.unsure,
        w.skip, // the question is optional - always offer a way out
    ];
    const mul = cur === "eur" ? 1 : 1e6;
    return { adaptive: true, chips, thresholds: [t1 * mul, t2 * mul, t3 * mul] };
}

// Map a typed/clicked budget answer to the STORED value, given the adaptive bands.
// We store the human-readable band label directly (no token), so the owner e-mail
// shows exactly what the customer picked and the value is robust to model drift.
function resolveBudget(answer, sel, lang = "hu") {
    const a = String(answer || "").trim();
    if (!a) return null;
    const b = budgetBandsFor(sel, lang);
    const hit = b.chips.find((c) => c.toLowerCase() === a.toLowerCase());
    if (hit) return hit; // store the (localized) band label the customer picked
    // The question is optional: any way of declining counts as an answer, so the
    // quote is never blocked by it.
    if (/ink[aá]bb nem|nem mondan[aá]m|nem szeretn[eé]m megadni|rather not|lieber nicht|keine angabe|skip|kihagy/i.test(a)) {
        return BUDGET_WORDS[normLang(lang)].skip;
    }
    // "Not sure" in any of the three languages -> the localized unsure label.
    if (/m[eé]g nem tud|nem tudom|not sure|wei(ß|ss) (noch )?nicht/i.test(a)) return BUDGET_WORDS[normLang(lang)].unsure;
    // Free-typed amount: store the parsed sum itself (language-neutral).
    const amt = parseBudgetAmount(a);
    if (amt != null && amt >= 50000) return formatHuf(amt);
    // Budget is the LAST question, so an unparseable answer here would leave the
    // customer stuck one step from their price. If it isn't a question, store it
    // verbatim - the owner sees exactly what they wrote, and the number is never
    // computed from the budget anyway. Real questions fall through so the model
    // can answer them and re-ask.
    const isQuestion = /\?/.test(a) ||
        /^(mi|mit|mi[eé]rt|hogyan|mennyi|milyen|what|why|how|which|was|wie|warum|welche)\b/i.test(a);
    return isQuestion ? null : a.slice(0, 120);
}

// Quick-reply chip labels per fixed-choice field.
const CHIP_LABELS = {
    projectType: ["Fürdőszoba", "Konyha", "Teljes lakás", "Családi ház", "Egy szoba"],
    tier: ["Alap / takarékos", "Közepes", "Prémium", "Nem tudom"],
    washing: ["Műmárvány zuhanytálca (üvegfallal)", "Zuhanykabin", "Kád", "Kád és zuhany", "Nem tudom"],
    layout: ["Marad a mostani elrendezés", "Áthelyezzük", "Nem tudom"],
    heating: ["Kérek padlófűtést", "Nem szükséges", "Nem tudom"],
    scope: ["Teljes (mindent cserélünk)", "Részleges (felületek + néhány szakág)", "Kozmetikai (festés, burkolat)", "Nem tudom"],
    roomscope: ["Csak festés", "Festés + új padló", "Teljes felújítás", "Nem tudom"],
    bathrooms: ["1 fürdő/WC", "2 fürdő/WC", "3 vagy több", "Nem tudom"],
    kitchen: ["Új konyhabútorral", "Felújítás bútor nélkül", "Konyhát nem érinti", "Nem tudom"],
    windows: ["Igen, ablakcsere kell", "Nem, maradnak", "Nem tudom"],
    heatingsys: ["Marad a mostani", "Radiátorcsere", "Padlófűtés", "Hőszivattyús rendszer", "Nem tudom"],
    furniture: ["Igen, új bútor kell", "Nem, marad", "Nem tudom"],
    kitchen_fm: ["2–3 fm", "3–4 fm", "4–5 fm", "5–6 fm", "6 fm felett", "Nem tudom"],
    appliances: ["Igen, gépekkel", "Nem, saját gépek", "Nem tudom"],
    timeline: ["Amint lehet", "Egy hónapon belül", "Fél éven belül", "Még idén", "Még nem tudom"],
    // --- Refine stage ---
    refine_gate: ["Igen, pontosítsuk", "Most nem, köszönöm"],
    walls: ["Igen, falakat is mozgatunk", "Nem, maradnak a falak", "Nem tudom"],
    condition: ["Új építésű (15 évnél nem öregebb)", "Felújítandó (20 évnél öregebb)", "Régi, elhasználódott (30+ év)", "Nem tudom"],
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
    washing: { "műmárvány zuhanytálca (üvegfallal)": "zuhany", "zuhanykabin": "zuhanykabin", "kád": "kad", "kád és zuhany": "mindketto", "nem tudom": "nem_tudom" },
    layout: { "marad a mostani elrendezés": "marad", "áthelyezzük": "athelyez", "nem tudom": "nem_tudom" },
    heating: { "kérek padlófűtést": "igen", "nem szükséges": "nem", "nem tudom": "nem_tudom" },
    scope: { "teljes (mindent cserélünk)": "teljes", "részleges (felületek + néhány szakág)": "reszleges", "kozmetikai (festés, burkolat)": "kozmetikai", "nem tudom": "nem_tudom" },
    roomscope: { "csak festés": "festes", "festés + új padló": "festes_padlo", "teljes felújítás": "teljes", "nem tudom": "nem_tudom" },
    bathrooms: { "1 fürdő/wc": "1", "2 fürdő/wc": "2", "3 vagy több": "3p", "nem tudom": "nem_tudom" },
    kitchen: { "új konyhabútorral": "uj", "felújítás bútor nélkül": "felujitas", "konyhát nem érinti": "nem", "nem tudom": "nem_tudom" },
    windows: { "igen, ablakcsere kell": "csere", "nem, maradnak": "marad", "nem tudom": "nem_tudom" },
    heatingsys: { "marad a mostani": "marad", "radiátorcsere": "radiator", "padlófűtés": "padlofutes", "hőszivattyús rendszer": "hoszivattyu", "nem tudom": "nem_tudom" },
    furniture: { "igen, új bútor kell": "igen", "nem, marad": "nem", "nem tudom": "nem_tudom" },
    kitchen_fm: { "2–3 fm": "fm_2_3", "3–4 fm": "fm_3_4", "4–5 fm": "fm_4_5", "5–6 fm": "fm_5_6", "6 fm felett": "fm_6p", "nem tudom": "nem_tudom" },
    appliances: { "igen, gépekkel": "igen", "nem, saját gépek": "nem", "nem tudom": "nem_tudom" },
    timeline: { "amint lehet": "t_asap", "egy hónapon belül": "t_month", "fél éven belül": "t_halfyear", "még idén": "t_thisyear", "még nem tudom": "t_unsure" },
    // --- Refine stage ---
    refine_gate: { "igen, pontosítsuk": "yes", "most nem, köszönöm": "no" },
    walls: { "igen, falakat is mozgatunk": "igen", "nem, maradnak a falak": "nem", "nem tudom": "nem_tudom" },
    condition: { "új építésű (15 évnél nem öregebb)": "ujszeru", "felújítandó (20 évnél öregebb)": "lakott", "régi, elhasználódott (30+ év)": "regi", "nem tudom": "nem_tudom" },
    floortile: { "inkább csempe": "tobb_csempe", "fele-fele": "fele_fele", "inkább laminált/parketta": "tobb_laminalt", "nem tudom": "nem_tudom" },
    klima: { "igen, kérek klímát": "igen", "nem szükséges": "nem", "nem tudom": "nem_tudom" },
};

// Chips for a given field, in the current project-type context.
function chipsFor(field, sel, lang = "hu") {
    const L = normLang(lang);
    const pt = sel && sel.projectType;
    if (field === "size") {
        if (L !== "hu" && SIZE_CHIPS_I18N[L] && SIZE_CHIPS_I18N[L][pt]) return SIZE_CHIPS_I18N[L][pt];
        return SIZE_CHIPS[pt] || SIZE_CHIPS.furdo;
    }
    if (field === "budget") return budgetBandsFor(sel, L).chips;
    if (L !== "hu" && CHIP_LABELS_I18N[L] && CHIP_LABELS_I18N[L][field]) return CHIP_LABELS_I18N[L][field];
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

// Light e-mail sanity check. Goal: catch the obvious cases - a malformed address
// and (especially) a MISSPELLED gmail.com - so a bounced lead doesn't slip
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
    // Anything written as "gmail.<not com>" is a typo - gmail only uses .com.
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

// Location sanity check. NM Bau works in Hungary AND in Austria, so this field
// accepts ANY kind of location: a HU/AT postcode, a settlement name, a district,
// "Wien 1010", "A-8010 Graz", "Sopron környéke" - all fine. We only reject the
// two things that are clearly not a location: an empty/one-character answer, and
// a long digit run (a phone number bleeding into the field).
// Returns "format" | null.
function locationIssue(loc) {
    const s = String(loc || "").trim();
    if (s.length < 2 || s.length > 80) return "format";
    const digits = s.replace(/\D/g, "");
    const letters = s.replace(/[^\p{L}]/gu, "");
    // Digits only → must look like a postcode (HU/AT 4, DE 5, PL 5, UK-ish 6).
    if (!letters) return /^\d{3,6}$/.test(digits) ? null : "format";
    // Has letters but is dominated by digits → almost certainly a phone number.
    if (digits.length > 6 && letters.length < 2) return "format";
    return null;
}

// Given the field the customer is answering + their message + the current state,
// return the canonical value. Choice fields match the clicked chip label
// (case-insensitive). Size accepts a per-type band chip OR a typed number. Budget
// accepts a per-scale band OR a typed amount. Contact fields take the text as-is.
function mapAnswer(field, answer, sel, lang = "hu") {
    if (typeof answer !== "string" || !answer.trim()) return null;
    const a = answer.trim();
    const pt = sel && sel.projectType;
    if (field === "size") {
        // Reverse map merged across HU/EN/DE, so a clicked chip resolves in any
        // language; a free-typed number falls through to parseArea.
        const map = SIZE_REVERSE[pt] || SIZE_REVERSE.furdo;
        const chip = map[a.toLowerCase()];
        if (chip) return chip;
        const n = parseArea(a);
        return n != null ? String(n) : null;
    }
    if (field === "budget") return resolveBudget(a, sel, lang);
    if (CHOICE_REVERSE[field]) return CHOICE_REVERSE[field][a.toLowerCase()] || null;
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

// Fields the BACKEND owns deterministically - the model must never set them, so we
// strip them from every model-emitted DATA block. `budget` is computed/stored as an
// adaptive band label here, so a stale model token can't clobber it across turns.
function stripManaged(s) {
    if (s && typeof s === "object") delete s.budget;
    return s;
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

function nextChips(sel, lang = "hu") {
    const f = pendingField(sel);
    return f ? chipsFor(f, sel, lang) : [];
}

// What each field is asking about, in one short phrase. Used to tell the model
// - every single turn - exactly which question it is allowed to ask next.
// Without this the model tracks its own position in the script and the backend
// tracks another, and the two drift apart: the text asks about the timeline
// while the buttons still offer budget bands. The backend owns the order.
const FIELD_TOPIC = {
    projectType: "mit szeretne felújítani (fürdő / konyha / lakás / ház / szoba)",
    size: "a helyiség vagy ingatlan mérete négyzetméterben",
    tier: "a kivitelezési szint (alap / közepes / prémium)",
    washing: "zuhanyzót vagy kádat szeretne-e",
    layout: "marad-e a mostani elrendezés, vagy áthelyezzük a vizes pontokat",
    heating: "kér-e elektromos padlófűtést",
    scope: "milyen mély felújítás kell (teljes / részleges / kozmetikai)",
    roomscope: "mit szeretne a szobával (csak festés / festés + padló / teljes)",
    bathrooms: "hány fürdőszoba vagy WC van",
    kitchen: "mi legyen a konyhával",
    furniture: "kell-e új konyhabútor és munkalap",
    kitchen_fm: "milyen hosszú a konyhabútor folyóméterben",
    appliances: "kér-e beépített gépeket",
    windows: "kell-e ablakcsere",
    heatingsys: "kell-e fűtéskorszerűsítés",
    walls: "mozgatunk-e falakat vagy vizes pontokat",
    condition: "az ingatlan jelenlegi állapota",
    floortile: "a padló inkább csempe vagy laminált/parketta lesz",
    klima: "kér-e klímát",
    refine_gate: "szeretné-e pontosítani az árat néhány gyors kérdéssel",
    timeline: "mikorra szeretné a kivitelezést",
    name: "az ügyfél neve",
    postal_code: "hol van az ingatlan - irányítószám VAGY település neve, magyar és osztrák helyszín egyaránt jó",
    email: "az ügyfél e-mail címe",
    phone: "az ügyfél telefonszáma",
    budget: "a tervezett keretösszeg - PONTOSAN ezzel a felütéssel kérdezd: \"Ahhoz, hogy el tudjuk küldeni az árajánlatot, kérem, határozza meg a keret összegét.\" Ne ajánlgasd, hogy kihagyható",
};

// The per-turn steering line appended to the system prompt.
function nextQuestionDirective(field, lang) {
    if (!field) return "";
    const topic = FIELD_TOPIC[field] || field;
    const langName = { hu: "magyarul", en: "angolul", de: "németül" }[normLang(lang)] || "magyarul";
    return `

=== A JELENLEGI KÉRDÉS (a rendszer határozza meg - EZ FELÜLÍR MINDEN MÁST) ===
A következő üzenetedben KIZÁRÓLAG EZT kérdezd meg: ${topic}.
- Ha az ügyfél kérdezett valamit, ELŐSZÖR válaszolj a kérdésére 1-2 mondatban, és UGYANEBBEN az üzenetben tedd fel a fenti kérdést.
- Ha az ügyfél válasza a fenti kérdésre értelmezhetetlen vagy nem oda tartozott, kérdezd meg ÚJRA a fenti kérdést, barátságosan.
- SOHA ne ugorj a következő kérdésre, és SOHA ne tegyél fel ettől eltérő adatgyűjtő kérdést. A gombokat a rendszer ehhez a kérdéshez rakja ki, ezért ha mást kérdezel, rossz gombok jelennek meg.
- A választ ${langName} írd.`;
}

// The model may return DATA values for fields the customer has not been asked
// yet (it guesses ahead, or echoes an example from the prompt). Accepting those
// makes the backend believe a question is already answered and jump the chips
// forward - which is exactly how the buttons stopped matching the question on
// screen. So a value only the MODEL supplied is kept only while nothing before
// it is still unanswered.
function dropSkipAhead(sel, trusted) {
    const out = { ...sel };
    const has = (o, k) => o && o[k] != null && String(o[k]).trim() !== "";
    let gap = false;
    for (const f of fieldOrder(out)) {
        if (!has(out, f)) { gap = true; continue; }
        if (gap && !has(trusted, f)) delete out[f];
    }
    return out;
}

// Human-readable Hungarian labels for the recap/e-mail. Fixed-token choice fields
// only; `size` is handled by sizeLabel() since it can also be a free number.
const LABELS = {
    projectType: { furdo: "Fürdőszoba", konyha: "Konyha", lakas: "Teljes lakás", haz: "Családi ház", szoba: "Egy szoba" },
    tier: { basic: "Alap / takarékos", mid: "Közepes", premium: "Prémium", nem_tudom: "Nem tudja (alap: közepes)" },
    washing: { zuhany: "Műmárvány zuhanytálca (üvegfallal)", zuhanykabin: "Zuhanykabin", kad: "Kád", mindketto: "Kád és zuhany", nem_tudom: "Nem tudja (alap: zuhanykabin)" },
    layout: { marad: "Marad a mostani", athelyez: "Áthelyezés (új elrendezés)", nem_tudom: "Nem tudja (alap: marad)" },
    heating: { igen: "Igen, padlófűtéssel", nem: "Nem", nem_tudom: "Nem tudja (alap: nincs)" },
    scope: { teljes: "Teljes (gépészet, villany, minden)", reszleges: "Részleges (felületek + néhány szakág)", kozmetikai: "Kozmetikai (festés, burkolat)", nem_tudom: "Nem tudja (alap: részleges)" },
    roomscope: { festes: "Csak festés", festes_padlo: "Festés + új padló", teljes: "Teljes felújítás", nem_tudom: "Nem tudja (alap: teljes)" },
    bathrooms: { "1": "1 fürdő/WC", "2": "2 fürdő/WC", "3p": "3 vagy több", nem_tudom: "Nem tudja (alap: 1)" },
    kitchen: { uj: "Új konyhabútorral", felujitas: "Felújítás bútor nélkül", nem: "Konyhát nem érinti", nem_tudom: "Nem tudja" },
    windows: { csere: "Igen, ablakcsere", marad: "Nem, maradnak", nem_tudom: "Nem tudja (alap: marad)" },
    heatingsys: { marad: "Marad a mostani", radiator: "Radiátorcsere", padlofutes: "Padlófűtés", hoszivattyu: "Hőszivattyús rendszer", nem_tudom: "Nem tudja (alap: marad)" },
    furniture: { igen: "Igen, új bútor", nem: "Nem, marad", nem_tudom: "Nem tudja" },
    kitchen_fm: { fm_2_3: "2–3 fm", fm_3_4: "3–4 fm", fm_4_5: "4–5 fm", fm_5_6: "5–6 fm", fm_6p: "6 fm felett", nem_tudom: "Nem tudja (~4 fm)" },
    appliances: { igen: "Igen, gépekkel", nem: "Nem, saját gépek", nem_tudom: "Nem tudja" },
    walls: { igen: "Igen, falmozgatás is", nem: "Nem, maradnak a falak", nem_tudom: "Nem tudja (alap: nem)" },
    condition: { ujszeru: "Új építésű (15 évnél nem öregebb)", lakott: "Felújítandó (20 évnél öregebb)", regi: "Régi, elhasználódott (30+ év)", nem_tudom: "Nem tudja" },
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
// ===========================================================================
//  MULTI-LANGUAGE (HU / EN / DE)
//  The whole pipeline runs on language-independent CANONICAL TOKENS (furdo,
//  basic, zuhany, ...). Only the DISPLAY layer is translated here: the chip
//  button labels, the recap labels, the budget/size band words and the
//  customer-facing prose. Prices stay in Ft in every language. The owner's lead
//  e-mail is always Hungarian (handled by calling these with lang="hu").
// ===========================================================================
const LANGS = ["hu", "en", "de"];
function normLang(l) {
    const s = String(l || "").toLowerCase().slice(0, 2);
    return s === "en" || s === "de" ? s : "hu";
}

// --- Recap / e-mail token -> label, per language. Falls back to the Hungarian
//     LABELS above for any missing entry. Same token keys as LABELS. ---
const I18N_LABELS = {
    en: {
        projectType: { furdo: "Bathroom", konyha: "Kitchen", lakas: "Whole flat", haz: "Family house", szoba: "A single room" },
        tier: { basic: "Basic / budget", mid: "Mid-range", premium: "Premium", nem_tudom: "Not sure (default: mid-range)" },
        washing: { zuhany: "Cultured marble shower tray (glass panel)", zuhanykabin: "Shower cabin", kad: "Bathtub", mindketto: "Bath and shower", nem_tudom: "Not sure (default: shower cabin)" },
        layout: { marad: "Keep current", athelyez: "Relocate (new layout)", nem_tudom: "Not sure (default: keep)" },
        heating: { igen: "Yes, with underfloor heating", nem: "No", nem_tudom: "Not sure (default: none)" },
        scope: { teljes: "Full (plumbing, electrics, everything)", reszleges: "Partial (surfaces + some trades)", kozmetikai: "Cosmetic (paint, tiling)", nem_tudom: "Not sure (default: partial)" },
        roomscope: { festes: "Painting only", festes_padlo: "Painting + new floor", teljes: "Full renovation", nem_tudom: "Not sure (default: full)" },
        bathrooms: { "1": "1 bathroom/WC", "2": "2 bathrooms/WC", "3p": "3 or more", nem_tudom: "Not sure (default: 1)" },
        kitchen: { uj: "With new kitchen units", felujitas: "Renovate without units", nem: "Kitchen not included", nem_tudom: "Not sure" },
        windows: { csere: "Yes, replace windows", marad: "No, they stay", nem_tudom: "Not sure (default: keep)" },
        heatingsys: { marad: "Keep current", radiator: "Replace radiators", padlofutes: "Underfloor heating", hoszivattyu: "Heat pump system", nem_tudom: "Not sure (default: keep)" },
        furniture: { igen: "Yes, new units", nem: "No, they stay", nem_tudom: "Not sure" },
        kitchen_fm: { fm_2_3: "2–3 rm", fm_3_4: "3–4 rm", fm_4_5: "4–5 rm", fm_5_6: "5–6 rm", fm_6p: "over 6 rm", nem_tudom: "Not sure (~4 rm)" },
        appliances: { igen: "Yes, with appliances", nem: "No, own appliances", nem_tudom: "Not sure" },
        walls: { igen: "Yes, moving walls too", nem: "No, walls stay", nem_tudom: "Not sure (default: no)" },
        condition: { ujszeru: "Newly built (under 15 years)", lakott: "To be renovated (over 20 years)", regi: "Old, worn (30+ years)", nem_tudom: "Not sure" },
        floortile: { tobb_csempe: "Mostly tiles", fele_fele: "Half and half", tobb_laminalt: "Mostly laminate/parquet", nem_tudom: "Not sure" },
        klima: { igen: "Yes, with AC", nem: "No", nem_tudom: "Not sure (default: none)" },
        refine_gate: { yes: "Yes", no: "No" },
        budget: {
            b_1m: "under 1 million Ft", b_1_2: "1–2 million Ft", b_2_3: "2–3 million Ft", b_3m: "over 3 million Ft",
            b_5m: "under 5 million Ft", b_5_10: "5–10 million Ft", b_10_15: "10–15 million Ft", b_15m: "over 15 million Ft",
            b_10m: "under 10 million Ft", b_10_20: "10–20 million Ft", b_20_35: "20–35 million Ft", b_35m: "over 35 million Ft",
            b_unsure: "Not sure yet",
        },
        timeline: { t_asap: "As soon as possible", t_month: "Within a month", t_halfyear: "Within six months", t_thisyear: "Still this year", t_unsure: "Not sure yet" },
    },
    de: {
        projectType: { furdo: "Badezimmer", konyha: "Küche", lakas: "Ganze Wohnung", haz: "Einfamilienhaus", szoba: "Ein Zimmer" },
        tier: { basic: "Einfach / sparsam", mid: "Mittel", premium: "Premium", nem_tudom: "Weiß nicht (Standard: Mittel)" },
        washing: { zuhany: "Mineralguss-Duschtasse (Glaswand)", zuhanykabin: "Duschkabine", kad: "Badewanne", mindketto: "Wanne und Dusche", nem_tudom: "Weiß nicht (Standard: Duschkabine)" },
        layout: { marad: "Bleibt", athelyez: "Verlegen (neue Anordnung)", nem_tudom: "Weiß nicht (Standard: bleibt)" },
        heating: { igen: "Ja, mit Fußbodenheizung", nem: "Nein", nem_tudom: "Weiß nicht (Standard: keine)" },
        scope: { teljes: "Komplett (Installation, Elektrik, alles)", reszleges: "Teilweise (Oberflächen + einige Gewerke)", kozmetikai: "Kosmetisch (Malern, Beläge)", nem_tudom: "Weiß nicht (Standard: teilweise)" },
        roomscope: { festes: "Nur Malern", festes_padlo: "Malern + neuer Boden", teljes: "Komplette Renovierung", nem_tudom: "Weiß nicht (Standard: komplett)" },
        bathrooms: { "1": "1 Bad/WC", "2": "2 Bäder/WC", "3p": "3 oder mehr", nem_tudom: "Weiß nicht (Standard: 1)" },
        kitchen: { uj: "Mit neuen Küchenmöbeln", felujitas: "Renovieren ohne Möbel", nem: "Küche nicht betroffen", nem_tudom: "Weiß nicht" },
        windows: { csere: "Ja, Fenstertausch", marad: "Nein, bleiben", nem_tudom: "Weiß nicht (Standard: bleibt)" },
        heatingsys: { marad: "Bleibt", radiator: "Heizkörpertausch", padlofutes: "Fußbodenheizung", hoszivattyu: "Wärmepumpensystem", nem_tudom: "Weiß nicht (Standard: bleibt)" },
        furniture: { igen: "Ja, neue Möbel", nem: "Nein, bleiben", nem_tudom: "Weiß nicht" },
        kitchen_fm: { fm_2_3: "2–3 lfm", fm_3_4: "3–4 lfm", fm_4_5: "4–5 lfm", fm_5_6: "5–6 lfm", fm_6p: "über 6 lfm", nem_tudom: "Weiß nicht (~4 lfm)" },
        appliances: { igen: "Ja, mit Geräten", nem: "Nein, eigene Geräte", nem_tudom: "Weiß nicht" },
        walls: { igen: "Ja, auch Wände versetzen", nem: "Nein, Wände bleiben", nem_tudom: "Weiß nicht (Standard: nein)" },
        condition: { ujszeru: "Neubau (unter 15 Jahre)", lakott: "Renovierungsbedürftig (über 20 Jahre)", regi: "Alt, abgenutzt (30+ Jahre)", nem_tudom: "Weiß nicht" },
        floortile: { tobb_csempe: "Eher Fliesen", fele_fele: "Halb und halb", tobb_laminalt: "Eher Laminat/Parkett", nem_tudom: "Weiß nicht" },
        klima: { igen: "Ja, mit Klimaanlage", nem: "Nein", nem_tudom: "Weiß nicht (Standard: keine)" },
        refine_gate: { yes: "Ja", no: "Nein" },
        budget: {
            b_1m: "unter 1 Mio. Ft", b_1_2: "1–2 Mio. Ft", b_2_3: "2–3 Mio. Ft", b_3m: "über 3 Mio. Ft",
            b_5m: "unter 5 Mio. Ft", b_5_10: "5–10 Mio. Ft", b_10_15: "10–15 Mio. Ft", b_15m: "über 15 Mio. Ft",
            b_10m: "unter 10 Mio. Ft", b_10_20: "10–20 Mio. Ft", b_20_35: "20–35 Mio. Ft", b_35m: "über 35 Mio. Ft",
            b_unsure: "Weiß noch nicht",
        },
        timeline: { t_asap: "So bald wie möglich", t_month: "Innerhalb eines Monats", t_halfyear: "Innerhalb von sechs Monaten", t_thisyear: "Noch dieses Jahr", t_unsure: "Weiß noch nicht" },
    },
};
function lbl(group, key, lang = "hu") {
    const L = normLang(lang);
    if (L !== "hu" && I18N_LABELS[L] && I18N_LABELS[L][group] && I18N_LABELS[L][group][key] != null) return I18N_LABELS[L][group][key];
    return (LABELS[group] && LABELS[group][key]) || key || "-";
}

// --- Chip button labels per language, SAME ORDER as the Hungarian CHIP_LABELS /
//     CHOICE_VALUES, so the canonical token for index i is identical. ---
const CHIP_LABELS_I18N = {
    en: {
        projectType: ["Bathroom", "Kitchen", "Whole flat", "Family house", "A single room"],
        tier: ["Basic / budget", "Mid-range", "Premium", "Not sure"],
        washing: ["Cultured marble shower tray (glass panel)", "Shower cabin", "Bathtub", "Bath and shower", "Not sure"],
        layout: ["Keep the current layout", "Relocate it", "Not sure"],
        heating: ["Yes, underfloor heating", "Not needed", "Not sure"],
        scope: ["Full (replace everything)", "Partial (surfaces + some trades)", "Cosmetic (paint, tiling)", "Not sure"],
        roomscope: ["Painting only", "Painting + new floor", "Full renovation", "Not sure"],
        bathrooms: ["1 bathroom/WC", "2 bathrooms/WC", "3 or more", "Not sure"],
        kitchen: ["With new kitchen units", "Renovate without units", "Kitchen not included", "Not sure"],
        windows: ["Yes, replace windows", "No, they stay", "Not sure"],
        heatingsys: ["Keep the current one", "Replace radiators", "Underfloor heating", "Heat pump system", "Not sure"],
        furniture: ["Yes, new units needed", "No, they stay", "Not sure"],
        kitchen_fm: ["2–3 rm", "3–4 rm", "4–5 rm", "5–6 rm", "over 6 rm", "Not sure"],
        appliances: ["Yes, with appliances", "No, my own appliances", "Not sure"],
        timeline: ["As soon as possible", "Within a month", "Within six months", "Still this year", "Not sure yet"],
        refine_gate: ["Yes, let's refine it", "Not now, thanks"],
        walls: ["Yes, we'll move walls too", "No, walls stay", "Not sure"],
        condition: ["Newly built (under 15 years)", "To be renovated (over 20 years)", "Old, worn (30+ years)", "Not sure"],
        floortile: ["Mostly tiles", "Half and half", "Mostly laminate/parquet", "Not sure"],
        klima: ["Yes, I'd like AC", "Not needed", "Not sure"],
    },
    de: {
        projectType: ["Badezimmer", "Küche", "Ganze Wohnung", "Einfamilienhaus", "Ein Zimmer"],
        tier: ["Einfach / sparsam", "Mittel", "Premium", "Weiß nicht"],
        washing: ["Mineralguss-Duschtasse (Glaswand)", "Duschkabine", "Badewanne", "Wanne und Dusche", "Weiß nicht"],
        layout: ["Aktuelle Anordnung bleibt", "Wird verlegt", "Weiß nicht"],
        heating: ["Ja, Fußbodenheizung", "Nicht nötig", "Weiß nicht"],
        scope: ["Komplett (alles wird erneuert)", "Teilweise (Oberflächen + einige Gewerke)", "Kosmetisch (Malern, Beläge)", "Weiß nicht"],
        roomscope: ["Nur Malern", "Malern + neuer Boden", "Komplette Renovierung", "Weiß nicht"],
        bathrooms: ["1 Bad/WC", "2 Bäder/WC", "3 oder mehr", "Weiß nicht"],
        kitchen: ["Mit neuen Küchenmöbeln", "Renovieren ohne Möbel", "Küche nicht betroffen", "Weiß nicht"],
        windows: ["Ja, Fenstertausch", "Nein, bleiben", "Weiß nicht"],
        heatingsys: ["Aktuelles bleibt", "Heizkörpertausch", "Fußbodenheizung", "Wärmepumpensystem", "Weiß nicht"],
        furniture: ["Ja, neue Möbel", "Nein, bleiben", "Weiß nicht"],
        kitchen_fm: ["2–3 lfm", "3–4 lfm", "4–5 lfm", "5–6 lfm", "über 6 lfm", "Weiß nicht"],
        appliances: ["Ja, mit Geräten", "Nein, eigene Geräte", "Weiß nicht"],
        timeline: ["So bald wie möglich", "Innerhalb eines Monats", "Innerhalb von sechs Monaten", "Noch dieses Jahr", "Weiß noch nicht"],
        refine_gate: ["Ja, verfeinern", "Jetzt nicht, danke"],
        walls: ["Ja, auch Wände versetzen", "Nein, Wände bleiben", "Weiß nicht"],
        condition: ["Neubau (unter 15 Jahre)", "Renovierungsbedürftig (über 20 Jahre)", "Alt, abgenutzt (30+ Jahre)", "Weiß nicht"],
        floortile: ["Eher Fliesen", "Halb und halb", "Eher Laminat/Parkett", "Weiß nicht"],
        klima: ["Ja, mit Klimaanlage", "Nicht nötig", "Weiß nicht"],
    },
};
// Localized SIZE chips (same order as SIZE_CHIPS). Only the "under/over/not sure"
// words differ; the "N m²" numbers are language-neutral.
const SIZE_CHIPS_I18N = {
    en: {
        furdo: ["3–4 m²", "5–6 m²", "7–8 m²", "9–10 m²", "over 10 m²", "Not sure"],
        lakas: ["under 40 m²", "40–60 m²", "60–80 m²", "80–120 m²", "over 120 m²", "Not sure"],
        haz: ["under 80 m²", "80–120 m²", "120–160 m²", "over 160 m²", "Not sure"],
        konyha: ["under 6 m²", "6–10 m²", "10–15 m²", "over 15 m²", "Not sure"],
        szoba: ["under 10 m²", "10–15 m²", "15–20 m²", "over 20 m²", "Not sure"],
    },
    de: {
        furdo: ["3–4 m²", "5–6 m²", "7–8 m²", "9–10 m²", "über 10 m²", "Weiß nicht"],
        lakas: ["unter 40 m²", "40–60 m²", "60–80 m²", "80–120 m²", "über 120 m²", "Weiß nicht"],
        haz: ["unter 80 m²", "80–120 m²", "120–160 m²", "über 160 m²", "Weiß nicht"],
        konyha: ["unter 6 m²", "6–10 m²", "10–15 m²", "über 15 m²", "Weiß nicht"],
        szoba: ["unter 10 m²", "10–15 m²", "15–20 m²", "über 20 m²", "Weiß nicht"],
    },
};

// Merged reverse lookup: ANY language's chip label (lowercased) -> canonical
// token, so a customer who switches language mid-chat still resolves correctly.
// Built by zipping each language's chip array against the HU token order.
const CHOICE_REVERSE = {};
for (const field of Object.keys(CHOICE_VALUES)) {
    const map = {};
    const tokens = Object.values(CHOICE_VALUES[field]); // HU chip order = token order
    Object.assign(map, CHOICE_VALUES[field]); // HU labels already mapped
    for (const L of ["en", "de"]) {
        const arr = CHIP_LABELS_I18N[L] && CHIP_LABELS_I18N[L][field];
        if (arr) arr.forEach((label, i) => { if (tokens[i] != null) map[label.toLowerCase()] = tokens[i]; });
    }
    CHOICE_REVERSE[field] = map;
}
const SIZE_REVERSE = {};
for (const pt of Object.keys(SIZE_VALUES)) {
    const map = {};
    const tokens = Object.values(SIZE_VALUES[pt]);
    Object.assign(map, SIZE_VALUES[pt]);
    for (const L of ["en", "de"]) {
        const arr = SIZE_CHIPS_I18N[L] && SIZE_CHIPS_I18N[L][pt];
        if (arr) arr.forEach((label, i) => { if (tokens[i] != null) map[label.toLowerCase()] = tokens[i]; });
    }
    SIZE_REVERSE[pt] = map;
}

// Localized budget band words. Adaptive bands are built from these so a small
// basic job and a big premium one show different amounts, in the right language.
const BUDGET_WORDS = {
    hu: { unit: "millió Ft", unitEur: "EUR", under: (s, u) => `${s} ${u} alatt`, over: (s, u) => `${s} ${u} felett`, range: (a, b, u) => `${a}–${b} ${u}`, unsure: "Még nem tudom", skip: "Inkább nem mondanám" },
    en: { unit: "million Ft", unitEur: "EUR", under: (s, u) => `under ${s} ${u}`, over: (s, u) => `over ${s} ${u}`, range: (a, b, u) => `${a}–${b} ${u}`, unsure: "Not sure yet", skip: "I'd rather not say" },
    de: { unit: "Mio. Ft", unitEur: "EUR", under: (s, u) => `unter ${s} ${u}`, over: (s, u) => `über ${s} ${u}`, range: (a, b, u) => `${a}–${b} ${u}`, unsure: "Weiß noch nicht", skip: "Lieber nicht angeben" },
};

// A budget threshold, expressed in whatever currency the customer is quoted in.
// Forint reads naturally in millions; euro amounts are only ~4 digits, so they
// are shown whole, rounded to a tidy 500.
function budgetUnit(lang, cur) {
    const w = BUDGET_WORDS[normLang(lang)] || BUDGET_WORDS.hu;
    return cur === "eur" ? w.unitEur : w.unit;
}
function budgetStep(n, cur) {
    if (cur === "eur") return Math.max(500, Math.round(n / 500) * 500);
    return niceMillion(n);
}
function budgetText(n, cur) {
    return cur === "eur" ? Math.round(n).toLocaleString("de-AT") : fmtM(n);
}
// Fixed (non-adaptive) budget band thresholds in millions, per scale - used to
// build localized fallback chips when the running ballpark isn't computable yet.
const BUDGET_FIXED_M = { small: [1, 2, 3], flat: [5, 10, 15], house: [10, 20, 35] };
function fixedBudgetChips(scale, lang = "hu", cur = "huf") {
    const w = BUDGET_WORDS[normLang(lang)] || BUDGET_WORDS.hu;
    const u = budgetUnit(lang, cur);
    let [a, b, c] = BUDGET_FIXED_M[scale] || BUDGET_FIXED_M.small;
    if (cur === "eur") {
        // The anchors are in millions of Ft; convert with the price list's own
        // ratio and round to a tidy 500 EUR so the chips read like real budgets.
        const toEur = (m) => Math.round(m * 1e6 / FT_PER_EUR_FALLBACK / 500) * 500;
        [a, b, c] = [toEur(a), toEur(b), toEur(c)];
        const t = (n) => n.toLocaleString("de-AT");
        return [w.under(t(a), u), w.range(t(a), t(b), u), w.range(t(b), t(c), u), w.over(t(c), u), w.unsure, w.skip];
    }
    return [w.under(a, u), w.range(a, b, u), w.range(b, c, u), w.over(c, u), w.unsure, w.skip];
}

// ===========================================================================
//  WHICH LANGUAGE IS THE CUSTOMER WRITING IN?
//  The host site tells us its own language (hu|en|de), but a visitor may well
//  read the Hungarian page and type in German. Whatever they write in, we answer
//  in - so the language is decided by the CONVERSATION, with the site language
//  only as the starting point.
//
//  Two independent signals, deliberately kept conservative. Guessing wrong is
//  much worse than not guessing: an unnecessary switch answers a Hungarian
//  customer in German. So both signals return null unless they are sure, and a
//  null simply keeps the language we already had.
// ===========================================================================

// SIGNAL 1 - a clicked chip. Chip labels are strings WE generated in a known
// language, so this is exact rather than a guess. Built from the same arrays
// that render the chips, so it can never drift from them. A label that exists in
// more than one language (the "6–10 m²" size bands are identical in all three)
// maps to null = no signal.
const CHIP_LANG = (() => {
    const seen = new Map();
    const put = (label, lang) => {
        const k = String(label || "").toLowerCase().trim();
        if (!k) return;
        if (!seen.has(k)) seen.set(k, lang);
        else if (seen.get(k) !== lang) seen.set(k, null); // same label in 2 languages
    };
    for (const field of Object.keys(CHOICE_VALUES)) {
        Object.keys(CHOICE_VALUES[field]).forEach((l) => put(l, "hu"));
        for (const L of ["en", "de"]) {
            const arr = CHIP_LABELS_I18N[L] && CHIP_LABELS_I18N[L][field];
            if (arr) arr.forEach((l) => put(l, L));
        }
    }
    for (const pt of Object.keys(SIZE_VALUES)) {
        Object.keys(SIZE_VALUES[pt]).forEach((l) => put(l, "hu"));
        for (const L of ["en", "de"]) {
            const arr = SIZE_CHIPS_I18N[L] && SIZE_CHIPS_I18N[L][pt];
            if (arr) arr.forEach((l) => put(l, L));
        }
    }
    for (const L of LANGS) { put(BUDGET_WORDS[L].unsure, L); put(BUDGET_WORDS[L].skip, L); }
    return seen;
})();

// SIGNAL 2 - typed prose. Function words only (articles, pronouns, verbs,
// question words): they are what people actually type, and unlike nouns they do
// NOT appear in names, town names or e-mail addresses. That property is what
// keeps "Hans Müller", "Wien" and "nev@gmail.com" from switching the language.
// A word listed under two languages is dropped as ambiguous.
const LANG_WORDS = {
    hu: ["nem", "igen", "kérem", "kérek", "köszönöm", "köszi", "szeretnék", "szeretném", "lenne", "van", "hogy", "mit", "mennyi", "mennyibe", "kerül", "kerülne", "meg", "egy", "és", "vagy", "ez", "az", "jó", "kell", "tudom", "tudna", "lehet", "milyen", "hol", "mikor", "miért", "csak", "még", "már", "nagyon", "sok", "kicsit", "akkor", "azt", "ha", "de", "is", "majd", "kellene", "szia", "sziasztok", "üdvözlöm", "rendben", "persze", "inkább", "nálunk", "nekem", "vagyok", "vagyunk", "kaphatok", "árajánlatot", "felújítás", "felújítást", "felújítani"],
    de: ["ich", "ist", "das", "der", "die", "und", "nicht", "nein", "wie", "eine", "einen", "möchte", "gerne", "danke", "bitte", "für", "mit", "haben", "hätte", "kann", "können", "wir", "sie", "sind", "wäre", "wieviel", "wieviele", "kostet", "kosten", "hallo", "guten", "aber", "auch", "noch", "schon", "sehr", "mein", "meine", "unser", "unsere", "brauche", "brauchen", "machen", "lassen", "würde", "müssen", "soll", "vielen", "dank", "sagen", "fragen", "angebot", "renovierung", "kostenvoranschlag"],
    en: ["the", "is", "are", "you", "your", "how", "much", "what", "would", "like", "please", "thanks", "thank", "want", "need", "can", "could", "we", "our", "my", "me", "and", "for", "with", "have", "hello", "hi", "there", "just", "some", "about", "does", "do", "don", "it", "that", "this", "quote", "estimate", "renovation", "refurbishment", "cost", "costs", "price", "looking", "wondering"],
};
// word -> language, with anything claimed by two languages neutralised. ("is"
// is both English and German; "sie"/"sind" vs nothing in HU, and so on.)
const LANG_WORD_INDEX = (() => {
    const idx = new Map();
    for (const L of LANGS) for (const w of LANG_WORDS[L]) {
        if (!idx.has(w)) idx.set(w, L);
        else if (idx.get(w) !== L) idx.set(w, null);
    }
    return idx;
})();

// Things that are never a language signal, whichever field they were typed into:
// an e-mail address, a phone number, a bare postcode/size. Checked explicitly so
// the answer behaves the same when it is re-scanned from the history later, when
// we no longer know which question it answered.
const NOT_PROSE = /^[^\s@]+@[^\s@]+$/;

// Returns "hu" | "en" | "de" when the text is CONFIDENTLY in that language,
// otherwise null (keep whatever language we were already using).
function detectMessageLang(text) {
    const raw = String(text || "").trim();
    if (!raw || raw.length > 2000) return null;

    // Exact chip label → certain answer, no scoring needed.
    const chip = CHIP_LANG.get(raw.toLowerCase());
    if (chip) return chip;

    if (NOT_PROSE.test(raw)) return null;
    const s = raw.toLowerCase();
    // Too few letters to judge: "6", "3–4 m²", "+36 20 123 4567", "ok".
    if (s.replace(/[^\p{L}]/gu, "").length < 3) return null;

    const score = { hu: 0, en: 0, de: 0 };
    for (const tok of s.split(/[^\p{L}]+/u)) {
        if (!tok) continue;
        const L = LANG_WORD_INDEX.get(tok);
        if (L) score[L] += 1;
    }
    // Letters only one of the three uses. Hungarian ő/ű and German ß/ä are
    // decisive; ö/ü are shared by HU and DE, so they score nothing.
    if (/[őű]/.test(s)) score.hu += 2;
    if (/[áéíóú]/.test(s)) score.hu += 1;
    if (/[ß]/.test(s)) score.de += 2;
    if (/[ä]/.test(s)) score.de += 1;

    const ranked = LANGS.slice().sort((a, b) => score[b] - score[a]);
    const best = ranked[0], second = ranked[1];
    // Needs real evidence AND a clear margin - a single word ("ja", which is
    // German but also a Hungarian interjection) must never flip the language.
    if (score[best] < 2 || score[best] - score[second] < 2) return null;
    return best;
}

// The language of the conversation as a whole: the MOST RECENT confident signal
// from anything the customer said, falling back to the site language when they
// have not given one yet. Deriving it from the history every turn (rather than
// trusting a flag from the browser) means it survives a reload, a re-send, and a
// client that never echoes it back.
function conversationLang(history, question, siteLang) {
    let lang = normLang(siteLang);
    const scan = (text) => { const d = detectMessageLang(text); if (d) lang = d; };
    if (Array.isArray(history)) {
        for (const m of history) {
            if (!m || m.role !== "user" || typeof m.content !== "string") continue;
            scan(m.content);
        }
    }
    // The current message may not be in `history` yet, depending on the caller.
    if (typeof question === "string") scan(question);
    return lang;
}

// Size label: bathroom band token → friendly band; free number → "N m²";
// unknown → per-type default note.
const SIZE_LABEL = { s_3_4: "3–4 m²", s_5_6: "5–6 m²", s_7_8: "7–8 m²", s_9_10: "9–10 m²", s_11p: "10 m² felett" };
function sizeLabel(size, pt, lang = "hu") {
    const L = normLang(lang);
    if (size === "nem_tudom" || size == null || String(size).trim() === "") {
        const A = TYPE_DEFAULT_AREA[pt] || 5;
        if (L === "en") return `Not sure (default: ${A} m²)`;
        if (L === "de") return `Weiß nicht (Standard: ${A} m²)`;
        return `Nem tudja (alap: ${A} m²)`;
    }
    if (Object.prototype.hasOwnProperty.call(SIZE_LABEL, size)) return SIZE_LABEL[size];
    const n = parseFloat(String(size).replace(",", "."));
    return !isNaN(n) && n > 0 ? `${String(size).replace(".", ",")} m²` : "-";
}

// ---------------------------------------------------------------------------
//  Quote line-item label translation. buildQuote() always emits Hungarian item
//  labels (so the pricing tests stay stable); when the customer's language is
//  EN/DE we translate them HERE, at render time. Static phrases use an exact
//  dictionary; the few labels that carry a dynamic count/length use regex rules.
// ---------------------------------------------------------------------------
const ITEM_LABELS_I18N = {
    en: {
        // --- Törzsárlista trade groups (bathroom flow, 2026-09-04) ---
        "Bontás, elszállítás, munkaterület védelme": "Strip-out, waste removal, site protection",
        "Víz- és csatornaszerelés": "Plumbing and drainage",
        "Fűtésszerelés": "Heating installation",
        "Szellőztetés": "Ventilation",
        "Előkészítés, kőműves munka, vízszigetelés": "Preparation, masonry, waterproofing",
        "Szárazépítészet": "Drylining",
        "Falpanel": "Wall panelling",
        "Mikrocement": "Microcement",
        "Burkolás munkadíja": "Tiling labour",
        "Vinyl padló fektetése": "Vinyl floor laying",
        "Villanyszerelés": "Electrical work",
        "Szerelvényezés, szaniterek beépítése": "Fitting the sanitaryware and fixtures",
        "Befejező munkák": "Finishing works",
        "Kiszállás": "Call-out",
        "Bontás, törmelékelszállítás, konténer": "Demolition, debris removal, skip",
        "Aljzatkiegyenlítés és kétrétegű vízszigetelés": "Floor levelling and two-layer waterproofing",
        "Burkolás munkadíja (fal + padló)": "Tiling labour (walls + floor)",
        "Csempe és járólap (anyag)": "Wall and floor tiles (material)",
        "Gépészet (víz- és lefolyóvezeték, bekötések)": "Plumbing (water and waste pipes, connections)",
        "Villanyszerelés (világítás, csatlakozók, szellőztetés)": "Electrical work (lighting, sockets, ventilation)",
        "Szaniterek és csaptelepek (anyag + beépítés)": "Sanitaryware and taps (material + installation)",
        "Festés, glettelés (mennyezet és nem burkolt falak)": "Painting, skimming (ceiling and untiled walls)",
        "Elektromos padlófűtés (fűtőszőnyeg + termosztát)": "Electric underfloor heating (heating mat + thermostat)",
        "Bontás, előkészítés, takarítás": "Demolition, preparation, cleaning",
        "Burkolás / új padló (anyag + munka)": "Tiling / new floor (material + labour)",
        "Festés, glettelés": "Painting, skimming",
        "Villany frissítés (lámpák, kapcsolók, dugaljak)": "Electrical refresh (lights, switches, sockets)",
        "Részleges bontás, törmelékelszállítás": "Partial demolition, debris removal",
        "Falazás, vakolás, gipszkarton, glettelés": "Masonry, plastering, drywall, skimming",
        "Faljavítás, glettelés, gipszkarton": "Wall repair, skimming, drywall",
        "Aljzatkiegyenlítés és vízszigetelés": "Floor levelling and waterproofing",
        "Gépészet (víz, csatorna) és villanyszerelés": "Plumbing (water, drainage) and electrical work",
        "Gépészet és villany (részleges)": "Plumbing and electrics (partial)",
        "Burkolás és padló (anyag + munka)": "Tiling and flooring (material + labour)",
        "Falátalakítás és vizes pont áthelyezés": "Wall alterations and relocating wet points",
        "Konyhabútor és munkalap (vízkiállás-igazítással)": "Kitchen units and worktop (with plumbing adjustment)",
        "Vizes padlófűtés (rendszer + szerelés)": "Water underfloor heating (system + installation)",
        "Hőszivattyús fűtési rendszer (komplett)": "Heat pump heating system (complete)",
        "Klíma (beltéri egység, szereléssel)": "Air conditioning (indoor unit, with installation)",
        "Bontás, burkolás, gépészet- és villanykiállás, padló, festés": "Demolition, tiling, plumbing and electrical rough-in, floor, painting",
        "Beépített gépek (sütő, főzőlap, páraelszívó stb.)": "Built-in appliances (oven, hob, extractor, etc.)",
        "Víz/gáz/villany pontok áthelyezése (vízkiállás)": "Relocating water/gas/electrical points",
        "Előkészítés, takarítás": "Preparation, cleaning",
        "Új padló (anyag + munka)": "New floor (material + labour)",
        "Apró javítások": "Minor repairs",
    },
    de: {
        // --- Törzsárlista trade groups (bathroom flow, 2026-09-04) ---
        "Bontás, elszállítás, munkaterület védelme": "Abbruch, Entsorgung, Schutz der Baustelle",
        "Víz- és csatornaszerelés": "Wasser- und Abwasserinstallation",
        "Fűtésszerelés": "Heizungsinstallation",
        "Szellőztetés": "Lüftung",
        "Előkészítés, kőműves munka, vízszigetelés": "Vorbereitung, Maurerarbeiten, Abdichtung",
        "Szárazépítészet": "Trockenbau",
        "Falpanel": "Wandpaneele",
        "Mikrocement": "Mikrozement",
        "Burkolás munkadíja": "Fliesenarbeiten (Arbeitslohn)",
        "Vinyl padló fektetése": "Vinylboden verlegen",
        "Villanyszerelés": "Elektroinstallation",
        "Szerelvényezés, szaniterek beépítése": "Montage der Sanitärobjekte und Armaturen",
        "Befejező munkák": "Abschlussarbeiten",
        "Kiszállás": "Anfahrt",
        "Bontás, törmelékelszállítás, konténer": "Abbruch, Schuttentsorgung, Container",
        "Aljzatkiegyenlítés és kétrétegű vízszigetelés": "Bodenausgleich und zweilagige Abdichtung",
        "Burkolás munkadíja (fal + padló)": "Verlegearbeit (Wand + Boden)",
        "Csempe és járólap (anyag)": "Wand- und Bodenfliesen (Material)",
        "Gépészet (víz- és lefolyóvezeték, bekötések)": "Sanitärinstallation (Wasser- und Abflussleitungen, Anschlüsse)",
        "Villanyszerelés (világítás, csatlakozók, szellőztetés)": "Elektroinstallation (Beleuchtung, Steckdosen, Lüftung)",
        "Szaniterek és csaptelepek (anyag + beépítés)": "Sanitärobjekte und Armaturen (Material + Einbau)",
        "Festés, glettelés (mennyezet és nem burkolt falak)": "Malern, Spachteln (Decke und nicht geflieste Wände)",
        "Elektromos padlófűtés (fűtőszőnyeg + termosztát)": "Elektrische Fußbodenheizung (Heizmatte + Thermostat)",
        "Bontás, előkészítés, takarítás": "Abbruch, Vorbereitung, Reinigung",
        "Burkolás / új padló (anyag + munka)": "Belag / neuer Boden (Material + Arbeit)",
        "Festés, glettelés": "Malern, Spachteln",
        "Villany frissítés (lámpák, kapcsolók, dugaljak)": "Elektro-Auffrischung (Lampen, Schalter, Steckdosen)",
        "Részleges bontás, törmelékelszállítás": "Teilabbruch, Schuttentsorgung",
        "Falazás, vakolás, gipszkarton, glettelés": "Mauerwerk, Verputz, Trockenbau, Spachteln",
        "Faljavítás, glettelés, gipszkarton": "Wandreparatur, Spachteln, Trockenbau",
        "Aljzatkiegyenlítés és vízszigetelés": "Bodenausgleich und Abdichtung",
        "Gépészet (víz, csatorna) és villanyszerelés": "Sanitär (Wasser, Abwasser) und Elektroinstallation",
        "Gépészet és villany (részleges)": "Sanitär und Elektrik (teilweise)",
        "Burkolás és padló (anyag + munka)": "Belag und Boden (Material + Arbeit)",
        "Falátalakítás és vizes pont áthelyezés": "Wandumbau und Verlegung der Nassanschlüsse",
        "Konyhabútor és munkalap (vízkiállás-igazítással)": "Küchenmöbel und Arbeitsplatte (mit Anschlussanpassung)",
        "Vizes padlófűtés (rendszer + szerelés)": "Warmwasser-Fußbodenheizung (System + Montage)",
        "Hőszivattyús fűtési rendszer (komplett)": "Wärmepumpen-Heizsystem (komplett)",
        "Klíma (beltéri egység, szereléssel)": "Klimaanlage (Innengerät, mit Montage)",
        "Bontás, burkolás, gépészet- és villanykiállás, padló, festés": "Abbruch, Belag, Sanitär- und Elektro-Rohinstallation, Boden, Malern",
        "Beépített gépek (sütő, főzőlap, páraelszívó stb.)": "Einbaugeräte (Backofen, Kochfeld, Dunstabzug usw.)",
        "Víz/gáz/villany pontok áthelyezése (vízkiállás)": "Verlegung der Wasser-/Gas-/Stromanschlüsse",
        "Előkészítés, takarítás": "Vorbereitung, Reinigung",
        "Új padló (anyag + munka)": "Neuer Boden (Material + Arbeit)",
        "Apró javítások": "Kleinere Reparaturen",
    },
};
function translateItemLabel(huLabel, lang) {
    const L = normLang(lang);
    if (L === "hu") return huLabel;
    const dict = ITEM_LABELS_I18N[L];
    // Dynamic-count / length labels first.
    let m;
    if ((m = huLabel.match(/^Beltéri ajtók? \((\d+) db\)$/))) {
        const n = m[1];
        return L === "de" ? `Innentüren (${n} Stk.)` : `Interior doors (${n} ${n === "1" ? "pc" : "pcs"})`;
    }
    if ((m = huLabel.match(/^Fürdőszoba\/WC szaniter és vízszigetelés \((\d+) db\)$/))) {
        return L === "de" ? `Bad/WC Sanitär und Abdichtung (${m[1]} Stk.)` : `Bathroom/WC sanitaryware and waterproofing (${m[1]} pcs)`;
    }
    if ((m = huLabel.match(/^Nyílászárócsere - ablakok \((\d+) db\)$/))) {
        return L === "de" ? `Fenstertausch (${m[1]} Stk.)` : `Window replacement (${m[1]} pcs)`;
    }
    if ((m = huLabel.match(/^Fűtéskorszerűsítés - radiátorcsere \((\d+) db\)$/))) {
        return L === "de" ? `Heizungsmodernisierung - Heizkörpertausch (${m[1]} Stk.)` : `Heating upgrade - radiator replacement (${m[1]} pcs)`;
    }
    if ((m = huLabel.match(/^Konyhabútor és munkalap \(([\d,]+) fm\)$/))) {
        return L === "de" ? `Küchenmöbel und Arbeitsplatte (${m[1]} lfm)` : `Kitchen units and worktop (${m[1]} rm)`;
    }
    return (dict && dict[huLabel]) || huLabel; // fall back to Hungarian if unmapped
}

// Choice fields with fixed tokens, validated against their allowed set below.
// NB: `budget` is NOT here. It is stored as the human-readable band label the
// customer picked (adaptive, so there is no fixed token set); validating it
// against LABELS would silently delete every real answer.
const CHOICE_FIELDS = ["projectType", "tier", "washing", "layout", "heating", "scope",
    "roomscope", "bathrooms", "kitchen", "windows", "heatingsys",
    "furniture", "kitchen_fm", "appliances", "walls", "condition", "floortile", "klima",
    "refine_gate", "timeline"];

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
// Recap-row key labels, per language.
const RECAP_KEYS = {
    hu: { type: "Típus", size: "Méret", finish: "Kivitelezési szint", shower: "Zuhany / kád", layout: "Elrendezés", heat: "Padlófűtés", scope: "Munka jellege", baths: "Fürdőszobák", kitchen: "Konyha", condition: "Jelenlegi állapot", walls: "Falmozgatás", floor: "Padló jellege", windows: "Ablakcsere", heatsys: "Fűtés", klima: "Klíma", newkitchen: "Új konyhabútor", units: "Bútor hossza", appliances: "Beépített gépek" },
    en: { type: "Type", size: "Size", finish: "Finish level", shower: "Shower / bath", layout: "Layout", heat: "Underfloor heating", scope: "Type of work", baths: "Bathrooms", kitchen: "Kitchen", condition: "Current condition", walls: "Wall changes", floor: "Floor type", windows: "Window replacement", heatsys: "Heating", klima: "Air conditioning", newkitchen: "New kitchen units", units: "Units length", appliances: "Built-in appliances" },
    de: { type: "Typ", size: "Größe", finish: "Ausstattungsniveau", shower: "Dusche / Wanne", layout: "Anordnung", heat: "Fußbodenheizung", scope: "Art der Arbeiten", baths: "Bäder", kitchen: "Küche", condition: "Aktueller Zustand", walls: "Wandänderungen", floor: "Bodenart", windows: "Fenstertausch", heatsys: "Heizung", klima: "Klimaanlage", newkitchen: "Neue Küchenmöbel", units: "Möbellänge", appliances: "Einbaugeräte" },
};
function summaryPairs(sel, lang = "hu") {
    const L = normLang(lang);
    const K = RECAP_KEYS[L] || RECAP_KEYS.hu;
    const pt = sel.projectType || "furdo";
    const p = [[K.type, lbl("projectType", pt, L)], [K.size, sizeLabel(sel.size, pt, L)], [K.finish, lbl("tier", sel.tier, L)]];
    if (pt === "furdo") {
        p.push([K.shower, lbl("washing", sel.washing, L)]);
        p.push([K.layout, lbl("layout", sel.layout, L)]);
        p.push([K.heat, lbl("heating", sel.heating, L)]);
    } else if (pt === "lakas" || pt === "haz") {
        const has = (k) => sel[k] != null && String(sel[k]).trim() !== "";
        p.push([K.scope, lbl("scope", sel.scope, L)]);
        p.push([K.baths, lbl("bathrooms", sel.bathrooms, L)]);
        p.push([K.kitchen, lbl("kitchen", sel.kitchen, L)]);
        // Refine answers - only shown if the customer actually gave them.
        if (has("condition")) p.push([K.condition, lbl("condition", sel.condition, L)]);
        if (has("walls")) p.push([K.walls, lbl("walls", sel.walls, L)]);
        if (has("floortile")) p.push([K.floor, lbl("floortile", sel.floortile, L)]);
        if (has("windows")) p.push([K.windows, lbl("windows", sel.windows, L)]);
        if (has("heatingsys")) p.push([K.heatsys, lbl("heatingsys", sel.heatingsys, L)]);
        if (has("klima")) p.push([K.klima, lbl("klima", sel.klima, L)]);
    } else if (pt === "konyha") {
        p.push([K.newkitchen, lbl("furniture", sel.furniture, L)]);
        if (sel.furniture === "igen" && sel.kitchen_fm) p.push([K.units, lbl("kitchen_fm", sel.kitchen_fm, L)]);
        p.push([K.appliances, lbl("appliances", sel.appliances, L)]);
        p.push([K.layout, lbl("layout", sel.layout, L)]);
    } else if (pt === "szoba") {
        p.push([K.scope, lbl("roomscope", sel.roomscope, L)]);
    }
    return p;
}

// Running ballpark for the LIVE estimate banner (lakas/haz only). Appears once the
// essential questions are answered, with a band that's WIDER while refine questions
// are still open and TIGHTENS (and shifts) as the customer fills them in - which is
// what motivates people to keep going. Returns null until there's enough to show.
function runningEstimate(sel, lang) {
    if (!sel || (sel.projectType !== "lakas" && sel.projectType !== "haz")) return null;
    const filled = (k) => sel[k] != null && String(sel[k]).trim() !== "";
    if (!projectFields(sel.projectType, sel).every(filled)) return null; // essentials incomplete
    const cur = currencyFor(lang);
    const q = buildQuote(sel, { currency: cur });
    const unknown = refineFields(sel.projectType).filter((f) => !filled(f)).length;
    const k = Math.min(0.12, unknown * 0.02); // extra uncertainty per open refine question
    const band = sel.projectType === "haz" ? RENO.bandHouse : RENO.band;
    const step = (MONEY[cur] || MONEY.huf).total;
    return {
        low: roundTo(q.total * (band.low - k), step),
        high: roundTo(q.total * (band.high + k), step),
        partial: unknown > 0,
        currency: cur,
    };
}

// Customer-facing estimate. Returns sections split by [[SPLIT]] so the widget
// renders them as separate chat bubbles. Numbers come from buildQuote.
// Customer-facing quote prose, per language. Each returns the three bubbles as
// an array. Numbers/labels are passed in already formatted/translated.
const QUOTE_STR = {
    hu: {
        approx: "kb.",
        price: (name, size, tierLower, what, items, low, high, basisNote) => [
            `Köszönöm, ${name}! Íme az **előzetes árajánlata** egy **${size}**, **${tierLower}** ${what}ra.`,
            ``, `**Tételek (tájékoztató, kb. sávval):**`, items, ``,
            `**Becsült végösszeg: kb. ${low} – ${high}**`, basisNote,
        ].join("\n"),
        // NM Bau alanyi adómentes: nincs rá ÁFA, tehát ez a fizetendő összeg.
        basisLabour: "(**ÁFA-mentes** ár - ez a **munkadíj**, az anyag nem tartalmazza)",
        basisTurnkey: "(**ÁFA-mentes** ár, **kulcsrakész**)",
        inclFurdo: "bontás, víz- és csatornaszerelés, fűtés, vízszigetelés, kőműves munka, burkolás és a szaniterek beépítése - mindez **munkadíjban**",
        inclOther: "a fenti tételek - anyaggal és munkadíjjal, kulcsrakész kivitelben",
        exclLabour: "**Mit nem tartalmaz?** Az **anyagot**: csempe, járólap, szaniterek (WC, mosdó, kád), csaptelepek, zuhanytálca vagy üvegfal - ezeket Ön vásárolja meg, a kiválasztásban szívesen segítünk. A **festés-glettelést** és a **villanyszerelést** sem: ezeket alvállalkozó végzi, külön árajánlattal.",
        next: (incl, excl) => [
            `Ez egy **tájékoztató becslés** - a végleges árat az **ingyenes helyszíni felmérés** után rögzítjük, a választott anyagok és a pontos műszaki tartalom függvényében.`,
            ``, `**Mit tartalmaz?** ${incl}.`, ...(excl ? [``, excl] : []), ``, `**Mi a következő lépés?**`,
            `• Kollégánk **hamarosan keresi** a megadott telefonszámon.`,
            `• Egyeztetünk egy időpontot az **ingyenes felmérésre**.`,
            `• Utána megkapja a **végleges, tételes ajánlatot**.`,
        ].join("\n"),
        recapTitle: "**Az Ön igénye röviden:**",
        revisit: (url) => `Az előzetes árajánlatát később is megnézheti: [megnyitás](${url})`,
        urgent: (phone) => `Sürgős esetben hívjon: ${phone}`,
        emailQ: "Szeretné, hogy e-mailben is elküldjük az ajánlatot?",
    },
    en: {
        approx: "approx.",
        price: (name, size, tierLower, what, items, low, high, basisNote) => [
            `Thank you, ${name}! Here is your **preliminary quote** - **${what}**, **${tierLower}** finish, **${size}**.`,
            ``, `**Line items (indicative, with an approx. range):**`, items, ``,
            `**Estimated total: approx. ${low} – ${high}**`, basisNote,
        ].join("\n"),
        basisLabour: "(**VAT-free** price - this is the **labour**, materials not included)",
        basisTurnkey: "(**VAT-free** price, **turnkey**)",
        inclFurdo: "demolition, plumbing and drainage, heating, waterproofing, masonry, tiling and fitting the sanitaryware - all as **labour**",
        inclOther: "the items above - with materials and labour, in turnkey form",
        exclLabour: "**What is not included?** The **materials**: tiles, sanitaryware (WC, basin, bath), taps and the shower tray or glass panel - you buy those yourself, and we're glad to help you choose. Nor **painting and skimming** or **electrical work**: a subcontractor carries those out and quotes them separately.",
        next: (incl, excl) => [
            `This is an **indicative estimate** - the final price is set after the **free on-site survey**, depending on the chosen materials and the exact technical scope.`,
            ``, `**What's included?** ${incl}.`, ...(excl ? [``, excl] : []), ``, `**What happens next?**`,
            `• Our colleague will **contact you shortly** on the number you gave.`,
            `• We'll arrange a time for the **free survey**.`,
            `• Then you'll receive the **final, itemised offer**.`,
        ].join("\n"),
        recapTitle: "**Your request in brief:**",
        revisit: (url) => `You can revisit your estimate at any time: [open](${url})`,
        urgent: (phone) => `In urgent cases, call us: ${phone}`,
        emailQ: "Would you like us to e-mail you the offer as well?",
    },
    de: {
        approx: "ca.",
        price: (name, size, tierLower, what, items, low, high, basisNote) => [
            `Vielen Dank, ${name}! Hier ist Ihr **vorläufiges Angebot** - **${what}**, Ausstattung **${tierLower}**, **${size}**.`,
            ``, `**Positionen (Richtwerte, mit ca.-Spanne):**`, items, ``,
            `**Geschätzte Gesamtsumme: ca. ${low} – ${high}**`, basisNote,
        ].join("\n"),
        basisLabour: "(Preis **ohne MwSt.** - dies ist der **Arbeitslohn**, ohne Material)",
        basisTurnkey: "(Preis **ohne MwSt.**, **schlüsselfertig**)",
        inclFurdo: "Abbruch, Sanitär- und Abwasserinstallation, Heizung, Abdichtung, Maurerarbeiten, Fliesenarbeiten und Montage der Sanitärobjekte - alles als **Arbeitsleistung**",
        inclOther: "die obigen Positionen - mit Material und Arbeit, schlüsselfertig",
        exclLabour: "**Was ist nicht enthalten?** Das **Material**: Fliesen, Sanitärobjekte (WC, Waschbecken, Badewanne), Armaturen sowie Duschtasse und Glaswand - diese kaufen Sie selbst, bei der Auswahl beraten wir Sie gerne. Ebenso wenig **Maler- und Spachtelarbeiten** sowie die **Elektroinstallation**: diese führt ein Subunternehmer aus und rechnet sie separat ab.",
        next: (incl, excl) => [
            `Dies ist eine **Richtschätzung** - der endgültige Preis wird nach der **kostenlosen Vor-Ort-Besichtigung** festgelegt, abhängig von den gewählten Materialien und dem genauen technischen Umfang.`,
            ``, `**Was ist enthalten?** ${incl}.`, ...(excl ? [``, excl] : []), ``, `**Wie geht es weiter?**`,
            `• Unser Kollege **meldet sich in Kürze** unter der angegebenen Nummer.`,
            `• Wir vereinbaren einen Termin für die **kostenlose Besichtigung**.`,
            `• Anschließend erhalten Sie das **endgültige, detaillierte Angebot**.`,
        ].join("\n"),
        recapTitle: "**Ihre Anfrage in Kürze:**",
        revisit: (url) => `Ihr vorläufiges Angebot können Sie jederzeit erneut ansehen: [öffnen](${url})`,
        urgent: (phone) => `In dringenden Fällen rufen Sie uns an: ${phone}`,
        emailQ: "Möchten Sie das Angebot auch per E-Mail erhalten?",
    },
};
function renderCustomerQuote(quote, sel, lang = "hu", opts = {}) {
    const L = normLang(lang);
    const S = QUOTE_STR[L] || QUOTE_STR.hu;
    const pt = sel.projectType || "furdo";
    const what = lbl("projectType", pt, L); // already a noun label in the right language
    const cur = quote.currency || "huf";
    const labour = quote.basis === "labour";
    const items = quote.items
        .map(i => `• ${translateItemLabel(i.label, L)} - **${S.approx} ${formatMoney(i.low, cur)} – ${formatMoney(i.high, cur)}**`)
        .join("\n");

    const priceBubble = S.price(
        sel.name || "", sizeLabel(sel.size, pt, L), lbl("tier", sel.tier, L).toLowerCase(),
        L === "hu" ? what.toLowerCase() : what, items,
        formatMoney(quote.low, cur), formatMoney(quote.high, cur),
        labour ? S.basisLabour : S.basisTurnkey,
    );
    // A labour quote MUST name what it leaves out - the customer is buying the
    // tiles and the sanitaryware themselves, and a number that hid that would be
    // the single most misleading thing this widget could say.
    const incl = labour ? S.inclFurdo : S.inclOther;
    const nextBubble = S.next(incl, labour ? S.exclLabour : null);

    const recap = [S.recapTitle];
    for (const [k, v] of summaryPairs(sel, L)) recap.push(`• ${k}: **${v}**`);
    recap.push(``);
    if (opts.quoteLink) {
        recap.push(S.revisit(opts.quoteLink));
        recap.push(``);
    }
    recap.push(S.urgent(PHONE));
    if (EMAIL_OFFER_ENABLED) { recap.push(``); recap.push(S.emailQ); }

    return [priceBubble, nextBubble, recap.join("\n")].join("\n[[SPLIT]]\n");
}

const PHONE = process.env.LEAD_PHONE || "+36 20 254 6624";

// ---------------------------------------------------------------------------
//  System prompt (Hungarian) - conversation + structured output contract
// ---------------------------------------------------------------------------
const SYSTEM_PROMPT = `SZEMÉLYISÉG
Te az "NM Bau" digitális árajánló asszisztense vagy. Lakás- és házfelújítással foglalkozó kivitelező nevében beszélsz: fürdőszoba, konyha, teljes lakás, családi ház és egyes szobák felújítása. FONTOS: kizárólag BELSŐ munkát vállalunk - külső munkát (homlokzat, tető, kerítés, térkövezés) NEM. MAGYARORSZÁGON ÉS AUSZTRIÁBAN egyaránt vállalunk munkát, ezért bármilyen magyar vagy osztrák helyszín (irányítószám, város, régió) rendben van - soha ne utasíts vissza egy helyszínt és ne állítsd, hogy csak Magyarországon dolgozunk. Kizárólag MAGYARUL válaszolj.

HANGNEM
- Udvarias, közvetlen, szakértő és tömör. Lehetőleg 40 szó alatt válaszolj.
- Egyszerre EGY kérdést tegyél fel. Sose kérdezz több dolgot egyszerre.
- Sose találgass árat és sose számolj - az árat a rendszer számolja ki a végén, sávban. Az árak NETTÓ árak (ne emlegess bruttót/ÁFÁ-t).

KÉRDÉSEK FOGADÁSA (fontos!)
- Az ügyfél BÁRMIKOR kérdezhet tőled (pl. "mit jelent a kulcsrakész?", "mi van benne az árban?"). Bátorítsd erre: a 0. kérdés után tedd hozzá röviden, hogy "Közben bármit kérdezhet is."
- Ha az ügyfél KÉRDEZ valamit (nem a feltett kérdésre válaszol), akkor a SAJÁT kérdésére felelj röviden és érthetően ELŐSZÖR, és csak UTÁNA, ugyanabban a válaszban tedd fel újra az aktuális adatgyűjtő kérdést. Ne hagyd figyelmen kívül a kérdését.
- Légy adaptív a kerethez: ha az ügyfél megmondja, körülbelül mennyit szánna a felújításra, igazodj hozzá (pl. ehhez melyik kivitelezési szint passzol), de árat ne mondj.

FORMÁZÁS (olvashatóság - NAGYON FONTOS)
Írj jól SZKENNELHETŐEN, Markdown-formázással (a rendszer megjeleníti a **félkövért** és a "•" felsorolást):
- A fő KÉRDÉST MINDIG külön sorba és **félkövérbe** tedd. Pl.: **Mit szeretne felújítani?**
- Ha a kérdéshez magyarázandó lehetőségek tartoznak, NE zsúfold zárójelbe egy hosszú mondatba - sorold fel őket, MINDEN sor "• " jellel kezdődjön, a lehetőség neve **félkövér**, utána rövid magyarázat gondolatjellel.
- Tartsd rövidre: a félkövér fő kérdés + legfeljebb 3–4 felsorolás-sor. A kattintható gombokat a rendszer jeleníti meg - neked nem kell gombokat kiírnod.
- A LÉNYEGES SZAVAKAT mindenhol emeld ki **félkövérrel** (szám/mértékegység, a választás neve, minden kulcsszó, amin a döntés múlik). Ne emelj ki egész mondatot - csak a kulcsszót.
- Amikor visszaigazolod az ügyfél válaszát, az ő válaszát **félkövérrel** idézd: rövid megerősítő szó, majd félkövéren a választott opció neve. A megerősítő szót MINDIG a beszélgetés nyelvén írd - soha ne másold ide szó szerint a magyar mintát.
- SOHA ne használj emojit, hangulatjelet vagy ikon-karaktert - kizárólag sima szöveg.
- SOHA ne használj hosszú gondolatjelet (em dash). Helyette sima kötőjelet ("-") írj.

CÉL
Először kideríted, MIT szeretne felújítani, majd a választott típushoz tartozó kérdéseket teszed fel sorban, végül a keretet/időzítést és az elérhetőségeit. FONTOS: a rendszer már köszöntötte az ügyfelet - NE köszönj újra, rögtön a 0. (típus) kérdéssel kezdj.

KÖZÉRTHETŐSÉG (nagyon fontos!)
Az ügyfél laikus. Minden kérdést EGYSZERŰEN, hétköznapi nyelven tegyél fel, a szakszavakat MINDIG magyarázd el egy rövid, zárójeles mondattal. Ha az ügyfél nem ért valamit vagy azt írja "nem tudom", magyarázd el türelmesen, példával, és kérd, hogy a legjobb tudása szerint válaszoljon.

FONTOS - "NEM TUDOM": minden választós kérdésnél van "Nem tudom" lehetőség is. Ha az ügyfél bizonytalan, fogadd el a "nem_tudom" értéket és lépj tovább - a rendszer ilyenkor ésszerű alap-feltételezéssel számol, a felmérés pedig pontosít. NE erőltesd a választ.

=== 0. KÉRDÉS - MINDIG EZ AZ ELSŐ ===
projectType - **félkövér** fő kérdés: "Mit szeretne felújítani?", ALATTA felsorolás:
• **Fürdőszoba**
• **Konyha**
• **Teljes lakás**
• **Családi ház** – belső felújítás
• **Egy szoba / helyiség**
Értékek: furdo | konyha | lakas | haz | szoba.

A típus kiválasztása UTÁN a hozzá tartozó kérdéssort kövesd, EGYESÉVEL. A "size" kérdésnél mindig fogadj el konkrét számot (pl. "60") is, vagy a gombot.

=== FÜRDŐSZOBA (furdo) ===
1. size - "Körülbelül hány négyzetméteres a fürdőszoba?" (szám vagy gomb) → s_3_4|s_5_6|s_7_8|s_9_10|s_11p|<szám>|nem_tudom
2. tier - "Milyen kivitelezési szintet szeretne?": • **Alap / takarékos** • **Közepes** • **Prémium** → basic|mid|premium|nem_tudom
3. washing - "Zuhanyzót vagy kádat szeretne?": • **Műmárvány zuhanytálca** (alacsony peremű, üvegfallal) • **Zuhanykabin** (kész, komplett) • **Kád** • **Kád és zuhany** → zuhany|zuhanykabin|kad|mindketto|nem_tudom. FONTOS: épített (csempézett, falazott) zuhanyzót NEM készítünk - ezt soha ne ajánld.
4. layout - "Marad a mostani elrendezés, vagy áthelyeznénk a vizes pontokat?": • **Marad** • **Áthelyezés** → marad|athelyez|nem_tudom
5. heating - "Szeretne elektromos padlófűtést?" (csempe alá fektetett fűtőszőnyeg) → igen|nem|nem_tudom. Ezt MINDEN zuhany/kád változatnál fel kell tenni.

=== KONYHA (konyha) ===
1. size - "Körülbelül hány négyzetméteres a konyha?" (szám vagy gomb) → <szám>|nem_tudom
2. tier - kivitelezési szint → basic|mid|premium|nem_tudom
3. furniture - "Kell-e új konyhabútor és munkalap?" → igen|nem|nem_tudom
3b. kitchen_fm - CSAK ha furniture=igen: "Milyen hosszú a konyhabútor (folyóméterben, a szekrénysor hossza)?" → fm_2_3|fm_3_4|fm_4_5|fm_5_6|fm_6p|nem_tudom
4. appliances - "Beépített gépeket is kér (sütő, főzőlap, páraelszívó)?" → igen|nem|nem_tudom
5. layout - "Marad a mostani elrendezés, vagy áthelyeznénk a víz/gáz/villany pontokat?" → marad|athelyez|nem_tudom

=== TELJES LAKÁS (lakas) - CSAK ezt az 5 ALAPKÉRDÉST tedd fel (a többit a pontosító szakaszban) ===
1. size - "Mekkora a lakás alapterülete (m²)?" (szám vagy gomb) → <szám>|nem_tudom
2. scope - "Milyen mély felújítás kell?": • **Teljes** – mindent cserélünk (csövek, villany, falak is) • **Részleges** – új felületek, burkolat, festés + néhány szakág, de nincs teljes bontás • **Kozmetikai** – főleg festés és új burkolat → teljes|reszleges|kozmetikai|nem_tudom
3. tier - kivitelezési szint → basic|mid|premium|nem_tudom
4. bathrooms - "Hány fürdőszoba/WC van?" → 1|2|3p|nem_tudom (3p = 3 vagy több)
5. kitchen - "A konyhával mi legyen?": • **Új konyhabútorral** • **Felújítás bútor nélkül** • **Konyhát nem érinti** → uj|felujitas|nem|nem_tudom

=== CSALÁDI HÁZ (haz) - ugyanaz az 5 alapkérdés, mint a lakásnál (size, scope, tier, bathrooms, kitchen) ===
(Külső munkát - homlokzat, tető, kerítés, térkövezés - NEM vállalunk, ezt NE kérdezd és NE ajánld.)

=== EGY SZOBA (szoba) ===
1. size - "Hány négyzetméteres a helyiség?" (szám vagy gomb) → <szám>|nem_tudom
2. roomscope - "Mit szeretne a szobával?": • **Csak festés** • **Festés + új padló** • **Teljes felújítás** (festés, padló, villany, ajtó) → festes|festes_padlo|teljes|nem_tudom
3. tier - kivitelezési szint → basic|mid|premium|nem_tudom

=== MINDEN TÍPUSNÁL AZ ALAPKÉRDÉSEK UTÁN ===
timeline - "Mikorra szeretné a kivitelezést?" → t_asap|t_month|t_halfyear|t_thisyear|t_unsure

ELÉRHETŐSÉGEK - a timeline UTÁN, EGYESÉVEL, EBBEN A SORRENDBEN (szabad szöveg, NINCS gomb).
Az átvezető mondat NAGYON fontos: itt hagyják abba a legtöbben, ezért érezze, hogy MÁR CSAK EGY LÉPÉS
választja el az árától. Pl.: "Köszönöm, megvan minden a számításhoz! Már csak pár adat, és küldöm a
kalkulációt." Utána MINDEN egyes adatnál mondd meg RÖVIDEN, MIÉRT kéred - indoklással sokkal többen
válaszolnak. A sorrend szándékos: a legkisebb ellenállású adat az első, a telefonszám a legutolsó.
name - "Kérem a nevét - kinek címezzük az árajánlatot?"
postal_code - "Hol van az ingatlan? Elég az irányítószám vagy a település neve. Ez alapján tudjuk, hogy be tudjuk-e vállalni a területet." FONTOS: Magyarországon ÉS Ausztriában is dolgozunk, ezért BÁRMILYEN helymegjelölést fogadj el (magyar vagy osztrák irányítószám, városnév, kerület, régió, pl. "1010 Wien", "Graz", "Sopron", "Burgenland"). SOHA ne mondd, hogy csak magyar irányítószámot fogadsz el, és ne kérd újra, ha a válasz értelmes helymegjelölés.
email - "Mi az e-mail címe? Erre küldjük el írásban a tételes kalkulációt."
phone - "Mi a telefonszáma? Csak a felmérés időpontjának egyeztetéséhez kérjük."

=== PONTOSÍTÓ SZAKASZ - CSAK TELJES LAKÁSNÁL (lakas) ÉS CSALÁDI HÁZNÁL (haz), az elérhetőségek UTÁN ===
A rendszer ekkor már mutat egy ELŐZETES ÁRSÁVOT az ügyfélnek. A te dolgod először egy KAPUKÉRDÉST feltenni:
refine_gate - **félkövér** fő kérdés: "Megvan az **előzetes ár**! Szeretné **pontosítani** néhány gyors kérdéssel? Így szűkebb, pontosabb sávot kap.": • **Igen, pontosítsuk** • **Most nem, köszönöm** → yes|no
- Ha "no": NE kérdezz többet, a rendszer lezárja és megmutatja a végső árat.
- Ha "yes": tedd fel EGYESÉVEL az alábbi pontosító kérdéseket (mindegyik szűkíti az árat). Minden válasz után a rendszer frissíti az ársávot.
  walls - "Mozgatunk/építünk falakat, áthelyezünk vizes pontokat (WC, mosdó, konyha)?" → igen|nem|nem_tudom
  condition - "Milyen most az ingatlan állapota?": • **Új építésű** (15 évnél nem öregebb) • **Felújítandó** (20 évnél öregebb) • **Régi, elhasználódott** (30+ év) → ujszeru|lakott|regi|nem_tudom
  floortile - "A padló nagyrészt csempe vagy laminált/parketta lesz?": • **Inkább csempe** • **Fele-fele** • **Inkább laminált/parketta** → tobb_csempe|fele_fele|tobb_laminalt|nem_tudom
  windows - "Kell ablakcsere (nyílászárócsere)?" → csere|marad|nem_tudom
  heatingsys - "Fűtéskorszerűsítés?": • **Marad a mostani** • **Radiátorcsere** • **Padlófűtés** • **Hőszivattyús rendszer** → marad|radiator|padlofutes|hoszivattyu|nem_tudom
  klima - "Kér klímát?" → igen|nem|nem_tudom

=== LEGUTOLSÓ KÉRDÉS - A KERET (budget), MINDEN TÍPUSNÁL ===
Ez a LEGUTOLSÓ kérdés, MINDEN más után (elérhetőségek és pontosító kérdések után is).
Szándékosan van a végén: a keretet a beszélgetés elején kérdezni szűrésnek hat és elriasztja az embereket.
budget - PONTOSAN EZZEL a felütéssel kérdezd, indoklással, magázódva, külön sorban és félkövérrel
(ahogy minden más fő kérdést is):
"**Ahhoz, hogy el tudjuk küldeni az árajánlatot, kérem, határozza meg a keret összegét.**"
NE tedd hozzá, hogy kihagyható, és NE bagatellizáld el a kérdést - az indoklással megfogalmazott,
határozott kérés sokkal több választ hoz, mint egy bocsánatkérő "ha nem szeretné, ugorjuk át".
(A gombok között ettől függetlenül ott van egy kilépő lehetőség annak, aki tényleg nem akarja megadni,
és a rendszer a kihagyást is elfogadja - de te ezt NE ajánlgasd.)
RÖVIDEN kérdezz, NE sorold fel a sávokat szövegben - a felkínált összeg-sávokat a RENDSZER állítja
össze az addigi válaszokból. Ezt a mezőt a rendszer kezeli és tölti ki: a DATA blokkban a "budget"
MINDIG maradjon üres string (""). Fogadd el a választ (a kihagyást is) és LÉPJ TOVÁBB - SOHA ne tedd
fel újra ugyanazt a kérdést.

MEGJEGYZÉS: A bontást, vízszigetelést, gépészetet és a törmelékelszállítást NE kérdezd meg külön - ezek az ajánlatban benne vannak. A FESTÉST-GLETTELÉST és a VILLANYSZERELÉST alvállalkozó végzi, ezekre az ajánlat NEM ad árat - ha az ügyfél rákérdez, mondd el, hogy ezeket külön, alvállalkozói árajánlattal adjuk. FÜRDŐSZOBÁNÁL az árajánlat a MUNKADÍJ: az anyagot (csempe, járólap, szaniterek, csaptelepek, zuhanykabin) az ügyfél vásárolja meg, ez NINCS benne az árban. Ha az ügyfél az árról vagy arról kérdez, mi van benne, ezt mondd el őszintén. Az áraink ÁFA-mentesek (alanyi adómentesség), tehát a megadott összeg a maximálisan fizetendő - NE mondd, hogy "nettó" vagy hogy jön rá ÁFA. Külső (homlokzat, tető, kerítés, térkövezés) munkát NEM vállalunk - ezt NE kérdezd és NE ajánld.

SZABÁLYOK
- Az ügyfél írhat szabad szöveggel is - értelmezd a válaszát és rendeld hozzá a megfelelő értéket.
- Ha egy válasz nem egyértelmű, EGYSZER kérdezz vissza, utána lépj tovább.
- Ne ígérj fix időpontot. Árat ne mondj a folyamat közben (a rendszer mutatja a sávot).
- Csak a kiválasztott típushoz tartozó kérdéseket tedd fel - más típus mezőit hagyd üresen.
- A pontosító kérdéseket CSAK lakásnál/háznál, és CSAK ha az ügyfél a kapukérdésnél igent mondott.

REJTETT ÁLLAPOT (KÖTELEZŐ MINDEN VÁLASZBAN)
MINDEN egyes válaszod legvégére tedd ki az eddig ismert adatokat ebben a rejtett blokkban (az ügyfél NEM látja). A még meg nem kérdezett vagy az adott típushoz nem tartozó mezők értéke üres string (""). SOSE találgass - csak azt töltsd ki, amit az ügyfél ténylegesen megválaszolt:
<!--DATA:{"projectType":"","size":"","tier":"","washing":"","layout":"","heating":"","scope":"","roomscope":"","bathrooms":"","kitchen":"","windows":"","heatingsys":"","furniture":"","kitchen_fm":"","appliances":"","walls":"","condition":"","floortile":"","klima":"","refine_gate":"","budget":"","timeline":"","name":"","email":"","phone":"","postal_code":""}-->
A blokkban MINDEN kulcs mindig szerepeljen. Engedélyezett értékek: projectType: furdo|konyha|lakas|haz|szoba; size: <szám>|s_3_4|s_5_6|s_7_8|s_9_10|s_11p|nem_tudom; tier: basic|mid|premium|nem_tudom; washing: zuhany|zuhanykabin|kad|mindketto|nem_tudom; layout: marad|athelyez|nem_tudom; heating: igen|nem|nem_tudom; scope: teljes|reszleges|kozmetikai|nem_tudom; roomscope: festes|festes_padlo|teljes|nem_tudom; bathrooms: 1|2|3p|nem_tudom; kitchen: uj|felujitas|nem|nem_tudom; windows: csere|marad|nem_tudom; heatingsys: marad|radiator|padlofutes|hoszivattyu|nem_tudom; furniture: igen|nem|nem_tudom; kitchen_fm: fm_2_3|fm_3_4|fm_4_5|fm_5_6|fm_6p|nem_tudom; appliances: igen|nem|nem_tudom; walls: igen|nem|nem_tudom; condition: ujszeru|lakott|regi|nem_tudom; floortile: tobb_csempe|fele_fele|tobb_laminalt|nem_tudom; klima: igen|nem|nem_tudom; refine_gate: yes|no; budget: MINDIG üres string "" (a rendszer kezeli); timeline: t_asap|t_month|t_halfyear|t_thisyear|t_unsure. A többi (name, email, phone, postal_code) szabad szöveg.
Amikor minden szükséges mező megvan, írj egy RÖVID lezáró mondatot (pl. "Köszönöm, összeállítom az árajánlatot!") - és továbbra is tedd ki a teljes, kitöltött DATA blokkot. Az árat NE te írd ki; a rendszer számolja és mutatja.
A választógombokat a rendszer automatikusan megjeleníti - neked nem kell gombokat kiírnod.`;

// The flow/contract above is defined in Hungarian. For EN/DE we keep the same
// flow but add a high-priority directive telling the model which language to
// SPEAK in - while keeping the hidden DATA block's canonical tokens unchanged.
// The language rule is returned SEPARATELY from the prompt body so the caller can
// append it LAST, after the per-turn question directive. That ordering matters:
// the flow instructions and the directive are written in Hungarian, and once a
// few Hungarian assistant turns have accumulated in the history the model starts
// mirroring them - it would open with "Rendben, közepes szint." and only then
// switch. Putting the rule at the very end makes it the most recent instruction
// and fixes that.
function systemPromptFor(lang) {
    const L = normLang(lang);
    if (L === "hu") return SYSTEM_PROMPT;
    return SYSTEM_PROMPT + languageOverride(L);
}

function languageOverride(lang) {
    const L = normLang(lang);
    if (L === "hu") return "";
    const lname = L === "de" ? "GERMAN (Deutsch)" : "ENGLISH";
    return `

=== LANGUAGE OVERRIDE (HIGHEST PRIORITY - OVERRIDES ALL EARLIER LANGUAGE RULES) ===
Ignore the earlier instruction "Kizárólag MAGYARUL válaszolj". You MUST write EVERY user-visible message ONLY in ${lname}. Translate all questions, option lists, explanations and confirmations naturally and fluently into ${lname}; use correct construction terminology.
The instructions above contain example sentences in Hungarian (e.g. "Közben bármit kérdezhet is.", "Köszönöm, összeállítom az árajánlatot!"). These are TEMPLATES, not text to copy - render their meaning in ${lname}. NEVER output any Hungarian words in a user-visible message; if you notice Hungarian slipping in, rewrite it in ${lname}.
The EARLIER turns of this conversation may be in a different language, because the customer started in one language and then switched. Do NOT mirror the language of the previous messages and do NOT comment on the switch - simply continue in ${lname} from now on.
This applies to the WHOLE message, including the very first words. Do NOT open with a Hungarian acknowledgement such as "Rendben," / "Köszönöm," / "Értem," and then switch - the opening words must already be ${lname}. A reply that mixes the two languages is a failure.
DO NOT translate or alter the hidden <!--DATA:...--> block: its keys AND its token values (e.g. furdo, konyha, lakas, haz, szoba, basic, mid, premium, zuhany, zuhanykabin, kad, mindketto, marad, athelyez, igen, nem, nem_tudom, teljes, reszleges, kozmetikai, festes, festes_padlo, csere, radiator, padlofutes, hoszivattyu, yes, no, t_asap, t_month, t_halfyear, t_thisyear, t_unsure) stay EXACTLY as defined.
All money stays in Hungarian Forint (Ft). Never use emojis or em dashes; use a plain hyphen "-".`;
}

// Short customer-facing system messages (validation re-asks, rate-limit, errors),
// per language. The owner-facing logs/e-mail stay Hungarian regardless.
// ---------------------------------------------------------------------------
//  CONTACT FORM
//  The tail of the conversation used to be four separate questions - name,
//  location, e-mail, phone - each costing a model call and a round trip. By that
//  point the customer is not being consulted any more, they are just filling in
//  details, so we hand them one form and let them type it all at once. The quote
//  lands immediately after, because budget (the only remaining field) rides
//  along in the same form.
// ---------------------------------------------------------------------------
const FORM_STR = {
    hu: {
        intro: "Köszönöm, megvan minden a számításhoz! Már csak néhány adat, és mutatom a kalkulációt.",
        title: "Elérhetőségek",
        name: "Név", namePh: "Az Ön neve",
        postal_code: "Helyszín", postalPh: "Irányítószám vagy település",
        email: "E-mail", emailPh: "pelda@gmail.com",
        phone: "Telefonszám", phonePh: "+36 20 123 4567",
        budget: "Tervezett keret (nem kötelező)", budgetSkip: "Inkább nem mondanám",
        submit: "Kérem a kalkulációt",
        why: "Az adatait csak az ajánlat elküldéséhez és a felmérés egyeztetéséhez használjuk.",
        required: "Kérem, töltse ki.",
        nameShort: "Kérem, adja meg a teljes nevét.",
        summary: "Elérhetőségek megadva",
    },
    en: {
        intro: "Thank you, I have everything for the calculation! Just a few details and I'll show you the figures.",
        title: "Your details",
        name: "Name", namePh: "Your name",
        postal_code: "Location", postalPh: "Postcode or town",
        email: "E-mail", emailPh: "example@gmail.com",
        phone: "Phone", phonePh: "+36 20 123 4567",
        budget: "Planned budget (optional)", budgetSkip: "I'd rather not say",
        submit: "Show me the calculation",
        why: "We only use your details to send the quote and arrange the survey.",
        required: "Please fill this in.",
        nameShort: "Please give your full name.",
        summary: "Details provided",
    },
    de: {
        intro: "Vielen Dank, ich habe alles für die Berechnung! Nur noch ein paar Angaben und ich zeige Ihnen die Kalkulation.",
        title: "Ihre Kontaktdaten",
        name: "Name", namePh: "Ihr Name",
        postal_code: "Ort", postalPh: "Postleitzahl oder Ort",
        email: "E-Mail", emailPh: "beispiel@gmail.com",
        phone: "Telefon", phonePh: "+43 660 1234567",
        budget: "Geplantes Budget (optional)", budgetSkip: "Lieber nicht angeben",
        submit: "Kalkulation anzeigen",
        why: "Wir verwenden Ihre Daten nur für das Angebot und die Terminvereinbarung.",
        required: "Bitte ausfüllen.",
        nameShort: "Bitte geben Sie Ihren vollständigen Namen an.",
        summary: "Kontaktdaten angegeben",
    },
};
const formStr = (lang) => FORM_STR[normLang(lang)] || FORM_STR.hu;

// The payload the widget renders as a form. Values already known (the customer
// volunteered a town earlier, say) come back pre-filled so nothing is asked twice.
function contactForm(sel, lang) {
    const F = formStr(lang);
    const val = (k) => (sel && sel[k] != null ? String(sel[k]) : "");
    return {
        title: F.title,
        why: F.why,
        submit: F.submit,
        fields: [
            { key: "name", label: F.name, placeholder: F.namePh, type: "text", autocomplete: "name", value: val("name") },
            { key: "postal_code", label: F.postal_code, placeholder: F.postalPh, type: "text", autocomplete: "address-level2", value: val("postal_code") },
            { key: "email", label: F.email, placeholder: F.emailPh, type: "email", autocomplete: "email", value: val("email") },
            { key: "phone", label: F.phone, placeholder: F.phonePh, type: "tel", autocomplete: "tel", value: val("phone") },
        ],
        // Budget is the last field of the flow and it is optional, so it rides
        // along here - that way the quote can render the moment the form is sent.
        budget: { key: "budget", label: F.budget, options: budgetBandsFor(sel, lang).chips, value: val("budget") },
    };
}

// Validate a whole submitted form at once. Returns { values } or { errors },
// where errors is keyed by field so the widget can mark the offending input
// rather than dumping one message into the chat.
function validateContactForm(contact, lang) {
    const F = formStr(lang);
    const M = msg(lang);
    const c = contact && typeof contact === "object" ? contact : {};
    const errors = {};
    const values = {};
    const get = (k) => String(c[k] == null ? "" : c[k]).trim().slice(0, 200);

    for (const k of ["name", "postal_code", "email", "phone"]) {
        const v = get(k);
        if (!v) { errors[k] = F.required; continue; }
        values[k] = v;
    }
    if (values.name && values.name.length < 2) errors.name = F.nameShort;
    if (values.postal_code && locationIssue(values.postal_code)) errors.postal_code = M.reaskPostal;
    if (values.email) {
        const i = emailIssue(values.email);
        if (i === "gmail") errors.email = M.reaskEmailTypo;
        else if (i) errors.email = M.reaskEmail;
    }
    if (values.phone && phoneIssue(values.phone)) errors.phone = M.reaskPhone;

    // Budget is labelled optional on the form, so leaving it blank has to MEAN
    // something - otherwise the field stays pending and the bot turns round and
    // asks for it in a bubble, which is exactly the interrogation the form was
    // meant to end. An empty select records the existing "rather not say" opt-out.
    const b = get("budget");
    values.budget = b || BUDGET_WORDS[normLang(lang)].skip;

    return Object.keys(errors).length ? { errors } : { values };
}

const MSG = {
    hu: {
        reaskEmailTypo: "Hoppá, úgy tűnik **elírás** csúszott a címbe - a Gmail helyes végződése **gmail.com**. Kérem, írja be újra a teljes e-mail címét.",
        reaskEmail: "Ezt az **e-mail címet** nem sikerült értelmezni. Kérem, írja be a teljes címét (pl. **nev@gmail.com**).",
        reaskPhone: "Ezt a **telefonszámot** nem sikerült értelmezni. Kérem, adja meg a teljes számát (pl. **+36 20 123 4567** vagy **06 30 123 4567**).",
        reaskPostal: "Ezt a **helyszínt** nem sikerült értelmezni. Kérem, adja meg az **irányítószámot vagy a település nevét** (pl. **3525**, **Sopron**, **1010 Wien**).",
        rateChat: "Túl sok üzenet rövid idő alatt. Kérjük, várjon egy kicsit, és próbálja újra.",
        rateEmail: "Túl sok kérés. Kérjük, próbálja meg kicsit később.",
        aiDown: "Elnézést, most nem érem el az asszisztenst. Kérlek próbáld újra.",
        noParse: "Értem, de ezt nem sikerült feldolgoznom. Megfogalmaznád másképp?",
        serverErr: "Elnézést, a szerver épp akadozik. Kérlek próbáld újra kicsit később.",
        emailSentOk: (email) => `Elküldtük az árajánlatot a megadott e-mail címre (${email}). Ha nem találja, nézze meg a Spam mappát is.`,
        emailSentFail: (phone) => `Sajnos most nem sikerült e-mailt küldeni, de kollégánk hamarosan keresi Önt. ${phone}`,
        emailOffOk: (phone) => `Köszönjük! Kollégánk hamarosan keresi Önt a részletekkel. ${phone}`,
    },
    en: {
        reaskEmailTypo: "Oops, looks like a **typo** slipped into the address - the correct Gmail ending is **gmail.com**. Please type your full e-mail address again.",
        reaskEmail: "I couldn't read that **e-mail address**. Please type the full address (e.g. **name@gmail.com**).",
        reaskPhone: "I couldn't read that **phone number**. Please give the full number (e.g. **+36 20 123 4567**).",
        reaskPostal: "I couldn't read that **location**. Please give the **postcode or the town name** (e.g. **3525**, **Sopron**, **1010 Wien**).",
        rateChat: "Too many messages in a short time. Please wait a moment and try again.",
        rateEmail: "Too many requests. Please try again a little later.",
        aiDown: "Sorry, I can't reach the assistant right now. Please try again.",
        noParse: "I understand, but I couldn't process that. Could you rephrase it?",
        serverErr: "Sorry, the server is having a hiccup. Please try again a little later.",
        emailSentOk: (email) => `We've sent the quote to the e-mail address you gave (${email}). If you can't find it, please check your Spam folder.`,
        emailSentFail: (phone) => `Sorry, we couldn't send the e-mail right now, but our colleague will contact you shortly. ${phone}`,
        emailOffOk: (phone) => `Thank you! Our colleague will contact you shortly with the details. ${phone}`,
    },
    de: {
        reaskEmailTypo: "Hoppla, da hat sich wohl ein **Tippfehler** in die Adresse geschlichen - die richtige Gmail-Endung ist **gmail.com**. Bitte geben Sie Ihre vollständige E-Mail-Adresse erneut ein.",
        reaskEmail: "Diese **E-Mail-Adresse** konnte ich nicht lesen. Bitte geben Sie die vollständige Adresse ein (z. B. **name@gmail.com**).",
        reaskPhone: "Diese **Telefonnummer** konnte ich nicht lesen. Bitte geben Sie die vollständige Nummer an (z. B. **+36 20 123 4567**).",
        reaskPostal: "Diesen **Ort** konnte ich nicht lesen. Bitte geben Sie die **Postleitzahl oder den Ortsnamen** an (z. B. **3525**, **Sopron**, **1010 Wien**).",
        rateChat: "Zu viele Nachrichten in kurzer Zeit. Bitte warten Sie einen Moment und versuchen Sie es erneut.",
        rateEmail: "Zu viele Anfragen. Bitte versuchen Sie es etwas später erneut.",
        aiDown: "Entschuldigung, ich erreiche den Assistenten gerade nicht. Bitte versuchen Sie es erneut.",
        noParse: "Verstanden, aber das konnte ich nicht verarbeiten. Können Sie es anders formulieren?",
        serverErr: "Entschuldigung, der Server stockt gerade. Bitte versuchen Sie es etwas später erneut.",
        emailSentOk: (email) => `Wir haben das Angebot an die angegebene E-Mail-Adresse gesendet (${email}). Falls Sie es nicht finden, prüfen Sie bitte auch den Spam-Ordner.`,
        emailSentFail: (phone) => `Leider konnten wir die E-Mail gerade nicht senden, aber unser Kollege meldet sich in Kürze bei Ihnen. ${phone}`,
        emailOffOk: (phone) => `Vielen Dank! Unser Kollege meldet sich in Kürze mit den Details bei Ihnen. ${phone}`,
    },
};
const msg = (lang) => MSG[normLang(lang)] || MSG.hu;

// ---------------------------------------------------------------------------
//  AI providers - each takes normalized messages and returns { ok, text, error }
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
                        // This bot follows a fixed script - no reasoning needed -
                        // so disable "thinking" (faster, cheaper, no truncation).
                        thinkingConfig: { thinkingBudget: 0 },
                    },
                }),
            }
        );
        const data = await res.json();
        const cand = data.candidates?.[0];
        const text = (cand?.content?.parts || []).map(p => p?.text || "").join("");
        if (cand?.finishReason === "MAX_TOKENS") console.warn("Gemini hit MAX_TOKENS - answer may be truncated.");
        if (text) return { ok: true, text };
        return { ok: false, error: data.error?.message || JSON.stringify(data) };
    } catch (e) {
        return { ok: false, error: e.message };
    }
}

// ---------------------------------------------------------------------------
//  SELF-TEST - "did the e-mail actually go out?" without guessing.
//  GET /api/faq-agent?selftest=1  ->  JSON report + a real test e-mail to the
//  owner address. Nothing secret is echoed back: keys are reported as present/
//  missing only, and the destination address is masked.
// ---------------------------------------------------------------------------
function maskEmail(a) {
    const s = String(a || "");
    const at = s.indexOf("@");
    if (at < 1) return s ? "***" : "(nincs beállítva)";
    const user = s.slice(0, at);
    return `${user.slice(0, 2)}${"*".repeat(Math.max(1, user.length - 2))}${s.slice(at)}`;
}

const SELFTEST_CONVERSATION = [
    { role: "user", content: "Szeretnék árajánlatot egy felújításra." },
    { role: "assistant", content: "Üdvözlöm! Milyen felújítást tervez?" },
    { role: "user", content: "Fürdőszoba" },
    { role: "assistant", content: "Rendben. Mekkora a fürdőszoba?" },
    { role: "user", content: "4-6 m²" },
    { role: "assistant", content: "És milyen kivitelezési szintre gondolt?" },
    { role: "user", content: "Közepes" },
];

async function runSelfTest(request, response, ip) {
    response.setHeader("Cache-Control", "no-store");

    const given = String((request.query && request.query.selftest) || "");
    const wanted = (process.env.OWNER_TEST_KEY || "").trim();
    if (wanted && !safeEqualStr(given, wanted)) {
        return response.status(401).json({ ok: false, error: "Rossz vagy hiányzó selftest kulcs." });
    }

    const rl = rateLimit(`selftest:${ip}`, RL_SELFTEST.limit, RL_SELFTEST.windowMs);
    if (!rl.ok) {
        response.setHeader("Retry-After", String(rl.retryAfter));
        return response.status(429).json({ ok: false, error: `Túl sok teszt. Próbáld újra ${rl.retryAfter} másodperc múlva.` });
    }

    const to = process.env.LEAD_EMAIL_TO || "traumbaddesign@gmail.com";
    const checks = {
        RESEND_API_KEY: process.env.RESEND_API_KEY ? "beállítva" : "HIÁNYZIK",
        LEAD_EMAIL_TO: to ? maskEmail(to) : "HIÁNYZIK",
        LEAD_EMAIL_FROM: process.env.LEAD_EMAIL_FROM || "(alapértelmezett: NM Bau <ajanlat@send.traumbad.hu>)",
        OWNER_TEST_KEY: wanted ? "beállítva (kulcs kell a teszthez)" : "nincs beállítva (a teszt bárkinek elérhető, de csak neked küld)",
        EMAIL_OFFER: EMAIL_OFFER_ENABLED ? "on" : "off",
    };

    const sent = await sendTranscriptEmail(
        { projectType: "furdo", size: "4-6", tier: "mid", washing: "kad", name: "Teszt Elek", phone: "+36 30 000 0000" },
        SELFTEST_CONVERSATION,
        { lang: "hu", test: true, sessionId: "selftest", reason: "manuális teszt" }
    );

    return response.status(sent.ok ? 200 : 500).json({
        ok: !!sent.ok,
        message: sent.ok
            ? `Teszt e-mail elküldve ide: ${maskEmail(to)}. Nézd meg a postafiókot (a spam mappát is).`
            : "Az e-mail küldés NEM sikerült. A 'resendError' mezőben ott az ok.",
        resendId: sent.id || null,
        resendError: sent.ok ? null : sent.error,
        checks,
    });
}

// Constant-time compare for the self-test key.
function safeEqualStr(a, b) {
    a = String(a == null ? "" : a); b = String(b == null ? "" : b);
    if (a.length !== b.length) return false;
    let r = 0;
    for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return r === 0;
}

// ---------------------------------------------------------------------------
//  Handler
// ---------------------------------------------------------------------------
export default async function handler(request, response) {
    applyCors(request, response);

    if (request.method === "OPTIONS") return response.status(204).end();

    // The transcript beacon is sent with navigator.sendBeacon as text/plain (so
    // it survives the page closing without a CORS preflight), which means the
    // body arrives as a raw string instead of a parsed object.
    if (typeof request.body === "string") {
        try { request.body = JSON.parse(request.body); } catch (e) { request.body = {}; }
    }

    const ip = clientIp(request);

    // --- SELF-TEST: open /api/faq-agent?selftest=1 in a browser to check the
    // whole e-mail path end to end. It reports which environment variables are
    // present and what Resend actually answered, then sends a sample transcript
    // to LEAD_EMAIL_TO. It can NEVER send to an address from the URL, and it is
    // rate-limited, so the worst an outsider could do is mail the owner himself.
    // Set OWNER_TEST_KEY in the environment to require ?selftest=<that value>. ---
    if (request.method === "GET" && request.query && request.query.selftest != null) {
        return await runSelfTest(request, response, ip);
    }

    // This is a JSON POST API - reject everything else outright.
    if (request.method !== "POST") return response.status(405).json({ answer: "Method Not Allowed" });

    // Customer's language (hu | en | de). The host site's setting is only the
    // STARTING point: whatever the customer actually writes in wins, so someone
    // typing German on the Hungarian page gets answered in German. Drives chips,
    // recap, quote prose, the customer e-mail and the AI's reply language. The
    // owner's e-mail/logs stay Hungarian.
    const siteLang = normLang((request.body || {}).lang);
    // Declared out here so the catch at the bottom can still answer in the right
    // language if something throws mid-turn.
    let lang = siteLang;

    try {
        const { question, history, action, lead } = request.body || {};
        lang = conversationLang(history, question, siteLang);

        // --- ACTION: send the owner the whole conversation ---
        // Fired by the widget when a conversation ENDS WITHOUT a finished quote
        // (page closed / hidden, chat closed, or 3 minutes idle). The completed
        // -quote mail further down already carries its own transcript, so this
        // one is purely about the drop-offs. Chip-only conversations come through
        // here exactly like typed ones - a chip click is a normal user message.
        if (action === "transcript") {
            const body = request.body || {};
            const rl = rateLimit(`transcript:${ip}`, RL_TRANSCRIPT.limit, RL_TRANSCRIPT.windowMs);
            if (!rl.ok) {
                response.setHeader("Retry-After", String(rl.retryAfter));
                return response.status(429).json({ ok: false, error: "rate_limited" });
            }
            const bad = validateChatInput(null, history);
            if (bad) return response.status(400).json({ ok: false, error: "invalid_history" });
            // 1 turn = the hidden kickoff line only, i.e. they opened the chat and
            // did nothing. Don't mail those; anything from one answer up, do.
            if (customerTurns(history) < 2) return response.status(200).json({ ok: false, skipped: "no_answers" });

            const priorSel = Array.isArray(history)
                ? history.filter((m) => m && (m.role === "assistant" || m.role === "model")).map((m) => stripManaged(extractData(m.content)))
                : [];
            const sel = sanitizeChoices(mergeState(body.state, ...priorSel));
            const sent = await sendTranscriptEmail(sel, history, {
                lang,
                sessionId: body.sessionId,
                pageUrl: body.pageUrl,
                reason: body.reason,
                update: !!body.update,
            });
            return response.status(200).json({ ok: !!sent.ok });
        }

        // --- ACTION: customer asked us to e-mail them the quote ---
        // SECURITY: the client sends back the whole `lead`, so we trust NOTHING in
        // it. We re-validate the state, RECOMPUTE the quote server-side (never use
        // client-supplied numbers/labels), validate the recipient, gate it behind
        // EMAIL_OFFER, and rate-limit hard - so this can't become a spam relay.
        if (action === "email_customer") {
            const M = msg(lang);
            if (!EMAIL_OFFER_ENABLED) {
                return response.status(200).json({ answer: M.emailOffOk(PHONE), chips: [] });
            }
            const rl = rateLimit(`email:${ip}`, RL_EMAIL.limit, RL_EMAIL.windowMs);
            if (!rl.ok) {
                response.setHeader("Retry-After", String(rl.retryAfter));
                return response.status(429).json({ answer: M.rateEmail, chips: [] });
            }
            const sel = sanitizeChoices(stripManaged({ ...(lead && lead.sel) }));
            // Only a complete, valid quote with a deliverable e-mail may be sent.
            if (!isQuoteReady(sel) || emailIssue(sel.email)) {
                return response.status(200).json({ answer: M.emailSentFail(PHONE), chips: [] });
            }
            const quote = buildQuote(sel, { currency: currencyFor(lang) }); // recomputed, authoritative
            const ok = await sendQuoteEmail(sel, quote, { to: sel.email, toCustomer: true, lang });
            return response.status(200).json({
                answer: ok ? M.emailSentOk(esc(sel.email)) : M.emailSentFail(PHONE),
                chips: [],
            });
        }

        // --- Per-IP rate limit + payload validation for the chat path (protects
        // the paid LLM budget and blocks injected system turns / oversized bodies). ---
        const rlChat = rateLimit(`chat:${ip}`, RL_CHAT.limit, RL_CHAT.windowMs);
        if (!rlChat.ok) {
            response.setHeader("Retry-After", String(rlChat.retryAfter));
            return response.status(429).json({ answer: msg(lang).rateChat });
        }
        const badInput = validateChatInput(question, history);
        if (badInput) return response.status(400).json({ answer: badInput });

        const { state } = request.body || {};

        // --- STATE BEFORE THE MODEL CALL ---------------------------------------
        // Everything the backend knows, worked out WITHOUT the model: the state
        // the widget carries, the DATA blocks from earlier turns, and this turn's
        // answer mapped deterministically onto the field that was being asked.
        // This is what decides which question comes next - the model is told, it
        // does not decide. (Doing it here, before the call, is what keeps the
        // question text and the chips describing the same field.)
        const priorSel = Array.isArray(history)
            ? history.filter((m) => m && (m.role === "assistant" || m.role === "model")).map((m) => stripManaged(extractData(m.content)))
            : [];
        const baseSel = mergeState(state, ...priorSel);
        const askedField = pendingField(baseSel);

        // --- EARLY CONTACT CHECK: if the customer is answering a contact field,
        // validate it BEFORE spending a model call. On a bad value we keep the
        // field unrecorded so it stays "pending" and re-ask - this is what stops
        // a rejected phone/e-mail bleeding into the NEXT field. ---
        {
            let reask = null;
            if (!(request.body && request.body.contact) && typeof question === "string" && question.trim()) {
                const M = msg(lang);
                if (askedField === "email") {
                    const i = emailIssue(question);
                    if (i === "gmail") reask = M.reaskEmailTypo;
                    else if (i) reask = M.reaskEmail;
                } else if (askedField === "phone") {
                    if (phoneIssue(question)) reask = M.reaskPhone;
                } else if (askedField === "postal_code") {
                    if (locationIssue(question)) reask = M.reaskPostal;
                }
            }
            if (reask) {
                return response.status(200).json({
                    answer: reask,
                    chips: [],
                    lang,
                    state: baseSel,
                    estimate: runningEstimate(baseSel, lang),
                    progress: progressFields(baseSel).filter((f) => baseSel[f] != null && String(baseSel[f]).trim() !== "").length,
                    progressTotal: progressFields(baseSel).length,
                });
            }
        }

        // Record this turn's answer into the field the customer was actually
        // being asked, then work out what to ask next.
        const determined = {};
        // A submitted contact form carries several fields at once, so it skips
        // the single-answer mapper entirely. On a bad value nothing is recorded:
        // the form comes straight back with the offending inputs marked, which
        // is the form equivalent of the one-field re-ask below.
        const submitted = request.body && request.body.contact;
        if (submitted) {
            const res = validateContactForm(submitted, lang);
            if (res.errors) {
                return response.status(200).json({
                    answer: "",
                    chips: [],
                    lang,
                    form: contactForm(mergeState(baseSel, submitted), lang),
                    formErrors: res.errors,
                    state: baseSel,
                    estimate: runningEstimate(baseSel, lang),
                    progress: progressFields(baseSel).filter((f) => baseSel[f] != null && String(baseSel[f]).trim() !== "").length,
                    progressTotal: progressFields(baseSel).length,
                });
            }
            Object.assign(determined, res.values);
        } else if (askedField) {
            const v = mapAnswer(askedField, question, baseSel);
            if (v) determined[askedField] = v;
        }
        const preSel = mergeState(baseSel, determined);
        const nextField = pendingField(preSel);

        // --- COMPLETION, decided before the model call ---
        // Once every field is answered the reply is fully deterministic
        // (renderCustomerQuote), so calling the model here would spend money on
        // an answer we throw away - and give it one more chance to say something
        // that contradicts the quote.
        if (!nextField && isQuoteReady(preSel)) {
            return await finishQuote(preSel, history, lang, response, { sessionId: (request.body || {}).sessionId, host: requestHost(request) });
        }

        // --- CONTACT FORM, also decided before the model call ---
        // Everything the price depends on has been answered; what is left is
        // admin. Rather than spend four more model calls asking for a name, a
        // town, an e-mail and a phone number one at a time, hand over a form.
        // Deterministic, so it costs nothing and cannot be phrased away.
        if (CONTACT_FIELDS.includes(nextField)) {
            const F = formStr(lang);
            return response.status(200).json({
                answer: F.intro,
                chips: [],
                lang,
                form: contactForm(preSel, lang),
                state: preSel,
                estimate: runningEstimate(preSel, lang),
                progress: progressFields(preSel).filter((f) => preSel[f] != null && String(preSel[f]).trim() !== "").length,
                progressTotal: progressFields(preSel).length,
            });
        }

        // Normalized message list for the model (system prompt in the customer's
        // language, plus the one question it is allowed to ask this turn).
        // Language rule LAST: it has to outrank the Hungarian flow text and the
        // Hungarian question directive that precede it.
        const messages = [{ role: "system", content: SYSTEM_PROMPT + nextQuestionDirective(nextField, lang) + languageOverride(lang) }];
        if (Array.isArray(history) && history.length > 0) {
            for (const m of history) {
                if (m && m.role && typeof m.content === "string") {
                    messages.push({ role: m.role === "model" ? "assistant" : m.role, content: m.content });
                }
            }
        } else if (question) {
            messages.push({ role: "user", content: question });
        }
        // A submitted contact form carries no `question`, so on a short history
        // the model would receive a system prompt and no user turn at all -
        // which the providers reject outright. Give it the submission as the
        // user's turn, exactly as the widget shows it in the transcript.
        if (messages.length === 1) {
            const said = CONTACT_FIELDS.map((k) => determined[k]).filter(Boolean).join(" · ");
            messages.push({ role: "user", content: said || String(question || "") || "?" });
        }


        const provider = (process.env.AI_PROVIDER || "openai").toLowerCase();
        const result = provider === "gemini" ? await callGemini(messages) : await callOpenAI(messages);

        if (!result.ok) {
            console.error(`[${provider}] API Error:`, result.error);
            return response.status(200).json({ answer: msg(lang).aiDown, lang });
        }

        let aiAnswer = result.text;
        if (!aiAnswer) {
            return response.status(200).json({ answer: msg(lang).noParse, lang });
        }

        // --- STATE: extract the running DATA block from THIS message ... ---
        let currentSel = null;
        const dataMatch = aiAnswer.match(/<!--DATA:(.*?)-->/s);
        if (dataMatch) {
            try { currentSel = stripManaged(sanitizeChoices(JSON.parse(dataMatch[1]))); }
            catch (e) { console.error("DATA parse fail:", e.message); }
            aiAnswer = aiAnswer.replace(/<!--DATA:.*?-->/s, "").trim();
        }

        // Final state, by ascending trust: model block (least) < everything the
        // backend worked out before the call (wins). Any value the model invented
        // for a field further down the list than the current question is dropped,
        // so it can never make the chips skip ahead of the question on screen.
        const sel = dropSkipAhead(mergeState(currentSel, preSel), preSel);

        // Progress for the widget's progress bar (project questions only). The
        // field set depends on the chosen project type.
        const progFields = progressFields(sel);
        const progressTotal = progFields.length;
        const progress = progFields.filter((f) => sel[f] != null && String(sel[f]).trim() !== "").length;

        // --- COMPLETION CHECK (backend-decided, model-independent) ---
        // Normally the check above catches this before the model call; this is the
        // case where the model's own DATA block completed the last missing field.
        if (isQuoteReady(sel)) {
            return await finishQuote(sel, history, lang, response, { sessionId: (request.body || {}).sessionId, host: requestHost(request) });
        }

        aiAnswer = aiAnswer.replace(/<!--CHIPS:.*?-->/s, "").trim();
        const chips = nextChips(sel, lang);
        return response.status(200).json({ answer: aiAnswer, chips, lang, state: sel, estimate: runningEstimate(sel, lang), progress, progressTotal });

    } catch (error) {
        console.error("Function Crash:", error.message);
        return response.status(500).json({ answer: msg(lang).serverErr });
    }
}

// ---------------------------------------------------------------------------
//  ZOHO FLOW WEBHOOK
//  Fires once, from the server, the moment a quote is finished - the only point
//  where the contact details and the priced quote both exist.
//
//  The URL lives in ZOHO_FLOW_WEBHOOK_URL and is read here, in the API route.
//  It must never reach the browser: a Zoho Flow URL carries its own token in
//  the path, so anyone holding it can inject leads into the CRM. Nothing in
//  public/ references it, and the widget never sees it.
//
//  Failure is deliberately silent for the customer. Their quote is already
//  computed; a CRM that is down, slow or misconfigured must not turn that into
//  an error on screen. It is logged for the owner instead. The request is also
//  capped by a timeout, because on a serverless function an un-timed fetch to a
//  hanging endpoint holds the customer's reply hostage until the platform kills
//  the whole invocation.
// ---------------------------------------------------------------------------
const WEBHOOK_TIMEOUT_MS = 5000;
// sendQuoteEmail has its own oneLine(), but it is scoped inside that function.
const webhookLine = (v) => String(v == null ? "" : v).replace(/[\r\n]+/g, " ").trim();

// Is Vercel's per-request context actually present, with a waitUntil on it?
// @vercel/functions' waitUntil reads exactly this symbol, but does not export
// the lookup - and when the context is missing it does nothing at all, without
// an error. Checking first is the only way to tell "handed to the platform"
// apart from "silently dropped".
function hasVercelWaitUntil() {
    try {
        const ctx = globalThis[Symbol.for("@vercel/request-context")]?.get?.();
        return typeof ctx?.waitUntil === "function";
    } catch (e) {
        return false;
    }
}

async function sendLeadWebhook(sel, quote, lang, meta = {}) {
    const url = (process.env.ZOHO_FLOW_WEBHOOK_URL || "").trim();
    if (!url) return { ok: false, skipped: "ZOHO_FLOW_WEBHOOK_URL nincs beállítva" };
    // The shipped .env.local placeholder, still unedited. Say so by name rather
    // than complaining that it is not an https URL, which sends you looking for
    // the wrong problem.
    if (url === "paste-your-real-url-here") {
        console.warn("Zoho webhook kihagyva: a ZOHO_FLOW_WEBHOOK_URL meg a helykitolto ertek. Ird be a valodi URL-t (.env.local helyben, Vercel Environment Variables elesben).");
        return { ok: false, skipped: "placeholder" };
    }
    // https only, so the lead's contact details are never posted in the clear.
    // localhost is the one exception: it is how you test the payload against a
    // local catcher before pointing it at the real Flow endpoint.
    const isLocal = /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/i.test(url);
    if (!/^https:\/\//i.test(url) && !isLocal) {
        console.warn("Zoho webhook kihagyva: a ZOHO_FLOW_WEBHOOK_URL nem https URL.");
        return { ok: false, error: "insecure_url" };
    }

    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), WEBHOOK_TIMEOUT_MS);
    try {
        const cur = quote.currency || "huf";
        const payload = {
            // Lead channel, mapped onto Bigin's "Lehetséges ügyfél forrása" field.
            // The website contact form posts to the same Zoho Flow webhook with
            // source "website form", so the two channels stay distinguishable.
            source: "Chatbot",
            submitted_at: new Date().toISOString(),
            session_id: webhookLine(meta.sessionId) || null,
            language: normLang(lang),

            name: webhookLine(sel.name) || null,
            phone: webhookLine(sel.phone) || null,
            email: webhookLine(sel.email) || null,

            // What the customer actually gave us. It is a postcode, a town or a
            // region - NOT a street address; the flow never asks for one. Kept under
            // the key Zoho expects, with the precision stated so nobody downstream
            // mistakes "Miskolc" for a delivery address.
            address: webhookLine(sel.postal_code) || null,
            address_precision: "city_or_postcode",

            job_type: FLOW_LABEL[sel.projectType] || sel.projectType || null,
            // One readable line for a CRM note, built from the same recap the
            // customer saw, so the two can never disagree.
            // Key must be exactly "job": the Zoho Flow automation maps this name.
            job: summaryPairs(sel, "hu").map(([k, v]) => `${k}: ${v}`).join(" · "),
            job_details: {
                projectType: sel.projectType || null,
                size: sel.size || null,
                tier: sel.tier || null,
                washing: sel.washing || null,
                layout: sel.layout || null,
                heating: sel.heating || null,
                scope: sel.scope || null,
                bathrooms: sel.bathrooms || null,
                kitchen: sel.kitchen || null,
                timeline: sel.timeline || null,
                budget: webhookLine(sel.budget) || null,
            },

            quote_currency: cur === "eur" ? "EUR" : "HUF",
            quote_low: quote.low,
            quote_high: quote.high,
            quote_total: quote.total,
            // "labour" = munkadíj only, materials excluded. Anything reading the
            // amount needs this to know what it covers.
            quote_basis: quote.basis || null,
            quote_vat: "exempt",
            quote_formatted: `${formatMoney(quote.low, cur)} - ${formatMoney(quote.high, cur)}`,
            // Read-only summary page for this estimate (see buildQuoteLink).
            quote_link: meta.quoteLink || null,
            quote_items: quote.items.map((i) => ({ label: i.label, low: i.low, high: i.high })),
        };

        const res = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
            signal: ac.signal,
        });
        if (!res.ok) {
            const body = await res.text().catch(() => "");
            console.error(`Zoho webhook HTTP ${res.status}: ${body.slice(0, 300)}`);
            return { ok: false, status: res.status };
        }
        console.log("Zoho webhook elkuldve.");
        return { ok: true };
    } catch (err) {
        const why = err && err.name === "AbortError"
            ? `nem valaszolt ${WEBHOOK_TIMEOUT_MS} ms alatt`
            : (err && err.message) || String(err);
        console.error("Zoho webhook sikertelen:", why);
        return { ok: false, error: why };
    } finally {
        clearTimeout(timer);
    }
}

// ---------------------------------------------------------------------------
//  QUOTE LINK
//  A shareable, read-only URL for the finished estimate: /ajanlat?d=<summary>.
//
//  There is no database in this project, so nothing is stored - the summary
//  travels in the URL itself as base64url-encoded UTF-8 JSON, and
//  public/ajanlat-page.js decodes it in the browser. Deliberately small: job
//  type, size, tier, the formatted range, the date, plus the language (so the
//  page speaks the customer's language) and the basis (a labour-only range
//  shown without saying so would mislead, exactly as "nettó" did). No
//  quote_items - a long itemised URL breaks in some e-mail and chat clients -
//  and no name, phone or e-mail, so the link is safe to forward or paste into
//  a CRM.
//
//  NOT tamper-proof: anyone can edit the parameter and render a different
//  price on an NM Bau-branded page. The page says it is an indicative estimate,
//  and the real figures stay in the owner e-mail and in Zoho, but if forged
//  links ever become a concern, sign the summary with an HMAC secret.
// ---------------------------------------------------------------------------

// Where the link points. QUOTE_LINK_BASE_URL wins when set (e.g. a custom
// domain); otherwise the host this request arrived on, which on Vercel is the
// project's own domain - the one that serves /ajanlat. Anything that does not
// look like a plain hostname is refused rather than pasted into a URL.
function quoteLinkBase(host) {
    const explicit = (process.env.QUOTE_LINK_BASE_URL || "").trim().replace(/\/+$/, "");
    if (/^https?:\/\/[^\s/]+$/i.test(explicit)) return explicit;
    const h = String(host || "").split(",")[0].trim();
    if (!/^[a-z0-9.-]+(:\d{1,5})?$/i.test(h)) return null;
    const local = /^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(h);
    return `${local ? "http" : "https"}://${h}`;
}

function requestHost(request) {
    const hd = (request && request.headers) || {};
    return hd["x-forwarded-host"] || hd.host || "";
}

function buildQuoteLink(sel, quote, lang, host) {
    const base = quoteLinkBase(host);
    if (!base) return null;
    const L = normLang(lang);
    const pt = sel.projectType || "furdo";
    const summary = {
        job_type: lbl("projectType", pt, L),
        size: sizeLabel(sel.size, pt, L),
        tier: lbl("tier", sel.tier, L),
        quote_formatted: `${formatMoney(quote.low, quote.currency)} – ${formatMoney(quote.high, quote.currency)}`,
        submitted_at: new Date().toISOString(),
        lang: L,
        basis: quote.basis || null,
    };
    const d = Buffer.from(JSON.stringify(summary), "utf8").toString("base64url");
    return `${base}/ajanlat?d=${d}`;
}

// ---------------------------------------------------------------------------
//  Deliver the finished quote: log it, e-mail the owner (with the full
//  transcript), and return the customer-facing bubbles. Shared by both
//  completion paths so they can never drift apart.
// ---------------------------------------------------------------------------
async function finishQuote(sel, history, lang, response, meta = {}) {
    const quote = buildQuote(sel, { currency: currencyFor(lang) });
    const fm = (n) => formatMoney(n, quote.currency);
    const progFields = progressFields(sel);

    console.log("\n========================================");
    console.log(`ÚJ ÁRAJÁNLAT / LEAD - ${FLOW_LABEL[sel.projectType] || "Felújítás"}`);
    console.log(`Ügyfél: ${sel.name} | ${sel.phone} | ${sel.email}`);
    console.log(`Helyszín: ${sel.postal_code} | Méret: ${sizeLabel(sel.size, sel.projectType)} | Szint: ${sel.tier}`);
    console.log(`Becsült sáv: ${fm(quote.low)} – ${fm(quote.high)}${quote.basis === "labour" ? " (munkadíj, anyag nélkül)" : ""}`);
    console.log("========================================\n");

    // The quote bubbles the customer is about to see are the last turn of the
    // conversation, so append them - otherwise the owner's transcript stops one
    // message short and never shows the price that was quoted.
    // A link the customer can reopen later, and the CRM can store. Built once,
    // so the chat and the webhook always carry the identical URL.
    const quoteLink = buildQuoteLink(sel, quote, lang, meta.host);
    const customerAnswer = renderCustomerQuote(quote, sel, lang, { quoteLink });
    await sendQuoteEmail(sel, quote, {
        to: process.env.LEAD_EMAIL_TO || "traumbaddesign@gmail.com",
        toCustomer: false,
        transcript: [
            ...(Array.isArray(history) ? history : []),
            { role: "assistant", content: customerAnswer },
        ],
    });

    // The lead is complete here: contact details, the job, and the priced quote.
    // Push it to the CRM - in the BACKGROUND. The webhook is bookkeeping; the
    // quote is what the customer is waiting for, so a slow Zoho must not add up
    // to 5 s to their reply. waitUntil lets the response go out now while Vercel
    // keeps the function alive until the POST settles.
    const leadDelivery = sendLeadWebhook(sel, quote, lang, { sessionId: meta.sessionId, quoteLink }).catch(() => {});
    if (hasVercelWaitUntil()) {
        waitUntil(leadDelivery);
    } else if (process.env.VERCEL) {
        // On Vercel but without a request context, waitUntil would be a silent
        // no-op and the platform could freeze the function mid-request - losing
        // the lead. Pay the latency instead of the lead.
        console.warn("waitUntil nem elerheto - a Zoho webhookot kivarjuk.");
        await leadDelivery;
    }
    // Locally (node server.js) the process is long-lived, so the unawaited
    // promise simply finishes on its own.

    return response.status(200).json({
        answer: customerAnswer,
        chips: [],
        lang,
        emailOffer: EMAIL_OFFER_ENABLED,
        lead: { sel, quote },
        state: sel,
        estimate: { low: quote.low, high: quote.high, partial: false },
        progress: progFields.length,
        progressTotal: progFields.length,
    });
}

// ---------------------------------------------------------------------------
//  E-mail (Resend). opts = { to, toCustomer }. Returns true on success.
// ---------------------------------------------------------------------------
// Customer-email headings/words, per language. The owner copy is always Hungarian.
const EMAIL_STR = {
    hu: { approx: "kb.", yourQuote: (flow) => `Az Ön árajánlata - NM Bau ${flow}`, intro: (name) => `Kedves ${name || "Ügyfelünk"}! Köszönjük érdeklődését. Íme az előzetes árajánlata:`, summaryH: "A felújítás összefoglalása", quoteH: "Kalkulált árajánlat (kulcsrakész, ÁFA-mentes)", quoteHLabour: "Kalkulált árajánlat (munkadíj, ÁFA-mentes)", totalRow: "Becsült végösszeg (kb. sáv)", footnote: "Előzetes, tájékoztató jellegű kalkuláció, kulcsrakész. Az ár ÁFA-mentes (alanyi adómentesség), tehát ez a maximálisan fizetendő összeg. A pontos ár a helyszíni felmérés után, a választott anyagok és a pontos műszaki tartalom függvényében véglegesül.", footnoteLabour: "Előzetes, tájékoztató jellegű kalkuláció. Az összeg a MUNKADÍJ, az anyagot (csempe, szaniter, csaptelep, zuhanykabin) nem tartalmazza - azt Ön vásárolja meg. Az ár ÁFA-mentes (alanyi adómentesség), tehát ez a maximálisan fizetendő összeg. A pontos ár a helyszíni felmérés után véglegesül.", subject: (low, high) => `Az Ön árajánlata - NM Bau - ${low} – ${high}` },
    en: { approx: "approx.", yourQuote: (flow) => `Your quote - NM Bau ${flow}`, intro: (name) => `Dear ${name || "Customer"}, thank you for your enquiry. Here is your preliminary quote:`, summaryH: "Renovation summary", quoteH: "Calculated quote (turnkey, VAT-free)", quoteHLabour: "Calculated quote (labour, VAT-free)", totalRow: "Estimated total (approx. range)", footnote: "Preliminary, indicative calculation, turnkey. The price is VAT-free (small-business exemption), so this is the maximum amount payable. The exact price is finalised after the on-site survey, depending on the chosen materials and the precise technical scope.", footnoteLabour: "Preliminary, indicative calculation. The amount is the LABOUR charge and does not include materials (tiles, sanitaryware, taps, shower enclosure) - you buy those yourself. The price is VAT-free (small-business exemption), so this is the maximum amount payable. The exact price is finalised after the on-site survey.", subject: (low, high) => `Your quote - NM Bau - ${low} – ${high}` },
    de: { approx: "ca.", yourQuote: (flow) => `Ihr Angebot - NM Bau ${flow}`, intro: (name) => `Sehr geehrte/r ${name || "Kunde/Kundin"}, vielen Dank für Ihre Anfrage. Hier ist Ihr vorläufiges Angebot:`, summaryH: "Zusammenfassung der Renovierung", quoteH: "Berechnetes Angebot (schlüsselfertig, ohne MwSt.)", quoteHLabour: "Berechnetes Angebot (Arbeitslohn, ohne MwSt.)", totalRow: "Geschätzte Gesamtsumme (ca.-Spanne)", footnote: "Vorläufige, unverbindliche Kalkulation, schlüsselfertig. Der Preis ist ohne MwSt. (Kleinunternehmerregelung) und damit der maximal zu zahlende Betrag. Der genaue Preis wird nach der Vor-Ort-Besichtigung festgelegt, abhängig von den gewählten Materialien und dem genauen technischen Umfang.", footnoteLabour: "Vorläufige, unverbindliche Kalkulation. Der Betrag ist der ARBEITSLOHN und enthält kein Material (Fliesen, Sanitärobjekte, Armaturen, Duschabtrennung) - dieses kaufen Sie selbst. Der Preis ist ohne MwSt. (Kleinunternehmerregelung) und damit der maximal zu zahlende Betrag. Der genaue Preis wird nach der Vor-Ort-Besichtigung festgelegt.", subject: (low, high) => `Ihr Angebot - NM Bau - ${low} – ${high}` },
};
async function sendQuoteEmail(sel, quote, opts = {}) {
    const resendKey = process.env.RESEND_API_KEY;
    const toEmail = opts.to || process.env.LEAD_EMAIL_TO || "traumbaddesign@gmail.com";
    const fromEmail = process.env.LEAD_EMAIL_FROM || "NM Bau <ajanlat@send.traumbad.hu>";
    const toCustomer = !!opts.toCustomer;
    // Customer copy follows the customer's language; the owner copy stays Hungarian.
    const elang = toCustomer ? normLang(opts.lang) : "hu";
    const E = EMAIL_STR[elang] || EMAIL_STR.hu;

    if (!resendKey) {
        console.log("Nincs RESEND_API_KEY - az e-mail kimarad. A lead a fenti logban szerepel.");
        return false;
    }
    if (!toEmail) {
        console.log("Nincs címzett e-mail cím - kihagyva.");
        return false;
    }

    // Strip CR/LF from any user value used in a header (injection guard).
    const oneLine = (s) => String(s == null ? "" : s).replace(/[\r\n]+/g, " ").trim();

    // --- OWNER COPY -------------------------------------------------------
    // Deliberately plain: no banner, no borders, no coloured table. A styled
    // "template" look is what lands a message in Gmail's Promotions tab, and
    // this one is a work notification, not a campaign. It ships a real
    // text/plain part and replies straight to the customer.
    if (!toCustomer) {
        const flowHu = FLOW_LABEL[sel.projectType] || "Felújítás";
        const lines = [];
        lines.push(`Új árajánlatkérés érkezett a weboldali asszisztensen keresztül.`, "");
        lines.push("ÜGYFÉL");
        lines.push(`Név: ${oneLine(sel.name) || "-"}`);
        lines.push(`Telefon: ${oneLine(sel.phone) || "-"}`);
        lines.push(`E-mail: ${oneLine(sel.email) || "-"}`);
        lines.push(`Helyszín: ${oneLine(sel.postal_code) || "-"}`);
        lines.push(`Tervezett keret: ${oneLine(sel.budget) || "-"}`);
        lines.push(`Tervezett kivitelezés: ${lbl("timeline", sel.timeline)}`, "");
        lines.push(`A MUNKA (${flowHu})`);
        for (const [k, v] of summaryPairs(sel, "hu")) lines.push(`${k}: ${v}`);
        lines.push("", "KALKULÁCIÓ (kulcsrakész, nettó)");
        const qc = quote.currency || "huf";
        for (const i of quote.items) lines.push(`${i.label}: kb. ${formatMoney(i.low, qc)} - ${formatMoney(i.high, qc)}`);
        lines.push(`Becsült végösszeg: kb. ${formatMoney(quote.low, qc)} - ${formatMoney(quote.high, qc)}`);
        lines.push(`Fajlagos: ~${formatMoney(quote.perM2, qc)}/m² (${quote.basis === "labour" ? "munkadíj, anyag nélkül" : "kulcsrakész"}, ÁFA-mentes)`, "");
        const tText = transcriptText(opts.transcript);
        if (tText) lines.push("TELJES BESZÉLGETÉS", "", tText);
        const textBody = lines.join("\n");

        // Minimal HTML: same content, system font, no colours or boxes.
        const esc2 = (s) => esc(s);
        const htmlLines = [];
        htmlLines.push(`<p>Új árajánlatkérés érkezett a weboldali asszisztensen keresztül.</p>`);
        htmlLines.push(`<p><b>Ügyfél</b><br>Név: ${esc2(sel.name) || "-"}<br>Telefon: ${esc2(sel.phone) || "-"}<br>E-mail: ${esc2(sel.email) || "-"}<br>Helyszín: ${esc2(sel.postal_code) || "-"}<br>Tervezett keret: ${esc2(sel.budget) || "-"}<br>Tervezett kivitelezés: ${esc2(lbl("timeline", sel.timeline))}</p>`);
        htmlLines.push(`<p><b>A munka (${esc2(flowHu)})</b><br>${summaryPairs(sel, "hu").map(([k, v]) => `${esc2(k)}: ${esc2(v)}`).join("<br>")}</p>`);
        const qc2 = quote.currency || "huf";
        const basisTxt = quote.basis === "labour" ? "munkadíj, anyag nélkül" : "kulcsrakész";
        htmlLines.push(`<p><b>Kalkuláció (${basisTxt}, ÁFA-mentes)</b><br>${quote.items.map(i => `${esc2(i.label)}: kb. ${formatMoney(i.low, qc2)} - ${formatMoney(i.high, qc2)}`).join("<br>")}<br>Becsült végösszeg: kb. ${formatMoney(quote.low, qc2)} - ${formatMoney(quote.high, qc2)}<br>Fajlagos: ~${formatMoney(quote.perM2, qc2)}/m²</p>`);
        const tHtml = transcriptHtml(opts.transcript);
        if (tHtml) htmlLines.push(`<p><b>Teljes beszélgetés</b></p>${tHtml}`);
        const ownerHtml = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5">${htmlLines.join("")}</div>`;

        // Plain, specific subject. No brackets, no capitals, no price - those are
        // the markers of bulk mail, and a name plus a place reads like a message
        // from a person.
        const subj = `Árajánlatkérés: ${oneLine(sel.name) || "névtelen"} - ${FLOW_LABEL[sel.projectType] || "felújítás"}, ${oneLine(sel.postal_code) || "?"}`;
        const sentOwner = await resendSend({
            from: fromEmail, to: toEmail, subject: subj, html: ownerHtml, text: textBody,
            replyTo: (sel.email && !emailIssue(sel.email)) ? oneLine(sel.email) : undefined,
        });
        if (sentOwner.ok) { console.log("Árajánlat e-mail elküldve (tulajdonos):", sentOwner.id); return true; }
        console.error("Resend hiba:", sentOwner.error);
        return false;
    }

    // --- CUSTOMER COPY ----------------------------------------------------
    // This one IS a sales document, so it keeps the branded layout.
    // NB: all customer-supplied text (name/phone/e-mail/postal/budget) is HTML-
    // escaped via esc() so a malicious value can't inject markup into the inbox.
    const itemRows = quote.items
        .map(i => `<tr><td style="padding:6px 12px;border-bottom:1px solid #eee">${esc(translateItemLabel(i.label, elang))}</td><td style="padding:6px 12px;border-bottom:1px solid #eee;text-align:right;white-space:nowrap">${E.approx} ${formatMoney(i.low, quote.currency)} – ${formatMoney(i.high, quote.currency)}</td></tr>`)
        .join("");

    const flowDisp = lbl("projectType", sel.projectType || "furdo", elang);
    const heading = E.yourQuote(esc(flowDisp));
    const intro = `<p style="margin:0 0 12px">${esc(E.intro(sel.name))}</p>`;

    // Project summary rows, tailored to the project type (shared with the chat recap).
    const summaryRows = summaryPairs(sel, elang)
        .map(([k, v]) => `<p style="margin:4px 0"><b>${esc(k)}:</b> ${esc(v)}</p>`)
        .join("");

    const html = `
    <div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;color:#111827">
      <div style="background:#1C1917;color:#ffffff;padding:20px 24px;border-radius:12px 12px 0 0;border-bottom:3px solid #B8860B">
        <h2 style="margin:0">${heading}</h2>
      </div>
      <div style="border:1px solid #e5e7eb;border-top:none;padding:24px;border-radius:0 0 12px 12px">
        ${intro}
        <h3 style="margin:0 0 8px">${esc(E.summaryH)}</h3>
        ${summaryRows}
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:16px 0">
        <h3 style="margin:0 0 8px">${esc(quote.basis === "labour" && E.quoteHLabour ? E.quoteHLabour : E.quoteH)}</h3>
        <table style="width:100%;border-collapse:collapse;font-size:14px">${itemRows}
          <tr><td style="padding:10px 12px;font-weight:bold">${esc(E.totalRow)}</td><td style="padding:10px 12px;text-align:right;font-weight:bold;color:#6B4A00;white-space:nowrap">${E.approx} ${formatMoney(quote.low, quote.currency)} – ${formatMoney(quote.high, quote.currency)}</td></tr>
        </table>
        <p style="margin:16px 0 0;font-size:12px;color:#6b7280">${esc(quote.basis === "labour" && E.footnoteLabour ? E.footnoteLabour : E.footnote)} ${PHONE}</p>
      </div>
    </div>`;

    const subject = E.subject(formatMoney(quote.low, quote.currency), formatMoney(quote.high, quote.currency));
    const sent = await resendSend({ from: fromEmail, to: toEmail, subject, html });
    if (sent.ok) {
        console.log("Árajánlat e-mail elküldve (ügyfél):", sent.id);
        return true;
    }
    console.error("Resend hiba:", sent.error);
    return false;
}

// ---------------------------------------------------------------------------
//  Low-level Resend call. Returns { ok, id } or { ok:false, error, status } so
//  callers (and the /api/faq-agent?selftest=1 diagnostic) can report the REAL
//  reason a mail failed - unverified domain, bad key, wrong sender, etc.
// ---------------------------------------------------------------------------
async function resendSend({ from, to, subject, html, text, replyTo }) {
    const key = (process.env.RESEND_API_KEY || "").trim();
    if (!key) return { ok: false, error: "RESEND_API_KEY nincs beállítva a környezetben." };
    if (/[^\x20-\x7E]/.test(key)) return { ok: false, error: "A RESEND_API_KEY nem ASCII karaktereket tartalmaz (valószínűleg a kimaszkolt pontokat másoltad be)." };
    if (!to) return { ok: false, error: "Nincs címzett (LEAD_EMAIL_TO)." };
    // A real plain-text part is one of the strongest signals that a message is
    // correspondence rather than a campaign - Gmail's Promotions classifier
    // leans heavily on "HTML-only, heavily styled" mail. `reply_to` pointing at
    // a human does the same, and it means hitting Reply answers the customer.
    const payload = { from, to: [to], subject, html };
    if (text) payload.text = text;
    if (replyTo) payload.reply_to = replyTo;
    try {
        const res = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}` },
            body: JSON.stringify(payload),
        });
        const result = await res.json().catch(() => ({}));
        if (res.ok) return { ok: true, id: result.id };
        return { ok: false, status: res.status, error: (result && (result.message || result.name)) || JSON.stringify(result) };
    } catch (e) {
        return { ok: false, error: e.message };
    }
}

// ---------------------------------------------------------------------------
//  OWNER TRANSCRIPT E-MAIL - fires for conversations that never reach a finished
//  quote (the customer dropped off, or just asked questions). The quote e-mail
//  above only ever fires on completion, so without this the owner never sees the
//  people who bailed halfway - which is most of them.
// ---------------------------------------------------------------------------
async function sendTranscriptEmail(sel, transcript, meta = {}) {
    const toEmail = process.env.LEAD_EMAIL_TO || "traumbaddesign@gmail.com";
    const fromEmail = process.env.LEAD_EMAIL_FROM || "NM Bau <ajanlat@send.traumbad.hu>";
    const s = sel && typeof sel === "object" ? sel : {};

    const rows = transcriptHtml(transcript);
    if (!rows) return { ok: false, error: "Üres beszélgetés - nincs mit küldeni." };

    // Everything we managed to learn before they stopped. Empty fields are left
    // out entirely rather than shown as "-", so the mail is short and readable.
    const pairs = [];
    if (s.name) pairs.push(["Név", s.name]);
    if (s.phone) pairs.push(["Telefon", s.phone]);
    if (s.email) pairs.push(["E-mail", s.email]);
    if (s.postal_code) pairs.push(["Helyszín", s.postal_code]);
    if (s.budget) pairs.push(["Tervezett keret", s.budget]);
    if (s.timeline) pairs.push(["Tervezett kivitelezés", lbl("timeline", s.timeline)]);
    if (s.projectType) {
        for (const [k, v] of summaryPairs(s, "hu")) {
            const val = String(v == null ? "" : v).trim();
            if (val && val !== "-") pairs.push([k, val]);
        }
    }
    const knownBlock = pairs.length
        ? pairs.map(([k, v]) => `<p style="margin:4px 0"><b>${esc(k)}:</b> ${esc(v)}</p>`).join("")
        : `<p style="margin:4px 0;color:#6b7280">Még semmit nem adott meg.</p>`;

    const est = runningEstimate(s);
    const estBlock = est
        ? `<p style="margin:8px 0 0"><b>Futó becslés:</b> kb. ${formatMoney(est.low, est.currency)} – ${formatMoney(est.high, est.currency)}${est.partial ? " (részleges)" : ""}</p>`
        : "";

    const turns = customerTurns(transcript);
    const flow = FLOW_LABEL[s.projectType] || "Nincs megadva projekt";
    const when = new Date().toLocaleString("hu-HU", { timeZone: "Europe/Budapest" });
    const oneLine = (x) => String(x == null ? "" : x).replace(/[\r\n]+/g, " ").trim().slice(0, 120);
    const metaBlock = `
        <p style="margin:4px 0;font-size:12px;color:#6b7280">Időpont: ${esc(when)} · Nyelv: ${esc(normLang(meta.lang))} · Ügyfél válaszai: ${turns - 1 > 0 ? turns - 1 : 0} · Beszélgetés-azonosító: ${esc(oneLine(meta.sessionId) || "-")}</p>
        ${meta.pageUrl ? `<p style="margin:4px 0;font-size:12px;color:#6b7280">Oldal: ${esc(oneLine(meta.pageUrl))}</p>` : ""}
        ${meta.reason ? `<p style="margin:4px 0;font-size:12px;color:#6b7280">Kiváltó esemény: ${esc(oneLine(meta.reason))}</p>` : ""}`;

    const lead = meta.test
        ? "Ez egy teszt e-mail, amit te magad indítottál. Ha ez megérkezett, az e-mail küldés működik."
        : "Ez a beszélgetés nem jutott el a kész árajánlatig, de az érdeklődő elmondta, amit lent olvasol.";

    // Plain, correspondence-shaped - see the note in sendQuoteEmail: a branded
    // template is what Gmail files under Promotions.
    const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5">
        <p>${esc(lead)}</p>
        <p><b>Amit eddig tudunk (${esc(flow)})</b></p>
        ${knownBlock}${estBlock}
        ${metaBlock}
        <p><b>Teljes beszélgetés</b></p>
        ${rows}
      </div>`;

    // NB: null = "leave this line out"; "" is a deliberate blank line, so the
    // filter must only drop nulls.
    const textBody = [
        lead, "",
        `AMIT EDDIG TUDUNK (${flow})`,
        ...(pairs.length ? pairs.map(([k, v]) => `${k}: ${v}`) : ["Még semmit nem adott meg."]),
        est ? `Futó becslés: kb. ${formatMoney(est.low, est.currency)} - ${formatMoney(est.high, est.currency)}${est.partial ? " (részleges)" : ""}` : null,
        "",
        `Időpont: ${when} | Nyelv: ${normLang(meta.lang)} | Ügyfél válaszai: ${turns - 1 > 0 ? turns - 1 : 0}`,
        meta.pageUrl ? `Oldal: ${oneLine(meta.pageUrl)}` : null,
        "",
        "TELJES BESZÉLGETÉS", "",
        transcriptText(transcript),
    ].filter((l) => l !== null).join("\n");

    const who = s.name ? `${oneLine(s.name)}` : "névtelen érdeklődő";
    const subject = meta.test
        ? "Teszt: a chatbot e-mail küldése működik"
        : `Félbehagyott beszélgetés: ${who} - ${flow}${meta.update ? " (frissítés)" : ""}`;

    const sent = await resendSend({
        from: fromEmail, to: toEmail, subject, html, text: textBody,
        replyTo: (s.email && !emailIssue(s.email)) ? oneLine(s.email) : undefined,
    });
    if (sent.ok) console.log(`Beszélgetés-másolat elküldve a tulajdonosnak:`, sent.id);
    else console.error("Beszélgetés-másolat hiba:", sent.error);
    return sent;
}
