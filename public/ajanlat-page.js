// Read-only quote summary page: /ajanlat?d=<summary>.
//
// The link is built server-side in finishQuote() (api/faq-agent.js). The
// summary travels in the URL itself as base64url-encoded UTF-8 JSON - the
// project has no database, so nothing is stored anywhere.
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
      locale: "hu-HU"
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
      locale: "en-GB"
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
      locale: "de-AT"
    }
  };

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
    try {
      return d.toLocaleDateString(t.locale, { year: "numeric", month: "long", day: "numeric" });
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
  try {
    summary = decode(new URLSearchParams(window.location.search).get("d"));
  } catch (e) {
    summary = null;
  }
  if (summary) renderQuote(summary);
  else renderNotFound();
})();
