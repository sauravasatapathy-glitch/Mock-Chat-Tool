// login.js
const API_BASE_URL = "https://mock-chat-backend.vercel.app/api";

const emailEl = document.getElementById("email");
const passwordEl = document.getElementById("password");
const convKeyEl = document.getElementById("convKey");
const loginBtn = document.getElementById("loginBtn");
const toggleMode = document.getElementById("toggleMode");
const loginTitle = document.getElementById("loginTitle");
const errorEl = document.getElementById("error");
const trainerAdminFields = document.getElementById("trainerAdminFields");
const agentFields = document.getElementById("agentFields");

let isAgentMode = false;

// 🔁 Toggle between Agent and Trainer/Admin mode
toggleMode.addEventListener("click", () => {
  isAgentMode = !isAgentMode;
  if (isAgentMode) {
    loginTitle.textContent = "Agent Login";
    trainerAdminFields.style.display = "none";
    agentFields.style.display = "block";
    toggleMode.textContent = "Login as Trainer / Admin";
  } else {
    loginTitle.textContent = "Trainer / Admin Login";
    trainerAdminFields.style.display = "block";
    agentFields.style.display = "none";
    toggleMode.textContent = "Login as Agent";
  }
  errorEl.textContent = "";
});

// 🚀 Handle Login
loginBtn.addEventListener("click", async () => {
  errorEl.textContent = "";

  try {
    if (isAgentMode) {
      // === Agent Login ===
      const convKey = convKeyEl.value.trim();
      if (!convKey) return (errorEl.textContent = "Enter conversation key.");

      // validate conversation exists
      const res = await fetch(`${API_BASE_URL}/conversation?convKey=${convKey}`);
      const data = await res.json();

      if (!res.ok || !data || data.error) {
        return (errorEl.textContent = "Invalid or expired conversation key.");
      }

      // Store key and role locally
      localStorage.setItem("role", "agent");
      localStorage.setItem("convKey", convKey);
      localStorage.setItem("user", JSON.stringify({
        name: data.associate_name,
        role: "agent"
      }));

      window.location.href = "index.html";
    } else {
      // === Trainer/Admin Login ===
      const email = emailEl.value.trim();
      const password = passwordEl.value.trim();
      if (!email || !password)
        return (errorEl.textContent = "Please enter email and password.");

      const res = await fetch(`${API_BASE_URL}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Login failed.");

      // Store JWT and user info
      localStorage.setItem("token", data.token);
      localStorage.setItem("user", JSON.stringify(data.user));
      localStorage.setItem("role", data.user.role);

      window.location.href = "index.html";
    }
  } catch (err) {
    console.error(err);
    errorEl.textContent = err.message || "Login failed.";
  }
});
