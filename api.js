export const API_BASE_URL = "https://mock-chat-backend.vercel.app/api";

export async function createConversation(trainerName, associateName) {
  const res = await fetch(`${API_BASE_URL}/conversation`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ trainerName, associateName }),
  });
  return res.json();
}

export async function sendMessage(convKey, senderName, role, text) {
  const res = await fetch(`${API_BASE_URL}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ convKey, senderName, role, text }),
  });
  return res.json();
}

export async function getMessages(convKey) {
  const res = await fetch(`${API_BASE_URL}/messages?convKey=${convKey}`);
  return res.json();
}

export async function getConversation(convKey) {
  const res = await fetch(`${API_BASE_URL}/conversation?convKey=${convKey}`);
  return res.json();
}
