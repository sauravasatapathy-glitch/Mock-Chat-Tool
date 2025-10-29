const API_BASE_URL = "http://localhost:5000/api"; // adjust if needed
const role = localStorage.getItem("role");
const user = JSON.parse(localStorage.getItem("user"));
const leftPane = document.getElementById("leftPane");
const rightPane = document.getElementById("rightPane");
const conversationList = document.getElementById("conversationList");
const convDetails = document.getElementById("convDetails");
const chatMessages = document.getElementById("chatMessages");
const chatInputArea = document.getElementById("chatInputArea");

// === Role-based visibility ===
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
function selectConversation(conv) {
  document.querySelectorAll(".conversation-item").forEach(i => i.classList.remove("active"));
  const active = document.querySelector(`[data-key="${conv.conv_key}"]`);
  active.classList.add("active");

  chatMessages.textContent = `Chat with ${conv.associate_name}`;
  convDetails.innerHTML = `
    <p><strong>Key:</strong> ${conv.conv_key}</p>
    <p><strong>Trainer:</strong> ${conv.trainer_name}</p>
    <p><strong>Agent:</strong> ${conv.associate_name}</p>
    <p><strong>Started:</strong> ${new Date(conv.start_time).toLocaleString()}</p>
    <p><strong>Status:</strong> ${conv.ended ? "Ended" : "Active"}</p>
  `;
  chatInputArea.classList.remove("hidden");

  // TODO: Load conversation messages next phase
}

loadConversations();
