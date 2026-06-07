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
    demoPerM2: 3000,
    demoFixed: 70000,

    // Screed levelling (aljzatkiegyenlítés): over the whole FLOOR, per m².
    screedPerM2: 6500,
    // Two-layer brush-on waterproofing (kétrétegű kenhető vízszigetelés): over the
    // FLOOR *plus* the wet-zone walls behind the shower/bath (not just the floor —
    // this is the fix for the previously under-priced prep line). Per m².
    waterproofPerM2: 7000,
    // Primer, corner/joint sealing tapes, floor drain collar — fixed wet-room setup.
    prepFixed: 20000,

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
        zuhany:      { basic: 120000, mid: 220000, premium: 400000 }, // beépített (tálcás/falazott) zuhanyzó + üveg
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
function buildQuote(sel) {
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

    const total = items.reduce((s, i) => s + i.huf, 0);
    const low = round10000(total * MODEL.bandLow);
    const high = round10000(total * MODEL.bandHigh);
    const perM2 = Math.round(total / A); // implied turnkey Ft/m² (market sanity check)
    return { items, total, low, high, area: A, perM2 };
}

// Exported for unit testing the pricing math (no effect in production).
export { buildQuote, areaOf, tiledSurface };

// Backend decides when the quote is complete — independent of the AI model.
function isQuoteReady(s) {
    if (!s || typeof s !== "object") return false;
    const filled = (k) => s[k] != null && String(s[k]).trim() !== "";
    const required = [
        "size", "tier", "washing", "layout", "heating", "budget", "timeline",
        "name", "email", "phone", "postal_code",
    ];
    return required.every(filled);
}

// Quick-reply buttons per choice question — decided by the BACKEND from the
// current state, so the right buttons always appear (not reliant on the model).
const CHIP_MAP = {
    size: ["3–4 m²", "5–6 m²", "7–8 m²", "9–10 m²", "10 m² felett", "Nem tudom"],
    tier: ["Alap / takarékos", "Közepes", "Prémium", "Nem tudom"],
    washing: ["Zuhanyzó (beépített)", "Zuhanykabin", "Kád", "Kád és zuhany", "Nem tudom"],
    layout: ["Marad a mostani elrendezés", "Áthelyezzük", "Nem tudom"],
    heating: ["Kérek padlófűtést", "Nem szükséges", "Nem tudom"],
    budget: ["1 millió Ft alatt", "1–2 millió Ft", "2–3 millió Ft", "3 millió Ft felett", "Még nem tudom"],
    timeline: ["Amint lehet", "Egy hónapon belül", "Fél éven belül", "Még idén", "Még nem tudom"],
};

// Order the questions are asked in: project questions first, contact details last
// (only after the project is fully described, i.e. the progress bar hits 100%).
const FIELD_ORDER = ["size", "tier", "washing", "layout", "heating", "budget", "timeline",
    "name", "email", "phone", "postal_code"];

// Only the project questions count toward the progress bar.
const PROGRESS_FIELDS = ["size", "tier", "washing", "layout", "heating", "budget", "timeline"];

// Maps a clicked chip label -> its canonical value, per field. Lets the BACKEND
// record an answer the instant it arrives, without waiting for the model's
// (one-step-behind) state block. Keys are the lowercased CHIP_MAP labels.
const CHIP_VALUES = {
    size: {
        "3–4 m²": "s_3_4", "5–6 m²": "s_5_6", "7–8 m²": "s_7_8",
        "9–10 m²": "s_9_10", "10 m² felett": "s_11p", "nem tudom": "nem_tudom",
    },
    tier: { "alap / takarékos": "basic", "közepes": "mid", "prémium": "premium", "nem tudom": "nem_tudom" },
    washing: {
        "zuhanyzó (beépített)": "zuhany", "zuhanykabin": "zuhanykabin",
        "kád": "kad", "kád és zuhany": "mindketto", "nem tudom": "nem_tudom",
    },
    layout: { "marad a mostani elrendezés": "marad", "áthelyezzük": "athelyez", "nem tudom": "nem_tudom" },
    heating: { "kérek padlófűtést": "igen", "nem szükséges": "nem", "nem tudom": "nem_tudom" },
    budget: {
        "1 millió ft alatt": "b_1m",
        "1–2 millió ft": "b_1_2",
        "2–3 millió ft": "b_2_3",
        "3 millió ft felett": "b_3m",
        "még nem tudom": "b_unsure",
    },
    timeline: {
        "amint lehet": "t_asap",
        "egy hónapon belül": "t_month",
        "fél éven belül": "t_halfyear",
        "még idén": "t_thisyear",
        "még nem tudom": "t_unsure",
    },
};

