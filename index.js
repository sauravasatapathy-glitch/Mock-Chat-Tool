// index.js (Lavender UI – fixed order + auth-safe + theme consistent)
import { createIcons, icons } from "https://unpkg.com/lucide@latest/dist/esm/lucide.js";
import { getUserFromToken, getAuthHeader } from "./authHelper.js";
import { checkAuth, logout } from "./authGuard.js";

const API_BASE_URL = "https://mock-chat-backend.vercel.app/api";

// ===== DOM Elements =====
const leftPane = document.getElementById("left-pane");
const rightPane = document.getElementById("right-pane");
const chatContent = document.getElementById("chatContent");
const newChatBtn = document.getElementById("newChatBtn");
const navRail = document.getElementById("nav-rail");

window.lucide = { createIcons, icons };
createIcons({ icons });

// ===== AUTH =====
const session = checkAuth(["admin", "trainer", "agent"]);
if (!session) {
  window.location.href = "login.html";
  throw new Error("Unauthorized");
}

const { user, token, role } = session;
const authHeader = getAuthHeader();

// ✅ Ensure token exists before continuing
if (!authHeader.Authorization) {
  console.warn("No auth token found. Redirecting...");
  logout();
}

// ====== Global State ======
let currentEventSource = null;
let currentConvKey = null;
let seenIds = new Set();

// ===== Notifications =====
if ("Notification" in window && Notification.permission === "default") {
  Notification.requestPermission().catch(() => {});
}
const notifAudio = (() => {
  const a = new Audio();
  a.src = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQgAAAAA";
  return a;
})();
function playNotification() {
  try { notifAudio.play().catch(() => {}); } catch (e) {}
}

// ===== Core Functions =====
async function loadConversations() {
  try {
    if (role === "admin" || role === "trainer") {
      let url = role === "admin"
        ? `${API_BASE_URL}/conversations?all=true`
        : `${API_BASE_URL}/conversations?trainer=${encodeURIComponent(user.name)}`;

      const res = await fetch(url, { headers: { ...authHeader } });
      const data = await res.json();

      if (res.status === 401) {
        alert("Session expired. Please log in again.");
        logout();
        return;
      }

      if (!res.ok) throw new Error(data.error || "Failed to load conversations");

      const activeConvs = (data || []).filter(c => !c.ended);
      renderList("activeConversations", activeConvs);
      return;
    }

    await loadAgentConversation();
  } catch (err) {
    console.error("Error loading conversations:", err);
  }
}

async function updateHomeBadge() {
  try {
    const badge = document.getElementById("badge-home");
    if (!badge) return;
    const res = await fetch(`${API_BASE_URL}/conversations?all=true`, {
      headers: { ...authHeader },
    });
    if (res.status === 401) {
      logout();
      return;
    }
    const rows = await res.json();
    const totalUnread = (rows || []).reduce((sum, c) => sum + (c.unread_count || 0), 0);
    badge.textContent = totalUnread > 99 ? "99+" : String(totalUnread);
    badge.hidden = totalUnread <= 0;
  } catch {
    const badge = document.getElementById("badge-home");
    if (badge) badge.hidden = true;
  }
}

function renderList(id, items) {
  const ul = document.getElementById(id);
  if (!ul) return;
  ul.innerHTML = "";
  if (!items || items.length === 0) {
    ul.innerHTML = `<li style="opacity:.7;padding:.6rem;">No conversations</li>`;
    return;
  }
  items.forEach(c => {
    const li = document.createElement("li");
    li.textContent = `${c.trainer_name} ↔ ${c.associate_name} (${c.conv_key})`;
    li.style.padding = ".6rem";
    li.style.cursor = "pointer";
    li.onclick = () => openConversation(c);
    ul.appendChild(li);
  });
}

