// index.js (updated - agent auto-open + convKey check)
import { getUserFromToken, getAuthHeader } from "./authHelper.js";
import { checkAuth, logout } from "./authGuard.js";

const API_BASE_URL = "https://mock-chat-backend.vercel.app/api";

// DOM
const leftPane = document.getElementById("left-pane");
const rightPane = document.getElementById("right-pane");
const chatContent = document.getElementById("chatContent");
const newChatBtn = document.getElementById("newChatBtn");

// AUTH
const session = checkAuth(["admin", "trainer", "agent"]);
if (!session) {
  window.location.href = "login.html";
  throw new Error("Unauthorized");
}
const { user, token, role } = session;
const authHeader = getAuthHeader();

// If agent — hide both side panes entirely
if (role === "agent") {
  if (leftPane) leftPane.style.display = "none";
  if (rightPane) rightPane.style.display = "none";
  if (newChatBtn) newChatBtn.style.display = "none";
} else {
  // non-agent: wire create conversation
  if (newChatBtn) {
    newChatBtn.addEventListener("click", () => {
      const associate = prompt("Enter associate name:");
      if (associate) createConversation(user.name, associate);
    });
  }
}

// Logout button (always available)
const logoutBtn = document.createElement("button");
logoutBtn.textContent = "Logout";
logoutBtn.style.cssText = "position:fixed;top:10px;right:10px;padding:0.4rem 0.8rem;background:#dc2626;color:white;border:none;border-radius:0.5rem;cursor:pointer;z-index:1000;";
logoutBtn.onclick = () => {
  // clear agent-specific keys plus token/user
  try {
    localStorage.removeItem("convKey");
    localStorage.removeItem("trainerName");
    localStorage.removeItem("role");
    localStorage.removeItem("user");
  } catch(e){}
  logout();
};
document.body.appendChild(logoutBtn);

// Global SSE + seen tracking
let currentEventSource = null;
let currentConvKey = null;
let seenIds = new Set();

// Notification permission request (non-blocking)
if ("Notification" in window && Notification.permission === "default") {
  Notification.requestPermission().catch(() => {});
}

// tiny beep
const notifAudio = (() => {
  const a = new Audio();
  a.src = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQgAAAAA";
  return a;
})();
function playNotification() { try { notifAudio.play().catch(()=>{}); } catch(e){} }
function autoScrollMessages() {
  const container = document.getElementById("messages");
  if (!container) return;

  container.scrollTo({
    top: container.scrollHeight,
    behavior: "smooth",
  });
}

