// index.js (Lavender Edition - Fixed load order 💜)
import { createIcons, icons } from "https://unpkg.com/lucide@latest/dist/esm/lucide.js";
import { getAuthHeader } from "./authHelper.js";
import { checkAuth, logout } from "./authGuard.js";

const API_BASE_URL = "https://mock-chat-backend.vercel.app/api";

// DOM elements
const leftPane = document.getElementById("left-pane");
const chatContent = document.getElementById("chatContent");
const newChatBtn = document.getElementById("newChatBtn");
const navRail = document.getElementById("nav-rail");

// Global setup
window.lucide = { createIcons, icons };
createIcons({ icons });

// AUTH
const session = checkAuth(["admin", "trainer", "agent"]);
if (!session) {
  window.location.href = "login.html";
  throw new Error("Unauthorized");
}
const { user, role } = session;
const authHeader = getAuthHeader();

// Global vars
let currentEventSource = null;
let currentConvKey = null;
let seenIds = new Set();

// ===== UTILITIES =====
function escapeHtml(s) {
  return String(s || "").replace(/[&<>"']/g, (m) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m])
  );
}
function playNotification() {
  try {
    const a = new Audio("data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQgAAAAA");
    a.play().catch(() => {});
  } catch (e) {}
}

// ====== CORE FUNCTIONS ======
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

async function loadConversations() {
  try {
    if (role === "admin" || role === "trainer") {
      let url =
        role === "admin"
          ? `${API_BASE_URL}/conversations?all=true`
          : `${API_BASE_URL}/conversations?trainer=${encodeURIComponent(
              user.name
            )}`;

      const res = await fetch(url, { headers: { ...authHeader } });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load conversations");

      const myConvs = Array.isArray(data) ? data : [];
      const activeConvs = myConvs.filter((c) => !c.ended);
      renderList("activeConversations", activeConvs);
    }
  } catch (err) {
    console.error("Error loading conversations:", err);
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

  items.forEach((c) => {
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
    badge.style.display =
      c.unread_count && c.unread_count > 0 ? "inline-block" : "none";
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

// ====== SIDE PANE ======
async function renderSidePane(tab) {
  if (!leftPane) return;

  const headerHTML = (title) =>
    `<h3 class="app-header">${title}</h3>`;

  if (tab === "home") {
    leftPane.innerHTML = `${headerHTML("Active Conversations")}<ul id="activeConversations"></ul>`;
    await loadConversations();
  }
  if (tab === "archive") {
    leftPane.innerHTML = `${headerHTML("Archive")}<ul id="archiveList"><li>Loading…</li></ul>`;
  }
  if (tab === "create") {
    leftPane.innerHTML = `
      ${headerHTML("Create Conversation")}
      <div style="padding:0.75rem; display:flex; flex-direction:column; gap:8px;">
        <label>Trainer</label><input id="createTrainer" placeholder="Trainer name" />
        <label>Associate</label><input id="createAssociate" placeholder="Associate name" />
        <button id="createBtn" style="margin-top:8px;background:#b371c7;color:white;border:none;border-radius:8px;padding:8px;">Create</button>
        <div id="createNote" style="font-size:12px;opacity:.8;margin-top:6px;"></div>
      </div>`;
  }

  requestAnimationFrame(() => {
    if (window.lucide)
      window.lucide.createIcons({ icons: window.lucide.icons });
  });
}

// ====== CHAT ======
async function openConversation(conv) {
  currentConvKey = conv.conv_key;
  chatContent.innerHTML = `
    <div id="chatContainer" style="display:flex;flex-direction:column;height:80vh;width:100%;background:#f7e8f6;border-radius:10px;border:1px solid rgba(179,113,199,0.3);overflow:hidden;">
      <div id="chatHeader" style="background:#b371c7;color:white;padding:0.75rem;text-align:center;font-weight:600;">
        ${escapeHtml(conv.trainer_name)} ↔ ${escapeHtml(conv.associate_name)} | Key: ${escapeHtml(conv.conv_key)}
      </div>
      <div id="messages" data-conv-key="${conv.conv_key}" style="flex:1;overflow-y:auto;padding:1rem;display:flex;flex-direction:column;gap:0.4rem;background:white;"></div>
      <div id="chatInputArea" style="padding:0.5rem;display:flex;gap:0.5rem;border-top:1px solid rgba(179,113,199,0.3);background:#f1c6e7;">
        <textarea id="chatInput" placeholder="Type a message..." style="flex:1;height:44px;border:1px solid rgba(179,113,199,0.3);border-radius:0.5rem;padding:0.6rem;"></textarea>
        <button id="sendBtn" style="background:#b371c7;color:white;border:none;border-radius:0.5rem;padding:0.6rem 1.2rem;cursor:pointer;">Send</button>
      </div>
    </div>`;
}

// ====== INITIALIZATION ======
document.addEventListener("DOMContentLoaded", async () => {
  // Logout
  const logoutBtn = document.getElementById("logoutBtn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", () => {
      ["convKey", "trainerName", "role", "user"].forEach((k) =>
        localStorage.removeItem(k)
      );
      logout();
    });
  }

  // Nav setup
  function setActiveTab(tab) {
    document
      .querySelectorAll("#nav-rail .nav-item")
      .forEach((btn) =>
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

  if (role !== "agent") {
    setActiveTab("home");
    await updateHomeBadge();
  }
});
