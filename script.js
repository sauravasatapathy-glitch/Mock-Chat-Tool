/* script.js - Netlify frontend for Mock Chat
   Backend: Google Apps Script webapp URL (provided) */

const BACKEND_URL = "https://script.google.com/a/macros/24-7intouch.com/s/AKfycbxn1WhLs8RR2KgdIUGYggiDsUZcjbLKPvPjlU4kMqi-zyIkugS3ACPLdkhTVn4AJI7K/exec";

// UI elements
const tabCreate = el('tabCreate'), tabJoin = el('tabJoin');
const createPanel = el('createPanel'), joinPanel = el('joinPanel');
const trainerNameEl = el('trainerName'), associateNameEl = el('associateName');
const createBtn = el('createBtn'), joinBtn = el('joinBtn');
const joinKeyEl = el('joinConvKey'), joinNameEl = el('joinUserName');
const messagesEl = el('messages'), chatHeaderEl = el('chatHeader');
const durationEl = el('duration'), typingEl = el('typingIndicator');
const inputEl = el('messageInput'), sendBtn = el('sendBtn');
const exportBtn = el('exportBtn'), endChatBtn = el('endChatBtn');
const headerInfoEl = el('headerInfo');
const createResultEl = el('createResult'), joinResultEl = el('joinResult');
const endConvKeyEl = el('endConvKey'), endUserNameEl = el('endUserName'), endBtn = el('endBtn'), endResultEl = el('endResult');
const chatStatusEl = el('chatStatus'), chatResultEl = el('chatResult');

let currentConvKey = null;
let currentUserName = null;
let currentUserRole = null;
let conversationStartTime = null;
let lastMessageCount = 0;
let pollTimer = null;
let sendingInProgress = false;
let pollingMs = 1000;

// utility
function el(id){ return document.getElementById(id); }
function safeJson(res){ return res.json().catch(()=>null); }

// nav tabs
tabCreate.addEventListener('click', ()=>{ tabCreate.classList.add('active'); tabJoin.classList.remove('active'); createPanel.classList.remove('hidden'); joinPanel.classList.add('hidden'); });
tabJoin.addEventListener('click', ()=>{ tabJoin.classList.add('active'); tabCreate.classList.remove('active'); joinPanel.classList.remove('hidden'); createPanel.classList.add('hidden'); });

// API wrappers
async function apiGet(params = {}){
  const url = new URL(BACKEND_URL);
  Object.keys(params).forEach(k => url.searchParams.append(k, params[k]));
  const r = await fetch(url.toString(), { method: 'GET', mode: 'cors' });
  if(!r.ok) throw new Error('Network error ' + r.status);
  return safeJson(r);
}
async function apiPost(payload = {}){
  const r = await fetch(BACKEND_URL, { method: 'POST', mode:'cors', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });
  if(!r.ok) throw new Error('Network error ' + r.status);
  return safeJson(r);
}

// Create conversation
createBtn.addEventListener('click', async () => {
  const trainer = trainerNameEl.value.trim();
  const associate = associateNameEl.value.trim();
  if(!trainer || !associate){ alert('Enter trainer and associate names'); return; }
  createResultEl.textContent = 'Creating...';
  try {
    const res = await apiPost({ action:'createConversation', trainer, associate });
    if(!res || !res.key) throw new Error('Create failed');
    currentConvKey = res.key;
    currentUserName = trainer;
    currentUserRole = 'trainer';
    conversationStartTime = new Date();
    // header
    const titleText = `Mock Chat : ${trainer} (Trainer) | ${associate}`;
    chatHeaderEl.textContent = titleText;
    document.title = titleText;
    headerInfoEl.textContent = `Key: ${res.key}`;
    createResultEl.textContent = `Created: ${res.key}`;
    trainerNameEl.value = ''; associateNameEl.value = '';
    // switch to chat polling
    startChat();
  } catch(err){
    createResultEl.textContent = 'Error: ' + err.message;
  }
});