// The first still-unanswered field given the current state (= the question the
// customer is being asked right now). Returns null when everything is filled.
function pendingField(sel) {
    const filled = (k) => sel && sel[k] != null && String(sel[k]).trim() !== "";
    for (const f of FIELD_ORDER) if (!filled(f)) return f;
    return null;
}

// Parse a free-typed bathroom size in m². Accepts "6", "6 m2", "6,5 m²", "6nm".
// Returns a plausible number (1–60) or null.
function parseArea(text) {
    if (typeof text !== "string") return null;
    const m = text.toLowerCase().replace(",", ".").match(/(\d+(?:\.\d+)?)/);
    if (!m) return null;
    const n = parseFloat(m[1]);
    return !isNaN(n) && n >= 1 && n <= 60 ? n : null;
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

// Put a Ft amount into the right budget band (bathroom-scale). Implausibly small
// inputs return null so they're rejected, not silently bucketed.
function bucketBudget(amount) {
    if (amount == null || amount < 50000) return null;
    if (amount < 1_000_000) return "b_1m";
    if (amount < 2_000_000) return "b_1_2";
    if (amount < 3_000_000) return "b_2_3";
    return "b_3m";
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

// Given the field the customer is answering + their message, return the canonical
// value. Choice fields match the clicked chip label (case-insensitive). Size also
// accepts a typed number (stored as the bare number string). Budget also accepts
// a typed amount, bucketed into a band. Contact fields take the text as-is.
function mapAnswer(field, answer) {
    if (typeof answer !== "string" || !answer.trim()) return null;
    const a = answer.trim();
    if (field === "size") {
        const chip = CHIP_VALUES.size[a.toLowerCase()];
        if (chip) return chip;
        const n = parseArea(a);
        return n != null ? String(n) : null;
    }
    if (field === "budget") {
        return CHIP_VALUES.budget[a.toLowerCase()] || bucketBudget(parseBudgetAmount(a));
    }
    if (CHIP_VALUES[field]) return CHIP_VALUES[field][a.toLowerCase()] || null;
    if (["name", "email", "phone", "postal_code"].includes(field)) return a;
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
    return f ? (CHIP_MAP[f] || []) : [];
}

// Human-readable Hungarian labels for the recap. Fixed-token choice fields only;
// `size` is handled by sizeLabel() since it can also be a free number.
const LABELS = {
    tier: { basic: "Alap / takarékos", mid: "Közepes", premium: "Prémium", nem_tudom: "Nem tudja (alap: közepes)" },
    washing: { zuhany: "Beépített zuhanyzó", zuhanykabin: "Zuhanykabin", kad: "Kád", mindketto: "Kád és zuhany", nem_tudom: "Nem tudja (alap: zuhanykabin)" },
    layout: { marad: "Marad a mostani", athelyez: "Áthelyezés (új elrendezés)", nem_tudom: "Nem tudja (alap: marad)" },
    heating: { igen: "Igen, padlófűtéssel", nem: "Nem", nem_tudom: "Nem tudja (alap: nincs)" },
    budget: { b_1m: "1 millió Ft alatt", b_1_2: "1–2 millió Ft", b_2_3: "2–3 millió Ft", b_3m: "3 millió Ft felett", b_unsure: "Még nem tudom" },
    timeline: { t_asap: "Amint lehet", t_month: "Egy hónapon belül", t_halfyear: "Fél éven belül", t_thisyear: "Még idén", t_unsure: "Még nem tudja" },
};
const lbl = (group, key) => (LABELS[group] && LABELS[group][key]) || key || "—";

// Size label: band token → friendly band; free number → "N m²"; unknown → note.
const SIZE_LABEL = { s_3_4: "3–4 m²", s_5_6: "5–6 m²", s_7_8: "7–8 m²", s_9_10: "9–10 m²", s_11p: "10 m² felett", nem_tudom: "Nem tudja (alap: 5 m²)" };
function sizeLabel(size) {
    if (size && Object.prototype.hasOwnProperty.call(SIZE_LABEL, size)) return SIZE_LABEL[size];
    const n = parseFloat(String(size).replace(",", "."));
    return !isNaN(n) && n > 0 ? `${String(size).replace(".", ",")} m²` : "—";
}

// Choice fields with fixed tokens, validated against LABELS in sanitizeChoices.
const CHOICE_FIELDS = ["tier", "washing", "layout", "heating", "budget", "timeline"];

// Drop any choice-field value the model invents that isn't a known canonical
// value. `size` is validated separately (known token OR a plausible number).
function sanitizeChoices(s) {
    if (!s || typeof s !== "object") return s;
    for (const field of CHOICE_FIELDS) {
        const v = s[field];
        if (v != null && String(v).trim() !== "" && !(String(v) in LABELS[field])) delete s[field];
    }
    if (s.size != null && String(s.size).trim() !== "") {
        const ok = String(s.size) in SIZE_AREA || parseArea(String(s.size)) != null;
        if (!ok) delete s.size;
    }
    return s;
}

// Customer-facing estimate. Returns sections split by [[SPLIT]] so the widget
// renders them as separate chat bubbles. Numbers come from buildQuote.
function renderCustomerQuote(quote, sel) {
    const items = quote.items.map(i => `• ${i.label} — **${formatHuf(i.huf)}**`).join("\n");

    // Bubble 1 — the price (shown as a range)
    const priceBubble = [
        `Köszönöm, ${sel.name || ""}! Íme az előzetes árajánlata. 🙏`,
        ``,
        `**Tételek:**`,
        items,
        ``,
        `**Becsült végösszeg: ${formatHuf(quote.low)} – ${formatHuf(quote.high)}** (bruttó, ÁFÁ-val, kulcsrakész)`,
    ].join("\n");

    // Bubble 2 — "just an estimate" note
    const noteBubble = [
        `ℹ️ Ez egy **előzetes, tájékoztató becslés** — a végleges ár a helyszíni felmérés után pontosul, a választott burkolat és szaniterek függvényében.`,
        `Az ár **kulcsrakész**: bontás, gépészet, villany, szigetelés, burkolás, festés, valamint a szaniterek és csaptelepek anyaga és beépítése is benne van.`,
    ].join("\n");

    // Bubble 3 — recap of everything the customer said
    const recap = [`**Az Ön válaszai:**`];
    recap.push(`• Fürdőszoba mérete: ${sizeLabel(sel.size)}`);
    recap.push(`• Kivitelezési szint: ${lbl("tier", sel.tier)}`);
    recap.push(`• Zuhany / kád: ${lbl("washing", sel.washing)}`);
    recap.push(`• Elrendezés: ${lbl("layout", sel.layout)}`);
    recap.push(`• Padlófűtés: ${lbl("heating", sel.heating)}`);
    recap.push(`• Név: ${sel.name || "—"}`);
    recap.push(`• E-mail: ${sel.email || "—"}`);
    recap.push(`• Telefon: ${sel.phone || "—"}`);
    recap.push(`• Irányítószám: ${sel.postal_code || "—"}`);
    recap.push(`• Tervezett keret: ${lbl("budget", sel.budget)}`);
    recap.push(`• Tervezett kivitelezés: ${lbl("timeline", sel.timeline)}`);
    recap.push(``);
    recap.push(`Az adatait továbbítottuk az NM Bau-hoz — hamarosan keressük! 📞 ${PHONE}`);
    if (EMAIL_OFFER_ENABLED) {
        recap.push(``);
        recap.push(`Szeretné, hogy e-mailben is elküldjük az ajánlatot?`);
    }

    return [priceBubble, noteBubble, recap.join("\n")].join("\n[[SPLIT]]\n");
}

const PHONE = process.env.LEAD_PHONE || "+36 30 260 57 56";

// ---------------------------------------------------------------------------
//  System prompt (Hungarian) — conversation + structured output contract
// ---------------------------------------------------------------------------
const SYSTEM_PROMPT = `SZEMÉLYISÉG
Te az "NM Bau" digitális árajánló asszisztense vagy. Fürdőszoba-felújítással foglalkozó kivitelező nevében beszélsz. Kizárólag MAGYARUL válaszolj.

HANGNEM
- Udvarias, közvetlen, szakértő és tömör. Lehetőleg 40 szó alatt válaszolj.
- Egyszerre EGY kérdést tegyél fel. Sose kérdezz több dolgot egyszerre.
- Sose találgass árat és sose számolj — az árat a rendszer számolja ki a végén, sávban.

FORMÁZÁS (olvashatóság — NAGYON FONTOS)
Írj jól SZKENNELHETŐEN, Markdown-formázással (a rendszer megjeleníti a **félkövért** és a "•" felsorolást):
- A fő KÉRDÉST MINDIG külön sorba és **félkövérbe** tedd. Pl.: **Körülbelül hány négyzetméteres a fürdőszoba?**
- Ha a kérdéshez magyarázandó lehetőségek tartoznak, NE zsúfold zárójelbe egy hosszú mondatba — sorold fel őket, MINDEN sor "• " jellel kezdődjön, a lehetőség neve **félkövér**, utána rövid magyarázat gondolatjellel. Példa a teljes válaszformára:
**Milyen kivitelezési szintet szeretne?**
• **Alap / takarékos** – egyszerű, jó ár-érték csempe és szaniter
• **Közepes** – szép, márkás, középkategóriás anyagok
• **Prémium** – magas minőségű, dizájn burkolat és szaniter
- Tartsd rövidre: a félkövér fő kérdés + legfeljebb 3–4 felsorolás-sor. A kattintható gombokat a rendszer jeleníti meg — neked nem kell gombokat kiírnod.
- A LÉNYEGES SZAVAKAT mindenhol emeld ki **félkövérrel**: a szám/mértékegység (pl. **7–8 m²**), a kivitelezési szint neve, a "**marad**"/"**áthelyezés**", a "**padlófűtés**", és minden olyan kulcsszó, amin a döntés múlik. Egy soron belül is legyen kiemelve a fontos szó (pl. "Erre küldjük el az **árajánlatot**."). Ne emelj ki egész mondatot — csak a kulcsszót.
- Amikor visszaigazolod az ügyfél válaszát, az ő válaszát is **félkövérrel** idézd (pl. "Rendben, **közepes** szint.").

CÉL
Végigvezeted az ügyfelet az alábbi kérdéseken, majd elkéred az elérhetőségeit. A kérdéseket természetesen, sorban tedd fel. FONTOS: a rendszer már köszöntötte az ügyfelet — NE köszönj újra, rögtön az 1. kérdéssel kezdj.

KÖZÉRTHETŐSÉG (nagyon fontos!)
Az ügyfél laikus. Minden kérdést EGYSZERŰEN, hétköznapi nyelven tegyél fel, a szakszavakat MINDIG magyarázd el egy rövid, zárójeles mondattal. Ha az ügyfél nem ért valamit vagy azt írja "nem tudom", magyarázd el türelmesen, példával, és kérd, hogy a legjobb tudása szerint válaszoljon.

FONTOS — "NEM TUDOM": minden választós kérdésnél van "Nem tudom" lehetőség is. Ha az ügyfél bizonytalan, fogadd el a "nem_tudom" értéket és lépj tovább — a rendszer ilyenkor egy ésszerű alap-feltételezéssel számol, a felmérés pedig pontosít. NE erőltesd a választ.

KÉRDÉSEK SORRENDJE (egyesével, mindig csak EGY kérdés!). ELŐSZÖR az 1–7. projektkérdést tedd fel, és CSAK utána, a végén kérd el az elérhetőségeket (8–11.):
1. size — **félkövér** fő kérdés: "Körülbelül hány négyzetméteres a fürdőszoba?" + egy rövid sor: mondjon konkrét számot (pl. 6 m²), vagy válasszon a gombok közül. Értékek: "s_3_4", "s_5_6", "s_7_8", "s_9_10", "s_11p", vagy egy szám (pl. "6"), vagy "nem_tudom".
2. tier — **félkövér** fő kérdés "Milyen kivitelezési szintet szeretne?", ALATTA felsorolás (kötelező ez a forma):
   • **Alap / takarékos** – egyszerű, jó ár-érték csempe és szaniter
   • **Közepes** – szép, márkás, középkategóriás anyagok
   • **Prémium** – magas minőségű, dizájn burkolat és szaniter
   Értékek: "basic", "mid", "premium", "nem_tudom".
3. washing — **félkövér** fő kérdés "Zuhanyzót vagy kádat szeretne?", ALATTA felsorolás:
   • **Beépített zuhanyzó** – falazott/tálcás, üvegfallal
   • **Zuhanykabin** – kész, komplett kabin
   • **Kád** – fürdőkád
   • **Kád és zuhany** – mindkettő, külön
   Értékek: "zuhany", "zuhanykabin", "kad", "mindketto", "nem_tudom".
4. layout — **félkövér** fő kérdés "Marad a mostani elrendezés, vagy áthelyeznénk a vizes pontokat?", ALATTA felsorolás:
   • **Marad** – a WC, mosdó, zuhany a helyén marad
   • **Áthelyezés** – új elrendezés, több gépészeti munkával
   Értékek: "marad", "athelyez", "nem_tudom".
5. heating — **félkövér** fő kérdés "Szeretne elektromos padlófűtést a fürdőbe?" + egy rövid magyarázó sor (kellemes meleg padló, csempe alá fektetett fűtőszőnyeg). Értékek: "igen", "nem", "nem_tudom".
6. budget — "Nagyjából milyen összeget szánna a felújításra?" RÖVIDEN kérdezz, NE sorold fel a sávokat szövegben — a gombokat a rendszer megjeleníti. Sávok (csak neked): 1 millió alatt → b_1m; 1–2 millió → b_1_2; 2–3 millió → b_2_3; 3 millió felett → b_3m; "Még nem tudom" → b_unsure. Konkrét számot sorolj be a megfelelő sávba.
7. timeline — "Mikorra szeretné a kivitelezést?" RÖVIDEN kérdezz, a gombokat a rendszer megjeleníti. Lehetőségek (csak neked): Amint lehet → t_asap; Egy hónapon belül → t_month; Fél éven belül → t_halfyear; Még idén → t_thisyear; "Még nem tudom" → t_unsure.

ELÉRHETŐSÉGEK — CSAK a 7. kérdés UTÁN kérd el ezeket, az árajánlat elküldéséhez és a visszahíváshoz. A 8. kérdés ELŐTT írj egy rövid átvezető mondatot, pl.: "Köszönöm! Hogy elküldhessük a személyre szabott árajánlatot és felvehessük Önnel a kapcsolatot, kérek még pár adatot." Utána KÜLÖN-KÜLÖN, egyesével kérdezd (a 8–11. szabad szöveg, NINCS gomb), és minden kérdésnél mondd meg RÖVIDEN, miért kéred:
8. name — "Kérem a nevét — kinek címezzük az árajánlatot?"
9. email — "Mi az e-mail címe? Erre küldjük el az árajánlatot."
10. phone — "Mi a telefonszáma? Ezen a számon hívjuk vissza a részletekkel."
11. postal_code — "Mi az irányítószáma? Ez alapján tudjuk a kiszállást/felmérést egyeztetni."

MEGJEGYZÉS: A bontást, vízszigetelést, gépészetet, villanyszerelést, festést és a törmelékelszállítást NE kérdezd meg — ezek minden kulcsrakész ajánlatban benne vannak, a rendszer automatikusan hozzáadja.

SZABÁLYOK
- Az ügyfél írhat szabad szöveggel is — értelmezd a válaszát és rendeld hozzá a megfelelő értéket.
- Ha egy válasz nem egyértelmű, EGYSZER kérdezz vissza, utána lépj tovább.
- Ne ígérj fix időpontot. Árat ne mondj a folyamat közben.

REJTETT ÁLLAPOT (KÖTELEZŐ MINDEN VÁLASZBAN)
MINDEN egyes válaszod legvégére tedd ki az eddig ismert adatokat ebben a rejtett blokkban (az ügyfél NEM látja). A még meg nem kérdezett mezők értéke üres string (""). SOSE találgass — csak azt töltsd ki, amit az ügyfél ténylegesen megválaszolt:
<!--DATA:{"size":"","tier":"","washing":"","layout":"","heating":"","budget":"","timeline":"","name":"","email":"","phone":"","postal_code":""}-->
A blokkban MINDEN kulcs mindig szerepeljen, csak az értékeket töltsd. Engedélyezett értékek: size: s_3_4|s_5_6|s_7_8|s_9_10|s_11p|<szám>|nem_tudom; tier: basic|mid|premium|nem_tudom; washing: zuhany|zuhanykabin|kad|mindketto|nem_tudom; layout: marad|athelyez|nem_tudom; heating: igen|nem|nem_tudom; budget: b_1m|b_1_2|b_2_3|b_3m|b_unsure; timeline: t_asap|t_month|t_halfyear|t_thisyear|t_unsure. A többi (name, email, phone, postal_code) szabad szöveg.
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
                    ? `Elküldtük az árajánlatot a megadott e-mail címre (${lead.sel.email}). 📧 Ha nem találja, nézze meg a Spam mappát is.`
                    : `Sajnos most nem sikerült e-mailt küldeni, de kollégánk hamarosan keresi Önt. 📞 ${PHONE}`,
                chips: [],
            });
        }

        // --- EARLY E-MAIL CHECK: if the customer is answering the e-mail field,
        // catch an obvious typo (esp. a misspelled gmail.com) BEFORE spending a
        // model call. We keep the field unrecorded so it stays "pending" and the
        // flow waits for a corrected address. ---
        {
            const priorSel = Array.isArray(history)
                ? history.filter((m) => m && (m.role === "assistant" || m.role === "model")).map((m) => extractData(m.content))
                : [];
            const baseSel = mergeState(state, ...priorSel);
            if (pendingField(baseSel) === "email" && typeof question === "string" && question.trim()) {
                const issue = emailIssue(question);
                if (issue) {
                    return response.status(200).json({
                        answer: issue === "gmail"
                            ? "Hoppá, úgy tűnik **elírás** csúszott a címbe — a Gmail helyes végződése **gmail.com**. Kérem, írja be újra a teljes e-mail címét. 🙏"
                            : "Ezt az **e-mail címet** nem sikerült értelmezni. Kérem, írja be a teljes címét (pl. **nev@gmail.com**).",
                        chips: [],
                        state: baseSel,
                        progress: PROGRESS_FIELDS.filter((f) => baseSel[f] != null && String(baseSel[f]).trim() !== "").length,
                        progressTotal: PROGRESS_FIELDS.length,
                    });
                }
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
            const v = mapAnswer(pending, question);
            if (v) determined[pending] = v;
        }

        // Final state, by ascending trust: model block (least) < accumulated <
        // this turn's deterministically-mapped answer (wins).
        const sel = mergeState(currentSel, baseSel, determined);

        // Progress for the widget's progress bar (project questions only).
        const progressTotal = PROGRESS_FIELDS.length;
        const progress = PROGRESS_FIELDS.filter((f) => sel[f] != null && String(sel[f]).trim() !== "").length;

        // --- COMPLETION CHECK (backend-decided, model-independent) ---
        if (isQuoteReady(sel)) {
            const quote = buildQuote(sel);

            console.log("\n========================================");
            console.log("🎯 ÚJ ÁRAJÁNLAT / LEAD — Fürdőszoba");
            console.log(`Ügyfél: ${sel.name} | ${sel.phone} | ${sel.email}`);
            console.log(`Irsz.: ${sel.postal_code} | Méret: ${sizeLabel(sel.size)} | Szint: ${sel.tier}`);
            console.log(`Becsült sáv: ${formatHuf(quote.low)} – ${formatHuf(quote.high)}`);
            console.log("========================================\n");

            await sendQuoteEmail(sel, quote, { to: process.env.LEAD_EMAIL_TO || "pirint.milan@gmail.com", toCustomer: false });

            return response.status(200).json({
                answer: renderCustomerQuote(quote, sel),
                chips: [],
                emailOffer: EMAIL_OFFER_ENABLED,
                lead: { sel, quote },
                state: sel,
                progress: progressTotal,
                progressTotal,
            });
        }

        aiAnswer = aiAnswer.replace(/<!--CHIPS:.*?-->/s, "").trim();
        const chips = nextChips(sel);
        return response.status(200).json({ answer: aiAnswer, chips, state: sel, progress, progressTotal });

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

    const heading = toCustomer ? "Az Ön árajánlata — NM Bau Fürdőszoba-felújítás" : "Új árajánlat — NM Bau Fürdőszoba-felújítás";
    const intro = toCustomer
        ? `<p style="margin:0 0 12px">Kedves ${sel.name || "Ügyfelünk"}! Köszönjük érdeklődését. Íme az előzetes árajánlata:</p>`
        : "";

    const html = `
    <div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;color:#111827">
      <div style="background:#1C1917;color:#ffffff;padding:20px 24px;border-radius:12px 12px 0 0;border-bottom:3px solid #B8860B">
        <h2 style="margin:0">${heading}</h2>
      </div>
      <div style="border:1px solid #e5e7eb;border-top:none;padding:24px;border-radius:0 0 12px 12px">
        ${intro}${clientBlock}
        <h3 style="margin:0 0 8px">A felújítás összefoglalása</h3>
        <p style="margin:4px 0"><b>Méret:</b> ${sizeLabel(sel.size)}</p>
        <p style="margin:4px 0"><b>Kivitelezési szint:</b> ${lbl("tier", sel.tier)}</p>
        <p style="margin:4px 0"><b>Zuhany / kád:</b> ${lbl("washing", sel.washing)}</p>
        <p style="margin:4px 0"><b>Elrendezés:</b> ${lbl("layout", sel.layout)}</p>
        <p style="margin:4px 0"><b>Padlófűtés:</b> ${lbl("heating", sel.heating)}</p>
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:16px 0">
        <h3 style="margin:0 0 8px">Kalkulált árajánlat (kulcsrakész)</h3>
        <table style="width:100%;border-collapse:collapse;font-size:14px">${itemRows}
          <tr><td style="padding:10px 12px;font-weight:bold">Becsült végösszeg (sáv)</td><td style="padding:10px 12px;text-align:right;font-weight:bold;color:#6B4A00;white-space:nowrap">${formatHuf(quote.low)} – ${formatHuf(quote.high)}</td></tr>
        </table>
        ${toCustomer ? "" : `<p style="margin:8px 0 0;font-size:12px;color:#9ca3af">Fajlagos: ~${formatHuf(quote.perM2)}/m² (kis fürdőnél magasabb a fix költségek miatt — piaci sáv: 150–250e/m² nagy fürdő, kisnél több)</p>`}
        <p style="margin:16px 0 0;font-size:12px;color:#6b7280">Előzetes, tájékoztató jellegű kalkuláció, bruttó (ÁFÁ-val), kulcsrakész. A pontos ár a helyszíni felmérés után, a választott burkolat és szaniterek függvényében véglegesül.${toCustomer ? " 📞 " + PHONE : ""}</p>
      </div>
    </div>`;

    const subject = toCustomer
        ? `Az Ön árajánlata — NM Bau — ${formatHuf(quote.low)} – ${formatHuf(quote.high)}`
        : `[ÚJ ÁRAJÁNLAT] ${sel.postal_code || ""} — ${sel.name || ""} — ${formatHuf(quote.low)}–${formatHuf(quote.high)}`;

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
