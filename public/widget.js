(function () {
  // Configuration with defaults for local development
  const config = window.KAZAN_CONFIG || {};
  const apiUrl = config.apiUrl || "/api/faq-agent";
  const assetsUrl = config.assetsUrl || ""; // e.g. "https://your-app.vercel.app"
  const PHONE = "+36 30 260 57 56";
  const BRAND = "Kazán Kecskemét";

  let chatOpen = false;
  let chatWindow = null;
  let messagesContainer = null;
  let inputElement = null;
  let sending = false;
  let conversationHistory = []; // [{ role: "user"|"assistant", content: "..." }]
  let started = false;

  let container = null;

  function logoSrc() {
    return assetsUrl ? `${assetsUrl}/logo.svg` : "logo.svg";
  }

  function createContainer() {
    container = document.createElement("div");
    container.id = "faq-agent-container";
    document.body.appendChild(container);
  }

  function createLauncher() {
    if (!container) createContainer();

    const btn = document.createElement("div");
    btn.className = "faq-chat-launcher";

    const img = document.createElement("img");
    img.src = logoSrc();
    img.alt = `Csevegés — ${BRAND}`;
    img.className = "faq-chat-launcher-icon";

    btn.appendChild(img);
    btn.onclick = toggleChat;
    container.appendChild(btn);

    const tooltip = document.createElement("div");
    tooltip.className = "faq-chat-tooltip";
    tooltip.innerHTML = "Üdv! 👋<br>Kérjen pár kattintással árajánlatot kazánra.";

    const closeBtn = document.createElement("span");
    closeBtn.className = "faq-tooltip-close";
    closeBtn.innerHTML = "×";
    closeBtn.onclick = (e) => {
      e.stopPropagation();
      tooltip.classList.add("hidden");
    };

    tooltip.appendChild(closeBtn);
    tooltip.onclick = () => {
      tooltip.classList.add("hidden");
      toggleChat();
    };

    container.appendChild(tooltip);

    setTimeout(() => tooltip.classList.add("show"), 1500);
  }

  function toggleChat() {
    const tooltip = document.querySelector(".faq-chat-tooltip");

    if (chatOpen) {
      chatWindow.remove();
      chatOpen = false;
    } else {
      if (tooltip) {
        tooltip.classList.remove("show");
        setTimeout(() => tooltip.classList.add("hidden"), 300);
      }
      openChat();
      chatOpen = true;
    }
  }

  function openChat() {
    chatWindow = document.createElement("div");
    chatWindow.className = "faq-chat-window";

    const header = document.createElement("div");
    header.className = "faq-chat-header";

    const logo = document.createElement("img");
    logo.src = logoSrc();
    logo.alt = BRAND;
    header.appendChild(logo);

    const headerText = document.createElement("div");
    headerText.className = "faq-header-text";
    headerText.innerHTML = `<span class="faq-header-title">${BRAND}</span><a class="faq-header-phone" href="tel:${PHONE.replace(/\s/g, "")}">📞 ${PHONE}</a>`;
    header.appendChild(headerText);

    messagesContainer = document.createElement("div");
    messagesContainer.className = "faq-chat-messages";

    const inputBar = document.createElement("div");
    inputBar.className = "faq-chat-input";

    inputElement = document.createElement("input");
    inputElement.type = "text";
    inputElement.placeholder = "Írja be a válaszát…";

    const sendBtn = document.createElement("button");
    sendBtn.textContent = "Küldés";

    sendBtn.onclick = () => sendMessage();
    inputElement.addEventListener("keydown", (e) => {
      if (e.key === "Enter") sendMessage();
    });

    inputBar.appendChild(inputElement);
    inputBar.appendChild(sendBtn);

    chatWindow.appendChild(header);
    chatWindow.appendChild(messagesContainer);
    chatWindow.appendChild(inputBar);

    container.appendChild(chatWindow);

    // Kick off the conversation through the API so the AI controls the script.
    if (!started) {
      started = true;
      addMessage("bot", `Üdvözlöm a ${BRAND} árajánló asszisztensénél! Pár kérdés alapján elkészítem az előzetes árajánlatát.`);
      sendMessage("Szeretnék árajánlatot kazán beépítésére / cseréjére.", true);
    }
  }

  function renderMarkdown(text) {
    let html = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
    html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    html = html.replace(/\n/g, "<br>");
    return html;
  }

  function clearChips() {
    const old = messagesContainer.querySelector(".faq-chips");
    if (old) old.remove();
  }

  function renderChips(chips) {
    clearChips();
    if (!chips || !chips.length) return;
    const wrap = document.createElement("div");
    wrap.className = "faq-chips";
    chips.forEach((label) => {
      const chip = document.createElement("button");
      chip.className = "faq-chip";
      chip.textContent = label;
      chip.onclick = () => {
        clearChips();
        sendMessage(label);
      };
      wrap.appendChild(chip);
    });
    messagesContainer.appendChild(wrap);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }

  function addMessage(sender, text) {
    const msg = document.createElement("div");
    msg.className = "faq-chat-message " + sender;

    const label = document.createElement("div");
    label.className = "message-label";
    label.textContent = sender === "bot" ? BRAND : "Ön";

    const bubble = document.createElement("div");
    bubble.className = "message-bubble";
    if (text === "…") {
      bubble.className += " thinking";
      bubble.textContent = text;
    } else if (sender === "bot") {
      bubble.innerHTML = renderMarkdown(text);
    } else {
      bubble.textContent = text;
    }

    msg.appendChild(label);
    msg.appendChild(bubble);
    messagesContainer.appendChild(msg);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }

  // text: message to send. hidden: don't show as a user bubble (used for the kickoff).
  async function sendMessage(presetText, hidden) {
    if (sending) return;
    const text = (presetText !== undefined ? presetText : (inputElement.value || "")).trim();
    if (!text) return;

    clearChips();
    if (!hidden) addMessage("user", text);
    if (presetText === undefined) inputElement.value = "";
    sending = true;

    conversationHistory.push({ role: "user", content: text });

    addMessage("bot", "…");

    try {
      const res = await fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: text, history: conversationHistory }),
      });

      const botMessages = messagesContainer.querySelectorAll(".faq-chat-message.bot");
      const lastBot = botMessages[botMessages.length - 1];
      if (lastBot && lastBot.textContent.endsWith("…")) lastBot.remove();

      if (!res.ok) {
        addMessage("bot", "Elnézést, hiba történt. Kérjük, próbálja újra később.");
        sending = false;
        return;
      }

      const data = await res.json();
      const botResponse = data.answer || "Elnézést, nem találtam választ.";
      addMessage("bot", botResponse);
      conversationHistory.push({ role: "assistant", content: botResponse });

      renderChips(data.chips);
    } catch (err) {
      console.error(err);
      const botMessages = messagesContainer.querySelectorAll(".faq-chat-message.bot");
      const lastBot = botMessages[botMessages.length - 1];
      if (lastBot && lastBot.textContent.endsWith("…")) lastBot.remove();
      addMessage("bot", "Elnézést, nem sikerült kapcsolódni a szerverhez.");
    } finally {
      sending = false;
    }
  }

  function init() {
    createLauncher();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
