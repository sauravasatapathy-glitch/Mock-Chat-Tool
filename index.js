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
