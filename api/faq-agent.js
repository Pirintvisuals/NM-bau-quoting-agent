// ============================================================================
//  KAZÁN KECSKEMÉT — Árajánló asszisztens (gas boiler quoting agent)
//  - AI provider: OpenAI (gpt-4o-mini) — drives the Hungarian conversation only.
//  - Pricing is computed DETERMINISTICALLY in this backend from the PRICES table
//    below. The AI never does arithmetic, so the total can never be miscalculated.
//  - When all answers are collected the AI emits a hidden JSON block
//    (<!--QUOTE_JSON:{...}-->). We parse it, price it, e-mail the owner, and
//    return the itemised estimate to show the customer.
// ============================================================================

// ---------------------------------------------------------------------------
//  PRICE TABLE (HUF) — single source of truth. Edit numbers here only.
//  Source: the company's price sheet (milan.xlsx). Prices shown "as-is".
// ---------------------------------------------------------------------------
const PRICES = {
    // Jelenlegi kazán (csak csere esetén számít)
    current_boiler: {
        nyilt:        { huf: 60000,  label: "Jelenlegi kazán: nyílt égésterű" },
        kondenzacios: { huf: 0,      label: "Jelenlegi kazán: kondenzációs" },
        turbos:       { huf: 60000,  label: "Jelenlegi kazán: turbós" },
        nincs:        { huf: 0,      label: "Jelenlegi kazán: nincs (új kiépítés)" },
    },
    // Új kazán típusa
    new_boiler: {
        kombi_24:   { huf: 450000, label: "Kombi átfolyós gázkészülék, 24 kW" },
        tarolos_46: { huf: 900000, label: "Tárolós gázkészülék 46 literes beépített tárolóval, 24 kW" },
        kulso_125:  { huf: 900000, label: "Külső tárolós 125 literes, 24 kW-os fűtő kazánnal" },
    },
    // Kémény / égéstermék-elvezetés
    flue: {
        teto:         { huf: 380000, label: "Kéménykivezetés a tetőn keresztül (kazántól indulva)" },
        tegla_kemeny: { huf: 600000, label: "Bekötés épített tégla kéménybe" },
        gyujtokemeny: { huf: 600000, label: "Társasházi gyűjtőkémény bekötés" },
    },
    // Életvédelmi (Fi) relé
    rcd: {
        van:   { huf: 50000,  label: "Életvédelmi (Fi) relé: van" },
        nincs: { huf: 100000, label: "Életvédelmi (Fi) relé: nincs — kiépítés szükséges" },
    },
    // Mindig felszámolt standard tételek
    standard: {
        wet_system:    { huf: 300000, label: "Vizes rendszerre kötés mágneses iszapleválasztóval (anyag + munkadíj)" },
        commissioning: { huf: 50000,  label: "Gázkazán gyári üzembe helyezése" },
    },
    // Csak csere esetén
    demolition: { huf: 90000, label: "Régi kazán és kémény bontása" },
};

// Company confirmed: the boiler-type prices include the appliance, and all
// prices are GROSS (ÁFA included) — what the customer actually pays.
const APPLIANCE_INCLUDED = true;

// ---------------------------------------------------------------------------
//  Helpers
// ---------------------------------------------------------------------------
function formatHuf(n) {
    // 450000 -> "450 000 Ft"
    return n.toLocaleString("hu-HU").replace(/ /g, " ") + " Ft";
}

// Build the itemised quote deterministically from the AI's structured answers.
function buildQuote(sel) {
    const items = [];
    const add = (entry) => { if (entry) items.push({ label: entry.label, huf: entry.huf }); };

    const isReplacement = sel.install_type === "csere";

    // Current boiler only counts on a replacement
    if (isReplacement) add(PRICES.current_boiler[sel.current_boiler] || PRICES.current_boiler.nyilt);

    add(PRICES.new_boiler[sel.new_boiler]);
    add(PRICES.flue[sel.flue]);
    add(PRICES.rcd[sel.rcd]);

    // Standard costs — always included (not asked).
    add(PRICES.standard.wet_system);
    add(PRICES.standard.commissioning);
    // Demolition of the OLD boiler/chimney only makes sense on a replacement.
    if (isReplacement) add(PRICES.demolition);

    const total = items.reduce((s, i) => s + i.huf, 0);
    return { items, total, isReplacement };
}