// ---------- Load conversations (role-aware) ----------
async function loadConversations() {
  try {
    // admin/trainer: list mode
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
      renderList("myConversations", myConvs);
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

// ---------- Agent: load single conversation by convKey and open ----------
// Behavior: if convKey missing/invalid/ended -> show message and redirect to login
async function loadAgentConversation() {
  try {
    const convKey = localStorage.getItem("convKey");
    if (!convKey) {
      // No convKey in storage -> force logout and redirect to login
      alert("Missing conversation key. Please login again.");
      // clear agent local keys
      try { localStorage.removeItem("role"); localStorage.removeItem("user"); localStorage.removeItem("trainerName"); } catch(e){}
      window.location.href = "login.html";
      return;
    }

    // fetch conversation
    const res = await fetch(`${API_BASE_URL}/conversations?convKey=${encodeURIComponent(convKey)}`, {
      headers: { ...authHeader },
    });

    // If 404 or bad request, backend will send appropriate code
    if (res.status === 404 || res.status === 400) {
      const err = await res.json().catch(()=>({ error: "Conversation not found" }));
      console.warn("Agent conversation fetch failed:", err);
      alert("This conversation is no longer active. Please contact your trainer.");
      // clear keys and redirect
      try { localStorage.removeItem("convKey"); localStorage.removeItem("role"); localStorage.removeItem("user"); localStorage.removeItem("trainerName"); } catch(e){}
      window.location.href = "login.html";
      return;
    }

    const conv = await res.json();
    if (!res.ok) {
      console.warn("Unexpected response loading conversation:", conv);
      alert("This conversation is no longer active. Please contact your trainer.");
      try { localStorage.removeItem("convKey"); localStorage.removeItem("role"); localStorage.removeItem("user"); localStorage.removeItem("trainerName"); } catch(e){}
      window.location.href = "login.html";
      return;
    }

    // If conversation ended -> redirect (Option B chosen)
    if (conv.ended) {
      alert("This conversation is no longer active. Please contact your trainer.");
      try { localStorage.removeItem("convKey"); localStorage.removeItem("role"); localStorage.removeItem("user"); localStorage.removeItem("trainerName"); } catch(e){}
      window.location.href = "login.html";
      return;
    }

    // At this point, conversation is valid and active; auto-open
    openConversation(conv);
  } catch (err) {
    console.error("loadAgentConversation error:", err);
    alert("This conversation is no longer active. Please contact your trainer.");
    try { localStorage.removeItem("convKey"); localStorage.removeItem("role"); localStorage.removeItem("user"); localStorage.removeItem("trainerName"); } catch(e){}
    window.location.href = "login.html";
  }
}

// ---------- Render conversation lists ----------
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

// ---------- Create conversation ----------
async function createConversation(trainerName, associateName) {
  try {
    const res = await fetch(`${API_BASE_URL}/conversations`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeader },
      body: JSON.stringify({ trainerName, associateName }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to create conversation");
    alert("Conversation created: " + data.convKey);
    loadConversations();
  } catch (err) {
    alert("Error creating conversation: " + err.message);
  }
}

// ---------- Open conversation (UI + SSE) ----------
async function openConversation(conv) {
  // close previous SSE
  if (currentEventSource) {
    try { currentEventSource.close(); } catch(e){}
    currentEventSource = null;
  }

  currentConvKey = conv.conv_key;
  seenIds = new Set();

  // Compact header as requested: "Trainer ↔ Associate  |  Key: XXXX"
  chatContent.innerHTML = `
    <div id="chatContainer" style="display:flex;flex-direction:column;height:80vh;width:100%;background:#f9fafb;border-radius:10px;border:1px solid #e2e8f0;overflow:hidden;">
      <div id="chatHeader" style="background:#2563eb;color:white;padding:0.75rem;text-align:center;font-weight:600;">
        ${escapeHtml(conv.trainer_name)} ↔ ${escapeHtml(conv.associate_name)} &nbsp; | &nbsp; Key: ${escapeHtml(conv.conv_key)}
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

  // load history (normal GET)
  await loadMessages(conv.conv_key);

  // mark as read (server updates unread table)
  await markConversationRead(conv.conv_key);

  // subscribe SSE live
  subscribeToMessages(conv.conv_key);

  // send handler
  async function handleSend() {
    const text = input.value.trim();
    if (!text) return;
    try {
      const newMsg = await sendMessage(conv.conv_key, user.name, role, text);
      if (!newMsg || !newMsg.id) {
        // optimistic render
        renderMessage(container, {
          id: `tmp-${Date.now()}`,
          sender_name: user.name,
          role,
          text,
          timestamp: new Date().toISOString()
        }, { scroll: true });
      } else {
        seenIds.add(String(newMsg.id));
        renderMessage(container, newMsg, { scroll: true });
      }
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

// ---------- Load messages (normal GET) ----------
async function loadMessages(convKey) {
  try {
    const res = await fetch(`${API_BASE_URL}/messages?convKey=${encodeURIComponent(convKey)}`, {
      headers: { ...authHeader },
    });
    const rows = await res.json();
    if (!res.ok) throw new Error(rows.error || "Failed to load messages");

    const container = document.getElementById("messages");
    if (!container) return;
    container.innerHTML = "";
    seenIds.clear();

    rows.forEach(r => {
      renderMessage(container, r, { scroll: false });
      if (r.id) seenIds.add(String(r.id));
    });
    container.scrollTop = container.scrollHeight;
  } catch (err) {
    console.error("Error loading messages:", err);
  }
}

// ---------- Send message (POST) ----------
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

// ---------- Render message ----------
function renderMessage(container, msg, opts = { scroll: true }) {
  const sender = msg.sender_name || msg.senderName || msg.sender || "Unknown";
  const senderRole = msg.role || msg.senderRole || "unknown";
  const isSelf = (sender === user.name) && (senderRole === role);

  const wrapper = document.createElement("div");
  wrapper.className = `message ${isSelf ? "self" : "other"}`;
  if (msg.id) wrapper.dataset.id = msg.id;

  const bubble = document.createElement("div");
  bubble.className = "bubble";
  bubble.innerHTML = `
    <span class="sender">${escapeHtml(sender)}</span>
    <div>${escapeHtml(msg.text || "")}</div>
    <span class="timestamp">
      ${new Date(msg.timestamp || Date.now()).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
    </span>
  `;

  wrapper.appendChild(bubble);
  container.appendChild(wrapper);
  if (opts.scroll) container.scrollTop = container.scrollHeight;
}



// escape
function escapeHtml(s) {
  return String(s || "").replace(/[&<>"']/g, (m) => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[m]));
}

// ---------- Mark conversation read ----------
async function markConversationRead(convKey) {
  try {
    const res = await fetch(`${API_BASE_URL}/messageRead`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeader },
      body: JSON.stringify({ convKey, userName: user.name }),
    });
    if (res.ok) {
      // refresh badges for trainers/admins
      if (role !== "agent") await loadConversations();
    }
  } catch (err) {
    console.error("markConversationRead error:", err);
  }
}

// ---------- SSE subscribe ----------
function subscribeToMessages(convKey) {
  // close previous
  if (currentEventSource) {
    try { currentEventSource.close(); } catch(e){}
    currentEventSource = null;
  }

  const container = document.getElementById("messages");
  if (!container) return;

  // EventSource for server-sent events
  const es = new EventSource(`${API_BASE_URL}/messages?convKey=${encodeURIComponent(convKey)}`);
  currentEventSource = es;

  es.onmessage = async (ev) => {
    try {
      const payload = JSON.parse(ev.data);

      if (payload.type === "init" && Array.isArray(payload.messages)) {
        container.innerHTML = "";
        seenIds.clear();
        payload.messages.forEach(m => {
          renderMessage(container, m, { scroll: false });
          if (m.id) seenIds.add(String(m.id));
        });
        container.scrollTop = container.scrollHeight;
        return;
      }

      if (payload.type === "new" && Array.isArray(payload.messages)) {
        const shouldScroll = isNearBottom(container, 150);
        for (const m of payload.messages) {
          if (!m.id || !seenIds.has(String(m.id))) {
            if (m.id) seenIds.add(String(m.id));
            renderMessage(container, m, { scroll: false });

            if (m.sender_name !== user.name) {
              playNotification();
              if (document.hidden && "Notification" in window && Notification.permission === "granted") {
                new Notification(m.sender_name, { body: m.text.length > 120 ? m.text.slice(0,120)+"..." : m.text });
              }
            }
          }
        }
        if (shouldScroll) container.scrollTop = container.scrollHeight;
        // refresh conversation badges only for non-agents
        if (role !== "agent") loadConversations().catch(()=>{});
        return;
      }
    } catch (err) {
      console.error("SSE parse error:", err, ev.data);
    }
  };

  es.onerror = (err) => {
    console.warn("SSE disconnected. reconnecting in 3s", err);
    try { es.close(); } catch(e){}
    setTimeout(() => subscribeToMessages(convKey), 3000);
  };
}

// ---------- Helpers ----------
function isNearBottom(el, threshold = 120) {
  return el.scrollHeight - (el.scrollTop + el.clientHeight) < threshold;
}

// Initial load
loadConversations();
