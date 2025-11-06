// login.js
const API_BASE_URL = "https://mock-chat-backend.vercel.app/api";

const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const convKeyInput = document.getElementById("convKey");
const loginBtn = document.getElementById("loginBtn");
const toggleMode = document.getElementById("toggleMode");
const loginTitle = document.getElementById("loginTitle");
const errorDiv = document.getElementById("error");
const trainerAdminFields = document.getElementById("trainerAdminFields");
const agentFields = document.getElementById("agentFields");

let isAgentMode = false;

// Prevent logged-in users from accessing login page
const existingUser = localStorage.getItem("user");
if (existingUser) {
  // If role exists and is agent/trainer/admin, go to index
  window.location.href = "index.html";
}

// === Toggle Login Mode ===
toggleMode.addEventListener("click", () => {
  isAgentMode = !isAgentMode;

  if (isAgentMode) {
    loginTitle.textContent = "Agent Login";
    toggleMode.textContent = "Login as Trainer / Admin";
    trainerAdminFields.style.display = "none";
    agentFields.style.display = "block";
  } else {
    loginTitle.textContent = "Trainer / Admin Login";
    toggleMode.textContent = "Login as Agent";
    trainerAdminFields.style.display = "block";
    agentFields.style.display = "none";
  }
});

// Small helper to show error
function showError(msg) {
  errorDiv.textContent = msg || "";
}

// === Handle Login ===
loginBtn.addEventListener("click", async () => {
  showError("");

  try {
    if (isAgentMode) {
      // 🔹 Agent login (no password) - fetch associate name from backend
      const convKey = convKeyInput.value.trim();
      if (!convKey) {
        showError("Conversation Key required.");
        return;
      }

      const resp = await fetch(`${API_BASE_URL}/agent-login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ convKey }),
      });

      const data = await resp.json();
      if (!resp.ok) {
        showError(data.error || "Invalid conversation key");
        return;
      }

      // store in same shape your app expects
      // keep token absent for agent; authGuard should allow agent based on localStorage role/user
      localStorage.setItem("role", "agent");
      localStorage.setItem("convKey", data.convKey);
      // data.agentName should be the associate name — fallback to empty name if backend not providing
      localStorage.setItem("user", JSON.stringify({ name: data.agentName || data.associateName || "Agent" }));
      if (data.trainerName) localStorage.setItem("trainerName", data.trainerName);

      // redirect to dashboard
      window.location.href = "index.html";
      return;
    }

    // 🔹 Trainer/Admin login
    const email = emailInput.value.trim();
    const password = passwordInput.value.trim();
    if (!email || !password) {
      showError("Please enter email and password.");
      return;
    }

    // --- Fetch API login ---
    const response = await fetch(`${API_BASE_URL}/auth?path=login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    const data = await response.json();

    if (!response.ok) {
      showError(data.error || "Login failed.");
      return;
    }

    // --- Save user info locally ---
    localStorage.setItem("token", data.token);
    localStorage.setItem("user", JSON.stringify(data.user));
    localStorage.setItem("role", data.user.role);

    // --- Redirect ---
    window.location.href = "index.html";
  } catch (err) {
    console.error("Login error:", err);
    showError("Failed to fetch. Please try again.");
  }
});