// Backend decides when the quote is complete — independent of the AI model.
function isQuoteReady(s) {
    if (!s || typeof s !== "object") return false;
    const filled = (k) => s[k] != null && String(s[k]).trim() !== "";
    const required = [
        "install_type", "new_boiler", "flue", "rcd",
        "name", "email", "phone", "postal_code", "budget",
    ];
    if (!required.every(filled)) return false;
    // current_boiler is only required on a replacement
    if (String(s.install_type).toLowerCase() === "csere" && !filled("current_boiler")) return false;
    return true;
}

// Quick-reply buttons for each choice question — decided by the BACKEND from the
// current state, so the right buttons always appear (not reliant on the model).
const CHIP_MAP = {
    install_type: ["Csere", "Új beépítés"],
    current_boiler: ["Nyílt égésterű", "Kondenzációs", "Turbós"],
    new_boiler: ["Kombi (24 kW)", "Tárolós (46 l)", "Külső tároló (125 l)"],
    flue: ["Tetőn keresztül", "Tégla kéménybe", "Társasházi gyűjtőkémény"],
    rcd: ["Van", "Nincs"],
};
// Parse the hidden running-state block out of any assistant message.
function extractData(text) {
    if (typeof text !== "string") return null;
    const m = text.match(/<!--DATA:(.*?)-->/s);
    if (!m) return null;
    try { return JSON.parse(m[1]); } catch (e) { return null; }
}

// Merge several state objects, keeping the last NON-EMPTY value per field.
// This makes the state immune to the model blanking a field in a single turn:
// once "csere" is set, a later empty value can't erase it (a real change to a
// new non-empty value still overrides).
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
    if (!sel || typeof sel !== "object") return CHIP_MAP.install_type;
    const filled = (k) => sel[k] != null && String(sel[k]).trim() !== "";
    const order = ["install_type", "current_boiler", "new_boiler", "flue", "rcd",
        "name", "email", "phone", "postal_code", "budget"];
    for (const f of order) {
        // current_boiler only applies to a replacement
        if (f === "current_boiler" && String(sel.install_type || "").toLowerCase() !== "csere") continue;
        if (!filled(f)) return CHIP_MAP[f] || [];
    }
    return [];
}

// Human-readable Hungarian labels for the recap of what the customer chose.
const LABELS = {
    install_type: { csere: "Régi kazán cseréje", uj: "Új beépítés" },
    current_boiler: { nyilt: "Nyílt égésterű", kondenzacios: "Kondenzációs", turbos: "Turbós", nincs: "—" },
    new_boiler: { kombi_24: "Kombi (24 kW)", tarolos_46: "Tárolós, 46 l (24 kW)", kulso_125: "Külső tároló, 125 l (24 kW)" },
    flue: { teto: "Tetőn keresztül", tegla_kemeny: "Tégla kéménybe", gyujtokemeny: "Társasházi gyűjtőkémény" },
    rcd: { van: "Van", nincs: "Nincs" },
};
const lbl = (group, key) => (LABELS[group] && LABELS[group][key]) || key || "—";

// Customer-facing estimate. Returns sections split by [[SPLIT]] so the widget
// renders them as separate, easy-to-read chat bubbles. Numbers come from buildQuote.
function renderCustomerQuote(quote, sel) {
    const items = quote.items.map(i => `• ${i.label} — **${formatHuf(i.huf)}**`).join("\n");

    // Bubble 1 — the price
    const priceBubble = [
        `Köszönöm, ${sel.name || ""}! Íme az előzetes árajánlata. 🙏`,
        ``,
        `**Tételek:**`,
        items,
        ``,
        `**Becsült végösszeg: ${formatHuf(quote.total)}** (bruttó, ÁFÁ-val)`,
    ].join("\n");

    // Bubble 2 — "just an estimate" note
    const noteBubble = [
        `ℹ️ Ez csak egy **előzetes, tájékoztató becslés** — a végleges ár a helyszíni felmérés után pontosul.`,
        `Az ár tartalmazza a kazánt és a teljes beépítést; a pontos márka/típus a felmérésnél dől el.`,
    ].join("\n");

    // Bubble 3 — recap of everything the customer said
    const recapLines = [`**Az Ön válaszai:**`];
    recapLines.push(`• Munka: ${lbl("install_type", sel.install_type)}`);
    if (sel.install_type === "csere") recapLines.push(`• Jelenlegi kazán: ${lbl("current_boiler", sel.current_boiler)}`);
    recapLines.push(`• Új kazán: ${lbl("new_boiler", sel.new_boiler)}`);
    recapLines.push(`• Kémény: ${lbl("flue", sel.flue)}`);
    recapLines.push(`• Életvédelmi (Fi) relé: ${lbl("rcd", sel.rcd)}`);
    recapLines.push(`• Név: ${sel.name || "—"}`);
    recapLines.push(`• E-mail: ${sel.email || "—"}`);
    recapLines.push(`• Telefon: ${sel.phone || "—"}`);
    recapLines.push(`• Irányítószám: ${sel.postal_code || "—"}`);
    recapLines.push(`• Tervezett keret: ${sel.budget || "—"}`);
    recapLines.push(``);
    recapLines.push(`Az adatait továbbítottuk a Kazán Kecskeméthez — hamarosan keressük! 📞 +36 30 260 57 56`);
    recapLines.push(``);
    recapLines.push(`Szeretné, hogy e-mailben is elküldjük az ajánlatot?`);

    return [priceBubble, noteBubble, recapLines.join("\n")].join("\n[[SPLIT]]\n");
}

