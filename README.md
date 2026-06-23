# NM Bau — Fürdőszoba-felújítás árajánló chat widget

A Hungarian **bathroom‑remodeling** quoting chat widget. The customer answers a
short set of questions (clicking suggested options **or** typing freely), gives
their contact details, then immediately sees an itemised **turnkey (kulcsrakész)
estimate shown as a tight range**. The company owner receives the same quote +
the customer's details by e‑mail.

It reuses the architecture of the boiler agent (`Kazán Kecskemét`) but with a
completely new, geometry‑based bathroom pricing engine.

---

## How it works (architecture)

```
public/widget.js   ──POST──►  api/faq-agent.js  ──►  OpenAI / Gemini  = conversation only
   (chat UI)                       │
                                   ├──►  MODEL table + buildQuote()  = deterministic price calc
                                   └──►  Resend                      = e-mail to owner
```

**The AI never does arithmetic.** It only runs the Hungarian conversation and,
once every answer is collected, emits a hidden JSON block of the customer's
*choices* (not prices). The backend computes the price deterministically in
`buildQuote()` from the `MODEL` table, then builds the quote. The total can never
be miscalculated by the model.

---

## Why a range, and how it stays accurate

A bathroom remodel total genuinely depends on choices that only firm up at the
site survey, so the widget quotes a **tight ±~10% band** around a point estimate
(e.g. `2 150 000 – 2 580 000 Ft`) — what an honest contractor gives over the
phone. The goal: **the most accurate number from the fewest questions.** We ask
only the inputs that actually move the price:

| # | Question | Field | Why it matters |
|---|---|---|---|
| 1 | Bathroom size (m²) | `size` | The single biggest driver. Accepts a typed number or a band. |
| 2 | Finish/quality tier | `tier` | Basic / mid / premium — swings tiles, fixtures, some labour ~2×. |
| 3 | Shower vs bath | `washing` | Walk‑in shower / cabin / bath / both — discrete fixture cost. |
| 4 | Keep or move plumbing | `layout` | Relocating wet points adds significant plumbing work. |
| 5 | Underfloor heating | `heating` | Discrete electric mat + thermostat add‑on. |
| 6 | Budget band | `budget` | Lead qualification (does **not** affect the price). |
| 7 | Timeline | `timeline` | Lead qualification (does **not** affect the price). |

Contact details (`name`, `email`, `phone`, `postal_code`) are asked **last**,
only after the project is fully described (progress bar at 100%).

Every choice question has a **"Nem tudom"** option → the engine falls back to a
sensible, **conservative** default (mid tier, 5 m², keep layout, the *cheaper*
shower‑cabin option, no heating) so an "I don't know" never rounds the quote
upward — the survey then confirms.

---

## How the price is calculated

All prices are **HUF, net (nettó, ÁFA nélkül), turnkey** (labour + materials +
fixtures). Every line — and the total — is shown as a realistic **"kb." range**
(per‑trade width). The estimate is built bottom‑up into ~8–9 itemised lines, so
the customer sees exactly what they're paying for:

1. **Bontás, törmelékelszállítás, konténer** — demolition + debris
2. **Aljzatkiegyenlítés és kétrétegű vízszigetelés** — screed + waterproofing
3. **Burkolás munkadíja** — tiling labour (floor + walls)
4. **Csempe és járólap (anyag)** — tile material (+10% waste)
5. **Gépészet** — plumbing (water + waste, by layout choice)
6. **Villanyszerelés** — electrical
7. **Szaniterek és csaptelepek** — fixtures (WC, basin, vanity, taps + shower/bath)
8. **Festés, glettelés** — painting + skim
9. **Elektromos padlófűtés** — *(only if chosen)*

### Why bottom‑up and not a flat Ft/m²

The aggregators headline a single "**150 000–250 000 Ft/m²**" turnkey number. We
deliberately **don't** price `that × area`, because it's a large‑room average that
is simply **wrong for small bathrooms**: container, plumbing/electrical rough‑in
and the fixture set are largely *fixed*, so a 4 m² room genuinely costs ~300 000
Ft/m² while a 9 m² one is ~270 000. A flat per‑m² rate can't express that — an
itemised model can, and it's also exactly how a real Hungarian *tételes
kulcsrakész árajánlat* is built, so the line items match what the customer would
see from a contractor.

### Geometry

Tiled surface (floor + walls) is estimated from the floor area `A`:
`wall ≈ 4.3·√A · 2.2 − 2.5` (perimeter × ~2.2 m full‑height tiling, less
door/fittings). Waterproofing covers the **floor + the wet‑zone walls** behind the
shower/bath (`wetWallArea`, 3–7 m²), not just the floor — the previously
under‑priced line. Fixed lumps (plumbing, electrical, fixture base, demolition
setup, wet‑room prep) provide the fixed‑cost floor that correctly makes **small
bathrooms cost more per m²**.

