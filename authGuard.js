// authGuard.js
export function checkAuth(allowedRoles = []) {
  const user = JSON.parse(localStorage.getItem("user"));
  const token = localStorage.getItem("token");
  const role = localStorage.getItem("role");

  // 🔒 Redirect if not logged in
  if (!user || (!token && role !== "agent")) {
    window.location.href = "login.html";
    return null;
  }

  // 🚫 Role-based restriction
  if (allowedRoles.length > 0 && !allowedRoles.includes(role)) {
    alert("Access denied: You do not have permission for this page.");
    window.location.href = "login.html";
    return null;
  }

  return { user, token, role };
}

// 🧹 Optional helper for logout
export function logout() {
  localStorage.clear();
  window.location.href = "login.html";
}
