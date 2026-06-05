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
sensible default (mid tier, 5 m², keep layout, walk‑in shower, no heating) and
the survey confirms.

---

## How the price is calculated

All prices are **HUF, gross (ÁFA included), turnkey** (labour + materials +
fixtures). The estimate is built bottom‑up into ~8–9 itemised lines, so the
customer sees exactly what they're paying for:

1. **Bontás, törmelékelszállítás, konténer** — demolition + debris
2. **Aljzatkiegyenlítés és kétrétegű vízszigetelés** — screed + waterproofing
3. **Burkolás munkadíja** — tiling labour (floor + walls)
4. **Csempe és járólap (anyag)** — tile material (+10% waste)
5. **Gépészet** — plumbing (water + waste, by layout choice)
6. **Villanyszerelés** — electrical
7. **Szaniterek és csaptelepek** — fixtures (WC, basin, vanity, taps + shower/bath)
8. **Festés, glettelés** — painting + skim
9. **Elektromos padlófűtés** — *(only if chosen)*

### Geometry

Tiled surface (floor + walls) is estimated from the floor area `A`:
`wall ≈ 4.3·√A · 2.2 − 2.5` (perimeter × ~2.2 m tiling height, less door/fittings).
Area‑scaling lines use this; fixed lumps (plumbing, electrical, fixture base,
demolition setup) provide the fixed‑cost floor that correctly makes **small
bathrooms cost more per m²**.

### Calibration (worked examples)

| Scenario | Estimate (range) |
|---|---|
| 4 m², basic, zuhanykabin, keep layout | ~0,9 – 1,1 M Ft |
| 6 m², mid, walk‑in shower, keep layout | ~1,5 – 1,8 M Ft |
| 9 m², mid, bath+shower, move plumbing, underfloor heating | ~2,15 – 2,58 M Ft |

These sit inside the published Hungarian ranges (5 m² ≈ 0,75–1,5 M; 10 m² ≈
1,5–2,5 M).

### Edit the prices in ONE place

The `MODEL` object at the top of [`api/faq-agent.js`](api/faq-agent.js). The band
width is `MODEL.bandLow` / `MODEL.bandHigh` (default ±8% / +10%).

### Price data sources (2025–2026)

Market aggregators cross‑checked against the **KSH** (Központi Statisztikai
Hivatal) official construction producer‑price index (**+5.4% YoY in 2025**):

- Komplett kulcsrakész fürdő: ~150 000–250 000 Ft/m² (Daibau, ÉpítésKultúra)
- Burkolás munkadíj: 8 000–14 000 Ft/m² (JóSzaki, profiburkolas, szakiweb)
- Vízszigetelés (2 réteg): 5 300–9 900 Ft/m²; aljzat: 1 300–4 400 Ft/m²
- Festés: 2 300–4 500 Ft/m²; villany előszerelés: 7 500–16 000 Ft/m²
- Szaniterek (anyag): WC, mosdó, kád, zuhanykabin, csaptelep — tier‑enként összevonva

> The numbers are **market‑calibrated estimates**, not an official price list —
> Hungary publishes no government bathroom price sheet. KSH grounds the labour
> inflation; the rest is triangulated from current contractor pricing.

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
