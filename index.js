// index.js (Lavender Edition 💜)
import { createIcons, icons } from "https://unpkg.com/lucide@latest/dist/esm/lucide.js";
import { getUserFromToken, getAuthHeader } from "./authHelper.js";
import { checkAuth, logout } from "./authGuard.js";

const API_BASE_URL = "https://mock-chat-backend.vercel.app/api";

// DOM references
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

// Hide side panes for agent
if (role === "agent") {
  if (leftPane) leftPane.style.display = "none";
  if (newChatBtn) newChatBtn.style.display = "none";
} else if (newChatBtn) {
  newChatBtn.addEventListener("click", () => {
    const associate = prompt("Enter associate name:");
    if (associate) createConversation(user.name, associate);
  });
}

// ===== LOGOUT =====
const logoutBtn = document.getElementById("logoutBtn");
if (logoutBtn) {
  logoutBtn.addEventListener("click", () => {
    ["convKey", "trainerName", "role", "user"].forEach(k => localStorage.removeItem(k));
    logout();
  });
}

// ===== NAVIGATION =====
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

if (role !== "agent") {
  setActiveTab("home");
  updateHomeBadge();
}

// ======= GLOBAL STATE =======
let currentEventSource = null;
let currentConvKey = null;
let seenIds = new Set();

// ======= SOUND / NOTIFICATIONS =======
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

// ======= SIDE PANE RENDER =======
async function renderSidePane(tab) {
  if (!leftPane) return;

  const headerHTML = (title) => `<h3 class="app-header">${title}</h3>`;

  if (tab === "home") {
    leftPane.innerHTML = `${headerHTML("Active Conversations")}<ul id="activeConversations"></ul>`;
    await loadConversations();
  } else if (tab === "archive") {
    leftPane.innerHTML = `${headerHTML("Archive")}<ul id="archiveList"><li style="padding:.6rem;opacity:.7">Loading…</li></ul>`;
    await renderArchiveList();
  } else if (tab === "create") {
    leftPane.innerHTML = `
      ${headerHTML("Create Conversation")}
      <div style="padding:0.75rem; display:flex; flex-direction:column; gap:8px;">
        <label>Trainer</label>
        <input id="createTrainer" placeholder="Trainer name" />
        <label>Associate</label>
        <input id="createAssociate" placeholder="Associate name" />
        <button id="createBtn" style="
          margin-top:8px;
          background:#b371c7;
          color:#fff;
          border:none;
          border-radius:8px;
          padding:8px 10px;
          cursor:pointer;
          transition:background 0.3s ease;">Create</button>
        <div id="createNote" style="font-size:12px;opacity:.8;margin-top:6px;"></div>
      </div>`;
    const t = document.getElementById("createTrainer");
    const a = document.getElementById("createAssociate");
    const btn = document.getElementById("createBtn");
    const note = document.getElementById("createNote");
    t.value = user?.name || "";
    btn.onmouseenter = () => (btn.style.background = "#e5b0ea");
    btn.onmouseleave = () => (btn.style.background = "#b371c7");
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
    leftPane.innerHTML = `${headerHTML("Queue")}<ul id="queueList"><li style="padding:.6rem;opacity:.7">Loading…</li></ul>`;
    await renderQueueList();
  } else if (tab === "reports") {
    leftPane.innerHTML = `
      ${headerHTML("Reports")}
      <div style="padding:0.75rem; display:flex; flex-direction:column; gap:8px;">
        <label>From</label><input type="date" id="rFrom"/>
        <label>To</label><input type="date" id="rTo"/>
        <button id="rExport" style="
          margin-top:8px;
          background:#b371c7;
          color:#fff;
          border:none;
          border-radius:8px;
          padding:8px 10px;
          cursor:pointer;
          transition:background 0.3s ease;">Export CSV</button>
        <div id="rNote" style="font-size:12px;opacity:.8;margin-top:6px;"></div>
      </div>`;
    const btn = document.getElementById("rExport");
    btn.onmouseenter = () => (btn.style.background = "#e5b0ea");
    btn.onmouseleave = () => (btn.style.background = "#b371c7");
    const note = document.getElementById("rNote");
    btn.onclick = () => { note.textContent = "Preparing... (coming soon)"; };
  }

  requestAnimationFrame(() => {
    if (window.lucide) window.lucide.createIcons({ icons: window.lucide.icons });
  });
}