// Join conversation
joinBtn.addEventListener('click', async () => {
  const key = joinKeyEl.value.trim(); const name = joinNameEl.value.trim();
  if(!key || !name){ joinResultEl.textContent = 'Enter key and name'; return; }
  joinResultEl.textContent = 'Joining...';
  try {
    const data = await apiGet({ action:'getUserRoleAndStartTime', key, name });
    if(!data){ joinResultEl.textContent = 'Invalid key or name'; return; }
    currentConvKey = data.convKey || key;
    currentUserName = name;
    currentUserRole = data.role;
    conversationStartTime = data.startTime ? new Date(data.startTime) : new Date();
    const titleText = `Mock Chat : ${data.trainerName} (Trainer) | ${data.associateName}`;
    chatHeaderEl.textContent = titleText;
    document.title = titleText;
    headerInfoEl.textContent = `Key: ${currentConvKey}`;
    joinResultEl.textContent = '';
    startChat();
  } catch(err){
    joinResultEl.textContent = 'Error: ' + err.message;
  }
});

// Start polling & UI
function startChat(){
  if(pollTimer) clearInterval(pollTimer);
  fetchMessages();
  pollTimer = setInterval(fetchMessages, pollingMs);
  endChatBtn.style.display = (currentUserRole === 'trainer') ? 'inline-block' : 'none';
  exportBtn.style.display = (currentUserRole === 'trainer') ? 'inline-block' : 'none';
  updateDuration();
}

// Fetch messages
async function fetchMessages(){
  if(!currentConvKey) return;
  try {
    const messages = await apiGet({ action:'getMessages', key: currentConvKey });
    if(!Array.isArray(messages)) return;
    if(messages.length > lastMessageCount){
      const newMessages = messages.slice(lastMessageCount);
      for(const m of newMessages){
        if(m.sender !== currentUserName) notifyIncoming(m);
      }
      lastMessageCount = messages.length;
    }
    renderMessages(messages);
  } catch(err){
    console.error('fetchMessages', err);
  }
}

// Render messages
function renderMessages(messages){
  messagesEl.innerHTML = '';
  for(const msg of messages){
    const wrapper = document.createElement('div');
    wrapper.className = 'message ' + (msg.role === 'trainer' ? 'trainer' : 'associate');
    const meta = document.createElement('div'); meta.className='meta'; meta.textContent = `${msg.sender} • ${new Date(msg.timestamp).toLocaleTimeString()}`;
    const text = document.createElement('div'); text.textContent = msg.text;
    wrapper.appendChild(meta); wrapper.appendChild(text);
    messagesEl.appendChild(wrapper);
  }
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

// Notify incoming
function notifyIncoming(msg){
  if(document.hidden){
    try { new Audio('https://actions.google.com/sounds/v1/alarms/beep_short.ogg').play().catch(()=>{}); } catch(e){}
    const original = document.title;
    if(!original.startsWith('(New) ')) document.title = `(New) ${original}`;
    window.addEventListener('focus', function restore(){ document.title = original; window.removeEventListener('focus', restore); });
  }
  if("Notification" in window && Notification.permission === 'granted' && document.hidden){
    try {
      const n = new Notification(`${msg.sender}`, { body: msg.text.length>80? msg.text.slice(0,77)+'...' : msg.text });
      n.onclick = ()=>window.focus();
      setTimeout(()=>n.close(),5000);
    } catch(e){ }
  }
}

// Send message (button + enter)
sendBtn.addEventListener('click', sendMessage);
inputEl.addEventListener('keydown', (ev)=>{ if(ev.key==='Enter') sendMessage(); });

async function sendMessage(){
  if(sendingInProgress) return;
  const txt = inputEl.value.trim();
  if(!txt || !currentConvKey || !currentUserName) return;
  sendingInProgress = true;
  // optimistic
  appendLocal({ sender: currentUserName, role: currentUserRole, text: txt, timestamp: new Date().toISOString() });
  inputEl.value = ''; inputEl.placeholder = 'Sending...'; inputEl.disabled = true; sendBtn.disabled = true;
  try {
    await apiPost({ action:'sendMessage', key: currentConvKey, sender: currentUserName, role: currentUserRole, text: txt });
    await fetchMessages();
  } catch(err){
    alert('Send failed: ' + err.message);
  } finally {
    inputEl.placeholder = 'Type a message...'; inputEl.disabled = false; sendBtn.disabled = false; inputEl.focus();
    sendingInProgress = false;
  }
}

function appendLocal(msg){
  const wrapper = document.createElement('div');
  wrapper.className = 'message ' + (msg.role==='trainer' ? 'trainer' : 'associate');
  const meta = document.createElement('div'); meta.className='meta'; meta.textContent = `${msg.sender} • ${new Date(msg.timestamp).toLocaleTimeString()}`;
  const text = document.createElement('div'); text.textContent = msg.text;
  wrapper.appendChild(meta); wrapper.appendChild(text);
  messagesEl.appendChild(wrapper);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

// End conversation (trainer)
endChatBtn.addEventListener('click', async ()=>{
  if(!currentConvKey || currentUserRole !== 'trainer') return;
  if(!confirm('End conversation?')) return;
  try {
    await apiPost({ action:'endConversation', key: currentConvKey, trainer: currentUserName });
    inputEl.disabled = true; sendBtn.disabled = true;
    chatStatusEl.innerHTML = `<div class="system-message">*** Conversation has ended by the Trainer. No further messages can be sent. ***</div>`;
  } catch(err){ alert('End failed: ' + err.message); }
});

// End from end tab
endBtn.addEventListener('click', async ()=>{
  const key = endConvKeyEl.value.trim(); const name = endUserNameEl.value.trim();
  if(!key || !name){ endResultEl.textContent = 'Enter key & name'; return; }
  if(!confirm('End conversation?')) return;
  try {
    await apiPost({ action:'endConversation', key, trainer: name });
    alert('Conversation ended');
    // reset UI
    resetUI();
  } catch(err){ endResultEl.textContent = 'Error: ' + err.message; }
});

// Export to PDF (client-side)
exportBtn.addEventListener('click', async ()=>{
  if(!messagesEl.children.length){ alert('No messages to export'); return; }
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ unit:'pt', format:'a4' });
  let y = 40; pdf.setFontSize(14); pdf.text('Conversation Export', 40, y); y+=20;
  pdf.setFontSize(11);
  for(const node of messagesEl.children){
    const txt = node.textContent.trim();
    const lines = pdf.splitTextToSize(txt, 520);
    if(y + lines.length * 14 > 780){ pdf.addPage(); y = 40; }
    pdf.text(lines, 40, y); y += lines.length*14 + 8;
  }
  pdf.save(`Conversation_${currentConvKey || 'chat'}.pdf`);
});