// ====== Side Pane ======
async function renderSidePane(tab) {
  if (!leftPane) return;
  const headerHTML = (title) => `<h3 class="app-header">${title}</h3>`;

  if (tab === "home") {
    leftPane.innerHTML = `${headerHTML("Active Conversations")}<ul id="activeConversations"></ul>`;
    await loadConversations();
  } else if (tab === "archive") {
    leftPane.innerHTML = `${headerHTML("Archive")}<ul id="archiveList"><li style="opacity:.7;padding:.6rem;">Loading…</li></ul>`;
  } else if (tab === "create") {
    leftPane.innerHTML = `
      ${headerHTML("Create Conversation")}
      <div style="padding:0.75rem;display:flex;flex-direction:column;gap:8px;">
        <label>Trainer</label>
        <input id="createTrainer" placeholder="Trainer name"/>
        <label>Associate</label>
        <input id="createAssociate" placeholder="Associate name"/>
        <button id="createBtn" style="margin-top:8px;background:#B371C7;color:white;border:none;border-radius:8px;padding:8px 10px;cursor:pointer;">Create</button>
        <div id="createNote" style="font-size:12px;opacity:.8;margin-top:6px;"></div>
      </div>`;
  }
  requestAnimationFrame(() => {
    if (window.lucide) window.lucide.createIcons({ icons: window.lucide.icons });
  });
}

// ====== Nav Wiring ======
function setActiveTab(tab) {
  document.querySelectorAll("#nav-rail .nav-item").forEach((btn) =>
    btn.classList.toggle("active", btn.dataset.tab === tab)
  );
  renderSidePane(tab);
}
if (navRail && role !== "agent") {
  navRail.addEventListener("click", (e) => {
    const btn = e.target.closest(".nav-item");
    if (!btn) return;
    setActiveTab(btn.dataset.tab);
  });
}

// ====== Initial Setup ======
if (role !== "agent") {
  setActiveTab("home");
  updateHomeBadge();
} else {
  loadConversations();
}

// ===== Logout Button =====
const logoutBtn = document.getElementById("logoutBtn");
if (logoutBtn) logoutBtn.addEventListener("click", logout);

