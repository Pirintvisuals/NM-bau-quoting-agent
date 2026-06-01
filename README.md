# Kazán Kecskemét — Árajánló chat widget

A Hungarian gas‑boiler quoting chat widget. The customer answers a short set of
questions (clicking suggested options **or** typing freely), gives their contact
details, then immediately sees an itemised estimate. The company owner receives
the same quote + the customer's details by e‑mail.

---

## How it works (architecture)

```
public/widget.js   ──POST──►  api/faq-agent.js  ──►  OpenAI (model via .env)  = conversation only
   (chat UI)                       │
                                   ├──►  PRICES table  = deterministic price calc
                                   └──►  Resend         = e-mail to owner
```

**The AI never does arithmetic.** It only runs the Hungarian conversation and,
once every answer is collected, emits a hidden JSON block of the customer's
*choices* (not prices). The backend looks each choice up in the fixed `PRICES`
table, sums it, and builds the quote. This is why the total can never be
miscalculated by the model.

---

## How the price is calculated

All prices are in **HUF** and are shown **as‑is** (no VAT note, no base/call‑out
fee). The total is simply the sum of the applicable items below. Source of the
numbers: the company's price sheet (`milan.xlsx`). Edit them in **one place**:
the `PRICES` object at the top of [`api/faq-agent.js`](api/faq-agent.js).

| Step | Question | Options → amount added |
|---|---|---|
| 1 | **Csere vagy új beépítés?** | replacement / new install — controls step 2 & the demolition line |
| 2 | **Jelenlegi kazán** *(only if replacement)* | nyílt égésterű +60 000 · kondenzációs +0 · turbós +60 000 |
| 3 | **Új kazán típusa** | kombi 24 kW +450 000 · tárolós 46 L +900 000 · külső 125 L +900 000 |
| 4 | **Kémény / égéstermék‑elvezetés** | tetőn ki +380 000 · tégla kéménybe +600 000 · társasházi gyűjtőkémény +600 000 |
| 5 | **Életvédelmi (Fi) relé** | van +50 000 · nincs +100 000 |
| — | **Always added (not asked)** | vizes rendszerre kötés +300 000 · gyári üzembe helyezés +50 000 · régi kazán/kémény bontása +90 000 |

**Total = sum of the selected rows + the three always‑added standard costs.**

### Decisions baked into the logic (confirmed by the company)
- **Prices are GROSS (ÁFA included) and include the boiler appliance + full
  installation** — the displayed total is what the customer pays
  (`APPLIANCE_INCLUDED = true`).
- **Standard costs** (wet‑system +300 000, commissioning +50 000, demolition
  +90 000) are **always added to every quote** and are **not asked** — they're
  standard on every job.
- **Current boiler** only counts on a replacement (a new install → `nincs`, +0).
- **No gázterv** line — the company confirmed it isn't needed.
- **Only 24 kW** appliances; exact brand/model is decided at the site survey.
- **Contact details** collected one field at a time at the end
  (name → e‑mail → phone → postal code → budget).

### Extra questions added (beyond the sheet)
These improve lead quality but **do not** change the price:
1. **Replacement vs. new install** — also gates the current‑boiler question.
2. **Urgency / timeframe** — strong lead signal for the owner.

### Quote delivery
- The itemised estimate is **shown in the chat** as soon as all answers are in.
- The **owner always** receives it by e‑mail (with the client's details).
- The **customer is offered a button** to have the quote e‑mailed to *them* too.
- Completion is decided by the **backend** (`isQuoteReady`) from a running hidden
  state block the model maintains — so the quote always appears even if the model
  phrasing varies. The model never computes the price.

---

## Setup & deploy

1. **Keys** — copy your secrets into `.env` (already git‑ignored):
   - `OPENAI_API_KEY` — from <https://platform.openai.com/api-keys>
   - `OPENAI_MODEL` — copy the exact model ID from your OpenAI dashboard. The
     task is tiny, so the cheapest tier is plenty (e.g. `gpt-5.4-nano`, or
     `gpt-5.4-mini`). The model never affects price accuracy — that's computed
     in the backend.
   - `RESEND_API_KEY` — free at <https://resend.com>
   - `LEAD_EMAIL_TO` — where quotes are sent (default `pirint.milan@gmail.com`)
   - `LEAD_EMAIL_FROM` — leave as the `onboarding@resend.dev` test sender to start;
     later verify your own domain in Resend and change it.
2. **Run locally:** `node server.js` → <http://localhost:8888>
3. **Deploy (Vercel):** push the repo; set the same env vars in the Vercel
   dashboard. `api/faq-agent.js` is the serverless endpoint, `public/` is static.
4. **Embed on a site:**
   ```html
   <script>
     window.KAZAN_CONFIG = {
       apiUrl: "https://YOUR-APP.vercel.app/api/faq-agent",
       assetsUrl: "https://YOUR-APP.vercel.app"
     };
   </script>
   <script src="https://YOUR-APP.vercel.app/widget.js"></script>
   ```

---

## Customising

- **Prices:** edit the `PRICES` object in `api/faq-agent.js`.
- **Questions / wording:** edit `SYSTEM_PROMPT` in `api/faq-agent.js`.
- **Colours / branding:** `public/style.css` (navy `#111827`, gold `#FBBF24`,
  blue `#025888`). Replace `public/logo.svg` with the company's real logo.
- **Phone number:** `PHONE` constant in `public/widget.js`.
