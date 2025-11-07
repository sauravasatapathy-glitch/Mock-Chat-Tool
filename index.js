// index.js (Lavender UI - original logic, modernized visuals only)
import { createIcons, icons } from "https://unpkg.com/lucide@latest/dist/esm/lucide.js";
import { getUserFromToken, getAuthHeader } from "./authHelper.js";
import { checkAuth, logout } from "./authGuard.js";

const API_BASE_URL = "https://mock-chat-backend.vercel.app/api";

// DOM
const leftPane = document.getElementById("left-pane");
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

// ===== Role-based layout =====
if (role === "agent") {
  if (leftPane) leftPane.style.display = "none";
  if (newChatBtn) newChatBtn.style.display = "none";
} else {
  if (newChatBtn) {
    newChatBtn.addEventListener("click", () => {
      const associate = prompt("Enter associate name:");
      if (associate) createConversation(user.name, associate);
    });
  }
}

// ===== Logout =====
document.getElementById("logoutBtn")?.addEventListener("click", () => {
  ["convKey", "trainerName", "role", "user"].forEach((k) => localStorage.removeItem(k));
  logout();
});

// ===== Nav Rail =====
function setActiveTab(tab) {
  document.querySelectorAll("#nav-rail .nav-item").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tab === tab);
  });
  renderSidePane(tab);
}

if (navRail && role !== "agent") {
  navRail.addEventListener("click", (e) => {
    const btn = e.target.closest(".nav-item");
    if (!btn) return;
    setActiveTab(btn.dataset.tab);
  });
}

// Initialize Home
if (role !== "agent") {
  setActiveTab("home");
  updateHomeBadge();
}

// ===== Global vars =====
let currentEventSource = null;
let currentConvKey = null;
let seenIds = new Set();

