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

// Send message
async function sendMessage(convKey, senderName, senderRole, text) {
  const response = await fetch(`${API_BASE_URL}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeader },
    body: JSON.stringify({ convKey, senderName, senderRole, text }),
  });

  return await response.json();
}

// Render single message
function renderMessage(container, msg) {
  const currentUser = JSON.parse(localStorage.getItem("user"));
  const currentRole = localStorage.getItem("role");

  const sender = msg.sender_name || msg.senderName;
  const isSelf = sender === currentUser?.name && msg.role === currentRole;

  const msgDiv = document.createElement("div");
  msgDiv.className = `message ${isSelf ? "self" : "other"}`;
  msgDiv.innerHTML = `
    <strong style="font-size:0.8rem;opacity:0.8;">${sender}</strong><br>
    ${msg.text}
    <div style="font-size:0.7rem;opacity:0.7;margin-top:0.25rem;text-align:${isSelf ? "right" : "left"};">
      ${new Date(msg.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
    </div>
  `;

  container.appendChild(msgDiv);
}

// Subscribe to SSE
function subscribeToMessages(convKey) {
  const evtSource = new EventSource(`${API_BASE_URL}/messages?convKey=${convKey}`);
  activeStream = evtSource;

  evtSource.onmessage = (event) => {
    const data = JSON.parse(event.data);
    const container = document.getElementById("messages");
    if (!container) return;

    const renderUnseen = (msgs) => {
      msgs.forEach((msg) => {
        if (!seenMessages.has(msg.id)) {
          seenMessages.add(msg.id);
          renderMessage(container, msg);
        }
      });
      container.scrollTop = container.scrollHeight;
    };

    if (data.type === "init") renderUnseen(data.messages);
    if (data.type === "new") renderUnseen(data.messages);
  };

  evtSource.onerror = () => {
    evtSource.close();
    setTimeout(() => subscribeToMessages(convKey), 2000);
  };
}
