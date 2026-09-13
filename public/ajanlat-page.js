// Read-only quote summary page: /ajanlat?d=<summary>&c=<conversation id>.
//
// When the link has a c= id, the full conversation is fetched from
// /api/transcript (saved server-side in Vercel Blob) and shown under the
// estimate. Without it, or if it cannot be read, the estimate shows alone.
//
// The link is built server-side in finishQuote() (api/faq-agent.js). The
// summary travels in the URL itself as base64url-encoded UTF-8 JSON - the
// project has no database, so nothing is stored anywhere. Current links carry a
// compact array of tokens and numbers (so the URL fits a 255-character CRM
// field), turned back into labels here; the first, longer object format is
// still accepted.
//
// Everything decoded here came from a URL anyone can edit, so it is treated as
// untrusted: strictly validated, capped in length, and written with
// textContent only, never innerHTML. A missing or broken link shows a friendly
// "not found" card instead of an error.
//
// Kept in its own file (not inline) because the site's Content-Security-Policy
// only allows scripts from 'self'.
(function () {
  "use strict";

  var PHONE = "+36 20 254 6624";
  var MAX_PARAM = 2048;
  var CHAT_ID_RE = /^[A-Za-z0-9_-]{32}$/;
  var MAX_CHAT_MSGS = 80;
  var MAX_CHAT_TEXT = 12000;
  // The conversation is saved in the background as the quote is sent, so a link
  // opened within a second or two can arrive before the file. Try once more.
  var CHAT_RETRY_MS = 2000;

  // Same labels as the chat recap (LABELS / I18N_LABELS / sizeLabel in
  // api/faq-agent.js) - keep them in step.
  var SIZE_BANDS = { s_3_4: "3–4 m²", s_5_6: "5–6 m²", s_7_8: "7–8 m²", s_9_10: "9–10 m²" };
  var DEFAULT_AREA = { furdo: 5, lakas: 60, haz: 110, konyha: 9, szoba: 15 };

  var T = {
    hu: {
      title: "Előzetes árajánlat",
      created: "Készült:",
      job: "Munka típusa",
      size: "Méret",
      tier: "Kivitelezési szint",
      price: "Becsült ár",
      basisLabour: "ÁFA-mentes ár – ez a munkadíj, az anyagot nem tartalmazza.",
      basisTurnkey: "ÁFA-mentes ár, kulcsrakész kivitelben.",
      disclaimer: "Ez egy tájékoztató becslés – a végleges árat az ingyenes helyszíni felmérés után rögzítjük, a választott anyagok és a pontos műszaki tartalom függvényében.",
      call: "Kérdése van? Hívjon minket:",
      nfTitle: "Ez az árajánlat nem található",
      nfBody: "A link hiányos vagy sérült. Kérjen új előzetes árajánlatot a weboldalunkon, vagy hívjon minket.",
      chatTitle: "A beszélgetés",
      chatLoading: "A beszélgetés betöltése…",
      chatUnavailable: "A beszélgetés most nem érhető el.",
      you: "Ügyfél",
      bot: "NM Bau asszisztens",
      via: { typed: "beírta", chip: "gombbal választotta", form: "űrlapon adta meg" },
      locale: "hu-HU",
      jobs: { furdo: "Fürdőszoba", konyha: "Konyha", lakas: "Teljes lakás", haz: "Családi ház", szoba: "Egy szoba" },
      tiers: { basic: "Alap / takarékos", mid: "Közepes", premium: "Prémium", nem_tudom: "Nem tudja (alap: közepes)" },
      over10: "10 m² felett",
      sizeUnknown: function (a) { return "Nem tudja (alap: " + a + " m²)"; },
      decimal: ","
    },
    en: {
      title: "Preliminary estimate",
      created: "Created:",
      job: "Type of work",
      size: "Size",
      tier: "Finish level",
      price: "Estimated price",
      basisLabour: "VAT-free price – this is the labour; materials are not included.",
      basisTurnkey: "VAT-free price, turnkey.",
      disclaimer: "This is an indicative estimate – the final price is set after the free on-site survey, depending on the chosen materials and the exact scope of work.",
      call: "Questions? Call us:",
      nfTitle: "This estimate could not be found",
      nfBody: "The link is incomplete or damaged. Request a new estimate on our website, or give us a call.",
      chatTitle: "The conversation",
      chatLoading: "Loading the conversation…",
      chatUnavailable: "The conversation is not available right now.",
      you: "Customer",
      bot: "NM Bau assistant",
      via: { typed: "typed", chip: "tapped a quick answer", form: "contact form" },
      locale: "en-GB",
      jobs: { furdo: "Bathroom", konyha: "Kitchen", lakas: "Whole flat", haz: "Family house", szoba: "A single room" },
      tiers: { basic: "Basic / budget", mid: "Mid-range", premium: "Premium", nem_tudom: "Not sure (default: mid-range)" },
      over10: "over 10 m²",
      sizeUnknown: function (a) { return "Not sure (default: " + a + " m²)"; },
      decimal: "."
    },
    de: {
      title: "Vorläufiges Angebot",
      created: "Erstellt am:",
      job: "Art der Arbeit",
      size: "Größe",
      tier: "Ausstattungsniveau",
      price: "Geschätzter Preis",
      basisLabour: "Preis ohne MwSt. – dies ist der Arbeitslohn, ohne Material.",
      basisTurnkey: "Preis ohne MwSt., schlüsselfertig.",
      disclaimer: "Dies ist eine Richtschätzung – der endgültige Preis wird nach der kostenlosen Vor-Ort-Besichtigung festgelegt, abhängig von den gewählten Materialien und dem genauen Leistungsumfang.",
      call: "Fragen? Rufen Sie uns an:",
      nfTitle: "Dieses Angebot wurde nicht gefunden",
      nfBody: "Der Link ist unvollständig oder beschädigt. Fordern Sie auf unserer Website ein neues Angebot an oder rufen Sie uns an.",
      chatTitle: "Das Gespräch",
      chatLoading: "Gespräch wird geladen…",
      chatUnavailable: "Das Gespräch ist gerade nicht verfügbar.",
      you: "Kunde",
      bot: "NM Bau Assistent",
      via: { typed: "selbst getippt", chip: "Schnellantwort gewählt", form: "Kontaktformular" },
      locale: "de-AT",
      jobs: { furdo: "Badezimmer", konyha: "Küche", lakas: "Ganze Wohnung", haz: "Einfamilienhaus", szoba: "Ein Zimmer" },
      tiers: { basic: "Einfach / sparsam", mid: "Mittel", premium: "Premium", nem_tudom: "Weiß nicht (Standard: Mittel)" },
      over10: "über 10 m²",
      sizeUnknown: function (a) { return "Weiß nicht (Standard: " + a + " m²)"; },
      decimal: ","
    }
  };

  function has(o, k) {
    return typeof k === "string" && Object.prototype.hasOwnProperty.call(o, k);
  }

  function pickLang(l) {
    l = String(l || "").toLowerCase().slice(0, 2);
    return l === "en" || l === "de" ? l : "hu";
  }

  // For the "not found" card there is no summary to read a language from, so
  // fall back to the browser's own language (Hungarian when in doubt).
  function browserLang() {
    var n = (navigator.languages && navigator.languages[0]) || navigator.language || "";
    return pickLang(n);
  }

  function isText(v, max) {
    return typeof v === "string" && v.trim() !== "" && v.length <= max;
  }

  function isValid(o) {
    return !!o && typeof o === "object" && !Array.isArray(o) &&
      isText(o.job_type, 120) &&
      isText(o.size, 60) &&
      isText(o.tier, 80) &&
      isText(o.quote_formatted, 80);
  }

  function isAmount(n) {
    return typeof n === "number" && isFinite(n) && n >= 0 && n <= 1e10 && Math.floor(n) === n;
  }

  function money(n, cur) {
    try {
      return cur === "eur" ? n.toLocaleString("de-AT") + " EUR" : n.toLocaleString("hu-HU") + " Ft";
    } catch (e) {
      return String(n) + (cur === "eur" ? " EUR" : " Ft");
    }
  }

  function sizeText(size, pt, t) {
    if (size === "nem_tudom") return t.sizeUnknown(DEFAULT_AREA[pt]);
    if (size === "s_11p") return t.over10;
    if (has(SIZE_BANDS, size)) return SIZE_BANDS[size];
    if (typeof size === "number" && isFinite(size) && size >= 1 && size <= 1000) {
      return String(size).replace(".", t.decimal) + " m²";
    }
    return null;
  }

  // Version 2: [2, lang, projectType, size, tier, low, high, currency, basis, date]
  // -> the same summary object the first link format carried, or null.
  function fromCompact(a) {
    if (a.length !== 10 || a[0] !== 2) return null;
    var lang = a[1], pt = a[2], size = a[3], tier = a[4], low = a[5], high = a[6];
    var cur = a[7], basis = a[8], date = a[9];
    if (lang !== "hu" && lang !== "en" && lang !== "de") return null;
    var t = T[lang];
    if (!has(t.jobs, pt)) return null;
    if (tier !== "" && !has(t.tiers, tier)) return null;
    if (!isAmount(low) || !isAmount(high) || low > high) return null;
    if (cur !== "huf" && cur !== "eur") return null;
    if (basis !== "l" && basis !== "t" && basis !== "") return null;
    var s = sizeText(size, pt, t);
    if (!s) return null;
    return {
      lang: lang,
      job_type: t.jobs[pt],
      size: s,
      tier: tier === "" ? "-" : t.tiers[tier],
      quote_formatted: money(low, cur) + " – " + money(high, cur),
      submitted_at: typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null,
      basis: basis === "l" ? "labour" : basis === "t" ? "turnkey" : null
    };
  }

  // base64url -> bytes -> strict UTF-8 -> JSON -> validated object, or null.
  function decode(param) {
    if (!param || param.length > MAX_PARAM || !/^[A-Za-z0-9_-]+$/.test(param)) return null;
    try {
      var b64 = param.replace(/-/g, "+").replace(/_/g, "/");
      while (b64.length % 4) b64 += "=";
      var bin = atob(b64);
      var bytes = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      var json = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      var o = JSON.parse(json);
      if (Array.isArray(o)) o = fromCompact(o);
      return isValid(o) ? o : null;
    } catch (e) {
      return null;
    }
  }

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function formatDate(iso, t) {
    if (typeof iso !== "string") return null;
    var d = new Date(iso);
    if (isNaN(d.getTime())) return null;
    var opts = { year: "numeric", month: "long", day: "numeric" };
    // A bare date parses as UTC midnight; show it as that day everywhere.
    if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) opts.timeZone = "UTC";
    try {
      return d.toLocaleDateString(t.locale, opts);
    } catch (e) {
      return null;
    }
  }

  function contactLine(t) {
    var p = el("p", "contact", t.call + " ");
    var a = el("a", null, PHONE);
    a.href = "tel:" + PHONE.replace(/\s/g, "");
    p.appendChild(a);
    return p;
  }

  function resetCard(lang, title) {
    document.documentElement.lang = lang;
    document.title = "NM Bau - " + title;
    var card = document.getElementById("card");
    card.textContent = "";
    return card;
  }

  function renderQuote(o) {
    var lang = pickLang(o.lang);
    var t = T[lang];
    var card = resetCard(lang, t.title);

    card.appendChild(el("h1", "title", t.title));
    var date = formatDate(o.submitted_at, t);
    if (date) card.appendChild(el("p", "muted", t.created + " " + date));

    var facts = el("dl", "facts");
    [[t.job, o.job_type], [t.size, o.size], [t.tier, o.tier]].forEach(function (row) {
      var item = el("div", "fact");
      item.appendChild(el("dt", null, row[0]));
      item.appendChild(el("dd", null, row[1]));
      facts.appendChild(item);
    });
    card.appendChild(facts);

    var price = el("div", "price");
    price.appendChild(el("span", "price-label", t.price));
    price.appendChild(el("span", "price-value", o.quote_formatted));
    var note = o.basis === "labour" ? t.basisLabour : o.basis === "turnkey" ? t.basisTurnkey : null;
    if (note) price.appendChild(el("span", "price-note", note));
    card.appendChild(price);

    card.appendChild(el("p", "disclaimer", t.disclaimer));
    card.appendChild(contactLine(t));
  }

  // Only what the endpoint is meant to return; anything else is dropped.
  function validMessages(doc) {
    if (!doc || !Array.isArray(doc.messages) || doc.messages.length > MAX_CHAT_MSGS) return null;
    var out = [];
    for (var i = 0; i < doc.messages.length; i++) {
      var m = doc.messages[i];
      if (!m || (m.role !== "customer" && m.role !== "assistant")) return null;
      if (!isText(m.text, MAX_CHAT_TEXT)) return null;
      var via = m.role === "customer" && (m.via === "typed" || m.via === "chip" || m.via === "form") ? m.via : null;
      out.push({ role: m.role, text: m.text, via: via });
    }
    return out.length ? out : null;
  }

  function fetchChat(id, retried, done) {
    fetch("/api/transcript?id=" + encodeURIComponent(id), { credentials: "omit", cache: "no-store" })
      .then(function (r) {
        if (r.status === 404 && !retried) {
          setTimeout(function () { fetchChat(id, true, done); }, CHAT_RETRY_MS);
          return null;
        }
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json().then(function (doc) { done(validMessages(doc)); });
      })
      .catch(function () { done(null); });
  }

  // Written with textContent only; newlines are kept by white-space: pre-line.
  function renderChat(id, t) {
    var section = el("section", "card chat");
    section.setAttribute("aria-live", "polite");
    section.appendChild(el("h2", "chat-title", t.chatTitle));
    var status = el("p", "muted", t.chatLoading);
    section.appendChild(status);
    document.getElementById("card").insertAdjacentElement("afterend", section);

    fetchChat(id, false, function (messages) {
      if (!messages) {
        status.textContent = t.chatUnavailable;
        return;
      }
      section.removeChild(status);
      var list = el("ol", "chat-list");
      messages.forEach(function (m) {
        var mine = m.role === "customer";
        // Typed answers get their own look: they are the ones to read for what
        // the bot misunderstood.
        var item = el("li", "msg " + (mine ? "msg--customer" : "msg--bot") + (m.via === "typed" ? " msg--typed" : ""));
        item.appendChild(el("span", "msg-who", (mine ? t.you : t.bot) + (m.via ? " · " + t.via[m.via] : "")));
        item.appendChild(el("p", "msg-text", m.text));
        list.appendChild(item);
      });
      section.appendChild(list);
    });
  }

  function renderNotFound() {
    var lang = browserLang();
    var t = T[lang];
    var card = resetCard(lang, t.nfTitle);
    card.classList.add("card--nf");
    card.appendChild(el("h1", "title", t.nfTitle));
    card.appendChild(el("p", "muted", t.nfBody));
    card.appendChild(contactLine(t));
  }

  var summary = null;
  var chatId = null;
  try {
    var params = new URLSearchParams(window.location.search);
    summary = decode(params.get("d"));
    chatId = params.get("c");
  } catch (e) {
    summary = null;
  }
  if (summary) {
    renderQuote(summary);
    if (typeof chatId === "string" && CHAT_ID_RE.test(chatId)) renderChat(chatId, T[pickLang(summary.lang)]);
  } else {
    renderNotFound();
  }
})();
