// ============================
// index.js (Clean Version)
// ============================

import { getUserFromToken, getAuthHeader } from "./authHelper.js";
import { checkAuth, logout } from "./authGuard.js";

const API_BASE_URL = "https://mock-chat-backend.vercel.app/api"; // ✅ backend URL

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

// === Load conversations on startup ===
loadConversations();


// ========================================================
// === FUNCTIONS ==========================================
// ========================================================

// 🟦 Load all conversations
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

// 🟦 Render conversation lists
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

// 🟦 Create a new conversation
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

// 🟦 Open a specific conversation
async function openConversation(conv) {
  chatContent.innerHTML = `
    <div id="chatHeader" style="
      display:flex;
      flex-direction:column;
      align-items:center;
      gap:0.3rem;
      padding:0.5rem 0;
    ">
      <h3 style="background:#2563eb;color:white;padding:0.4rem 1rem;border-radius:0.5rem;">
        ${conv.trainer_name} ↔ ${conv.associate_name}
      </h3>
      <p style="font-weight:600;">Conversation Key: <span style="color:#2563eb;">${conv.conv_key}</span></p>
    </div>

    <div id="messages" data-conv-key="${conv.conv_key}" style="
      display:flex;
      flex-direction:column;
      gap:0.4rem;
      align-items:flex-start;
      justify-content:flex-end;
      overflow-y:auto;
      margin-top:1rem;
      padding:1rem;
      border:1px solid #e2e8f0;
      border-radius:10px;
      background:#fff;
      height:60vh;
      width:100%;
      box-shadow:0 1px 2px rgba(0,0,0,0.05);
      scroll-behavior:smooth;
    "></div>

    <div id="chatInputArea" style="
      display:flex;
      align-items:center;
      margin-top:1rem;
      width:100%;
      gap:0.5rem;
    ">
      <textarea id="chatInput" placeholder="Type a message..."
        style="
          flex:1;
          border:1px solid #cbd5e1;
          border-radius:0.5rem;
          padding:0.6rem 0.75rem;
          font-size:0.95rem;
          outline:none;
          height:44px;
          min-height:44px;
          resize:none;
          font-family:inherit;
        "></textarea>
      <button id="sendBtn"
        style="
          background:#2563eb;
          color:white;
          border:none;
          border-radius:0.5rem;
          padding:0.6rem 1.5rem;
          font-size:0.95rem;
          cursor:pointer;
          height:44px;
          flex-shrink:0;
          transition:background 0.2s, transform 0.1s;
        "
        onmouseover="this.style.background='#1e40af'"
        onmouseout="this.style.background='#2563eb'"
        onmousedown="this.style.transform='scale(0.96)'"
        onmouseup="this.style.transform='scale(1)'"
      >Send</button>
    </div>
  `;

  await loadMessages(conv.conv_key);
  subscribeToMessages(conv.conv_key); // 🔌 Live updates

  const input = document.getElementById("chatInput");
  const sendBtn = document.getElementById("sendBtn");

  // === Click Send ===
  sendBtn.addEventListener("click", async () => {
    const text = input.value.trim();
    if (!text) return;

    await sendMessage(conv.conv_key, user.name, role, text);
    input.value = "";
    input.style.height = "44px"; // reset height
  });

  // === Enter to send, Shift+Enter for newline ===
  input.addEventListener("keydown", async (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      const text = input.value.trim();
      if (!text) return;

      await sendMessage(conv.conv_key, user.name, role, text);
      input.value = "";
      input.style.height = "44px";
    } else {
      // Auto expand textarea as user types
      input.style.height = "auto";
      input.style.height = Math.min(input.scrollHeight, 120) + "px"; // limit to 120px
    }
  });
}



// 🟦 Load messages
async function loadMessages(convKey) {
  try {
    const res = await fetch(`${API_BASE_URL}/messages?convKey=${convKey}`, {
      headers: { ...authHeader },
    });

    const messages = await res.json();
    if (!res.ok) throw new Error(messages.error || "Failed to load messages");

    const container = document.getElementById("messages");
    container.innerHTML = "";

    messages.forEach((msg) => renderMessage(container, msg));
    container.scrollTop = container.scrollHeight;
  } catch (err) {
    console.error("Error loading messages:", err);
  }
}


// 🟦 Send message
async function sendMessage(convKey, senderName, senderRole, text) {
  try {
    const response = await fetch(`${API_BASE_URL}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeader },
      body: JSON.stringify({ convKey, senderName, senderRole, text }),
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Failed to send message");
  } catch (err) {
    console.error("Send message error:", err);
  }
}

// 🟦 Render a single message
function renderMessage(container, msg) {
  const isSelf = msg.role === role;
  const msgDiv = document.createElement("div");
  msgDiv.classList.add("message");
  msgDiv.style.alignSelf = isSelf ? "flex-end" : "flex-start";
  msgDiv.style.background = isSelf ? "#2563eb" : "#e2e8f0";
  msgDiv.style.color = isSelf ? "#fff" : "#1e293b";
  msgDiv.style.padding = "0.6rem 0.9rem";
  msgDiv.style.borderRadius = "16px";
  msgDiv.style.maxWidth = "70%";
  msgDiv.style.wordWrap = "break-word";
  msgDiv.style.lineHeight = "1.4";
  msgDiv.style.boxShadow = "0 1px 2px rgba(0,0,0,0.05)";
  msgDiv.style.animation = "bounceIn 0.25s ease-out";
  msgDiv.innerHTML = `<strong>${msg.sender_name || msg.sender}</strong><br>${msg.text}`;

  container.appendChild(msgDiv);
  // Smooth scroll into view
  msgDiv.scrollIntoView({ behavior: "smooth", block: "end" });
}

// 🟦 Subscribe to live updates (SSE)
function subscribeToMessages(convKey) {
  if (window.eventSource) {
    window.eventSource.close();
  }

  const url = `${API_BASE_URL}/stream?convKey=${convKey}`;
  const eventSource = new EventSource(url);
  window.eventSource = eventSource;

  eventSource.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    const messagesBox = document.getElementById("messages");
    if (!messagesBox) return;

    renderMessage(messagesBox, msg);
    messagesBox.scrollTop = messagesBox.scrollHeight;
  };

  eventSource.onerror = () => {
    console.warn("🔌 SSE disconnected. Retrying in 5s...");
    setTimeout(() => subscribeToMessages(convKey), 5000);
  };
}
