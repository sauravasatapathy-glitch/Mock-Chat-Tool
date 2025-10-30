import { getUserFromToken, getAuthHeader } from "./authHelper.js";
import { checkAuth, logout } from "./authGuard.js";

const API_BASE_URL = "https://mock-chat-backend.vercel.app/api"; // ✅ your backend URL

// === DOM Elements ===
const leftPane = document.getElementById("left-pane");
const rightPane = document.getElementById("right-pane");
const chatContent = document.getElementById("chatContent");
const newChatBtn = document.getElementById("newChatBtn");

// === Auth Check ===
const session = checkAuth(["admin", "trainer", "agent"]);
if (!session) {
  // Instead of illegal return, just stop further code
  window.location.href = "login.html";
} else {
  const { user, token, role } = session;
  const authHeader = getAuthHeader();

  // === Role-based Layout ===
  if (role === "agent") {
    rightPane.style.display = "none";
  } else {
    newChatBtn.addEventListener("click", () => {
      const associate = prompt("Enter associate name:");
      if (associate) createConversation(user.name, associate);
    });
  }

  // === Load Conversations on Startup ===
  loadConversations();

  // === Logout Button ===
  const logoutBtn = document.createElement("button");
  logoutBtn.textContent = "Logout";
  logoutBtn.style.cssText =
    "position:fixed;top:10px;right:10px;margin:0.5rem;padding:0.4rem 0.8rem;background:#dc2626;color:white;border:none;border-radius:0.5rem;cursor:pointer;z-index:1000;";
  logoutBtn.onclick = () => {
    logout(); // clears localStorage + redirects
  };
  document.body.appendChild(logoutBtn);

  // ========================================================
  // === FUNCTIONS ==========================================
  // ========================================================

  // 🟦 Fetch all conversations
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

  // 🟦 Render lists
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

  // 🟦 Create new conversation
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

  // 🟦 Open conversation
  async function openConversation(conv) {
    chatContent.innerHTML = `
      <h3>${conv.trainer_name} ↔ ${conv.associate_name}</h3>
      <p><b>Conversation Key:</b> ${conv.conv_key}</p>
      <div id="messages" data-conv-key="${conv.conv_key}" 
           style="flex:1;overflow-y:auto;margin-top:1rem;padding:0.5rem;border:1px solid #ddd;border-radius:0.5rem;background:#fff;height:300px;"></div>
      <div style="display:flex;margin-top:1rem;">
        <input id="chatInput" placeholder="Type a message..." 
               style="flex:1;padding:0.6rem;border:1px solid #ccc;border-radius:0.5rem 0 0 0.5rem;" />
        <button id="sendBtn" 
                style="padding:0.6rem 1rem;background:#2563eb;color:white;border:none;border-radius:0 0.5rem 0.5rem 0;cursor:pointer;">
          Send
        </button>
      </div>
    `;

    await loadMessages(conv.conv_key);

    document.getElementById("sendBtn").addEventListener("click", async () => {
      const input = document.getElementById("chatInput");
      const text = input.value.trim();
      if (!text) return;

      await sendMessage(conv.conv_key, user.name, role, text);
      input.value = "";
      await loadMessages(conv.conv_key);
    });
  }
// 🟩 Setup live updates using SSE
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

    const msgDiv = document.createElement("div");
    msgDiv.style.margin = "0.5rem 0";
    msgDiv.style.textAlign = msg.role === role ? "right" : "left";
    msgDiv.innerHTML = `
      <div style="display:inline-block;background:${
        msg.role === role ? "#2563eb" : "#e2e8f0"
      };color:${msg.role === role ? "white" : "#1e293b"};padding:0.5rem 0.75rem;
                border-radius:0.75rem;max-width:70%;">
        <strong>${msg.sender_name}</strong><br>${msg.text}
      </div>
    `;
    messagesBox.appendChild(msgDiv);
    messagesBox.scrollTop = messagesBox.scrollHeight;
  };

  eventSource.onerror = () => {
    console.warn("🔌 SSE disconnected. Retrying in 5s...");
    setTimeout(() => subscribeToMessages(convKey), 5000);
  };
}

  // 🟦 Fetch messages
  async function loadMessages(convKey) {
    try {
      const res = await fetch(`${API_BASE_URL}/messages?convKey=${convKey}`, {
        headers: { ...authHeader },
      });
      const messages = await res.json();
      if (!res.ok) throw new Error(messages.error || "Failed to load messages");

      const container = document.getElementById("messages");
      container.innerHTML = "";

      messages.forEach((msg) => {
        const msgDiv = document.createElement("div");
        msgDiv.style.margin = "0.5rem 0";
        msgDiv.style.textAlign = msg.role === role ? "right" : "left";
        msgDiv.innerHTML = `
          <div style="display:inline-block;background:${
            msg.role === role ? "#2563eb" : "#e2e8f0"
          };color:${msg.role === role ? "white" : "#1e293b"};
          padding:0.5rem 0.75rem;border-radius:0.75rem;max-width:70%;">
            <strong>${msg.sender_name || msg.sender}</strong><br>${msg.text}
          </div>
        `;
        container.appendChild(msgDiv);
      });

      container.scrollTop = container.scrollHeight;
    } catch (err) {
      console.error("Error loading messages:", err);
    }
  }

  // 🟦 Send message
  async function sendMessage(convKey, senderName, senderRole, message) {
    try {
      const res = await fetch(`${API_BASE_URL}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeader },
        body: JSON.stringify({
        convKey: convKey,
        senderName: username,
        senderRole: role,
        text: text
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to send message");
    } catch (err) {
      console.error("Send message error:", err);
    }
  }

  // 🟦 Auto-refresh every 5s
  /*setInterval(() => {
    const messagesBox = document.getElementById("messages");
    if (messagesBox && messagesBox.dataset.convKey) {
      loadMessages(messagesBox.dataset.convKey);
    }
  }, 5000);*/
}
