// api/proxy.js
import { API_BASE_URL } from "../config.js";

export async function createConversation(trainer, associate) {
  const res = await fetch(`${API_BASE_URL}/conversation`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ trainerName: trainer, associateName: associate }),
  });
  return res.json();
}

export async function getMessages(convKey) {
  const res = await fetch(`${API_BASE_URL}/messages?convKey=${convKey}`);
  return res.json();
}

export async function sendMessage(convKey, sender, role, text) {
  const res = await fetch(`${API_BASE_URL}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ convKey, sender, role, text }),
  });
  return res.json();
}

export async function getAllConversations() {
  const res = await fetch(`${API_BASE_URL}/allConversations`);
  return res.json();
}

export async function getActiveConversations() {
  const res = await fetch(`${API_BASE_URL}/activeConversations`);
  return res.json();
}
