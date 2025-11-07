// index.js (Lavender UI - fixed dynamic header + lucide refresh)
import { createIcons, icons } from "https://unpkg.com/lucide@latest/dist/esm/lucide.js";
import { getUserFromToken, getAuthHeader } from "./authHelper.js";
import { checkAuth, logout } from "./authGuard.js";

const API_BASE_URL = "https://mock-chat-backend.vercel.app/api";

// DOM
const leftPane = document.getElementById("left-pane");
const rightPane = document.getElementById("right-pane");
const chatContent = document.getElementById("chatContent");
const newChatBtn = document.getElementById("newChatBtn");
const navRail = document.getElementById("nav-rail");

window.lucide = { createIcons, icons };
createIcons({ icons });

// AUTH
const session = checkAuth(["admin", "trainer", "agent"]);
if (!session) {
  window.location.href = "login.html";
  throw new Error("Unauthorized");
}
const { user, token, role } = session;
const authHeader = getAuthHeader();

// Hide panes for agents
if (role === "agent") {
  if (leftPane) leftPane.style.display = "none";
  if (rightPane) rightPane.style.display = "none";
  if (newChatBtn) newChatBtn.style.display = "none";
} else {
  if (newChatBtn) {
    newChatBtn.addEventListener("click", () => {
      const associate = prompt("Enter associate name:");
      if (associate) createConversation(user.name, associate);
    });
  }
}

// Logout button
const logoutBtn = document.getElementById("logoutBtn");
if (logoutBtn) {
  logoutBtn.addEventListener("click", () => {
    try {
      localStorage.removeItem("convKey");
      localStorage.removeItem("trainerName");
      localStorage.removeItem("role");
      localStorage.removeItem("user");
    } catch (e) {}
    logout();
  });
}

// ===== Layout Mode =====
document.body.classList.toggle("agent-mode", role === "agent");

// ====== Nav Rail Wiring ======
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

// Initial tab
if (role !== "agent") {
  setActiveTab("home");
  updateHomeBadge();
}

// ====== Global vars ======
let currentEventSource = null;
let currentConvKey = null;
let seenIds = new Set();

// Notifications
if ("Notification" in window && Notification.permission === "default") {
  Notification.requestPermission().catch(() => {});
}

// Tiny beep
const notifAudio = (() => {
  const a = new Audio();
  a.src =
    "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQgAAAAA";
  return a;
})();
function playNotification() {
  try {
    notifAudio.play().catch(() => {});
  } catch (e) {}
}

// ========= Dynamic Side Pane =========
async function renderSidePane(tab) {
  if (!leftPane) return;

  const headerHTML = (title) => `<h3 class="app-header">${title}</h3>`;

  if (tab === "home") {
    leftPane.innerHTML = `
      ${headerHTML("Active Conversations")}
      <ul id="activeConversations"></ul>
    `;
    await loadConversations();
  } else if (tab === "archive") {
    leftPane.innerHTML = `
      ${headerHTML("Archive")}
      <ul id="archiveList"><li style="padding:.6rem;opacity:.7">Loading…</li></ul>
    `;
    await renderArchiveList();
  } else if (tab === "create") {
    leftPane.innerHTML = `
      ${headerHTML("Create Conversation")}
      <div style="padding:0.75rem; display:flex; flex-direction:column; gap:8px;">
        <label>Trainer</label>
        <input id="createTrainer" placeholder="Trainer name" />
        <label>Associate</label>
        <input id="createAssociate" placeholder="Associate name" />
        <button id="createBtn" style="margin-top:8px;background:#2563eb;color:#fff;border:none;border-radius:8px;padding:8px 10px;cursor:pointer;">Create</button>
        <div id="createNote" style="font-size:12px;opacity:.8;margin-top:6px;"></div>
      </div>
    `;
    const t = document.getElementById("createTrainer");
    const a = document.getElementById("createAssociate");
    const btn = document.getElementById("createBtn");
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
        note.textContent = `Created. Key: ${data.convKey}`;
        await updateHomeBadge();
      } catch (e) {
        note.textContent = e.message;
      }
    };
  } else if (tab === "queue") {
    leftPane.innerHTML = `
      ${headerHTML("Queue")}
      <ul id="queueList"><li style="padding:.6rem;opacity:.7">Loading…</li></ul>
    `;
    await renderQueueList();
  } else if (tab === "reports") {
    leftPane.innerHTML = `
      ${headerHTML("Reports")}
      <div style="padding:0.75rem; display:flex; flex-direction:column; gap:8px;">
        <label>From</label><input type="date" id="rFrom"/>
        <label>To</label><input type="date" id="rTo"/>
        <button id="rExport" style="margin-top:8px;background:#2563eb;color:#fff;border:none;border-radius:8px;padding:8px 10px;cursor:pointer;">Export CSV</button>
        <div id="rNote" style="font-size:12px;opacity:.8;margin-top:6px;"></div>
      </div>
    `;
    const btn = document.getElementById("rExport");
    const note = document.getElementById("rNote");
    btn.onclick = () => {
      note.textContent = "Preparing… (coming soon)";
    };
  }

  // ✅ Re-render Lucide icons once content changes
  requestAnimationFrame(() => {
    if (window.lucide) window.lucide.createIcons({ icons: window.lucide.icons });
  });
}

