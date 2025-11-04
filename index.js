// ============================
// index.js (Updated Version)
// ============================

import { getUserFromToken, getAuthHeader } from "./authHelper.js";
import { checkAuth, logout } from "./authGuard.js";

const API_BASE_URL = "https://mock-chat-backend.vercel.app/api";

// === DOM Elements ===
const leftPane = document.getElementById("left-pane");
const rightPane = document.getElementById("right-pane");
const chatContent = document.getElementById("chatContent");
const newChatBtn = document.getElementById("newChatBtn");

// === Auth & Session ===
const session = checkAuth(["admin", "trainer", "agent"]);
if (!session) {
  window.location.href = "login.html";
  throw new Error("Unauthorized — redirecting...");
}

const { user, token, role } = session;
const authHeader = getAuthHeader();

// === Role-based layout ===
if (role === "agent") {
  rightPane.style.display = "none";
} else {
  newChatBtn.addEventListener("click", () => {
    const associate = prompt("Enter associate name:");
    if (associate) createConversation(user.name, associate);
  });
}

// === Logout Button ===
const logoutBtn = document.createElement("button");
logoutBtn.textContent = "Logout";
logoutBtn.style.cssText = `
  position:fixed;top:10px;right:10px;
  padding:0.4rem 0.8rem;background:#dc2626;
  color:white;border:none;border-radius:0.5rem;
  cursor:pointer;z-index:1000;
`;
logoutBtn.onclick = logout;
document.body.appendChild(logoutBtn);

// Load conversation lists
loadConversations();

// ========================================================
// === FUNCTIONS ==========================================
// ========================================================

// Load all conversations
async function loadConversations() {
  try {
    const res = await fetch(`${API_BASE_URL}/conversations?all=true`, {
      headers: { ...authHeader },
    });

    const conversations = await res.json();
    if (!res.ok) throw new Error(conversations.error || "Failed to load");

    const myConversations =
      role === "agent"
        ? conversations.filter((c) => c.associate_name === user.name)
        : conversations.filter((c) => c.trainer_name === user.name);

    const activeConversations = conversations.filter((c) => !c.ended);

    renderList("myConversations", myConversations, "No conversations yet");
    renderList("activeConversations", activeConversations, "No active chats");
  } catch (err) {
    console.error("Error loading conversations:", err);
  }
}

function renderList(id, items, emptyText) {
  const list = document.getElementById(id);
  list.innerHTML = "";

  if (!items.length) {
    list.innerHTML = `<li>${emptyText}</li>`;
    return;
  }

  items.forEach((conv) => {
    const li = document.createElement("li");
    li.textContent = `${conv.trainer_name} ↔ ${conv.associate_name} (${conv.conv_key})`;
    li.onclick = () => openConversation(conv);
    list.appendChild(li);
  });
}