// ======= CONVERSATION VIEW =======
async function openConversation(conv) {
  if (currentEventSource) try { currentEventSource.close(); } catch (e) {}
  currentConvKey = conv.conv_key;
  seenIds = new Set();

  chatContent.innerHTML = `
    <div id="chatContainer" style="
      display:flex;
      flex-direction:column;
      height:80vh;
      width:100%;
      background:var(--bg-card);
      border-radius:10px;
      border:1px solid rgba(179,113,199,0.3);
      overflow:hidden;">
      <div id="chatHeader" style="
        background:#b371c7;
        color:white;
        padding:0.75rem;
        text-align:center;
        font-weight:600;">
        ${escapeHtml(conv.trainer_name)} ↔ ${escapeHtml(conv.associate_name)} | Key: ${escapeHtml(conv.conv_key)}
      </div>
      <div id="messages" data-conv-key="${conv.conv_key}" style="
        flex:1;
        overflow-y:auto;
        padding:1rem;
        display:flex;
        flex-direction:column;
        gap:0.4rem;
        background:var(--bg-main);"></div>
      <div id="chatInputArea" style="
        padding:0.5rem;
        display:flex;
        gap:0.5rem;
        border-top:1px solid rgba(179,113,199,0.3);
        background:var(--lavender-lightest);">
        <textarea id="chatInput" placeholder="Type a message..." style="
          flex:1;
          height:44px;
          border:1px solid rgba(179,113,199,0.3);
          border-radius:0.5rem;
          padding:0.6rem;"></textarea>
        <button id="sendBtn" style="
          background:#b371c7;
          color:white;
          border:none;
          border-radius:0.5rem;
          padding:0.6rem 1.2rem;
          cursor:pointer;
          transition:background 0.3s ease;">Send</button>
      </div>
    </div>`;

  const container = document.getElementById("messages");
  const input = document.getElementById("chatInput");
  const sendBtn = document.getElementById("sendBtn");

  sendBtn.onmouseenter = () => (sendBtn.style.background = "#e5b0ea");
  sendBtn.onmouseleave = () => (sendBtn.style.background = "#b371c7");

  await loadMessages(conv.conv_key);
  await markConversationRead(conv.conv_key);
  subscribeToMessages(conv.conv_key);

  const handleSend = async () => {
    const text = input.value.trim();
    if (!text) return;
    try {
      const newMsg = await sendMessage(conv.conv_key, user.name, role, text);
      renderMessage(container, newMsg || {
        sender_name: user.name,
        role,
        text,
        timestamp: new Date().toISOString(),
      }, { scroll: true });
      input.value = "";
    } catch (err) {
      alert("Failed to send: " + err.message);
    }
  };

  sendBtn.onclick = handleSend;
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  });
}

// ======= MESSAGE RENDER =======
function renderMessage(container, msg, opts = { scroll: true }) {
  const sender = msg.sender_name || "Unknown";
  const senderRole = msg.role || "unknown";
  const isSelf = sender === user.name && senderRole === role;
  const wrapper = document.createElement("div");
  wrapper.className = `message ${isSelf ? "self" : "other"}`;

  const bubble = document.createElement("div");
  bubble.className = "bubble";
  const time = new Date(msg.timestamp || Date.now()).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  bubble.innerHTML = `
    ${!isSelf ? `<span class="sender">${escapeHtml(sender)}</span>` : ""}
    <div class="msg-text">${escapeHtml(msg.text || "")}</div>
    <span class="timestamp">${time}</span>`;

  wrapper.appendChild(bubble);
  container.appendChild(wrapper);

  if (opts.scroll) container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
}

function escapeHtml(s) {
  return String(s || "").replace(/[&<>"']/g, (m) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m])
  );
}

// ======= UTILITIES =======
async function markConversationRead(convKey) {
  try {
    await fetch(`${API_BASE_URL}/messageRead`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeader },
      body: JSON.stringify({ convKey, userName: user.name }),
    });
    if (role !== "agent") await loadConversations();
  } catch (err) {
    console.error("markConversationRead error:", err);
  }
}

async function loadMessages(convKey) {
  try {
    const res = await fetch(`${API_BASE_URL}/messages?convKey=${encodeURIComponent(convKey)}`, { headers: { ...authHeader } });
    const rows = await res.json();
    const container = document.getElementById("messages");
    container.innerHTML = "";
    rows.forEach((r) => renderMessage(container, r, { scroll: false }));
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

loadConversations();
