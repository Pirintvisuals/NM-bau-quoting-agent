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

// If the company confirms the boiler-type price already includes the appliance,
// set this to true to change the customer-facing wording. Default: false (safe).
const APPLIANCE_INCLUDED = false;

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

    // The three "standard" costs are now asked explicitly; add only if "igen".
    const yes = (v) => String(v || "").toLowerCase() === "igen";
    if (yes(sel.wet_system)) add(PRICES.standard.wet_system);
    if (yes(sel.commissioning)) add(PRICES.standard.commissioning);
    if (yes(sel.demolition)) add(PRICES.demolition);

    const total = items.reduce((s, i) => s + i.huf, 0);
    return { items, total, isReplacement };
}

// Customer-facing Hungarian estimate text (numbers come from buildQuote).
function renderCustomerQuote(quote, sel) {
    const lines = quote.items.map(i => `• ${i.label}: ${formatHuf(i.huf)}`).join("\n");
    const applianceNote = APPLIANCE_INCLUDED
        ? "Az összeg a kazánkészüléket és a teljes kivitelezést tartalmazza."
        : "Az összeg a kivitelezés (beépítés) díja; a kazán pontos márkája és típusa a helyszíni felmérés után véglegesül.";

    return [
        `Köszönöm, ${sel.name || ""}! Íme a tájékoztató árajánlatod:`,
        ``,
        lines,
        ``,
        `**Becsült végösszeg: ${formatHuf(quote.total)}**`,
        ``,
        `ℹ️ ${applianceNote}`,
        `ℹ️ Gázkazán cseréjéhez/kiépítéséhez jellemzően gázterv és a szolgáltatói üzembe helyezés is szükséges — ezt a helyszíni felmérés után, külön tételként adjuk meg.`,
        ``,
        `Ez egy előzetes, tájékoztató jellegű kalkuláció. Az adataidat továbbítottuk a Kazán Kecskeméthez, hamarosan keresünk a pontosításért. 📞 +36 30 260 57 56`,
    ].join("\n");
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
Végigvezeted az ügyfelet az alábbi kérdéseken, majd elkéred az elérhetőségeit. A kérdéseket természetesen, sorban tedd fel.

KÉRDÉSEK SORRENDJE (egyesével, mindig csak EGY kérdés!):
1. install_type — "Új kazán beépítéséről vagy egy meglévő kazán cseréjéről van szó?" Értékek: "csere" vagy "uj".
2. current_boiler — CSAK ha "csere": "Jelenleg milyen kazánja van?" Értékek: "nyilt" (nyílt égésterű), "kondenzacios" (kondenzációs), "turbos" (turbós). Ha "uj", ezt hagyd ki és állítsd "nincs"-re.
3. new_boiler — "Milyen típusú új kazánt szeretne?" Értékek: "kombi_24" (kombi átfolyós 24 kW), "tarolos_46" (tárolós, 46 literes beépített tárolóval, 24 kW), "kulso_125" (külső tárolós 125 literes, 24 kW fűtő kazánnal). Ha bizonytalan, kérdezz rá a melegvíz-igényre (lásd 9. pont) és javasolj.
4. flue — "Hogyan oldható meg a kémény / égéstermék-elvezetés?" Értékek: "teto" (kazántól a tetőn kivezetve), "tegla_kemeny" (épített tégla kéménybe), "gyujtokemeny" (társasházi gyűjtőkémény).
5. rcd — "Van-e a lakásban életvédelmi (Fi) relé?" Értékek: "van" vagy "nincs".
6. wet_system — "Szükséges a vizes (fűtési) rendszerre kötés mágneses iszapleválasztóval (anyag + munkadíj)?" Értékek: "igen" vagy "nem".
7. commissioning — "Kéri a gázkazán gyári üzembe helyezését?" Értékek: "igen" vagy "nem".
8. demolition — "Szükséges a régi kazán és kémény bontása?" Értékek: "igen" vagy "nem". (Új kiépítésnél jellemzően "nem".)
9. hot_water_note — "Hány fürdőszoba / hány fő használja a meleg vizet?" (Szabad szöveg. Segíthet a kazántípus választásában, de árat nem befolyásol.)
10. urgency — "Mennyire sürgős? (pl. azonnali, mert elromlott / pár héten belül / csak tájékozódik)" (Szabad szöveg.)

ELÉRHETŐSÉGEK — KÜLÖN-KÜLÖN kérdezd, egyesével (NE egyszerre, NE gombokkal):
11. name — "Mi a neve?"
12. email — "Mi az e-mail címe?"
13. phone — "Mi a telefonszáma?"
14. postal_code — "Mi az irányítószáma?"
15. budget — "Nagyjából milyen keretet / büdzsét szánna rá?"

SZABÁLYOK
- Az ügyfél írhat szabad szöveggel is — értelmezd a válaszát és rendeld hozzá a megfelelő értéket.
- Ha egy válasz nem egyértelmű, EGYSZER kérdezz vissza, utána lépj tovább.
- Ne ígérj fix időpontot. Árat ne mondj a folyamat közben.

BEFEJEZÉS
Amikor MINDEN adat megvan (install_type, new_boiler, flue, rcd, wet_system, commissioning, demolition, hot_water_note, urgency, name, email, phone, postal_code, budget — és csere esetén current_boiler is), írj egy RÖVID lezáró mondatot (pl. "Köszönöm, összeállítom az árajánlatot!"), majd a válasz LEGVÉGÉRE tedd ki PONTOSAN ezt a rejtett blokkot (az ügyfél ezt nem látja):
<!--QUOTE_JSON:{"install_type":"...","current_boiler":"...","new_boiler":"...","flue":"...","rcd":"...","wet_system":"...","commissioning":"...","demolition":"...","hot_water_note":"...","urgency":"...","name":"...","email":"...","phone":"...","postal_code":"...","budget":"..."}-->
Csak akkor add ki a blokkot, ha tényleg minden adat megvan. Az értékek pontosan a fent megadott kulcsok legyenek.

GYORSVÁLASZ GOMBOK
Választós kérdéseknél (install_type, current_boiler, new_boiler, flue, rcd, wet_system, commissioning, demolition) a válaszod LEGVÉGÉRE tedd ki a felkínált opciókat ebben a rejtett formában (az ügyfél gombként látja, de szabadon is írhat):
<!--CHIPS:["Opció 1","Opció 2"]-->
Magyar, rövid címkéket adj (pl. ["Csere","Új beépítés"], ["Nyílt égésterű","Kondenzációs","Turbós"], ["Igen","Nem"]). A melegvíz, sürgősség és az ELÉRHETŐSÉGEK kérdéseknél (név, e-mail, telefon, irányítószám, büdzsé) NE adj gombokat.`;

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
        const { question, history } = request.body || {};

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

        // --- QUOTE PROCESSING ---
        const quoteMatch = aiAnswer.match(/<!--QUOTE_JSON:(.*?)-->/s);
        if (quoteMatch) {
            try {
                const sel = JSON.parse(quoteMatch[1]);
                const quote = buildQuote(sel);

                console.log("\n========================================");
                console.log("🎯 ÚJ ÁRAJÁNLAT / LEAD");
                console.log(`Ügyfél: ${sel.name} | ${sel.phone} | ${sel.email}`);
                console.log(`Irsz.: ${sel.postal_code} | Keret: ${sel.budget}`);
                console.log(`Becsült végösszeg: ${formatHuf(quote.total)}`);
                console.log("========================================\n");

                await sendQuoteEmail(sel, quote);

                // Replace AI text with the deterministic, correctly-priced quote.
                return response.status(200).json({ answer: renderCustomerQuote(quote, sel) });
            } catch (parseErr) {
                console.error("Failed to parse QUOTE_JSON:", parseErr.message);
                // Fall through: strip marker, return whatever the AI said.
                aiAnswer = aiAnswer.replace(/<!--QUOTE_JSON:.*?-->/s, "").trim();
            }
        }

        // --- QUICK-REPLY CHIPS ---
        let chips = [];
        const chipsMatch = aiAnswer.match(/<!--CHIPS:(.*?)-->/s);
        if (chipsMatch) {
            try {
                const parsed = JSON.parse(chipsMatch[1]);
                if (Array.isArray(parsed)) chips = parsed.filter(c => typeof c === "string").slice(0, 5);
            } catch (e) { /* ignore malformed chips */ }
            aiAnswer = aiAnswer.replace(/<!--CHIPS:.*?-->/s, "").trim();
        }

        return response.status(200).json({ answer: aiAnswer, chips });

    } catch (error) {
        console.error("Function Crash:", error.message);
        return response.status(500).json({ answer: "Elnézést, a szerver épp akadozik. Kérlek próbáld újra kicsit később." });
    }
}

// ---------------------------------------------------------------------------
//  E-mail (Resend) — sends the full itemised quote to the company owner.
// ---------------------------------------------------------------------------
async function sendQuoteEmail(sel, quote) {
    const resendKey = process.env.RESEND_API_KEY;
    const toEmail = process.env.LEAD_EMAIL_TO || "pirint.milan@gmail.com";
    // Default sender works with no domain setup. Swap to your verified domain later.
    const fromEmail = process.env.LEAD_EMAIL_FROM || "Kazán Kecskemét <onboarding@resend.dev>";

    if (!resendKey) {
        console.log("⚠️  Nincs RESEND_API_KEY — az e-mail kimarad. A lead a fenti logban szerepel.");
        return;
    }

    const itemRows = quote.items
        .map(i => `<tr><td style="padding:6px 12px;border-bottom:1px solid #eee">${i.label}</td><td style="padding:6px 12px;border-bottom:1px solid #eee;text-align:right;white-space:nowrap">${formatHuf(i.huf)}</td></tr>`)
        .join("");

    const installTypeLabel = quote.isReplacement ? "Meglévő kazán cseréje" : "Új rendszer kiépítése";

    const html = `
    <div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;color:#111827">
      <div style="background:#111827;color:#FBBF24;padding:20px 24px;border-radius:12px 12px 0 0">
        <h2 style="margin:0">Új árajánlat — Kazán Kecskemét</h2>
      </div>
      <div style="border:1px solid #e5e7eb;border-top:none;padding:24px;border-radius:0 0 12px 12px">
        <h3 style="margin:0 0 8px">Ügyfél adatai</h3>
        <p style="margin:4px 0"><b>Név:</b> ${sel.name || "-"}</p>
        <p style="margin:4px 0"><b>Telefon:</b> ${sel.phone || "-"}</p>
        <p style="margin:4px 0"><b>E-mail:</b> ${sel.email || "-"}</p>
        <p style="margin:4px 0"><b>Irányítószám:</b> ${sel.postal_code || "-"}</p>
        <p style="margin:4px 0"><b>Keret / büdzsé:</b> ${sel.budget || "-"}</p>
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:16px 0">
        <h3 style="margin:0 0 8px">Munka jellege</h3>
        <p style="margin:4px 0"><b>Típus:</b> ${installTypeLabel}</p>
        <p style="margin:4px 0"><b>Melegvíz-igény:</b> ${sel.hot_water_note || "-"}</p>
        <p style="margin:4px 0"><b>Sürgősség:</b> ${sel.urgency || "-"}</p>
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:16px 0">
        <h3 style="margin:0 0 8px">Kalkulált árajánlat</h3>
        <table style="width:100%;border-collapse:collapse;font-size:14px">${itemRows}
          <tr><td style="padding:10px 12px;font-weight:bold">Becsült végösszeg</td><td style="padding:10px 12px;text-align:right;font-weight:bold;color:#025888">${formatHuf(quote.total)}</td></tr>
        </table>
        <p style="margin:16px 0 0;font-size:12px;color:#6b7280">Előzetes, tájékoztató jellegű kalkuláció. A kazán pontos típusa/márkája, valamint a gázterv és szolgáltatói üzembe helyezés a helyszíni felmérés után véglegesül.</p>
      </div>
    </div>`;

    const subject = `[ÚJ ÁRAJÁNLAT] ${sel.postal_code || ""} — ${sel.name || ""} — ${formatHuf(quote.total)}`;

    try {
        const emailRes = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${resendKey}`,
            },
            body: JSON.stringify({ from: fromEmail, to: [toEmail], subject, html }),
        });

        const result = await emailRes.json();
        if (emailRes.ok) {
            console.log("✅ Árajánlat e-mail elküldve:", result.id);
        } else {
            console.error("❌ Resend hiba:", JSON.stringify(result));
        }
    } catch (emailErr) {
        console.error("❌ Nem sikerült elküldeni az e-mailt:", emailErr.message);
    }
}
