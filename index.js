const API_BASE_URL = "https://mock-chat-backend.vercel.app/api"; // update to your deployed backend
const role = localStorage.getItem("role");
const user = JSON.parse(localStorage.getItem("user"));
const leftPane = document.getElementById("leftPane");
const rightPane = document.getElementById("rightPane");
const conversationList = document.getElementById("conversationList");
const convDetails = document.getElementById("convDetails");
const chatMessages = document.getElementById("chatMessages");
const chatInputArea = document.getElementById("chatInputArea");
const chatInput = document.getElementById("chatInput");
const sendBtn = document.getElementById("sendBtn");

let activeConv = null;

// === Role-based layout ===
if (role === "agent") {
  leftPane.classList.add("hidden");
  rightPane.classList.add("hidden");
}

// === Logout ===
document.getElementById("logoutBtn").addEventListener("click", () => {
  localStorage.clear();
  window.location.href = "login.html";
});

// === Fetch conversations for trainer/admin ===
async function loadConversations() {
  if (role === "trainer" || role === "admin") {
    const res = await fetch(`${API_BASE_URL}/conversations?trainer=${encodeURIComponent(user.name)}`);
    const data = await res.json();

    conversationList.innerHTML = "";
    if (!res.ok || !data.length) {
      conversationList.innerHTML = "<p>No conversations found.</p>";
      return;
    }

    data.forEach(conv => {
      const item = document.createElement("div");
      item.className = "conversation-item";
      item.dataset.key = conv.conv_key;
      item.innerHTML = `<strong>${conv.associate_name}</strong><br><small>${new Date(conv.start_time).toLocaleString()}</small>`;
      item.addEventListener("click", () => selectConversation(conv));
      conversationList.appendChild(item);
    });
  }
}

// === Select conversation ===
async function selectConversation(conv) {
  document.querySelectorAll(".conversation-item").forEach(i => i.classList.remove("active"));
  const active = document.querySelector(`[data-key="${conv.conv_key}"]`);
  active.classList.add("active");
  activeConv = conv;

  chatMessages.innerHTML = `<p style="color:#64748b;">Loading messages...</p>`;
  chatInputArea.classList.remove("hidden");

  // Load conversation details
  convDetails.innerHTML = `
    <p><strong>Key:</strong> ${conv.conv_key}</p>
    <p><strong>Trainer:</strong> ${conv.trainer_name}</p>
    <p><strong>Agent:</strong> ${conv.associate_name}</p>
    <p><strong>Started:</strong> ${new Date(conv.start_time).toLocaleString()}</p>
    <p><strong>Status:</strong> ${conv.ended ? "Ended" : "Active"}</p>
  `;

  await loadMessages(conv.conv_key);
}

// === Load messages ===
async function loadMessages(convKey) {
  const res = await fetch(`${API_BASE_URL}/messages?convKey=${convKey}`);
  const data = await res.json();
  if (!res.ok) return console.error("Failed to load messages:", data);

  renderMessages(data);
}

// === Render messages ===
function renderMessages(messages) {
  chatMessages.innerHTML = "";
  messages.forEach(msg => {
    const msgDiv = document.createElement("div");
    msgDiv.style.margin = "0.5rem 0";
    msgDiv.style.textAlign = msg.role === role ? "right" : "left";
    msgDiv.innerHTML = `
      <div style="display:inline-block; background:${msg.role === role ? "#2563eb" : "#e2e8f0"}; 
                  color:${msg.role === role ? "white" : "#1e293b"}; 
                  padding:0.5rem 0.75rem; border-radius:0.75rem; max-width:70%;">
        <strong>${msg.sender}</strong><br>${msg.text}
      </div>
    `;
    chatMessages.appendChild(msgDiv);
  });

  chatMessages.scrollTop = chatMessages.scrollHeight;
}

// === Send message ===
sendBtn.addEventListener("click", async () => {
  const text = chatInput.value.trim();
  if (!text || !activeConv) return;

  const payload = {
    convKey: activeConv.conv_key,
    sender: user.name,
    role,
    text,
  };

  const res = await fetch(`${API_BASE_URL}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const data = await res.json();
  if (res.ok) {
    chatInput.value = "";
    await loadMessages(activeConv.conv_key);
  } else {
    console.error("Error sending message:", data);
  }
});

// === Optional Auto Refresh (every 5 sec) ===
setInterval(() => {
  if (activeConv) loadMessages(activeConv.conv_key);
}, 5000);

loadConversations();
