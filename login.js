// Change this to your backend base URL
const API_BASE_URL = "https://mock-chat-backend.vercel.app/api";

const loginBtn = document.getElementById("loginBtn");
const toggleMode = document.getElementById("toggleMode");
const loginTitle = document.getElementById("loginTitle");
const errorBox = document.getElementById("error");

const trainerAdminFields = document.getElementById("trainerAdminFields");
const agentFields = document.getElementById("agentFields");

let mode = "trainer"; // default login mode

toggleMode.addEventListener("click", () => {
  if (mode === "trainer") {
    mode = "agent";
    loginTitle.textContent = "Agent Login";
    trainerAdminFields.style.display = "none";
    agentFields.style.display = "block";
    toggleMode.textContent = "Login as Trainer / Admin";
  } else {
    mode = "trainer";
    loginTitle.textContent = "Trainer / Admin Login";
    trainerAdminFields.style.display = "block";
    agentFields.style.display = "none";
    toggleMode.textContent = "Login as Agent";
  }
});

loginBtn.addEventListener("click", async () => {
  errorBox.textContent = "";

  if (mode === "agent") {
    const convKey = document.getElementById("convKey").value.trim();
    if (!convKey) {
      errorBox.textContent = "Please enter conversation key";
      return;
    }

    // Save convKey locally & go to chat screen
    localStorage.setItem("convKey", convKey);
    window.location.href = `index.html?convKey=${convKey}`;
    return;
  }

  // Trainer/Admin login
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value.trim();

  if (!email || !password) {
    errorBox.textContent = "Email and password required";
    return;
  }

  try {
    const res = await fetch(`${API_BASE_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Login failed");

    // Store token + user info locally
    localStorage.setItem("token", data.token);
    localStorage.setItem("user", JSON.stringify(data.user));

    // Redirect to dashboard or chat
    window.location.href = "index.html";
  } catch (err) {
    errorBox.textContent = err.message;
  }
});