// ===== Dynamic Side Pane =====
async function renderSidePane(tab) {
  if (!leftPane) return;

  const headerHTML = (title) =>
    `<h3 class="app-header" style="background:#6D28D9;color:white;text-align:center;padding:0.8rem;border-radius:10px 10px 0 0;margin:0;">${title}</h3>`;

  if (tab === "home") {
    leftPane.innerHTML = `
      ${headerHTML("Active Conversations")}
      <ul id="activeConversations" style="margin:0;padding:0;list-style:none;"></ul>
    `;
    await loadConversations();
  }

  else if (tab === "archive") {
    leftPane.innerHTML = `
      ${headerHTML("Archive")}
      <ul id="archiveList" style="list-style:none;padding:0;margin:0;"><li style="padding:.6rem;opacity:.7">Loading…</li></ul>
    `;
    await renderArchiveList();
  }

  else if (tab === "create") {
    leftPane.innerHTML = `
      ${headerHTML("Create Conversation")}
      <div style="padding:1rem;display:flex;flex-direction:column;gap:10px;">
        <label style="font-weight:500;">Trainer</label>
        <input id="createTrainer" placeholder="Trainer name" class="lavender-input"/>
        <label style="font-weight:500;">Associate</label>
        <input id="createAssociate" placeholder="Associate name" class="lavender-input"/>
        <button id="createBtn" class="lavender-btn">Create</button>
        <div id="createNote" style="font-size:12px;opacity:.8;margin-top:6px;"></div>
      </div>
    `;

    document.querySelectorAll(".lavender-input").forEach((el) => {
      el.style.cssText =
        "border:1px solid #c7d2fe;padding:0.5rem;border-radius:8px;font-size:0.9rem;";
    });
    const btn = document.getElementById("createBtn");
    btn.style.cssText =
      "background:linear-gradient(90deg,#7C3AED,#9333EA);color:white;font-weight:500;border:none;padding:0.6rem 0.9rem;border-radius:8px;cursor:pointer;transition:opacity 0.25s ease;";
    btn.onmouseenter = () => (btn.style.opacity = "0.9");
    btn.onmouseleave = () => (btn.style.opacity = "1");

    const t = document.getElementById("createTrainer");
    const a = document.getElementById("createAssociate");
    const note = document.getElementById("createNote");
    t.value = user?.name || "";
    btn.onclick = async () => {
      const trainerName = t.value.trim();
      const associateName = a.value.trim();
      if (!trainerName || !associateName) {
        note.textContent = "Both names required.";
        return;
      }
      try {
        const res = await fetch(`${API_BASE_URL}/conversations`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeader },
          body: JSON.stringify({ trainerName, associateName }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to create.");
        note.textContent = `✅ Created | Key: ${data.convKey}`;
        await updateHomeBadge();
      } catch (e) {
        note.textContent = e.message;
      }
    };
  }

  else if (tab === "queue") {
    leftPane.innerHTML = `
      ${headerHTML("Queue")}
      <ul id="queueList" style="list-style:none;padding:0;margin:0;"><li style="padding:.6rem;opacity:.7">Loading…</li></ul>
    `;
    await renderQueueList();
  }

  else if (tab === "reports") {
    leftPane.innerHTML = `
      ${headerHTML("Reports")}
      <div style="padding:1rem;display:flex;flex-direction:column;gap:10px;">
        <label>From</label><input type="date" id="rFrom" class="lavender-input"/>
        <label>To</label><input type="date" id="rTo" class="lavender-input"/>
        <button id="rExport" class="lavender-btn">Export CSV</button>
        <div id="rNote" style="font-size:12px;opacity:.8;margin-top:6px;"></div>
      </div>
    `;
    const btn = document.getElementById("rExport");
    const note = document.getElementById("rNote");
    btn.onclick = () => (note.textContent = "Coming soon: report export.");
  }

  requestAnimationFrame(() => {
    if (window.lucide) window.lucide.createIcons({ icons: window.lucide.icons });
  });
}

// ========= Conversations, Archive, Queue =========
async function updateHomeBadge() {
  try {
    const badge = document.getElementById("badge-home");
    if (!badge) return;
    const res = await fetch(`${API_BASE_URL}/conversations?all=true`, {
      headers: { ...authHeader },
    });
    const rows = await res.json();
    const unread = (rows || []).reduce((a, c) => a + (c.unread_count || 0), 0);
    badge.textContent = unread > 99 ? "99+" : String(unread);
    badge.hidden = unread <= 0;
  } catch {
    const badge = document.getElementById("badge-home");
    if (badge) badge.hidden = true;
  }
}

async function renderArchiveList() {
  try {
    const res = await fetch(`${API_BASE_URL}/conversations?all=true`, { headers: { ...authHeader } });
    const data = await res.json();
    const list = document.getElementById("archiveList");
    if (!res.ok) throw new Error(data.error || "Failed to load");
    const ended = data.filter((c) => c.ended);
    list.innerHTML = ended.length ? "" : `<li style="opacity:.7;padding:.6rem;">No archived</li>`;
    ended.forEach((c) => {
      const li = document.createElement("li");
      li.innerHTML = `<strong>${c.trainer_name}</strong> ↔ ${c.associate_name}<br><span style="font-size:0.8rem;opacity:0.7;">${c.conv_key}</span>`;
      li.style.cssText = "padding:.6rem;border-bottom:1px solid #e2e8f0;cursor:pointer;transition:background 0.2s;";
      li.onmouseenter = () => (li.style.background = "#EDE9FE");
      li.onmouseleave = () => (li.style.background = "");
      li.onclick = () => openConversation(c);
      list.appendChild(li);
    });
  } catch (e) {
    const list = document.getElementById("archiveList");
    if (list) list.innerHTML = `<li style="color:#b91c1c;padding:.6rem;">${e.message}</li>`;
  }
}

// ========= Core Conversation Functions =========
async function loadConversations() {
  try {
    if (role === "admin" || role === "trainer") {
      let url =
        role === "admin"
          ? `${API_BASE_URL}/conversations?all=true`
          : `${API_BASE_URL}/conversations?trainer=${encodeURIComponent(user.name)}`;
      const res = await fetch(url, { headers: { ...authHeader } });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load conversations");
      const active = data.filter((c) => !c.ended);
      renderList("activeConversations", active);
      return;
    }
    await loadAgentConversation();
  } catch (err) {
    console.error("Error loading conversations:", err);
    if (err.message?.toLowerCase().includes("invalid token")) {
      alert("Session invalid. Please login again.");
      logout();
    }
  }
}

function renderList(id, items) {
  const ul = document.getElementById(id);
  if (!ul) return;
  ul.innerHTML = items.length
    ? ""
    : `<li style="opacity:.7;padding:.6rem;">No conversations</li>`;
  items.forEach((c) => {
    const li = document.createElement("li");
    li.innerHTML = `
      <div style="display:flex;flex-direction:column;">
        <span style="font-weight:600;">${c.trainer_name} ↔ ${c.associate_name}</span>
        <span style="font-size:0.8rem;opacity:0.7;">${c.conv_key}</span>
      </div>
      ${c.unread_count ? `<span class="badge" style="background:#EF4444;color:#fff;padding:2px 6px;border-radius:12px;font-size:0.8rem;">${c.unread_count}</span>` : ""}
    `;
    li.style.cssText = "padding:0.6rem;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #e2e8f0;cursor:pointer;transition:background 0.2s;";
    li.onmouseenter = () => (li.style.background = "#EDE9FE");
    li.onmouseleave = () => (li.style.background = "");
    li.onclick = () => openConversation(c);
    ul.appendChild(li);
  });
}

async function loadAgentConversation() {
  try {
    const convKey = localStorage.getItem("convKey");
    if (!convKey) {
      alert("Missing conversation key. Please login again.");
      ["role", "user", "trainerName"].forEach((k) => localStorage.removeItem(k));
      window.location.href = "login.html";
      return;
    }
    const res = await fetch(`${API_BASE_URL}/conversations?convKey=${encodeURIComponent(convKey)}`, {
      headers: { ...authHeader },
    });
    if (res.status >= 400) {
      alert("Conversation not found or inactive.");
      ["convKey", "role", "user", "trainerName"].forEach((k) => localStorage.removeItem(k));
      window.location.href = "login.html";
      return;
    }
    const conv = await res.json();
    if (!conv || conv.ended) {
      alert("This conversation is no longer active.");
      ["convKey", "role", "user", "trainerName"].forEach((k) => localStorage.removeItem(k));
      window.location.href = "login.html";
      return;
    }
    openConversation(conv);
  } catch (err) {
    console.error("Agent load failed:", err);
    alert("Error loading conversation.");
    window.location.href = "login.html";
  }
}

// ========= Chat Window Rendering (unchanged logic) =========
async function openConversation(conv) {
  if (currentEventSource) {
    try {
      currentEventSource.close();
    } catch {}
    currentEventSource = null;
  }

  currentConvKey = conv.conv_key;
  seenIds = new Set();

  chatContent.innerHTML = `
    <div id="chatContainer" style="display:flex;flex-direction:column;height:80vh;width:100%;background:white;border-radius:12px;border:1px solid #E0E7FF;box-shadow:0 0 12px rgba(109,40,217,0.15);overflow:hidden;">
      <div id="chatHeader" style="background:linear-gradient(90deg,#6D28D9,#9333EA);color:white;padding:0.75rem;text-align:center;font-weight:600;">
        ${escapeHtml(conv.trainer_name)} ↔ ${escapeHtml(conv.associate_name)} | Key: ${escapeHtml(conv.conv_key)}
      </div>
      <div id="messages" data-conv-key="${conv.conv_key}" style="flex:1;overflow-y:auto;padding:1rem;display:flex;flex-direction:column;gap:0.5rem;background:#FAF5FF;"></div>
      <div id="chatInputArea" style="padding:0.6rem;display:flex;gap:0.5rem;border-top:1px solid #E0E7FF;background:white;">
        <textarea id="chatInput" placeholder="Type a message..." style="flex:1;height:44px;border:1px solid #C4B5FD;border-radius:0.5rem;padding:0.6rem;"></textarea>
        <button id="sendBtn" style="background:#6D28D9;color:white;border:none;border-radius:0.5rem;padding:0.6rem 1.2rem;cursor:pointer;font-weight:500;">Send</button>
      </div>
    </div>
  `;

  await loadMessages(conv.conv_key);
  await markConversationRead(conv.conv_key);
  subscribeToMessages(conv.conv_key);

  const input = document.getElementById("chatInput");
  const sendBtn = document.getElementById("sendBtn");
  const container = document.getElementById("messages");

  sendBtn.onclick = async () => {
    const text = input.value.trim();
    if (!text) return;
    const newMsg = await sendMessage(conv.conv_key, user.name, role, text);
    renderMessage(container, newMsg, { scroll: true });
    input.value = "";
  };
}

async function loadMessages(convKey) {
  const res = await fetch(`${API_BASE_URL}/messages?convKey=${encodeURIComponent(convKey)}`, {
    headers: { ...authHeader },
  });
  const rows = await res.json();
  const container = document.getElementById("messages");
  container.innerHTML = "";
  rows.forEach((r) => renderMessage(container, r, { scroll: false }));
  container.scrollTop = container.scrollHeight;
}

async function sendMessage(convKey, senderName, senderRole, text) {
  const res = await fetch(`${API_BASE_URL}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeader },
    body: JSON.stringify({ convKey, senderName, senderRole, text }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to send");
  return data;
}

function renderMessage(container, msg, opts = { scroll: true }) {
  const sender = msg.sender_name || msg.sender || "Unknown";
  const isSelf = sender === user.name;
  const wrapper = document.createElement("div");
  wrapper.className = `message ${isSelf ? "self" : "other"}`;
  const bubble = document.createElement("div");
  bubble.className = "bubble";
  bubble.style.cssText = `
    max-width:70%;padding:0.6rem 0.9rem;border-radius:10px;
    background:${isSelf ? "#6D28D9" : "#EDE9FE"};
    color:${isSelf ? "white" : "#1E1B4B"};
    box-shadow:0 2px 6px rgba(0,0,0,0.05);
  `;
  const time = new Date(msg.timestamp || Date.now()).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
  bubble.innerHTML = `<div>${escapeHtml(msg.text)}</div><div style="font-size:0.7rem;opacity:0.7;text-align:right;">${time}</div>`;
  wrapper.appendChild(bubble);
  container.appendChild(wrapper);
  if (opts.scroll) container.scrollTop = container.scrollHeight;
}

function escapeHtml(s) {
  return String(s || "").replace(/[&<>"']/g, (m) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m])
  );
}

async function markConversationRead(convKey) {
  await fetch(`${API_BASE_URL}/messageRead`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeader },
    body: JSON.stringify({ convKey, userName: user.name }),
  });
}
function showDesktopNotification(sender, text) {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  const n = new Notification(`💬 New message from ${sender}`, {
    body: text.length > 60 ? text.slice(0, 60) + "…" : text,
    icon: "/favicon.ico",
  });
  n.onclick = () => window.focus();
}

// SSE setup (unchanged)
function subscribeToMessages(convKey) {
  if (currentEventSource) currentEventSource.close();
  const es = new EventSource(`${API_BASE_URL}/messages?convKey=${encodeURIComponent(convKey)}`);
  currentEventSource = es;
  const container = document.getElementById("messages");
  es.onmessage = (e) => {
    const p = JSON.parse(e.data);
    if (p.type === "new") {
      p.messages.forEach((m) => {
        renderMessage(container, m);
      // 🔔 Trigger desktop notification only if not from self
        if (m.sender_name !== user.name) showDesktopNotification(m.sender_name, m.text);
      });
      if (role !== "agent") loadConversations();
    }
  };
  es.onerror = () => {
    setTimeout(() => subscribeToMessages(convKey), 3000);
  };
}

// Load initial conversations
loadConversations();