// ========= Archive + Queue + Badge =========
async function renderArchiveList() {
  try {
    const res = await fetch(`${API_BASE_URL}/conversations?all=true`, {
      headers: { ...authHeader },
    });
    const rows = await res.json();
    const list = document.getElementById("archiveList");
    if (!res.ok) throw new Error(rows.error || "Failed to load");
    const ended = (rows || []).filter((c) => c.ended);
    list.innerHTML =
      ended.length === 0
        ? `<li style="opacity:.7;padding:.6rem;">No archived</li>`
        : "";
    ended.forEach((c) => {
      const li = document.createElement("li");
      li.textContent = `${c.trainer_name} ↔ ${c.associate_name} (${c.conv_key})`;
      li.style.padding = ".6rem";
      li.onclick = () => openConversation(c);
      list.appendChild(li);
    });
  } catch (e) {
    const list = document.getElementById("archiveList");
    if (list)
      list.innerHTML = `<li style="color:#b91c1c;padding:.6rem;">${e.message}</li>`;
  }
}

async function renderQueueList() {
  try {
    const res = await fetch(`${API_BASE_URL}/conversations?all=true`, {
      headers: { ...authHeader },
    });
    const rows = await res.json();
    const list = document.getElementById("queueList");
    if (!res.ok) throw new Error(rows.error || "Failed to load");
    const queued = (rows || []).filter(
      (c) => !c.ended && (c.msg_count === 0 || c.unread_count === 0)
    );
    list.innerHTML =
      queued.length === 0
        ? `<li style="opacity:.7;padding:.6rem;">No queued conversations</li>`
        : "";
    queued.forEach((c) => {
      const li = document.createElement("li");
      li.textContent = `${c.trainer_name} ↔ ${c.associate_name} (${c.conv_key})`;
      li.style.padding = ".6rem";
      li.onclick = () => openConversation(c);
      list.appendChild(li);
    });
  } catch (e) {
    const list = document.getElementById("queueList");
    if (list)
      list.innerHTML = `<li style="color:#b91c1c;padding:.6rem;">${e.message}</li>`;
  }
}

// ---------- Remaining functions unchanged ----------
async function updateHomeBadge() {
  try {
    const badge = document.getElementById("badge-home");
    if (!badge) return;
    const res = await fetch(`${API_BASE_URL}/conversations?all=true`, {
      headers: { ...authHeader },
    });
    const rows = await res.json();
    const totalUnread = (rows || []).reduce(
      (sum, c) => sum + (c.unread_count || 0),
      0
    );
    badge.textContent = totalUnread > 99 ? "99+" : String(totalUnread);
    badge.hidden = totalUnread <= 0;
  } catch {
    const badge = document.getElementById("badge-home");
    if (badge) badge.hidden = true;
  }
}

// Other message / SSE / helper logic (unchanged)
function isNearBottom(el, threshold = 120) {
  return el.scrollHeight - (el.scrollTop + el.clientHeight) < threshold;
}

// Initial load// ---------- Load conversations (role-aware) ----------
async function loadConversations() {
  try {
    if (role === "admin" || role === "trainer") {
      let url;
      if (role === "admin") {
        url = `${API_BASE_URL}/conversations?all=true`;
      } else {
        url = `${API_BASE_URL}/conversations?trainer=${encodeURIComponent(user.name)}`;
      }

      const res = await fetch(url, { headers: { ...authHeader } });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load conversations");

      const myConvs = Array.isArray(data) ? data : [];
      const activeConvs = myConvs.filter(c => !c.ended);
      renderList("activeConversations", activeConvs);
      return;
    }

    // agent: use dedicated agent flow (auto open)
    await loadAgentConversation();
  } catch (err) {
    console.error("Error loading conversations:", err);
    if (err.message && err.message.toLowerCase().includes("invalid token")) {
      alert("Session invalid. Please login again.");
      logout();
    }
  }
}

