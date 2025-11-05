// index.js (replace existing frontend index.js)
import { getUserFromToken, getAuthHeader } from "./authHelper.js";
import { checkAuth, logout } from "./authGuard.js";

const API_BASE_URL = "https://mock-chat-backend.vercel.app/api"; // backend

// DOM
const leftPane = document.getElementById("left-pane");
const rightPane = document.getElementById("right-pane");
const chatContent = document.getElementById("chatContent");
const newChatBtn = document.getElementById("newChatBtn");

const session = checkAuth(["admin", "trainer", "agent"]);
if (!session) {
  window.location.href = "login.html";
  throw new Error("Unauthorized");
}
const { user, token, role } = session;
const authHeader = getAuthHeader();

// hide right pane for agents
if (role === "agent") rightPane.style.display = "none";
else {
  newChatBtn.addEventListener("click", () => {
    const associate = prompt("Enter associate name:");
    if (associate) createConversation(user.name, associate);
  });
}

// Logout button
const logoutBtn = document.createElement("button");
logoutBtn.textContent = "Logout";
logoutBtn.style.cssText = "position:fixed;top:10px;right:10px;padding:0.4rem 0.8rem;background:#dc2626;color:white;border:none;border-radius:0.5rem;cursor:pointer;z-index:1000;";
logoutBtn.onclick = logout;
document.body.appendChild(logoutBtn);

// global SSE and seen tracking
let currentEventSource = null;
let currentConvKey = null;
let seenIds = new Set(); // ids displayed in UI for current conversation

// load conversations initially
loadConversations();