// Typing indicator (local)
let typingTimer = null;
inputEl.addEventListener('input', ()=>{
  if(!currentConvKey || !currentUserName) return;
  typingEl.textContent = `${currentUserName} is typing...`;
  if(typingTimer) clearTimeout(typingTimer);
  typingTimer = setTimeout(()=> typingEl.textContent = '', 1500);
});

// Duration update
function updateDuration(){
  if(!conversationStartTime) return;
  const diff = Date.now() - conversationStartTime.getTime();
  const hrs = Math.floor(diff/3600000), mins = Math.floor((diff%3600000)/60000), secs = Math.floor((diff%60000)/1000);
  const pad = n => String(n).padStart(2,'0');
  durationEl.textContent = `Duration: ${pad(hrs)}:${pad(mins)}:${pad(secs)}`;
  setTimeout(updateDuration,1000);
}

// Reset UI
function resetUI(){
  currentConvKey = null; currentUserName = null; currentUserRole = null; conversationStartTime = null;
  lastMessageCount = 0; messagesEl.innerHTML = ''; typingEl.textContent = ''; inputEl.value = ''; inputEl.disabled = false; sendBtn.disabled = false;
  endChatBtn.style.display = 'none'; exportBtn.style.display = 'none'; chatStatusEl.innerHTML = ''; chatResultEl.textContent = ''; headerInfoEl.textContent = 'Not connected';
  chatHeaderEl.textContent = 'Not in a conversation';
  document.title = 'Mock Chat';
}

// Init
document.addEventListener('DOMContentLoaded', ()=>{
  // restore saved header
  const saved = localStorage.getItem('chatTitle');
  if(saved){ chatHeaderEl.textContent = saved; document.title = saved; }

  // request permission nicely
  if("Notification" in window && Notification.permission === 'default'){
    Notification.requestPermission().then(p=>console.log('Notification permission', p));
  }

  // nav initial state
  showCreateInitial();
});

// helper to show create
function showCreateInitial(){ tabCreate.classList.add('active'); tabJoin.classList.remove('active'); createPanel.classList.remove('hidden'); joinPanel.classList.add('hidden'); }
