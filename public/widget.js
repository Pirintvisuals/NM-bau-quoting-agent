(function () {
  // Configuration with defaults for local development
  const config = window.NMBAU_CONFIG || window.KAZAN_CONFIG || {};
  const apiUrl = config.apiUrl || "/api/faq-agent";
  const assetsUrl = config.assetsUrl || ""; // e.g. "https://your-app.vercel.app"
  const PHONE = "+36 30 260 57 56";
  const BRAND = "NM Bau";

  // --- Language sync with the host site -----------------------------------
  // The NM Bau site (assets/i18n.js) sets <html lang> and localStorage "nmlang"
  // to hu|en|de when the visitor clicks the HU/EN/DE buttons. We read the same
  // value so the chatbot speaks the site's language, and watch <html lang> to
  // follow live switches with no extra click. An embed can also force a fixed
  // language with window.NMBAU_CONFIG.lang = "en".
  function normLang(l) {
    l = String(l || "").toLowerCase().slice(0, 2);
    return l === "en" || l === "de" ? l : "hu";
  }
  function detectLang() {
    if (config.lang) return normLang(config.lang);
    try { const s = localStorage.getItem("nmlang"); if (s) return normLang(s); } catch (e) {}
    return normLang(document.documentElement.getAttribute("lang"));
  }
  let LANG = detectLang();

  const STRINGS = {
    hu: {
      teasers: [
        "Mennyibe kerül a felújításom?",
        "Kérjen ingyenes árajánlatot 1 perc alatt!",
        "Pár kérdés, és máris látja a várható árat.",
        "Lakást, fürdőt vagy konyhát újítana fel?",
        "Kíváncsi a felújítás reális árára?",
        "Kulcsrakész felújítás - kérjen kalkulációt!",
        "Teljes lakásfelújítást tervez? Számoljunk!",
        "Fürdő, konyha, ház - mutatjuk az árát is!",
        "Ingyenes helyszíni felmérés - kezdje itt!",
        "Felújítana? Kérdezzen tőlünk bátran!",
      ],
      launcherAria: "Csevegés megnyitása - NM Bau",
      bubbleClose: "Buborék bezárása",
      chatClose: "Csevegés bezárása",
      status: "Azonnal válaszol",
      placeholder: "Írja be a válaszát – vagy kérdezzen bátran…",
      inputAria: "Írja be a válaszát vagy kérdését",
      dialogAria: "NM Bau árajánló asszisztens",
      greeting: `Üdvözlöm az **${BRAND}** **felújítási** árajánló asszisztensénél! Néhány kérdés alapján elkészítem az **előzetes árajánlatát**.`,
      kickoff: "Szeretnék árajánlatot egy felújításra.",
      estLabel: "Becsült ár",
      estPartial: "pontosítással szűkül (nettó)",
      estFinal: "véglegesített sáv (nettó)",
      approx: "kb.",
      million: "millió Ft",
      emailYes: "Kérem e-mailben is",
      emailNo: "Köszönöm, nem",
      declineMsg: "Rendben, köszönjük a megkeresést! Hamarosan keressük. Ha sürgős, hívjon: " + PHONE,
      errGeneric: "Elnézést, hiba történt. Kérjük, próbálja újra később.",
      errConnect: "Elnézést, nem sikerült kapcsolódni a szerverhez.",
      emailSent: "Elküldtük az árajánlatot a megadott e-mail címre.",
      emailFail: "Sajnos most nem sikerült e-mailt küldeni. Kérjük, próbálja később.",
    },
    en: {
      teasers: [
        "How much will my renovation cost?",
        "Get a free quote in 1 minute!",
        "A few questions and you'll see the likely price.",
        "Renovating a flat, bathroom or kitchen?",
        "Curious about a realistic renovation price?",
        "Turnkey renovation - get a calculation!",
        "Planning a full flat renovation? Let's calculate!",
        "Bathroom, kitchen, house - we'll show the price too!",
        "Free on-site survey - start here!",
        "Renovating? Ask us anything!",
      ],
      launcherAria: "Open chat - NM Bau",
      bubbleClose: "Close bubble",
      chatClose: "Close chat",
      status: "Replies instantly",
      placeholder: "Type your answer – or ask us anything…",
      inputAria: "Type your answer or question",
      dialogAria: "NM Bau quote assistant",
      greeting: `Welcome to the **${BRAND}** **renovation** quote assistant! Based on a few questions I'll prepare your **preliminary quote**.`,
      kickoff: "I'd like a quote for a renovation.",
      estLabel: "Estimated price",
      estPartial: "narrows as you refine (net)",
      estFinal: "finalised range (net)",
      approx: "approx.",
      million: "million Ft",
      emailYes: "Yes, e-mail it to me",
      emailNo: "No, thanks",
      declineMsg: "Alright, thank you for reaching out! We'll be in touch soon. If it's urgent, call: " + PHONE,
      errGeneric: "Sorry, something went wrong. Please try again later.",
      errConnect: "Sorry, we couldn't connect to the server.",
      emailSent: "We've sent the quote to the e-mail address provided.",
      emailFail: "Sorry, we couldn't send the e-mail right now. Please try again later.",
    },
    de: {
      teasers: [
        "Was kostet meine Renovierung?",
        "Holen Sie sich in 1 Minute ein kostenloses Angebot!",
        "Ein paar Fragen und Sie sehen den voraussichtlichen Preis.",
        "Wohnung, Bad oder Küche renovieren?",
        "Neugierig auf einen realistischen Renovierungspreis?",
        "Schlüsselfertige Renovierung - jetzt kalkulieren!",
        "Komplette Wohnungsrenovierung geplant? Rechnen wir!",
        "Bad, Küche, Haus - wir zeigen auch den Preis!",
        "Kostenlose Vor-Ort-Besichtigung - hier starten!",
        "Renovieren? Fragen Sie uns alles!",
      ],
      launcherAria: "Chat öffnen - NM Bau",
      bubbleClose: "Blase schließen",
      chatClose: "Chat schließen",
      status: "Antwortet sofort",
      placeholder: "Geben Sie Ihre Antwort ein – oder fragen Sie uns…",
      inputAria: "Geben Sie Ihre Antwort oder Frage ein",
      dialogAria: "NM Bau Angebotsassistent",
      greeting: `Willkommen beim **${BRAND}** **Renovierungs**-Angebotsassistenten! Anhand einiger Fragen erstelle ich Ihr **vorläufiges Angebot**.`,
      kickoff: "Ich hätte gerne ein Angebot für eine Renovierung.",
      estLabel: "Geschätzter Preis",
      estPartial: "wird durch Angaben enger (netto)",
      estFinal: "endgültige Spanne (netto)",
      approx: "ca.",
      million: "Mio. Ft",
      emailYes: "Ja, bitte per E-Mail",
      emailNo: "Nein, danke",
      declineMsg: "In Ordnung, danke für Ihre Anfrage! Wir melden uns bald. Bei dringenden Fällen rufen Sie an: " + PHONE,
      errGeneric: "Entschuldigung, etwas ist schiefgelaufen. Bitte versuchen Sie es später erneut.",
      errConnect: "Entschuldigung, die Verbindung zum Server ist fehlgeschlagen.",
      emailSent: "Wir haben das Angebot an die angegebene E-Mail-Adresse gesendet.",
      emailFail: "Leider konnten wir die E-Mail gerade nicht senden. Bitte versuchen Sie es später erneut.",
    },
  };
  function t() { return STRINGS[LANG] || STRINGS.hu; }
  function curTeasers() { return t().teasers; }

  // --- Analytics (PostHog) -------------------------------------------------
  // Drop-in usage tracking. ALL events are tagged with `client` so a single
  // PostHog project gives you a per-client breakdown (this widget is embedded
  // on many sites). Nothing the customer types (name / e-mail / phone / address)
  // is ever sent as an event property or shown in a session replay - see the
  // PII masking in initAnalytics() and addMessage().
  //
  // Setup: create a free EU project at https://eu.posthog.com, copy the
  // "Project API Key" (starts with phc_), and either paste it below or set
  // window.NMBAU_CONFIG.posthogKey before loading this script. Until a real key
  // is set, analytics simply stays off and the widget works exactly as before.
  const POSTHOG_KEY = config.posthogKey || "phc_nroFe9H8K9hbVENBqcRRrWW9GXxoyVZhSomy3U8Zhu4P";
  const POSTHOG_HOST = config.posthogHost || "https://eu.i.posthog.com";
  // Identifies which client/site this embed belongs to. Set per client via
  // window.NMBAU_CONFIG.client = "clientname"; falls back to the host name.
  const CLIENT_ID = config.client || (location.hostname || "unknown");
  const WIDGET_VERSION = "2026-06-22";
  // Session replay is on by default (you asked for it). Set
  // window.NMBAU_CONFIG.sessionReplay = false to turn it off for a client.
  const SESSION_REPLAY = config.sessionReplay !== false;

  // Fire an analytics event. No-ops safely if PostHog isn't loaded / no key set.
  function track(event, props) {
    try {
      if (window.posthog && typeof window.posthog.capture === "function") {
        window.posthog.capture(event, props || {});
      }
    } catch (e) {}
  }

  function analyticsEnabled() {
    return POSTHOG_KEY && POSTHOG_KEY.indexOf("REPLACE") === -1;
  }

  function initAnalytics() {
    if (!analyticsEnabled()) return; // no key yet -> stay off, widget unaffected
    // Official PostHog loader snippet (async-loads array.js from the CDN).
    !function(t,e){var o,n,p,r;e.__SV||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.crossOrigin="anonymous",p.async=!0,p.src=s.api_host.replace(".i.posthog.com","-assets.i.posthog.com")+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],u.toString=function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e},u.people.toString=function(){return u.toString(1)+".people (stub)"},o="init capture register register_once register_for_session unregister unregister_for_session getFeatureFlag getFeatureFlagPayload isFeatureEnabled reloadFeatureFlags updateEarlyAccessFeatureEnrollment getEarlyAccessFeatures on onFeatureFlags onSessionId getSurveys getActiveMatchingSurveys renderSurvey canRenderSurvey getNextSurveyStep identify setPersonProperties group resetGroups setPersonPropertiesForFlags resetPersonPropertiesForFlags setGroupPropertiesForFlags resetGroupPropertiesForFlags reset get_distinct_id getGroups get_session_id get_session_replay_url alias set_config startSessionRecording stopSessionRecording sessionRecordingStarted captureException loadToolbar get_property getSessionProperty createPersonProfile opt_in_capturing opt_out_capturing has_opted_in_capturing has_opted_out_capturing clear_opt_in_out_capturing debug getPageViewId".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);
    try {
      window.posthog.init(POSTHOG_KEY, {
        api_host: POSTHOG_HOST,
        capture_pageview: false, // it's an embedded widget, not a page view
        autocapture: false,      // we send our own clean, named events instead
        disable_session_recording: !SESSION_REPLAY,
        session_recording: {
          maskAllInputs: true, // never record what the customer types (PII)
          // also mask the customer's own chat bubbles (they contain name /
          // address / etc.); bot bubbles + the price are left visible.
          maskTextSelector: ".faq-msg.user .faq-bubble, .ph-no-capture",
        },
      });
      window.posthog.register({
        client: CLIENT_ID,
        widget_version: WIDGET_VERSION,
        language: navigator.language || "",
      });
    } catch (e) {}
  }

  let chatOpen = false;
  let chatWindow = null;
  let messagesContainer = null;
  let inputElement = null;
  let sending = false;
  let conversationHistory = []; // [{ role: "user"|"assistant", content: "..." }]
  let convState = {}; // accumulated answer-state, carried turn-to-turn (chips/quote rely on it)
  let started = false;
  let lastLead = null; // { sel, quote } - held so the customer can request the e-mail
  let thinkingEl = null;
  let progressFillEl = null, progressLabelEl = null, progressBarEl = null;
  let estimateBarEl = null; // live "becsült ár" banner (full flat/house only)
  let lastProgress = 0, lastProgressTotal = 0; // for drop-off analytics
  let quoteDone = false; // so quote_completed fires once per conversation

  let container = null;

  // Rotating teaser questions shown in the always-on bubble next to the launcher.
  // Varied angles (price, speed, specific trades, CTA) so it stays interesting
  // and invites a click. The actual text comes from STRINGS[LANG].teasers.
  const TEASER_ROTATE_MS = 9000; // how long each question stays before swapping
  const TEASER_DISMISS_KEY = "nmbau_teaser_dismissed";
  let teaserIdx = Math.floor(Math.random() * curTeasers().length); // start varied
  let teaserTimer = null;       // rotation interval
  // Once the user closes the bubble with ×, it stays gone - remembered across
  // page loads/visits via localStorage (falls back to in-memory if unavailable).
  let teaserDismissed = false;
  try { teaserDismissed = localStorage.getItem(TEASER_DISMISS_KEY) === "1"; } catch (e) {}

  // --- Inline SVG icons (no emojis used as UI icons) ---
  const ICON = {
    chat: '<svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>',
    phone: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/></svg>',
    send: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>',
    mail: '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 5L2 7"/></svg>',
    close: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
    check: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
  };

  function logoSrc() {
    return assetsUrl ? `${assetsUrl}/logo.png` : "logo.png";
  }

  // Inject the widget stylesheet so it works on any site it's embedded on,
  // not just the demo page.
  function injectStyles() {
    if (document.getElementById("faq-agent-styles")) return;
    const link = document.createElement("link");
    link.id = "faq-agent-styles";
    link.rel = "stylesheet";
    link.href = assetsUrl ? `${assetsUrl}/style.css` : "style.css";
    document.head.appendChild(link);
  }

  function createContainer() {
    container = document.createElement("div");
    container.id = "faq-agent-container";
    document.body.appendChild(container);
  }

  function createLauncher() {
    if (!container) createContainer();

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "faq-chat-launcher";
    btn.setAttribute("aria-label", t().launcherAria);
    btn.innerHTML = `<span class="faq-launcher-ring" aria-hidden="true"></span>${ICON.chat}<span class="faq-launcher-dot" aria-hidden="true"></span>`;
    btn.onclick = toggleChat;
    container.appendChild(btn);

    const tooltip = document.createElement("div");
    tooltip.className = "faq-chat-tooltip";
    tooltip.setAttribute("role", "button");
    tooltip.setAttribute("tabindex", "0");
    tooltip.innerHTML = `<span class="faq-tooltip-text">${curTeasers()[teaserIdx % curTeasers().length]}</span>`;

    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "faq-tooltip-close";
    closeBtn.setAttribute("aria-label", t().bubbleClose);
    closeBtn.innerHTML = '<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><line x1="5" y1="5" x2="19" y2="19"/><line x1="19" y1="5" x2="5" y2="19"/></svg>';
    closeBtn.onclick = (e) => {
      e.stopPropagation();
      teaserDismissed = true; // user explicitly closed it → stay gone for good
      try { localStorage.setItem(TEASER_DISMISS_KEY, "1"); } catch (err) {}
      hideTeaser();
    };

    tooltip.appendChild(closeBtn);
    const openFromTooltip = () => {
      hideTeaser();
      if (!chatOpen) toggleChat();
    };
    tooltip.onclick = openFromTooltip;
    tooltip.onkeydown = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openFromTooltip(); } };

    container.appendChild(tooltip);
    // Show shortly after load, then keep rotating through the varied questions.
    setTimeout(() => showTeaser(), 1600);
  }

  function teaserEl() { return document.querySelector(".faq-chat-tooltip"); }

  // Fade the current question out, swap in the next one, give a tiny attention
  // bounce. Keeps the bubble feeling alive so people notice and click.
  function rotateTeaser() {
    const tip = teaserEl();
    if (!tip || !tip.classList.contains("show")) return;
    const textEl = tip.querySelector(".faq-tooltip-text");
    if (!textEl) return;
    tip.classList.add("swapping");
    setTimeout(() => {
      teaserIdx = (teaserIdx + 1) % curTeasers().length;
      textEl.textContent = curTeasers()[teaserIdx];
      tip.classList.remove("swapping");
      tip.classList.add("attention");
      setTimeout(() => tip.classList.remove("attention"), 650);
    }, 260);
  }

  function showTeaser() {
    if (teaserDismissed || chatOpen) return;
    const tip = teaserEl();
    if (!tip) return;
    tip.classList.remove("hidden");
    // reflow so the entrance transition replays after being hidden
    void tip.offsetWidth;
    tip.classList.add("show");
    if (!teaserTimer) teaserTimer = setInterval(rotateTeaser, TEASER_ROTATE_MS);
  }

  function hideTeaser() {
    const tip = teaserEl();
    if (teaserTimer) { clearInterval(teaserTimer); teaserTimer = null; }
    if (!tip) return;
    tip.classList.remove("show");
    setTimeout(() => tip.classList.add("hidden"), 300);
  }

  function toggleChat() {
    const launcher = document.querySelector(".faq-chat-launcher");

    if (chatOpen) {
      // Close: animate, then HIDE (keep in DOM so the conversation persists).
      const w = chatWindow;
      w.classList.add("closing");
      setTimeout(() => {
        if (w) { w.style.display = "none"; w.classList.remove("closing"); }
      }, 180);
      chatOpen = false;
      if (launcher) launcher.classList.remove("active");
      track("chat_closed", { answered: lastProgress, total: lastProgressTotal });
      // Bring the rotating teaser back so the launcher never sits there silent.
      setTimeout(() => showTeaser(), 400);
    } else {
      hideTeaser();
      if (!chatWindow) {
        openChat(); // build once (also fires the greeting + first question)
      } else {
        // Re-show the existing window with its messages intact.
        chatWindow.style.display = "flex";
        chatWindow.style.animation = "none";
        void chatWindow.offsetWidth; // force reflow so the open animation replays
        chatWindow.style.animation = "";
        scrollToBottom();
        setTimeout(() => inputElement && inputElement.focus(), 120);
      }
      chatOpen = true;
      if (launcher) launcher.classList.add("active");
      track("chat_opened");
    }
  }

  function openChat() {
    chatWindow = document.createElement("div");
    chatWindow.className = "faq-chat-window";
    chatWindow.setAttribute("role", "dialog");
    chatWindow.setAttribute("aria-label", t().dialogAria);

    // ---- Header ----
    const header = document.createElement("div");
    header.className = "faq-chat-header";

    const logo = document.createElement("img");
    logo.src = logoSrc();
    logo.alt = BRAND;
    logo.className = "faq-header-logo";

    const textBlock = document.createElement("div");
    textBlock.className = "faq-header-text";
    textBlock.innerHTML =
      `<span class="faq-header-title">${BRAND}</span>` +
      `<span class="faq-header-status"><span class="faq-status-dot" aria-hidden="true"></span>${t().status}</span>`;

    const actions = document.createElement("div");
    actions.className = "faq-header-actions";

    const phone = document.createElement("a");
    phone.className = "faq-header-phone";
    phone.href = `tel:${PHONE.replace(/\s/g, "")}`;
    phone.setAttribute("aria-label", `Hívás: ${PHONE}`);
    phone.innerHTML = `${ICON.phone}<span>${PHONE}</span>`;

    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "faq-header-close";
    closeBtn.setAttribute("aria-label", t().chatClose);
    closeBtn.innerHTML = ICON.close;
    closeBtn.onclick = toggleChat;

    actions.appendChild(phone);
    actions.appendChild(closeBtn);

    header.appendChild(logo);
    header.appendChild(textBlock);
    header.appendChild(actions);

    // ---- Progress bar (how far through the questions) ----
    const progress = document.createElement("div");
    progress.className = "faq-progress";
    progress.innerHTML =
      '<div class="faq-progress-track"><div class="faq-progress-fill"></div></div>' +
      '<span class="faq-progress-label"></span>';
    progressBarEl = progress;
    progressFillEl = progress.querySelector(".faq-progress-fill");
    progressLabelEl = progress.querySelector(".faq-progress-label");

    // ---- Live estimate banner (shown once there's enough to estimate) ----
    estimateBarEl = document.createElement("div");
    estimateBarEl.className = "faq-estimate";
    estimateBarEl.style.cssText =
      "display:none;align-items:center;justify-content:space-between;gap:8px;" +
      "padding:10px 14px;background:#1C1917;color:#fff;border-bottom:2px solid #B8860B;" +
      "font-family:inherit;";
    estimateBarEl.innerHTML =
      `<span style="font-size:12px;color:#D6D3D1">${t().estLabel}</span>` +
      '<span class="faq-estimate-val" style="font-size:15px;font-weight:700;color:#fff"></span>' +
      '<span class="faq-estimate-note" style="font-size:10px;color:#A8A29E;text-align:right;flex:0 0 auto"></span>';

    // ---- Messages ----
    messagesContainer = document.createElement("div");
    messagesContainer.className = "faq-chat-messages";
    messagesContainer.setAttribute("role", "log");
    messagesContainer.setAttribute("aria-live", "polite");

    // ---- Input ----
    const inputBar = document.createElement("form");
    inputBar.className = "faq-chat-input";
    inputBar.onsubmit = (e) => { e.preventDefault(); sendMessage(); };

    inputElement = document.createElement("input");
    inputElement.type = "text";
    inputElement.className = "faq-input-field";
    inputElement.setAttribute("aria-label", t().inputAria);
    inputElement.placeholder = t().placeholder;
    inputElement.autocomplete = "off";

    const sendBtn = document.createElement("button");
    sendBtn.type = "submit";
    sendBtn.className = "faq-send-btn";
    sendBtn.setAttribute("aria-label", "Küldés");
    sendBtn.innerHTML = ICON.send;

    inputBar.appendChild(inputElement);
    inputBar.appendChild(sendBtn);

    chatWindow.appendChild(header);
    chatWindow.appendChild(progress);
    chatWindow.appendChild(estimateBarEl);
    chatWindow.appendChild(messagesContainer);
    chatWindow.appendChild(inputBar);

    container.appendChild(chatWindow);
    setTimeout(() => inputElement && inputElement.focus(), 150);

    if (!started) {
      started = true;
      track("quote_started");
      addMessage("bot", t().greeting);
      sendMessage(t().kickoff, true);
    }
  }

  function renderMarkdown(text) {
    const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
    // Only allow safe URL schemes in links - blocks javascript:/data: injection
    // even if a customer's own echoed text contains link markup.
    const safeUrl = (u) => (/^(https?:\/\/|mailto:|tel:|\/|#)/i.test(u) ? u : "#");
    const inline = (s) =>
      esc(s)
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (m, label, url) =>
          `<a href="${safeUrl(url.trim())}" target="_blank" rel="noopener noreferrer">${label}</a>`)
        .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");

    // Build clean block elements (bullets, headers, paragraphs) for readability.
    let html = "";
    for (const raw of text.split("\n")) {
      const line = raw.trim();
      if (line === "") { html += '<div class="faq-sp"></div>'; continue; }
      if (line.startsWith("•")) { html += '<div class="faq-li">' + inline(line.replace(/^•\s*/, "")) + "</div>"; continue; }
      if (/^\*\*.*\*\*:?$/.test(line)) { html += '<div class="faq-h">' + inline(line) + "</div>"; continue; }
      html += '<div class="faq-p">' + inline(line) + "</div>";
    }
    return html;
  }

  function clearChips() {
    messagesContainer.querySelectorAll(".faq-chips").forEach((c) => c.remove());
  }

  function makeChip(label) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "faq-chip";
    chip.textContent = label;
    return chip;
  }

  function renderChips(chips) {
    clearChips();
    if (!chips || !chips.length) return;
    const wrap = document.createElement("div");
    wrap.className = "faq-chips";
    chips.forEach((label) => {
      const chip = makeChip(label);
      chip.onclick = () => { clearChips(); sendMessage(label); };
      wrap.appendChild(chip);
    });
    messagesContainer.appendChild(wrap);
    scrollToBottom();
  }

  // After the quote is shown, offer to e-mail it to the customer.
  function renderEmailOffer() {
    clearChips();
    const wrap = document.createElement("div");
    wrap.className = "faq-chips";

    const yes = document.createElement("button");
    yes.type = "button";
    yes.className = "faq-chip faq-chip-primary";
    yes.innerHTML = `${ICON.mail}<span>${t().emailYes}</span>`;
    yes.onclick = () => { clearChips(); track("email_requested"); requestEmail(); };

    const no = makeChip(t().emailNo);
    no.onclick = () => {
      clearChips();
      track("email_declined");
      addMessage("bot", t().declineMsg);
    };

    wrap.appendChild(yes);
    wrap.appendChild(no);
    messagesContainer.appendChild(wrap);
    scrollToBottom();
  }

  async function requestEmail() {
    if (sending || !lastLead) return;
    sending = true;
    addThinking();
    try {
      const res = await fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "email_customer", lead: lastLead, lang: LANG }),
      });
      removeThinking();
      const data = await res.json();
      addMessage("bot", data.answer || t().emailSent);
    } catch (e) {
      removeThinking();
      addMessage("bot", t().emailFail);
    } finally {
      sending = false;
    }
  }

  function scrollToBottom() {
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }

  function addMessage(sender, text) {
    const msg = document.createElement("div");
    msg.className = "faq-msg " + sender;

    if (sender === "bot") {
      const avatar = document.createElement("img");
      avatar.className = "faq-avatar";
      avatar.src = logoSrc();
      avatar.alt = "";
      avatar.setAttribute("aria-hidden", "true");
      msg.appendChild(avatar);
    }

    const bubble = document.createElement("div");
    bubble.className = "faq-bubble";
    if (sender === "bot") bubble.innerHTML = renderMarkdown(text);
    else { bubble.textContent = text; bubble.classList.add("ph-no-capture"); } // mask customer text in replay

    msg.appendChild(bubble);
    messagesContainer.appendChild(msg);
    scrollToBottom();
    return msg;
  }

  function addThinking() {
    const msg = document.createElement("div");
    msg.className = "faq-msg bot";
    msg.innerHTML =
      `<img class="faq-avatar" src="${logoSrc()}" alt="" aria-hidden="true">` +
      `<div class="faq-bubble faq-typing"><span></span><span></span><span></span></div>`;
    messagesContainer.appendChild(msg);
    scrollToBottom();
    thinkingEl = msg;
  }

  function removeThinking() {
    if (thinkingEl) { thinkingEl.remove(); thinkingEl = null; }
  }

  // Money formatter matching the backend (e.g. "7 800 000 Ft").
  function fmtHuf(n) {
    return Math.round(n).toLocaleString("hu-HU") + " Ft";
  }

  // Friendlier range: big sums in "millió Ft" (e.g. "5,3 – 6,6 millió Ft"),
  // smaller ones in full forints. Much more scannable than 8-digit numbers.
  function fmtRange(low, high) {
    if (high >= 1000000) {
      const m = (n) => (Math.round(n / 100000) / 10).toLocaleString("hu-HU", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
      return `${m(low)} – ${m(high)} ${t().million}`;
    }
    return `${fmtHuf(low)} – ${fmtHuf(high)}`;
  }

  let lastEstimateText = null; // so we only pulse when the value actually changes

  // Update the live "Becsült ár" banner from the backend's running estimate.
  // partial = still refining (wider range); false = final, locked-in range.
  function updateEstimate(est) {
    if (!estimateBarEl) return;
    if (!est || est.low == null || est.high == null) { estimateBarEl.style.display = "none"; lastEstimateText = null; return; }
    const wasVisible = estimateBarEl.style.display !== "none";
    estimateBarEl.style.display = "flex";
    const val = estimateBarEl.querySelector(".faq-estimate-val");
    const note = estimateBarEl.querySelector(".faq-estimate-note");
    const text = t().approx + " " + fmtRange(est.low, est.high);
    if (val) val.textContent = text;
    if (note) note.textContent = est.partial ? t().estPartial : t().estFinal;
    // Pulse the banner when the number changes (and it was already on screen) so
    // people SEE it move/tighten - the main reason they keep answering.
    if (wasVisible && text !== lastEstimateText) {
      estimateBarEl.classList.remove("faq-estimate--pulse");
      void estimateBarEl.offsetWidth; // restart the animation
      estimateBarEl.classList.add("faq-estimate--pulse");
      setTimeout(() => estimateBarEl && estimateBarEl.classList.remove("faq-estimate--pulse"), 650);
    }
    lastEstimateText = text;
  }

  // Update the progress bar from the backend's answered/total counts.
  function updateProgress(done, total) {
    if (!progressFillEl || !total) return;
    const pct = Math.max(0, Math.min(100, Math.round((done / total) * 100)));
    progressFillEl.style.width = pct + "%";
    if (progressLabelEl) progressLabelEl.textContent = pct + "%";
    if (progressBarEl) {
      progressBarEl.classList.add("visible");
      progressBarEl.classList.toggle("complete", done >= total);
    }
  }

  // text: message to send. hidden: don't show as a user bubble (the kickoff).
  async function sendMessage(presetText, hidden) {
    if (sending) return;
    const text = (presetText !== undefined ? presetText : (inputElement.value || "")).trim();
    if (!text) return;

    clearChips();
    if (!hidden) addMessage("user", text);
    if (presetText === undefined) inputElement.value = "";
    sending = true;

    conversationHistory.push({ role: "user", content: text });
    addThinking();

    try {
      const res = await fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: text, history: conversationHistory, state: convState, lang: LANG }),
      });

      removeThinking();

      if (!res.ok) {
        addMessage("bot", t().errGeneric);
        sending = false;
        return;
      }

      const data = await res.json();
      if (data.state && typeof data.state === "object") convState = data.state;
      if (typeof data.progress === "number" && typeof data.progressTotal === "number") {
        updateProgress(data.progress, data.progressTotal);
        // Tag every event from here on with the chosen project type, so the
        // whole dashboard can be sliced by flat / bath / kitchen / etc.
        if (convState && convState.projectType && window.posthog) {
          try { window.posthog.register({ project_type: convState.projectType }); } catch (e) {}
        }
        // One event per answered question -> "how many questions they answer",
        // and the last value reached drives the drop-off funnel. No PII: we send
        // counts and the field just answered, never the typed text.
        if (!hidden && data.progress > lastProgress) {
          track("question_answered", {
            answered: data.progress,
            total: data.progressTotal,
            project_type: convState && convState.projectType,
          });
        }
        lastProgress = data.progress;
        lastProgressTotal = data.progressTotal;
      }
      if ("estimate" in data) updateEstimate(data.estimate);

      // Completion: backend returns `lead` only when the quote is ready. Send
      // ONLY non-personal fields (project / size / tier / price range).
      if (data.lead && !quoteDone) {
        quoteDone = true;
        const s = data.lead.sel || {}, q = data.lead.quote || {};
        track("quote_completed", {
          project_type: s.projectType,
          size: s.size,
          tier: s.tier,
          quote_low: q.low,
          quote_high: q.high,
        });
      }
      const botResponse = data.answer || "Elnézést, nem találtam választ.";
      // A response may contain [[SPLIT]] markers → render as separate bubbles
      // for readability (e.g. the final quote: price / note / recap).
      const parts = botResponse.split("[[SPLIT]]").map(s => s.trim()).filter(Boolean);
      parts.forEach(p => addMessage("bot", p));
      conversationHistory.push({ role: "assistant", content: parts.join("\n\n") });

      if (data.emailOffer && data.lead) {
        lastLead = data.lead;
        renderEmailOffer();
      } else {
        renderChips(data.chips);
      }
    } catch (err) {
      console.error(err);
      removeThinking();
      addMessage("bot", t().errConnect);
    } finally {
      sending = false;
    }
  }

  // Animation for the live estimate banner (kept inline so it works on any host
  // page regardless of the external stylesheet).
  function injectEstimateStyles() {
    if (document.getElementById("faq-estimate-anim")) return;
    const s = document.createElement("style");
    s.id = "faq-estimate-anim";
    s.textContent =
      ".faq-estimate{transition:background-color .4s ease}" +
      ".faq-estimate .faq-estimate-val{display:inline-block;transition:transform .25s ease}" +
      ".faq-estimate--pulse{animation:faqEstFlash .65s ease}" +
      ".faq-estimate--pulse .faq-estimate-val{animation:faqEstPop .5s ease}" +
      "@keyframes faqEstFlash{0%,55%{background:#3d320c}100%{background:#1C1917}}" +
      "@keyframes faqEstPop{0%{transform:scale(1)}40%{transform:scale(1.13)}100%{transform:scale(1)}}";
    document.head.appendChild(s);
  }

  // Re-apply the static UI text after a live language switch. Already-rendered
  // chat bubbles stay as they were; every NEW question/answer arrives in the new
  // language because sendMessage() sends the current LANG to the backend.
  function applyLang() {
    const next = detectLang();
    if (next === LANG) return;
    LANG = next;
    const q = (sel) => document.querySelector(sel);
    const launcher = q(".faq-chat-launcher");
    if (launcher) launcher.setAttribute("aria-label", t().launcherAria);
    const tipText = q(".faq-chat-tooltip .faq-tooltip-text");
    if (tipText) tipText.textContent = curTeasers()[teaserIdx % curTeasers().length];
    const status = q(".faq-header-status");
    if (status) status.innerHTML = `<span class="faq-status-dot" aria-hidden="true"></span>${t().status}`;
    if (inputElement) { inputElement.placeholder = t().placeholder; inputElement.setAttribute("aria-label", t().inputAria); }
    if (chatWindow) chatWindow.setAttribute("aria-label", t().dialogAria);
    const estLbl = estimateBarEl && estimateBarEl.querySelector("span");
    if (estLbl) estLbl.textContent = t().estLabel;
  }

  // Watch the host site's language signal: <html lang> (set by assets/i18n.js on
  // every HU/EN/DE click) and the localStorage write (covers other tabs).
  function watchSiteLang() {
    try {
      const obs = new MutationObserver(applyLang);
      obs.observe(document.documentElement, { attributes: true, attributeFilter: ["lang"] });
    } catch (e) {}
    window.addEventListener("storage", (e) => { if (!e || e.key === "nmlang") applyLang(); });
  }

  function init() {
    initAnalytics();
    injectStyles();
    injectEstimateStyles();
    createLauncher();
    watchSiteLang();
    // Fires once per page where the widget loads -> "how many people see it".
    track("widget_loaded");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