// ---------------------------------------------------------------------------
//  System prompt (Hungarian) — conversation + structured output contract
// ---------------------------------------------------------------------------
const SYSTEM_PROMPT = `SZEMÉLYISÉG
Te a "Kazán Kecskemét" digitális árajánló asszisztense vagy. Gázkazán beépítéssel és cserével foglalkozó szakember nevében beszélsz. Kizárólag MAGYARUL válaszolj.

HANGNEM
- Udvarias, közvetlen, szakértő és tömör. Lehetőleg 40 szó alatt válaszolj.
- Egyszerre EGY kérdést tegyél fel. Sose kérdezz több dolgot egyszerre.
- Sose találgass árat és sose számolj — az árat a rendszer számolja ki a végén.

CÉL
Végigvezeted az ügyfelet az alábbi kérdéseken, majd elkéred az elérhetőségeit. A kérdéseket természetesen, sorban tedd fel. FONTOS: a rendszer már köszöntötte az ügyfelet — NE köszönj újra, rögtön az 1. kérdéssel kezdj.

KÖZÉRTHETŐSÉG (nagyon fontos!)
Az ügyfél laikus, nem szakember. Minden kérdést EGYSZERŰEN, hétköznapi nyelven tegyél fel, és a szakszavakat MINDIG magyarázd el egy rövid, zárójeles mondattal. Ha az ügyfél nem ért valamit vagy azt írja "nem tudom" / "ez mit jelent", magyarázd el türelmesen, hétköznapi példával, és kérd, hogy a legjobb tudása szerint válaszoljon.

KÉRDÉSEK SORRENDJE (egyesével, mindig csak EGY kérdés!):
1. install_type — "Új kazán beépítéséről, vagy egy régi kazán cseréjéről van szó?" Értékek: "csere" vagy "uj".
2. current_boiler — CSAK ha "csere": "Milyen kazánja van most?" Röviden segíts: nyílt égésterű (a régi, a helyiség levegőjét égeti), turbós (ventilátorral kifújja a falon át), kondenzációs (modern, hatékony). Értékek: "nyilt", "kondenzacios", "turbos". Ha "uj", hagyd ki és állítsd "nincs"-re.
3. new_boiler — "Milyen új kazánt szeretne?" Segíts a választásban: kombi (24 kW) — azonnal melegíti a vizet, kis helyigény; tárolós beépített 46 literes tartállyal (24 kW) — több melegvíz egyszerre; külső 125 literes tárolóval (24 kW) — a legtöbb melegvíz, nagy családnak. Értékek: "kombi_24", "tarolos_46", "kulso_125".
4. flue — "Hogyan távozik a kazán füstgáza?" Magyarázd: a tetőn keresztül kivezetve; meglévő, épített tégla kéménybe; vagy társasházi közös (gyűjtő-) kéménybe. Értékek: "teto", "tegla_kemeny", "gyujtokemeny".
5. rcd — "Van a lakásban életvédelmi (Fi-)relé? Ez egy biztonsági kapcsoló a biztosítékszekrényben (általában 'TESZT' gombbal), ami áramütés ellen véd." Ha nem tudja, kérd, nézze meg a biztosítékszekrényt; ha így sem tudja, állítsd "nincs"-re (biztonságból a kiépítéssel számolunk, a felmérés pontosítja). Értékek: "van" vagy "nincs".

ELÉRHETŐSÉGEK — KÜLÖN-KÜLÖN kérdezd, egyesével (NE egyszerre, NE gombokkal):
6. name — "Mi a neve?"
7. email — "Mi az e-mail címe?"
8. phone — "Mi a telefonszáma?"
9. postal_code — "Mi az irányítószáma?"
10. budget — "Nagyjából milyen keretet szánna rá?"

MEGJEGYZÉS: A vizes rendszerre kötést, a gyári üzembe helyezést és a régi kazán/kémény bontását NE kérdezd meg — ezek minden ajánlatban benne vannak, a rendszer automatikusan hozzáadja.

SZABÁLYOK
- Az ügyfél írhat szabad szöveggel is — értelmezd a válaszát és rendeld hozzá a megfelelő értéket.
- Ha egy válasz nem egyértelmű, EGYSZER kérdezz vissza, utána lépj tovább.
- Ne ígérj fix időpontot. Árat ne mondj a folyamat közben.

REJTETT ÁLLAPOT (KÖTELEZŐ MINDEN VÁLASZBAN)
MINDEN egyes válaszod legvégére tedd ki az eddig ismert adatokat ebben a rejtett blokkban (az ügyfél NEM látja). A még meg nem kérdezett mezők értéke üres string (""). SOSE találgass — csak azt töltsd ki, amit az ügyfél ténylegesen megválaszolt:
<!--DATA:{"install_type":"","current_boiler":"","new_boiler":"","flue":"","rcd":"","name":"","email":"","phone":"","postal_code":"","budget":""}-->
A blokkban MINDEN kulcs mindig szerepeljen, csak az értékeket töltsd. Engedélyezett értékek: install_type: csere|uj; current_boiler: nyilt|kondenzacios|turbos|nincs; new_boiler: kombi_24|tarolos_46|kulso_125; flue: teto|tegla_kemeny|gyujtokemeny; rcd: van|nincs. A többi (name, email, phone, postal_code, budget) szabad szöveg.
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
                model: process.env.OPENAI_MODEL || "gpt-5.4-mini",
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
                    generationConfig: { temperature: 0.4, maxOutputTokens: 500 },
                }),
            }
        );
        const data = await res.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
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

    if (request.method === "OPTIONS") {
        return response.status(200).end();
    }

    try {
        const { question, history, action, lead } = request.body || {};

        // --- ACTION: customer asked us to e-mail them the quote ---
        if (action === "email_customer" && lead?.sel && lead?.quote) {
            const ok = await sendQuoteEmail(lead.sel, lead.quote, {
                to: lead.sel.email,
                toCustomer: true,
            });
            return response.status(200).json({
                answer: ok
                    ? `Elküldtük az árajánlatot a megadott e-mail címre (${lead.sel.email}). 📧 Ha nem találja, nézze meg a Spam mappát is.`
                    : `Sajnos most nem sikerült e-mailt küldeni, de kollégánk hamarosan keresi Önt. 📞 +36 30 260 57 56`,
                chips: [],
            });
        }

        // Normalized message list: [{ role: "system"|"user"|"assistant", content }]
        // The widget sends history as [{ role: "user"|"assistant", content }].
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

        // Provider is switchable via .env (AI_PROVIDER=openai | gemini).
        // Gemini has a free tier — handy for testing without billing.
        const provider = (process.env.AI_PROVIDER || "openai").toLowerCase();
        const result = provider === "gemini"
            ? await callGemini(messages)
            : await callOpenAI(messages);

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
            try { currentSel = JSON.parse(dataMatch[1]); }
            catch (e) { console.error("DATA parse fail:", e.message); }
            aiAnswer = aiAnswer.replace(/<!--DATA:.*?-->/s, "").trim();
        }

        // ... then merge it over every earlier DATA block in the conversation so a
        // single turn that drops a field can't wipe an answer the customer already
        // gave. Chips + completion are decided from this stable, accumulated state.
        const priorSel = Array.isArray(history)
            ? history
                .filter((m) => m && (m.role === "assistant" || m.role === "model"))
                .map((m) => extractData(m.content))
            : [];
        const sel = mergeState(...priorSel, currentSel);

        // --- COMPLETION CHECK (backend-decided, model-independent) ---
        if (isQuoteReady(sel)) {
            const quote = buildQuote(sel);

            console.log("\n========================================");
            console.log("🎯 ÚJ ÁRAJÁNLAT / LEAD");
            console.log(`Ügyfél: ${sel.name} | ${sel.phone} | ${sel.email}`);
            console.log(`Irsz.: ${sel.postal_code} | Keret: ${sel.budget}`);
            console.log(`Becsült végösszeg: ${formatHuf(quote.total)}`);
            console.log("========================================\n");

            // Always notify the owner.
            await sendQuoteEmail(sel, quote, { to: process.env.LEAD_EMAIL_TO || "pirint.milan@gmail.com", toCustomer: false });

            // Show the itemised quote in chat + offer to e-mail it to the customer.
            return response.status(200).json({
                answer: renderCustomerQuote(quote, sel),
                chips: [],
                emailOffer: true,
                lead: { sel, quote },
            });
        }

        // Strip any chips marker the model may still emit (we compute chips ourselves).
        aiAnswer = aiAnswer.replace(/<!--CHIPS:.*?-->/s, "").trim();

        // --- QUICK-REPLY CHIPS (backend-decided, reliable) ---
        const chips = nextChips(sel);

        return response.status(200).json({ answer: aiAnswer, chips });

    } catch (error) {
        console.error("Function Crash:", error.message);
        return response.status(500).json({ answer: "Elnézést, a szerver épp akadozik. Kérlek próbáld újra kicsit később." });
    }
}

// ---------------------------------------------------------------------------
//  E-mail (Resend). opts = { to, toCustomer }. Returns true on success.
//  - owner mail: full client details + quote
//  - customer mail: friendly "your quote" version
// ---------------------------------------------------------------------------
async function sendQuoteEmail(sel, quote, opts = {}) {
    const resendKey = process.env.RESEND_API_KEY;
    const toEmail = opts.to || process.env.LEAD_EMAIL_TO || "pirint.milan@gmail.com";
    const fromEmail = process.env.LEAD_EMAIL_FROM || "Kazán Kecskemét <onboarding@resend.dev>";
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

    const installTypeLabel = quote.isReplacement ? "Meglévő kazán cseréje" : "Új rendszer kiépítése";

    // Client-details block is only included in the owner's copy.
    const clientBlock = toCustomer ? "" : `
        <h3 style="margin:0 0 8px">Ügyfél adatai</h3>
        <p style="margin:4px 0"><b>Név:</b> ${sel.name || "-"}</p>
        <p style="margin:4px 0"><b>Telefon:</b> ${sel.phone || "-"}</p>
        <p style="margin:4px 0"><b>E-mail:</b> ${sel.email || "-"}</p>
        <p style="margin:4px 0"><b>Irányítószám:</b> ${sel.postal_code || "-"}</p>
        <p style="margin:4px 0"><b>Tervezett keret:</b> ${sel.budget || "-"}</p>
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:16px 0">`;

    const heading = toCustomer ? "Az Ön árajánlata — Kazán Kecskemét" : "Új árajánlat — Kazán Kecskemét";
    const intro = toCustomer
        ? `<p style="margin:0 0 12px">Kedves ${sel.name || "Ügyfelünk"}! Köszönjük érdeklődését. Íme az előzetes árajánlata:</p>`
        : "";

    const html = `
    <div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;color:#111827">
      <div style="background:#0369A1;color:#ffffff;padding:20px 24px;border-radius:12px 12px 0 0">
        <h2 style="margin:0">${heading}</h2>
      </div>
      <div style="border:1px solid #e5e7eb;border-top:none;padding:24px;border-radius:0 0 12px 12px">
        ${intro}${clientBlock}
        <h3 style="margin:0 0 8px">Munka jellege</h3>
        <p style="margin:4px 0"><b>Típus:</b> ${installTypeLabel}</p>
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:16px 0">
        <h3 style="margin:0 0 8px">Kalkulált árajánlat</h3>
        <table style="width:100%;border-collapse:collapse;font-size:14px">${itemRows}
          <tr><td style="padding:10px 12px;font-weight:bold">Becsült végösszeg</td><td style="padding:10px 12px;text-align:right;font-weight:bold;color:#025888">${formatHuf(quote.total)}</td></tr>
        </table>
        <p style="margin:16px 0 0;font-size:12px;color:#6b7280">Előzetes, tájékoztató jellegű kalkuláció, bruttó (ÁFÁ-val). Az ár tartalmazza a kazánt és a teljes beépítést; a pontos márka/típus a helyszíni felmérés után véglegesül.${toCustomer ? " 📞 +36 30 260 57 56" : ""}</p>
      </div>
    </div>`;

    const subject = toCustomer
        ? `Az Ön árajánlata — Kazán Kecskemét — ${formatHuf(quote.total)}`
        : `[ÚJ ÁRAJÁNLAT] ${sel.postal_code || ""} — ${sel.name || ""} — ${formatHuf(quote.total)}`;

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
