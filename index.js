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

// Initial load
loadConversations();