// Create conversation
async function createConversation(trainerName, associateName) {
  try {
    const res = await fetch(`${API_BASE_URL}/conversations`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeader },
      body: JSON.stringify({ trainerName, associateName }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to create conversation");

    alert(`✅ Conversation created: ${data.convKey}`);
    loadConversations();
  } catch (err) {
    alert("Error creating conversation: " + err.message);
  }
}

// ========================
// ✅ GLOBAL SEEN MESSAGES STORE
// ========================
let seenMessages = new Set();
let activeStream = null;

// Open a conversation
async function openConversation(conv) {
  if (activeStream) {
    activeStream.close();
    activeStream = null;
  }

  seenMessages.clear();

  chatContent.innerHTML = `
    <div id="chatContainer" style="display:flex;flex-direction:column;height:80vh;width:100%;background:#f9fafb;border-radius:10px;border:1px solid #e2e8f0;box-shadow:0 1px 3px rgba(0,0,0,0.05);overflow:hidden;">
      <div id="chatHeader" style="flex-shrink:0;background:#2563eb;color:white;padding:0.75rem 1rem;font-weight:600;text-align:center;">
        ${conv.trainer_name} ↔ ${conv.associate_name}
        <div style="font-size:0.8rem;opacity:0.9;">Conversation Key: ${conv.conv_key}</div>
      </div>

      <div id="messages" data-conv-key="${conv.conv_key}" style="flex:1;overflow-y:auto;padding:1rem;display:flex;flex-direction:column;gap:0.4rem;background:white;scroll-behavior:smooth;"></div>

      <div id="chatInputArea" style="flex-shrink:0;display:flex;align-items:flex-end;padding:0.5rem;border-top:1px solid #e5e7eb;background:#f8fafc;gap:0.5rem;">
        <textarea id="chatInput" placeholder="Type a message..." style="flex:1;border:1px solid #cbd5e1;border-radius:0.5rem;padding:0.6rem 0.75rem;font-size:0.95rem;outline:none;resize:none;height:44px;max-height:120px;"></textarea>
        <button id="sendBtn" style="background:#2563eb;color:white;border:none;border-radius:0.5rem;padding:0.6rem 1.2rem;font-size:0.95rem;cursor:pointer;height:44px;">Send</button>
      </div>
    </div>
  `;

  const container = document.getElementById("messages");
  const input = document.getElementById("chatInput");
  const sendBtn = document.getElementById("sendBtn");

  await loadMessages(conv.conv_key);
  container.scrollTop = container.scrollHeight;

  subscribeToMessages(conv.conv_key);

  async function handleSend() {
    const text = input.value.trim();
    if (!text) return;

    try {
      const newMsg = await sendMessage(conv.conv_key, user.name, role, text);

      // ✅ Render locally
      renderMessage(container, newMsg);

      // ✅ Mark as seen so SSE does NOT re-render it
      seenMessages.add(newMsg.id);

      container.scrollTop = container.scrollHeight;
      input.value = "";
      input.style.height = "44px";
    } catch (err) {
      console.error("Send failed:", err);
    }
  }

  sendBtn.addEventListener("click", handleSend);
  input.addEventListener("keydown", async (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      await handleSend();
    } else {
      input.style.height = "auto";
      input.style.height = Math.min(input.scrollHeight, 120) + "px";
    }
  });
}

// Load messages
async function loadMessages(convKey) {
  const res = await fetch(`${API_BASE_URL}/messages?convKey=${convKey}`, {
    headers: { ...authHeader },
  });

  const messages = await res.json();
  const container = document.getElementById("messages");
  container.innerHTML = "";

  messages.forEach((msg) => {
    seenMessages.add(msg.id);
    renderMessage(container, msg);
  });

  container.scrollTop = container.scrollHeight;
}
// sound notification (small beep)
const notifAudio = (() => {
  const a = new Audio();
  // tiny base64 click sound (replace with hosted asset if you want)
  a.src = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQgAAAAA"; 
  return a;
})();

function playNotification() {
  try { notifAudio.play().catch(() => {}); } catch(e){/*ignore*/ }
}

function isNearBottom(el, threshold = 120) {
  return el.scrollHeight - (el.scrollTop + el.clientHeight) < threshold;
}

