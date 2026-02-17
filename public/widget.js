(function () {
  const FUNCTION_URL = "/api/faq-agent";

  let chatOpen = false;
  let chatWindow = null;
  let messagesContainer = null;
  let inputElement = null;
  let sending = false;
  let conversationHistory = []; // Track conversation history

  let container = null;

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
    img.src = "logo.png"; // Updated to user's new logo
    img.alt = "Chat with Landscale";
    img.className = "faq-chat-launcher-icon";

    btn.appendChild(img);
    btn.onclick = toggleChat;
    container.appendChild(btn);

    // Create floating tooltip
    console.log("Creating tooltip...");
    const tooltip = document.createElement("div");
    tooltip.className = "faq-chat-tooltip";
    // Compelling engagement question
    tooltip.innerHTML = "Hi there! 👋<br>Planning a garden project?";

    // Close button for tooltip
    const closeBtn = document.createElement("span");
    closeBtn.className = "faq-tooltip-close";
    closeBtn.innerHTML = "×";
    closeBtn.onclick = (e) => {
      e.stopPropagation();
      tooltip.classList.add("hidden");
      window.parent.postMessage('hideTooltip', '*');
    };

    tooltip.appendChild(closeBtn);
    tooltip.onclick = () => {
      tooltip.classList.add("hidden");
      window.parent.postMessage('hideTooltip', '*');
      toggleChat();
    };

    container.appendChild(tooltip);

    // Show tooltip after 1.5 seconds for quick engagement
    setTimeout(() => {
      tooltip.classList.add("show");
      window.parent.postMessage('showTooltip', '*');
    }, 1500);
  }

  function toggleChat() {
    const tooltip = document.querySelector(".faq-chat-tooltip");

    if (chatOpen) {
      chatWindow.remove();
      chatOpen = false;
      // Notify parent to close
      window.parent.postMessage('closeChat', '*');
    } else {
      if (tooltip) {
        // Just hide it, don't remove so we can show it again next session if needed
        tooltip.classList.remove("show");
        window.parent.postMessage('hideTooltip', '*');
        setTimeout(() => tooltip.classList.add("hidden"), 300);
      }
      openChat();
      chatOpen = true;
      // Notify parent to open
      window.parent.postMessage('openChat', '*');
    }
  }

  function openChat() {
    chatWindow = document.createElement("div");
    chatWindow.className = "faq-chat-window";

    const header = document.createElement("div");
    header.className = "faq-chat-header";

    const logo = document.createElement("img");
    logo.src = "logo.png"; // Updated logo
    logo.alt = "Landscale";
    header.appendChild(logo);

    const headerText = document.createElement("span");
    headerText.textContent = "Landscale AI"; // Updated Name
    header.appendChild(headerText);

    messagesContainer = document.createElement("div");
    messagesContainer.className = "faq-chat-messages";

    const inputBar = document.createElement("div");
    inputBar.className = "faq-chat-input";

    inputElement = document.createElement("input");
    inputElement.type = "text";
    inputElement.placeholder = "Ask about landscaping, patios, or design..."; // More specific placeholder

    const sendBtn = document.createElement("button");
    sendBtn.textContent = "Send";

    sendBtn.onclick = sendMessage;
    inputElement.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        sendMessage();
      }
    });

    inputBar.appendChild(inputElement);
    inputBar.appendChild(sendBtn);

    chatWindow.appendChild(header);
    chatWindow.appendChild(messagesContainer);
    chatWindow.appendChild(inputBar);

    container.appendChild(chatWindow);

    addMessage(
      "bot",
      "Hello! I'm Milán's digital assistant. How can I help you regarding your garden project today?"
    );
  }

  function addMessage(sender, text) {
    const msg = document.createElement("div");
    msg.className = "faq-chat-message " + sender;

    const label = document.createElement("div");
    label.className = "message-label";
    label.textContent = sender === "bot" ? "Gardening Agent" : "You";

    const bubble = document.createElement("div");
    bubble.className = "message-bubble";
    if (text === "Thinking...") {
      bubble.className += " thinking";
    }
    bubble.textContent = text;

    msg.appendChild(label);
    msg.appendChild(bubble);
    messagesContainer.appendChild(msg);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }

  async function sendMessage() {
    if (sending) return;
    const text = (inputElement.value || "").trim();
    if (!text) return;

    addMessage("user", text);
    inputElement.value = "";
    sending = true;

    // Add user message to conversation history
    conversationHistory.push({
      role: "user",
      parts: [{ text: text }]
    });

    addMessage("bot", "Thinking...");

    try {
      const res = await fetch(FUNCTION_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: text,
          history: conversationHistory // Send conversation history
        }),
      });

      const botMessages = messagesContainer.querySelectorAll(".faq-chat-message.bot");
      const lastBot = botMessages[botMessages.length - 1];
      if (lastBot && lastBot.textContent.endsWith("Thinking...")) {
        lastBot.remove();
      }

      if (!res.ok) {
        addMessage("bot", "Sorry, something went wrong. Please try again later.");
        sending = false;
        return;
      }

      const data = await res.json();
      const botResponse = data.answer || "Sorry, I could not find an answer.";
      addMessage("bot", botResponse);

      // Add bot response to conversation history
      conversationHistory.push({
        role: "model",
        parts: [{ text: botResponse }]
      });
    } catch (err) {
      console.error(err);
      addMessage("bot", "Sorry, there was a problem connecting to the server.");
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
