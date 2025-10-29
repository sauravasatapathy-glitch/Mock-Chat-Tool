const API_BASE_URL = "https://mock-chat-backend.vercel.app/api";
const token = localStorage.getItem("token");
const user = JSON.parse(localStorage.getItem("user") || "{}");
const tableBody = document.getElementById("convTableBody");
const createConvBtn = document.getElementById("createConvBtn");
const associateNameInput = document.getElementById("associateName");
const logoutBtn = document.getElementById("logoutBtn");

// ✅ Redirect if not logged in or not a trainer/admin
if (!token || (user.role !== "trainer" && user.role !== "admin")) {
  window.location.href = "login.html";
}

// 🧹 Logout
logoutBtn.addEventListener("click", () => {
  localStorage.clear();
  window.location.href = "login.html";
});

// 🆕 Create conversation
createConvBtn.addEventListener("click", async () => {
  const associateName = associateNameInput.value.trim();
  if (!associateName) return alert("Please enter an agent name.");

  const res = await fetch(`${API_BASE_URL}/conversation`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`,
    },
    body: JSON.stringify({ associateName }),
  });

  const data = await res.json();
  if (res.ok) {
    alert(`Conversation created! Key: ${data.convKey}`);
    loadConversations();
    associateNameInput.value = "";
  } else {
    alert("Error: " + (data.error || "Failed to create conversation"));
  }
});

// 📋 Load all conversations (for now, show last 20)
async function loadConversations() {
  const res = await fetch(`${API_BASE_URL}/conversations`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  const data = await res.json();
  tableBody.innerHTML = "";

  if (res.ok && Array.isArray(data)) {
    data.forEach((conv) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td><b>${conv.conv_key}</b></td>
        <td>${conv.trainer_name}</td>
        <td>${conv.associate_name}</td>
        <td>${new Date(conv.start_time).toLocaleString()}</td>
        <td><button onclick="navigator.clipboard.writeText('${conv.conv_key}')">Copy Key</button></td>
      `;
      tableBody.appendChild(tr);
    });
  } else {
    tableBody.innerHTML = `<tr><td colspan="5">No conversations found.</td></tr>`;
  }
}

// Load on page start
loadConversations();
