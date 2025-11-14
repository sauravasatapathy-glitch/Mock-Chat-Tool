// index.js (Lavender UI — fixes + enhancements, no breaking API changes)

function onReady(fn) {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", fn, { once: true });
  } else fn();
}

onReady(async () => {
  // Ensure lucide icons exist (index.html usually sets them)
  try {
    if (!window.lucide?.createIcons) {
      const { createIcons, icons } = await import("https://unpkg.com/lucide@latest/dist/esm/lucide.js");
      window.lucide = { createIcons, icons };
      createIcons({ icons });
    } else {
      window.lucide.createIcons({ icons: window.lucide.icons });
    }
  } catch {}

  const { getAuthHeader } = await import("./authHelper.js");
  const { checkAuth, logout } = await import("./authGuard.js");

  const API_BASE_URL = "https://mock-chat-backend.vercel.app/api";

  // DOM
  const leftPane = document.getElementById("left-pane");
  const chatContent = document.getElementById("chatContent");
  const navRail = document.getElementById("nav-rail");
  const logoutBtn = document.getElementById("logoutBtn");

  // AUTH
  const session = checkAuth(["admin", "trainer", "agent"]);
  if (!session) {
    window.location.href = "login.html";
    return;
  }
  const { user, role } = session;
  const authHeader = getAuthHeader();

  // Globals
  let currentEventSource = null;
  let currentConvKey = null;
  let seenIds = new Set();            // robust de-dupe for SSE
  let timerId = null;                 // header duration timer
  let firstMsgTs = null;              // first message timestamp
  let timerInterval = null;
  let startTime = null;

  function startDurationTimer(convKey) {
    const header = document.getElementById("chatHeader");
    if (!header) return;
    if (!startTime) {
      const stored = localStorage.getItem(`conv_start_${convKey}`);
      startTime = stored ? new Date(stored) : new Date();
      localStorage.setItem(`conv_start_${convKey}`, startTime.toISOString());
    }
    timerInterval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTime.getTime()) / 1000);
      const mins = Math.floor(elapsed / 60);
      const secs = elapsed % 60;
      header.querySelector(".timer")?.remove();
      const span = document.createElement("span");
      span.className = "timer";
      span.style.marginLeft = "8px";
      span.textContent = `🕒 ${mins}:${secs.toString().padStart(2, "0")}`;
      header.appendChild(span);
    }, 1000);
  }

  function stopDurationTimer(convKey) {
    if (timerInterval) clearInterval(timerInterval);
    localStorage.removeItem(`conv_start_${convKey}`);
    timerInterval = null;
    startTime = null;
  }

  // ---- helpers ----
  const isTrainerOrAdmin = () => role === "trainer" || role === "admin";

  function setActiveTab(tab) {
    document.querySelectorAll("#nav-rail .nav-item").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.tab === tab);
    });
    renderSidePane(tab);
  }

  async function renderSidePane(tab) {
    if (!leftPane) return;

    const headerHTML = (title) =>
      `<h3 class="app-header" style="background:#6D28D9;color:white;text-align:center;padding:0.8rem;border-radius:10px 10px 0 0;margin:0;">${title}</h3>`;

    if (tab === "home") {
      leftPane.innerHTML = `
        ${headerHTML("Active Conversations")}
        <ul id="activeConversations" style="margin:0;padding:0;list-style:none;"></ul>
      `;
      await loadConversations("home");
    } else if (tab === "archive") {
      leftPane.innerHTML = `
        ${headerHTML("Archive")}
        <ul id="archiveList" style="list-style:none;padding:0;margin:0;"><li style="padding:.6rem;opacity:.7">Loading…</li></ul>
      `;
      await loadConversations("archive");
    } else if (tab === "queue") {
      leftPane.innerHTML = `
        ${headerHTML("Queue")}
        <ul id="queueList" style="list-style:none;padding:0;margin:0;"><li style="padding:.6rem;opacity:.7">Loading…</li></ul>
      `;
      await loadConversations("queue");
    } else if (tab === "create") {
      leftPane.innerHTML = `
        ${headerHTML("Create Conversation")}
        <div style="padding:1rem;display:flex;flex-direction:column;gap:10px;">
          <label style="font-weight:500;">Trainer</label>
          <input id="createTrainer" placeholder="Trainer name" class="lavender-input"/>
          <label style="font-weight:500;">Associate</label>
          <input id="createAssociate" placeholder="Associate name" class="lavender-input"/>
          <button id="createBtn" class="lavender-btn" style="height:35px">Create</button>
          <div id="createNote" style="font-size:12px;opacity:.8;margin-top:6px;"></div>
        </div>
      `;
      const t = document.getElementById("createTrainer");
      const a = document.getElementById("createAssociate");
      const btn = document.getElementById("createBtn");
      const note = document.getElementById("createNote");
      t.value = user?.name || "";
      btn.onclick = async () => {
        const trainerName = t.value.trim();
        const associateName = a.value.trim();
        if (!trainerName || !associateName) {
          note.textContent = "Both names required.";
          return;
        }
        try {
          const res = await fetch(`${API_BASE_URL}/conversations`, {
            method: "POST",
            headers: { "Content-Type": "application/json", ...authHeader },
            body: JSON.stringify({ trainerName, associateName }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || "Failed to create.");
          note.textContent = `✅ Created | Key: ${data.convKey}`;
          await updateHomeBadge();
        } catch (e) {
          note.textContent = e.message;
        }
      };
    } else if (tab === "reports") {
      leftPane.innerHTML = `
        ${headerHTML("Reports")}
        <div style="padding:1rem;display:flex;flex-direction:column;gap:10px;">
          <label>From</label><input type="date" id="rFrom" class="lavender-input"/>
          <label>To</label><input type="date" id="rTo" class="lavender-input"/>
          <button id="rExport" class="lavender-btn" style="height:35px">Export CSV</button>
          <div id="rNote" style="font-size:12px;opacity:.8;margin-top:6px;"></div>
        </div>
      `;
      const btn = document.getElementById("rExport");
      const note = document.getElementById("rNote");
      btn.onclick = async () => {
        const from = document.getElementById("rFrom").value;
        const to = document.getElementById("rTo").value;

        if (!from || !to) {
          note.textContent = "⚠️ Please select both start and end dates.";
          return;
        }

        try {
          note.textContent = "⏳ Generating report...";

          const res = await fetch(
            `${API_BASE_URL}/reports?from=${from}&to=${to}`,
            { headers: { ...authHeader } }
          );

          if (!res.ok) {
            const data = await res.json();
            throw new Error(data.error || "Failed to export report");
          }

          const blob = await res.blob();
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `mockchat-report-${from}-to-${to}.csv`;
          document.body.appendChild(a);
          a.click();
          a.remove();
          window.URL.revokeObjectURL(url);

          note.textContent = "✅ Report downloaded successfully!";
        } catch (err) {
          console.error(err);
          note.textContent = `❌ ${err.message}`;
          }
      };
    }
    else if (tab === "users") {
      // 🧩 Manage Users (Admins Only)
      leftPane.innerHTML = `
        <h3 class="app-header" style="background:#6D28D9;color:white;text-align:center;padding:0.8rem;border-radius:10px 10px 0 0;margin:0;">
          Manage Users
        </h3>
        <div style="padding:1rem;display:flex;flex-direction:column;gap:10px;">
          <label style="font-weight:500;">Name</label>
          <input id="userName" placeholder="Enter name" class="lavender-input"/>
      
          <label style="font-weight:500;">Email</label>
          <input id="userEmail" placeholder="Enter email" class="lavender-input"/>

          <label style="font-weight:500;">Role</label>
          <select id="userRole" class="lavender-input">
            <option value="" disabled selected>Select role</option>
            <option value="trainer">Trainer</option>
            <option value="admin">Admin</option>
          </select>

          <button id="inviteBtn" class="lavender-btn" style="height:35px">Invite User</button>
          <div id="inviteNote" style="font-size:12px;opacity:.8;margin-top:6px;"></div>
        </div>
      `;

      const inviteBtn = document.getElementById("inviteBtn");
      const inviteNote = document.getElementById("inviteNote");

      inviteBtn.onclick = async () => {
        const name = document.getElementById("userName").value.trim();
        const email = document.getElementById("userEmail").value.trim();
        const role = document.getElementById("userRole").value;

        if (!name || !email || !role) {
          inviteNote.textContent = "⚠️ Please fill in all fields.";
          inviteNote.style.color = "red";
          return;
        }

        try {
          inviteNote.textContent = "⏳ Sending invite...";
          inviteNote.style.color = "inherit";

          const res = await fetch(`${API_BASE_URL}/users`, {
            method: "POST",
            headers: { 
              "Content-Type": "application/json",
              ...authHeader
            },
            body: JSON.stringify({ name, email, role }),
          });

          const data = await res.json();
          if (!res.ok) throw new Error(data.error || "Failed to invite user");

          inviteNote.textContent = `✅ Invite sent to ${email}`;
          inviteNote.style.color = "green";
        } catch (err) {
          inviteNote.textContent = `❌ ${err.message}`;
          inviteNote.style.color = "red";
        }
      };
    }

    if (window.lucide?.createIcons) window.lucide.createIcons({ icons: window.lucide.icons });
    syncHeights();
  }

  async function updateHomeBadge() {
    try {
      const badge = document.getElementById("badge-home");
      if (!badge) return;
      const res = await fetch(`${API_BASE_URL}/conversations?all=true`, { headers: { ...authHeader } });
      const rows = await res.json();
      const unread = (rows || []).reduce((a, c) => a + (c.unread_count || 0), 0);
      badge.textContent = unread > 99 ? "99+" : String(unread);
      badge.hidden = unread <= 0;
    } catch {
      const badge = document.getElementById("badge-home");
      if (badge) badge.hidden = true;
    }
  }

  // ---- Filtering loader (Queue/Home/Archive) ----
// ---- Filtering loader (Queue/Home/Archive) ----
async function loadConversations(tab = "home") {
  try {
    const url =
      role === "admin"
        ? `${API_BASE_URL}/conversations?all=true`
        : `${API_BASE_URL}/conversations?trainer=${encodeURIComponent(user.name)}`;

    const res = await fetch(url, { headers: { ...authHeader } });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to load conversations");

    // Some backends don’t return msg_count. If missing, derive it on the fly.
    // (Lightweight — only for items that aren’t ended.)
    const needCounts = data.filter(c => !c.ended && (c.msg_count == null));
    if (needCounts.length) {
      await Promise.all(
        needCounts.map(async (c) => {
          try {
            const r = await fetch(`${API_BASE_URL}/messages?convKey=${encodeURIComponent(c.conv_key)}`, { headers: { ...authHeader } });
            const arr = await r.json();
            c._msg_count = Array.isArray(arr) ? arr.length : 0;
          } catch {
            c._msg_count = 0;
          }
        })
      );
    }

    const getCount = (c) => (typeof c.msg_count === "number" ? c.msg_count : (c._msg_count || 0));

    // categorize
    const queued   = data.filter(c => !c.ended && getCount(c) === 0);
    const active   = data.filter(c => !c.ended && getCount(c)  >  0);
    const archived = data.filter(c =>  c.ended);

    if (tab === "queue")       renderList("queueList", queued);
    else if (tab === "archive")renderList("archiveList", archived);
    else                       renderList("activeConversations", active);
  } catch (err) {
    console.error("loadConversations:", err);
    if (err.message?.toLowerCase().includes("invalid token")) {
      alert("Session invalid. Please login again.");
      logout();
    }
  }
}


  function renderList(id, items) {
    const ul = document.getElementById(id);
    if (!ul) return;
    ul.innerHTML = items.length ? "" : `<li style="opacity:.7;padding:.6rem;">No conversations</li>`;
    items.forEach((c) => {
      const li = document.createElement("li");
      li.innerHTML = `
        <div style="display:flex;flex-direction:column;">
          <span style="font-weight:600;">${c.trainer_name} ↔ ${c.associate_name}</span>
          <span style="font-size:0.8rem;opacity:0.7;">${c.conv_key}</span>
        </div>
        ${c.unread_count ? `<span class="badge" style="background:#EF4444;color:#fff;padding:2px 6px;border-radius:12px;font-size:0.8rem;">${c.unread_count}</span>` : ""}`;
      li.style.cssText =
        "padding:0.6rem;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #e2e8f0;cursor:pointer;transition:background 0.2s;";
      li.addEventListener("click", () => openConversation(c));
      ul.appendChild(li);
    });
    syncHeights();
  }

  async function loadAgentConversation() {
    try {
      const convKey = localStorage.getItem("convKey");
      if (!convKey) {
        alert("Missing conversation key. Please login again.");
        ["role", "user", "trainerName"].forEach((k) => localStorage.removeItem(k));
        window.location.href = "login.html";
        return;
      }
      const res = await fetch(`${API_BASE_URL}/conversations?convKey=${encodeURIComponent(convKey)}`, {
        headers: { ...authHeader },
      });
      if (res.status >= 400) throw new Error("Conversation not found or inactive.");
const conv = await res.json();
if (!conv || conv.ended) {
  alert("This conversation is no longer active.");
  // ✅ clear keys before redirect to stop the loop
  ["convKey", "role", "user", "trainerName"].forEach((k) => localStorage.removeItem(k));
  window.location.href = "login.html";
  return;
}
      openConversation(conv);
    } catch (err) {
      console.error("Agent load failed:", err);
      alert("Error loading conversation.");
      window.location.href = "login.html";
    }
  }

  function formatDuration(ms) {
    const s = Math.floor(ms / 1000);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return (h ? h.toString().padStart(2, "0") + ":" : "") +
           m.toString().padStart(2, "0") + ":" +
           sec.toString().padStart(2, "0");
  }

  function startHeaderTimer(headerEl) {
    stopHeaderTimer();
    if (!firstMsgTs || !headerEl) return;
    timerId = setInterval(() => {
      const elapsed = Date.now() - firstMsgTs;
      const base = headerEl.dataset.base || headerEl.textContent;
      headerEl.dataset.base = base;
      headerEl.textContent = `${base} • ${formatDuration(elapsed)}`;
    }, 1000);
  }
  function stopHeaderTimer() {
    if (timerId) clearInterval(timerId);
    timerId = null;
  }

  function applyInputTheme(textarea) {
    const dark = document.body.classList.contains("dark-mode");
    textarea.style.background = dark ? "#3a1d4d" : "#ffffff";
    textarea.style.color = dark ? "#f7e8f6" : "#1e293b";
    textarea.style.border = dark ? "1px solid #8b5cf6" : "1px solid #C4B5FD";
  }

  function syncHeights() {
    const chatPane = document.getElementById("chat-pane");
    if (!chatPane || !leftPane) return;
    leftPane.style.height = `${chatPane.clientHeight}px`;
  }

  async function openConversation(conv) {
    if (currentEventSource) currentEventSource.close();
    stopHeaderTimer();
    currentConvKey = conv.conv_key;
    seenIds.clear();
    firstMsgTs = null;

    const endBtn = isTrainerOrAdmin()
      ? `<button id="endConvBtn" class="lavender-btn" style="margin-left:8px;padding:0.35rem 0.7rem;border-radius:8px;">End</button>`
      : "";

chatContent.innerHTML = `
  <div id="chatContainer" style="display:flex;flex-direction:column;height:80vh;width:100%;background:white;border-radius:12px;border:1px solid #E0E7FF;box-shadow:0 0 12px rgba(109,40,217,0.15);overflow:hidden;">
    <div id="chatHeader"
         style="background:linear-gradient(90deg,#6D28D9,#9333EA);color:white;padding:0.75rem;font-weight:600;display:flex;align-items:center;justify-content:space-between;gap:8px;">
      <span id="chatHeaderText" style="text-align:left;">
        ${escapeHtml(conv.trainer_name)} ↔ ${escapeHtml(conv.associate_name)} | Key: ${escapeHtml(conv.conv_key)}
      </span>
      ${role !== "agent"
        ? '<button id="endBtn" style="background:#EF4444;color:white;border:none;border-radius:6px;padding:0.35rem 0.7rem;font-size:0.8rem;cursor:pointer;">End</button>'
        : '<span></span>'}
    </div>
    <div id="messages" data-conv-key="${conv.conv_key}" style="flex:1;overflow-y:auto;padding:1rem;display:flex;flex-direction:column;gap:0.5rem;background:#FAF5FF;"></div>
    <div id="chatInputArea" style="padding:0.6rem;display:flex;gap:0.5rem;border-top:1px solid #E0E7FF;background:white;">
      <textarea id="chatInput" placeholder="Type a message..." style="flex:1;min-height:64px;max-height:200px;resize:vertical;border:1px solid #C4B5FD;border-radius:0.6rem;padding:0.7rem;line-height:1.4;"></textarea>
      <button id="sendBtn" style="background:#6D28D9;color:white;border:none;border-radius:0.6rem;padding:0 1.1rem;min-height:64px;cursor:pointer;font-weight:600;">Send</button>
    </div>
  </div>
`;
// Small visual polish: ensure "End" button hugs the right edge
const chatHeaderEl = document.getElementById("chatHeader");
if (chatHeaderEl) {
  chatHeaderEl.style.paddingRight = "0.9rem";
}


    const headerEl = document.getElementById("chatHeaderText");
    const input = document.getElementById("chatInput");
    const sendBtn = document.getElementById("sendBtn");
    const container = document.getElementById("messages");
    applyInputTheme(input);

    // input behaviors
    input.addEventListener("input", () => {
      input.style.height = "auto";
      const h = Math.min(input.scrollHeight, 200);
      input.style.height = h + "px";
    });
    input.addEventListener("keydown", async (e) => {
      if (e.key === "Enter" && !e.shiftKey && !e.ctrlKey) {
        e.preventDefault();
        sendBtn.click();
      }
      // Shift+Enter or Ctrl+Enter → newline (default)
    });

sendBtn.addEventListener("click", async () => {
  const text = input.value.trim();
  if (!text) return;

  // Optimistic render for sender so it appears instantly.
  // We still ignore sender’s own messages in SSE to avoid duplicates.
  renderMessage(container, {
    sender_name: user.name,
    text,
    timestamp: new Date().toISOString()
  }, { scroll: true });

  try {
    await sendMessage(conv.conv_key, user.name, role, text);
    input.value = "";
    input.dispatchEvent(new Event("input"));
    await markConversationRead(conv.conv_key);
  } catch (err) {
    alert(err.message || "Send failed");
  }
});


    // End conversation (trainer/admin only)
const endBtnEl = document.getElementById("endBtn");
if (endBtnEl) {
  endBtnEl.addEventListener("click", async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/conversations?end=true`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeader },
        body: JSON.stringify({ convKey: currentConvKey }),
      });
      if (!res.ok) throw new Error("Failed to end conversation");

      // Do not append local system message here; SSE will deliver it from backend.
      inputDisabledState(true);
      stopDurationTimer(currentConvKey);
      stopHeaderTimer();

    } catch (err) {
      console.error("End conversation failed:", err);
      alert("Could not end conversation.");
    }
  });
}




    // If conversation is ended, disable input and show message
    if (conv.ended) {
      stopDurationTimer(conv.conv_key);
      inputDisabledState(true);
      showSystemMessage("This conversation has been ended by the trainer/admin.", container, "ended");
    }

    await loadMessages(conv.conv_key);
    await markConversationRead(conv.conv_key);
    subscribeToMessages(conv.conv_key, headerEl);
    syncHeights();
  }

  async function loadMessages(convKey) {
    const res = await fetch(`${API_BASE_URL}/messages?convKey=${encodeURIComponent(convKey)}`, {
      headers: { ...authHeader },
    });
    const rows = await res.json();
    const container = document.getElementById("messages");
    container.innerHTML = "";
    rows.forEach((r) => {
      if (r.id) seenIds.add(String(r.id));
      if (!firstMsgTs) firstMsgTs = Date.parse(r.timestamp || "") || Date.now();
      renderMessage(container, r, { scroll: false });
    });
    if (!firstMsgTs && rows.length > 0) {
      firstMsgTs = Date.parse(rows[0].timestamp || "") || Date.now();
    }
    container.scrollTop = container.scrollHeight;
  }

  async function sendMessage(convKey, senderName, senderRole, text) {
    const res = await fetch(`${API_BASE_URL}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeader },
      body: JSON.stringify({ convKey, senderName, senderRole, text }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to send");
    return data;
  }

function renderMessage(container, msg, opts = { scroll: true }) {
  // System messages: role === 'system' OR sender_name === 'System'
  if ((msg.role && msg.role.toLowerCase() === "system") || (msg.sender_name === "System")) {
    showSystemMessage(msg.text || "System", container, /ended/i.test(msg.text || ""));
    if (opts.scroll) container.scrollTop = container.scrollHeight;
    return;
  }

  const sender = msg.sender_name || msg.sender || "Unknown";
  const isSelf = sender === user.name;

  const wrapper = document.createElement("div");
  wrapper.className = `message ${isSelf ? "self" : "other"}`;

  const bubble = document.createElement("div");
  bubble.className = "bubble";
  bubble.style.cssText = `
    max-width:75%;padding:0.7rem 1rem;border-radius:12px;
    background:${isSelf ? "#6D28D9" : "#EDE9FE"};
    color:${isSelf ? "white" : "#1E1B4B"};
    box-shadow:0 2px 6px rgba(0,0,0,0.05);
  `;

  const time = new Date(msg.timestamp || Date.now()).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  bubble.innerHTML = `<div>${escapeHtml(msg.text || "")}</div>
                      <div style="font-size:0.7rem;opacity:0.7;text-align:right;">${time}</div>`;
  wrapper.appendChild(bubble);
  container.appendChild(wrapper);

  if (opts.scroll) container.scrollTop = container.scrollHeight;
}

function showSystemMessage(text, container = document.getElementById("messages"), isEnd = false) {
  if (!container) return;
  const msg = document.createElement("div");
  msg.style.cssText = `
    text-align:center;
    font-size:0.9rem;
    margin:0.5rem auto;
    padding:0.4rem 0.8rem;
    border-radius:8px;
    background: ${isEnd ? "#FEE2E2" : "#F5F3FF"};
    color: ${isEnd ? "#B91C1C" : "#4B3F72"};
    font-weight: ${isEnd ? "700" : "600"};
    max-width: 80%;
  `;
  msg.textContent = text;
  container.appendChild(msg);
}

  function inputDisabledState(disabled = true) {
    const input = document.getElementById("chatInput");
    const sendBtn = document.getElementById("sendBtn");
    if (!input || !sendBtn) return;
    input.disabled = disabled;
    sendBtn.disabled = disabled;
    if (disabled) {
      input.placeholder = "Conversation ended.";
      input.style.opacity = "0.7";
    } else {
      input.placeholder = "Type a message...";
      input.style.opacity = "1";
    }
  }
function showAgentLogoutCountdown(container) {
  // Blur overlay
  const overlay = document.createElement("div");
  overlay.style.cssText = `
    position:absolute;
    inset:0;
    background:rgba(0,0,0,0.55);
    backdrop-filter:blur(3px);
    display:flex;
    align-items:center;
    justify-content:center;
    color:white;
    font-size:1.2rem;
    font-weight:600;
    z-index:1000;
    flex-direction:column;
    transition:opacity 0.5s ease;
  `;

  let remaining = 30;
  const msg = document.createElement("div");
  msg.textContent = `Conversation ended. Logging out in ${remaining}s...`;

  overlay.appendChild(msg);
  container.appendChild(overlay);

  const timer = setInterval(() => {
    remaining--;
    msg.textContent = `Conversation ended. Logging out in ${remaining}s...`;

    if (remaining <= 0) {
      clearInterval(timer);
      msg.textContent = "Session ended.";
      overlay.style.opacity = "0";
      setTimeout(() => {
        logout();
      }, 1000);
    }
  }, 1000);
}


  function escapeHtml(s) {
    return String(s || "").replace(/[&<>"']/g, (m) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m])
    );
  }

  async function markConversationRead(convKey) {
    try {
      await fetch(`${API_BASE_URL}/messageRead`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeader },
        body: JSON.stringify({ convKey, userName: user.name }),
      });
      if (isTrainerOrAdmin()) updateHomeBadge().catch(() => {});
    } catch {}
  }

  function showDesktopNotification(sender, text) {
    if (!("Notification" in window)) return;
    if (Notification.permission === "default") Notification.requestPermission();
    if (Notification.permission !== "granted") return;
    const n = new Notification(`💬 New message from ${sender}`, {
      body: text && text.length > 60 ? text.slice(0, 60) + "…" : (text || ""),
      icon: "/favicon.ico",
    });
    n.onclick = () => window.focus();
  }

function subscribeToMessages(convKey, headerEl) {
  if (currentEventSource) currentEventSource.close();
  const es = new EventSource(`${API_BASE_URL}/messages?convKey=${encodeURIComponent(convKey)}`);
  currentEventSource = es;
  const container = document.getElementById("messages");

  es.onmessage = (e) => {
    try {
      const p = JSON.parse(e.data);

      // --- initial batch of messages ---
      if (p.type === "init" && Array.isArray(p.messages)) {
        container.innerHTML = "";
        seenIds.clear();
        p.messages.forEach((m) => {
          if (m.id) seenIds.add(String(m.id));
          if (!firstMsgTs) firstMsgTs = Date.parse(m.timestamp || "") || Date.now();
          renderMessage(container, m, { scroll: false });
        });
        if (firstMsgTs) startHeaderTimer(headerEl);
        container.scrollTop = container.scrollHeight;
        return;
      }

      // --- new messages or system events ---
      if (p.type === "new" && Array.isArray(p.messages)) {
        let gotNew = false;

        for (const m of p.messages) {
          const isSystem =
            (m.role && m.role.toLowerCase() === "system") || m.sender_name === "System";
          const text = (m.text || "").toLowerCase();

          // 🟥 Detect conversation ended system message
          if (isSystem && text.includes("conversation ended")) {
            inputDisabledState(true);
            stopDurationTimer(convKey);
            stopHeaderTimer();
            renderMessage(container, m); // display the system msg

            if (role === "agent") {
              showAgentLogoutCountdown(container);
            }
            if (isTrainerOrAdmin()) {
              loadConversations("archive").catch(() => {});
            }
            continue;
          }

          // regular message flow
          const mid = m.id ? String(m.id) : null;
          if (mid && seenIds.has(mid)) continue;
          seenIds.add(mid);
          if (m.sender_name === user.name) continue;

          if (!firstMsgTs) firstMsgTs = Date.parse(m.timestamp || "") || Date.now();
          renderMessage(container, m);
          gotNew = true;
          if (m.sender_name !== user.name)
            showDesktopNotification(m.sender_name, m.text || "");
        }

        if (gotNew && firstMsgTs) startHeaderTimer(headerEl);

        if (p.ended === true) stopHeaderTimer();

        if (isTrainerOrAdmin()) loadConversations("home").catch(() => {});
      }
    } catch (err) {
      console.warn("SSE parse issue:", err);
    }
  };

  es.onerror = () => {
    setTimeout(() => subscribeToMessages(convKey, headerEl), 3000);
  };
}

// Logout
logoutBtn?.addEventListener("click", () => {
  ["convKey", "trainerName", "role", "user"].forEach((k) => localStorage.removeItem(k));
  logout();
});

// Nav
if (navRail && role !== "agent") {
  navRail.addEventListener("click", (e) => {
    const btn = e.target.closest(".nav-item");
    if (!btn) return;
    setActiveTab(btn.dataset.tab);
  });
}
// Hide Manage Users for non-admins
if (role !== "admin") {
  const manageUsersTab = navRail.querySelector('[data-tab="users"]');
  if (manageUsersTab) manageUsersTab.style.display = "none";
}

// Resize height sync
window.addEventListener("resize", syncHeights);

// Kickoff
if (role !== "agent") {
  setActiveTab("home");
  updateHomeBadge();
} else {
  await loadAgentConversation();
}
});