// ---------- Render list ----------
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
    li.style.display = "flex";
    li.style.justifyContent = "space-between";
    li.style.alignItems = "center";
    li.style.gap = "8px";
    li.style.padding = ".5rem";

    const left = document.createElement("div");
    left.style.flex = "1";
    left.textContent = `${c.trainer_name} ↔ ${c.associate_name} (${c.conv_key})`;

    if (c.unread_count && c.unread_count > 0) left.style.fontWeight = "700";

    const badge = document.createElement("div");
    badge.className = "conv-badge";
    badge.style.display = (c.unread_count && c.unread_count > 0) ? "inline-block" : "none";
    badge.style.background = "#ef4444";
    badge.style.color = "#fff";
    badge.style.padding = "0.18rem 0.5rem";
    badge.style.borderRadius = "999px";
    badge.style.fontSize = "0.85rem";
    badge.textContent = c.unread_count || "";

    li.appendChild(left);
    li.appendChild(badge);

    li.onclick = () => openConversation(c);
    ul.appendChild(li);
  });
}

// ---------- Agent: single conversation ----------
async function loadAgentConversation() {
  try {
    const convKey = localStorage.getItem("convKey");
    if (!convKey) {
      alert("Missing conversation key. Please login again.");
      ["role", "user", "trainerName"].forEach(k => localStorage.removeItem(k));
      window.location.href = "login.html";
      return;
    }

    const res = await fetch(`${API_BASE_URL}/conversations?convKey=${encodeURIComponent(convKey)}`, {
      headers: { ...authHeader },
    });
    if (res.status === 404 || res.status === 400) {
      alert("Conversation no longer active. Please contact your trainer.");
      ["convKey", "role", "user", "trainerName"].forEach(k => localStorage.removeItem(k));
      window.location.href = "login.html";
      return;
    }

    const conv = await res.json();
    if (!res.ok || conv.ended) {
      alert("This conversation is no longer active.");
      ["convKey", "role", "user", "trainerName"].forEach(k => localStorage.removeItem(k));
      window.location.href = "login.html";
      return;
    }

    openConversation(conv);
  } catch (err) {
    console.error("loadAgentConversation error:", err);
    alert("Error loading your conversation. Please contact your trainer.");
    ["convKey", "role", "user", "trainerName"].forEach(k => localStorage.removeItem(k));
    window.location.href = "login.html";
  }
}

// ---------- Open Conversation ----------
async function openConversation(conv) {
  if (currentEventSource) {
    try { currentEventSource.close(); } catch (e) {}
    currentEventSource = null;
  }

  currentConvKey = conv.conv_key;
  seenIds = new Set();

  chatContent.innerHTML = `
    <div id="chatContainer" style="display:flex;flex-direction:column;height:80vh;width:100%;background:#f9fafb;border-radius:10px;border:1px solid #e2e8f0;overflow:hidden;">
      <div id="chatHeader" style="background:#2563eb;color:white;padding:0.75rem;text-align:center;font-weight:600;">
        ${escapeHtml(conv.trainer_name)} ↔ ${escapeHtml(conv.associate_name)} | Key: ${escapeHtml(conv.conv_key)}
      </div>
      <div id="messages" data-conv-key="${conv.conv_key}" style="flex:1;overflow-y:auto;padding:1rem;display:flex;flex-direction:column;gap:0.4rem;background:white;"></div>
      <div id="chatInputArea" style="padding:0.5rem;display:flex;gap:0.5rem;border-top:1px solid #e5e7eb;background:#f8fafc;">
        <textarea id="chatInput" placeholder="Type a message..." style="flex:1;height:44px;border:1px solid #cbd5e1;border-radius:0.5rem;padding:0.6rem;"></textarea>
        <button id="sendBtn" style="background:#2563eb;color:white;border:none;border-radius:0.5rem;padding:0.6rem 1.2rem;cursor:pointer;">Send</button>
      </div>
    </div>
  `;

  const container = document.getElementById("messages");
  const input = document.getElementById("chatInput");
  const sendBtn = document.getElementById("sendBtn");

  await loadMessages(conv.conv_key);
  await markConversationRead(conv.conv_key);
  subscribeToMessages(conv.conv_key);

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

// ---------- Supporting functions ----------
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
  const timeStr = new Date(msg.timestamp || Date.now())
    .toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  bubble.innerHTML = `
    ${!isSelf ? `<span class="sender">${escapeHtml(sender)}</span>` : ""}
    <div class="msg-text">${escapeHtml(msg.text || "")}</div>
    <span class="timestamp">${timeStr}</span>
  `;

  wrapper.appendChild(bubble);
  container.appendChild(wrapper);
  if (opts.scroll) container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
}

function escapeHtml(s) {
  return String(s || "").replace(/[&<>"']/g, (m) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m])
  );
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
        if (role !== "agent") loadConversations().catch(()=>{});
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

// Initialize conversations on startup
loadConversations();