### Calibration (worked examples)

| Scenario | Estimate (range) | ~Ft/m² |
|---|---|---|
| 4 m², basic, zuhanykabin, keep layout | ~0,95 – 1,14 M Ft | ~296 e |
| 6 m², mid, walk‑in shower, keep layout | ~1,54 – 1,84 M Ft | ~303 e |
| 9 m², mid, bath+shower, move plumbing, underfloor heating | ~2,25 – 2,70 M Ft | ~272 e |
| 6 m², premium, walk‑in, move plumbing, heating | ~2,56 – 3,06 M Ft | ~506 e |

These sit inside the published Hungarian ranges (5 m² ≈ 0,8–1,25 M; 10 m² ≈
1,5–2,5 M; közepes 2,5–3,5 M). [`test-quote.mjs`](test-quote.mjs) asserts every
scenario's **total *and* implied Ft/m²** stay inside the market envelope and exits
non‑zero if a future price edit drifts off‑market — run `node test-quote.mjs`.

### Edit the prices in ONE place

The `MODEL` object at the top of [`api/faq-agent.js`](api/faq-agent.js). The band
width is `MODEL.bandLow` / `MODEL.bandHigh` (default −8% / +10%).

### Price data sources (verified 2026‑06)

Triangulated across the live 2025–2026 Hungarian market, grounded by the **KSH**
(Központi Statisztikai Hivatal) construction producer‑price index for labour
inflation:

- Komplett kulcsrakész fürdő: 150 000–250 000 Ft/m² nagy fürdőnél, kisnél több —
  Daibau (5 m² ≈ 0,8–1,25 M, 10 m² ≈ 1,5–2,5 M), qjob (átlag ~250 e/m²),
  ÉpítésKultúra (alap 1,5–2 M, közepes 2,5–3,5 M)
- Burkolás munkadíj: 3–10 m² szoba 7 000–15 000 Ft/m², 3 m² alatt 9 000–20 000
  (Daibau, qjob, Imprex, Árfürkész, szakiweb)
- Csempe/járólap anyag: középkat. 5 000–10 000, prémium 15 000–25 000 Ft/m²
- Aljzat/esztrich 5 000–10 000 Ft/m²; kétrétegű vízszigetelés 5 300–9 900 Ft/m²
- Bontás: 2 100–7 600 Ft/m² + konténer; festés 1 700–4 000 Ft/m²; villany
  előszerelés 7 500–16 000 Ft/m²
- Szaniterek (anyag+beépítés): WC 15–80e, mosdó 15–80e, kád 20–300e, zuhanykabin
  90–300e, csaptelep 5–30e — tier‑enként összevonva

> The numbers are **market‑calibrated estimates**, not an official price list —
> Hungary publishes no government bathroom price sheet. KSH grounds the labour
> inflation; the rest is triangulated from current contractor pricing and
> cross‑checked against the published per‑m² and per‑project envelopes.

---

## Setup & deploy

1. **Keys** — in `.env` (git‑ignored):
   - `AI_PROVIDER` — `gemini` (free tier, good for testing) or `openai`
   - `GEMINI_API_KEY` / `GEMINI_MODEL` — Google AI Studio
   - `OPENAI_API_KEY` / `OPENAI_MODEL` — the task is tiny, cheapest tier is plenty
   - `RESEND_API_KEY` — free at <https://resend.com>
   - `LEAD_EMAIL_TO` — where quotes are sent (default `pirint.milan@gmail.com`)
   - `LEAD_EMAIL_FROM` — keep `onboarding@resend.dev` to start; later verify your
     own domain and set e.g. `NM Bau <ajanlat@yourdomain.hu>`
   - `EMAIL_OFFER=on` — *(optional)* offer to e-mail the quote to the customer too
     (needs a verified sending domain first)
2. **Run locally:** `node server.js` → <http://localhost:8888>
3. **Deploy (Vercel):** push the repo; set the same env vars. `api/faq-agent.js`
   is the serverless endpoint, `public/` is static.
4. **Embed on a site:**
   ```html
   <script>
     window.NMBAU_CONFIG = {
       apiUrl: "https://YOUR-APP.vercel.app/api/faq-agent",
       assetsUrl: "https://YOUR-APP.vercel.app"
     };
   </script>
   <script src="https://YOUR-APP.vercel.app/widget.js"></script>
   ```

---

## Customising

- **Prices:** edit the `MODEL` object in `api/faq-agent.js`.
- **Questions / wording:** edit `SYSTEM_PROMPT` in `api/faq-agent.js`.
- **Brand / phone:** `BRAND` and `PHONE` in `public/widget.js`; `PHONE` falls back
  to `LEAD_PHONE` in `.env` on the backend.
- **Colours / branding:** `public/style.css`. Replace `public/logo.png` with NM
  Bau's real logo.