// ---------- Conversations ----------
async function loadConversations() {
  try {
    const res = await fetch(`${API_BASE_URL}/conversations?all=true`, {
      headers: { ...authHeader },
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to load conversations");

    // render both lists (myConversations + activeConversations)
    const myConvs = data.filter(c => (role === "agent" ? c.associate_name === user.name : c.trainer_name === user.name));
    const activeConvs = data.filter(c => !c.ended);

    renderList("myConversations", myConvs);
    renderList("activeConversations", activeConvs);
  } catch (err) {
    console.error("Error loading conversations:", err);
  }
}

function renderList(id, items) {
  const ul = document.getElementById(id);
  ul.innerHTML = "";
  if (!items.length) {
    ul.innerHTML = "<li>No conversations</li>";
    return;
  }

  items.forEach(c => {
    const li = document.createElement("li");
    li.style.display = "flex";
    li.style.justifyContent = "space-between";
    li.style.alignItems = "center";
    li.style.gap = "8px";

    const left = document.createElement("div");
    left.style.flex = "1";
    left.textContent = `${c.trainer_name} ↔ ${c.associate_name} (${c.conv_key})`;

    // bold if unread
    if (c.unread_count && c.unread_count > 0) {
      left.style.fontWeight = "700";
    }

    const badge = document.createElement("div");
    badge.className = "conv-badge";
    badge.style.display = c.unread_count && c.unread_count > 0 ? "inline-block" : "none";
    badge.textContent = c.unread_count;

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
  // close any existing SSE
  if (currentEventSource) {
    try { currentEventSource.close(); } catch (e) {}
    currentEventSource = null;
  }
  currentConvKey = conv.conv_key;
  seenIds = new Set();

  chatContent.innerHTML = `
    <div id="chatContainer" style="display:flex;flex-direction:column;height:80vh;width:100%;background:#f9fafb;border-radius:10px;border:1px solid #e2e8f0;overflow:hidden;">
      <div id="chatHeader" style="background:#2563eb;color:white;padding:0.75rem;text-align:center;font-weight:600;">
        ${conv.trainer_name} ↔ ${conv.associate_name}
        <div style="font-size:0.8rem;opacity:0.9">Conversation Key: ${conv.conv_key}</div>
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

  // After initial load, mark all as read for this user
  await markConversationRead(conv.conv_key);

  // subscribe SSE
  subscribeToMessages(conv.conv_key);

  // send handler (backend returns inserted message row)
  async function handleSend() {
    const text = input.value.trim();
    if (!text) return;
    try {
      const newMsg = await sendMessage(conv.conv_key, user.name, role, text);
      // add to seen so SSE doesn't re-render it
      seenIds.add(String(newMsg.id));
      // render that message using server-returned row
      renderMessage(container, newMsg, { scroll: true });
      input.value = "";
      // mark read (if message from me it's read by me)
      await markConversationRead(conv.conv_key);
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

// ---------- Load messages (normal fetch) ----------
async function loadMessages(convKey) {
  try {
    const res = await fetch(`${API_BASE_URL}/messages?convKey=${convKey}`, {
      headers: { ...authHeader },
    });
    const rows = await res.json();
    if (!res.ok) throw new Error(rows.error || "Failed to load");

    const container = document.getElementById("messages");
    container.innerHTML = "";
    seenIds.clear();
    rows.forEach(r => {
      renderMessage(container, r, { scroll: false });
      seenIds.add(String(r.id));
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
  return data; // inserted row with id
}

// ---------- Render message ----------
function renderMessage(container, msg, opts = { scroll: true }) {
  const currentUser = user;
  const currentRole = role;
  const sender = msg.sender_name || msg.senderName || msg.sender || "Unknown";
  const senderRole = msg.role || msg.senderRole || "unknown";
  const isSelf = (sender === currentUser?.name) && (senderRole === currentRole);

  // Build DOM
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
  bubble.innerHTML = `<strong style="font-size:0.85rem;opacity:0.85">${escapeHtml(sender)}</strong>
    <div style="margin-top:0.25rem;white-space:pre-wrap;">${escapeHtml(msg.text || "")}</div>
    <div style="font-size:0.7rem;opacity:0.65;margin-top:0.35rem;text-align:${isSelf ? "right":"left"}">
      ${new Date(msg.timestamp || Date.now()).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}
    </div>`;

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
    // POST with convKey + userName (server will insert new rows)
    const res = await fetch(`${API_BASE_URL}/messageRead`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeader },
      body: JSON.stringify({ convKey, userName: user.name }),
    });
    const data = await res.json();
    if (res.ok) {
      // refresh conversation badges
      loadConversations();
    }
  } catch (err) {
    console.error("markConversationRead error:", err);
  }
}

// ---------- SSE subscription ----------
function subscribeToMessages(convKey) {
  // close previous stream
  if (currentEventSource) {
    try { currentEventSource.close(); } catch (e) {}
    currentEventSource = null;
  }

  const container = document.getElementById("messages");
  if (!container) return;

  const es = new EventSource(`${API_BASE_URL}/messages?convKey=${convKey}`);
  currentEventSource = es;

  es.onmessage = async (ev) => {
    try {
      const payload = JSON.parse(ev.data);

      if (payload.type === "init" && Array.isArray(payload.messages)) {
        container.innerHTML = "";
        seenIds.clear();
        payload.messages.forEach(m => {
          renderMessage(container, m, { scroll: false });
          seenIds.add(String(m.id));
        });
        container.scrollTop = container.scrollHeight;
        return;
      }

      if (payload.type === "new" && Array.isArray(payload.messages)) {
        // only render messages we haven't seen
        const shouldScroll = isNearBottom(container, 200);
        for (const m of payload.messages) {
          if (!seenIds.has(String(m.id))) {
            seenIds.add(String(m.id));
            renderMessage(container, m, { scroll: false });

            // If message is by someone else and the window is not hidden -> mark read right away (and refresh badges)
            if ((m.sender_name !== user.name) && (document.hidden === false)) {
              await markConversationRead(convKey);
            }

            // Desktop notification if tab hidden and not from me
            if ((m.sender_name !== user.name) && document.hidden) {
              playNotification();
              if (Notification && Notification.permission === "granted") {
                new Notification(m.sender_name, { body: m.text.length > 120 ? m.text.slice(0,120)+"..." : m.text });
              }
            }
          }
        }
        if (shouldScroll) container.scrollTop = container.scrollHeight;
        return;
      }

      if (payload.type === "typing" && Array.isArray(payload.typing)) {
        // optional: show typing indicator
        // showTypingIndicator(payload.typing)
      }
    } catch (err) {
      console.error("SSE parse error:", err, ev.data);
    }
  };

  es.onerror = (err) => {
    console.warn("SSE disconnected, reconnecting in 3s", err);
    try { es.close(); } catch (e) {}
    setTimeout(() => subscribeToMessages(convKey), 3000);
  };
}

// ---------- small helpers ----------
function isNearBottom(el, threshold = 120) {
  return el.scrollHeight - (el.scrollTop + el.clientHeight) < threshold;
}

// tiny beep
const notifAudio = (() => {
  const a = new Audio();
  a.src = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQgAAAAA";
  return a;
})();
function playNotification() { try { notifAudio.play().catch(()=>{}); } catch(e){} }

// Request notification permission on load if not denied
if ("Notification" in window && Notification.permission === "default") {
  Notification.requestPermission().catch(()=>{});
}