// Send message
async function sendMessage(convKey, senderName, senderRole, text) {
  const response = await fetch(`${API_BASE_URL}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeader },
    body: JSON.stringify({ convKey, senderName, senderRole, text }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Failed to send message");
  return data; // inserted message {id, conv_key, sender_name, role, text, timestamp}
}


// Render single message
function renderMessage(container, msg, opts = { scroll: true }) {
  const currentUser = JSON.parse(localStorage.getItem("user"));
  const currentRole = localStorage.getItem("role");
  const sender = msg.sender_name || msg.senderName || msg.sender || "Unknown";
  const senderRole = msg.role || msg.senderRole || "unknown";
  const text = msg.text || "";
  const isSelf = sender === currentUser?.name && senderRole === currentRole;

  const wrapper = document.createElement("div");
  wrapper.className = `message ${isSelf ? "self" : "other"}`;
  wrapper.style.display = "flex";
  wrapper.style.justifyContent = isSelf ? "flex-end" : "flex-start";
  wrapper.dataset.id = msg.id;

  const bubble = document.createElement("div");
  bubble.style.background = isSelf ? "#2563eb" : "#e2e8f0";
  bubble.style.color = isSelf ? "#fff" : "#111827";
  bubble.style.padding = "0.6rem 0.9rem";
  bubble.style.borderRadius = "12px";
  bubble.style.maxWidth = "72%";
  bubble.style.boxShadow = "0 1px 2px rgba(0,0,0,0.06)";
  bubble.innerHTML = `<strong style="font-size:0.85rem;opacity:0.85">${sender}</strong><div style="margin-top:0.25rem;white-space:pre-wrap;">${escapeHtml(text)}</div>
    <div style="font-size:0.7rem;opacity:0.65;margin-top:0.35rem;text-align:${isSelf ? "right" : "left"}">
      ${new Date(msg.timestamp || Date.now()).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}
    </div>`;

  wrapper.appendChild(bubble);
  container.appendChild(wrapper);
  if (opts.scroll) container.scrollTop = container.scrollHeight;
}
/* ---------- simple escape helper ---------- */
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (m) => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[m]));
}
let typingTimer = null;
function initTypingHandler(convKey) {
  const input = document.getElementById("chatInput");
  let isTyping = false;

  input.addEventListener("input", () => {
    if (!convKey) return;
    // send typing = true (debounced)
    if (!isTyping) {
      isTyping = true;
      fetch(`${API_BASE_URL}/typing`, {
        method: "POST",
        headers: {"Content-Type":"application/json", ...authHeader},
        body: JSON.stringify({ convKey, userName: user.name, role })
      }).catch(()=>{});
    }
    clearTimeout(typingTimer);
    typingTimer = setTimeout(() => {
      isTyping = false;
      fetch(`${API_BASE_URL}/typing`, {
        method: "POST",
        headers: {"Content-Type":"application/json", ...authHeader},
        body: JSON.stringify({ convKey, userName: user.name, role, typing: false })
      }).catch(()=>{});
    }, 800); // stop typing after 800ms of inactivity
  });
}

function showTypingIndicator(typingRows) {
  // typingRows: [{user_name, role, updated_at}, ...]
  const indicator = document.getElementById("typingIndicator");
  if (!indicator) return;
  const names = typingRows.map(r => r.user_name).filter(n => n !== user.name);
  indicator.textContent = names.length ? `${names.join(", ")} is typing…` : "";
}
// Subscribe to SSE
function subscribeToMessages(convKey) {
  // close previous if any
  if (window.currentEventSource) {
    try { window.currentEventSource.close(); } catch(e) {}
    window.currentEventSource = null;
  }

  const container = document.getElementById("messages");
  const seen = new Set(); // keep per-connection seen ids

  // If there are existing message divs with data-id, populate seen
  document.querySelectorAll("#messages .message[data-id]").forEach(n => {
    const id = n.dataset.id;
    if (id) seen.add(id);
  });

  const evt = new EventSource(`${API_BASE_URL}/messages?convKey=${convKey}`);
  window.currentEventSource = evt;

  evt.onmessage = (ev) => {
    try {
      const payload = JSON.parse(ev.data);

      if (payload.type === "init" && Array.isArray(payload.messages)) {
        container.innerHTML = "";
        seen.clear();
        payload.messages.forEach(m => {
          seen.add(String(m.id));
          renderMessage(container, m, { scroll: false });
        });
        container.scrollTop = container.scrollHeight;
        return;
      }

      if (payload.type === "new" && Array.isArray(payload.messages)) {
        const shouldScroll = isNearBottom(container, 200);
        for (const m of payload.messages) {
          if (!seen.has(String(m.id))) {
            seen.add(String(m.id));
            renderMessage(container, m, { scroll: false });
            // notification only for messages not by me
            const currentUser = JSON.parse(localStorage.getItem("user"));
            if (m.sender_name !== currentUser?.name) {
              playNotification();
              // desktop notification
              if ("Notification" in window && Notification.permission === "granted" && document.hidden) {
                new Notification(m.sender_name, { body: m.text.length > 100 ? m.text.slice(0,97)+"..." : m.text });
              }
            }
          }
        }
        if (shouldScroll) container.scrollTop = container.scrollHeight;
        return;
      }

      if (payload.type === "typing" && Array.isArray(payload.typing)) {
        // show typing hint (frontend should implement showTyping)
        showTypingIndicator(payload.typing);
        return;
      }
    } catch (err) {
      console.error("SSE parse error:", err, ev.data);
    }
  };

  evt.onerror = (err) => {
    console.warn("SSE disconnected. reconnecting in 3s...", err);
    try { evt.close(); } catch(e) {}
    setTimeout(() => subscribeToMessages(convKey), 3000);
  };
}
