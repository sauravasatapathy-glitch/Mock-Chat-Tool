const API_BASE_URL = "https://mock-chat-backend.vercel.app/api";

// === Redirect logged-in users away from login page ===
const existingToken = localStorage.getItem("token");
if (existingToken) {
  window.location.href = "index.html";
}

const loginBtn = document.getElementById("loginBtn");
const toggleModeBtn = document.getElementById("toggleMode");
const emailEl = document.getElementById("email");
const passwordEl = document.getElementById("password");
const convKeyEl = document.getElementById("convKey");
const errorEl = document.getElementById("error");
const trainerAdminFields = document.getElementById("trainerAdminFields");
const agentFields = document.getElementById("agentFields");
const loginTitle = document.getElementById("loginTitle");

let isAgentMode = false;

// === Toggle between Agent / Trainer-Admin Login ===
toggleModeBtn.addEventListener("click", () => {
  isAgentMode = !isAgentMode;
  if (isAgentMode) {
    trainerAdminFields.style.display = "none";
    agentFields.style.display = "block";
    loginTitle.textContent = "Agent Login";
    toggleModeBtn.textContent = "Login as Trainer/Admin";
  } else {
    trainerAdminFields.style.display = "block";
    agentFields.style.display = "none";
    loginTitle.textContent = "Trainer / Admin Login";
    toggleModeBtn.textContent = "Login as Agent";
  }
});

loginBtn.addEventListener("click", async () => {
  errorEl.textContent = "";

  try {
    if (isAgentMode) {
      // === Agent Login ===
      const convKey = convKeyEl.value.trim();
      if (!convKey) return (errorEl.textContent = "Enter conversation key.");

      // Validate conversation exists
      const res = await fetch(`${API_BASE_URL}/conversation?convKey=${convKey}`);
      const data = await res.json();

      if (!res.ok || !data || data.error) {
        return (errorEl.textContent = "Invalid or expired conversation key.");
      }

      // Store info locally
      localStorage.setItem("role", "agent");
      localStorage.setItem("convKey", convKey);
      localStorage.setItem(
        "user",
        JSON.stringify({
          name: data.associate_name || "Agent",
          role: "agent",
        })
      );

      // Redirect for agent
      window.location.href = "index.html?role=agent";
    } else {
      // === Trainer/Admin Login ===
      const email = emailEl.value.trim();
      const password = passwordEl.value.trim();
      if (!email || !password)
        return (errorEl.textContent = "Please enter email and password.");

      const res = await fetch(`${API_BASE_URL}/auth?path=login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Login failed.");

      // Store JWT + user info
      localStorage.setItem("token", data.token);
      localStorage.setItem("user", JSON.stringify(data.user));
      localStorage.setItem("role", data.user.role);

      // Redirect based on role
      if (data.user.role === "agent") {
        window.location.href = "index.html?role=agent";
      } else {
        window.location.href = "index.html";
      }
    }
  } catch (err) {
    console.error(err);
    errorEl.textContent = err.message || "Login failed.";
  }
});