// ===== Utility =====
function escapeHtml(s) {
  return String(s || "").replace(/[&<>"']/g, (m) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[m]));
}
// =======================
// 🟣 Conversation Handling
// =======================

async function openConversation(conv) {
  // close previous SSE connection if any
  if (currentEventSource) {
    try { currentEventSource.close(); } catch (e) {}
    currentEventSource = null;
  }

  currentConvKey = conv.conv_key;
  seenIds = new Set();

  chatContent.innerHTML = `
    <div id="chatContainer" style="display:flex;flex-direction:column;height:80vh;width:100%;background:linear-gradient(180deg, #F3E8FF, #FFFFFF);border-radius:10px;border:1px solid #e2e8f0;overflow:hidden;">
      <div id="chatHeader" style="background:#B371C7;color:white;padding:0.75rem;text-align:center;font-weight:600;">
        ${escapeHtml(conv.trainer_name)} ↔ ${escapeHtml(conv.associate_name)} | Key: ${escapeHtml(conv.conv_key)}
      </div>
      <div id="messages" data-conv-key="${conv.conv_key}" style="flex:1;overflow-y:auto;padding:1rem;display:flex;flex-direction:column;gap:0.4rem;background:white;"></div>
      <div id="chatInputArea" style="padding:0.5rem;display:flex;gap:0.5rem;border-top:1px solid #e5e7eb;background:#f8fafc;">
        <textarea id="chatInput" placeholder="Type a message..." style="flex:1;height:44px;border:1px solid #cbd5e1;border-radius:0.5rem;padding:0.6rem;font-family:inherit;"></textarea>
        <button id="sendBtn" style="background:#B371C7;color:white;border:none;border-radius:0.5rem;padding:0.6rem 1.2rem;cursor:pointer;transition:all .2s ease;">Send</button>
      </div>
    </div>
  `;

  const container = document.getElementById("messages");
  const input = document.getElementById("chatInput");
  const sendBtn = document.getElementById("sendBtn");

  await loadMessages(conv.conv_key);
  await markConversationRead(conv.conv_key);
  subscribeToMessages(conv.conv_key);

  // Send handler
  async function handleSend() {
    const text = input.value.trim();
    if (!text) return;
    try {
      const newMsg = await sendMessage(conv.conv_key, user.name, role, text);
      renderMessage(container, newMsg || {
        sender_name: user.name,
        role,
        text,
        timestamp: new Date().toISOString()
      }, { scroll: true });
      input.value = "";
      input.style.height = "44px";
      await markConversationRead(conv.conv_key);
    } catch (err) {
      console.error("Send failed:", err);
      alert("Failed to send message: " + (err.message || err));
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

// ============ Message Handling ============

async function loadMessages(convKey) {
  try {
    const res = await fetch(`${API_BASE_URL}/messages?convKey=${encodeURIComponent(convKey)}`, {
      headers: { ...authHeader },
    });
    const rows = await res.json();
    if (!res.ok) throw new Error(rows.error || "Failed to load messages");

    const container = document.getElementById("messages");
    container.innerHTML = "";
    rows.forEach(r => renderMessage(container, r, { scroll: false }));
    container.scrollTop = container.scrollHeight;
  } catch (err) {
    console.error("Error loading messages:", err);
  }
}

async function sendMessage(convKey, senderName, senderRole, text) {
  const res = await fetch(`${API_BASE_URL}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeader },
    body: JSON.stringify({ convKey, senderName, senderRole, text }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to send message");
  return data;
}

function renderMessage(container, msg, opts = { scroll: true }) {
  const sender = msg.sender_name || msg.sender || "Unknown";
  const senderRole = msg.role || "unknown";
  const isSelf = (sender === user.name) && (senderRole === role);
  const wrapper = document.createElement("div");
  wrapper.className = `message ${isSelf ? "self" : "other"}`;

  const bubble = document.createElement("div");
  bubble.className = "bubble";
  bubble.style.background = isSelf ? "#B371C7" : "#E6D2F0";
  bubble.style.color = isSelf ? "#fff" : "#1e293b";

  const timeStr = new Date(msg.timestamp || Date.now())
    .toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  bubble.innerHTML = `
    ${!isSelf ? `<span class="sender" style="font-size:0.8rem;opacity:0.8;">${escapeHtml(sender)}</span>` : ""}
    <div class="msg-text" style="font-size:0.95rem;">${escapeHtml(msg.text || "")}</div>
    <span class="timestamp" style="font-size:0.75rem;opacity:0.6;">${timeStr}</span>
  `;

  wrapper.appendChild(bubble);
  container.appendChild(wrapper);

  if (opts.scroll) container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
}

async function markConversationRead(convKey) {
  try {
    const res = await fetch(`${API_BASE_URL}/messageRead`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeader },
      body: JSON.stringify({ convKey, userName: user.name }),
    });
    if (res.ok && role !== "agent") await loadConversations();
  } catch (err) {
    console.error("markConversationRead error:", err);
  }
}

function subscribeToMessages(convKey) {
  if (currentEventSource) {
    try { currentEventSource.close(); } catch (e) {}
    currentEventSource = null;
  }

  const container = document.getElementById("messages");
  if (!container) return;

  const es = new EventSource(`${API_BASE_URL}/messages?convKey=${encodeURIComponent(convKey)}`);
  currentEventSource = es;

  es.onmessage = (ev) => {
    try {
      const payload = JSON.parse(ev.data);
      if (payload.type === "new" && Array.isArray(payload.messages)) {
        payload.messages.forEach(m => renderMessage(container, m, { scroll: true }));
        if (role !== "agent") loadConversations().catch(() => {});
      }
    } catch (err) {
      console.error("SSE parse error:", err, ev.data);
    }
  };

  es.onerror = (err) => {
    console.warn("SSE disconnected, retrying in 3s", err);
    try { es.close(); } catch (e) {}
    setTimeout(() => subscribeToMessages(convKey), 3000);
  };
}
