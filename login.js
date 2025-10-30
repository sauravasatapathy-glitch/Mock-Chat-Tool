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

// === Handle Login ===
loginBtn.addEventListener("click", async () => {
  errorDiv.textContent = "";

  try {
    if (isAgentMode) {
      // 🔹 Agent login (no password)
      const convKey = convKeyInput.value.trim();
      if (!convKey) {
        errorDiv.textContent = "Conversation Key required.";
        return;
      }

      localStorage.setItem("role", "agent");
      localStorage.setItem("convKey", convKey);
      localStorage.setItem("user", JSON.stringify({ name: "Agent User" }));

      window.location.href = "index.html";
      return;
    }

    // 🔹 Trainer/Admin login
    const email = emailInput.value.trim();
    const password = passwordInput.value.trim();
    if (!email || !password) {
      errorDiv.textContent = "Please enter email and password.";
      return;
    }

    // --- Fetch API with CORS-safe query param ---
    const response = await fetch(`${API_BASE_URL}/auth?path=login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    const data = await response.json();

    if (!response.ok) {
      errorDiv.textContent = data.error || "Login failed.";
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
    errorDiv.textContent = "Failed to fetch. Please try again.";
  }
});
