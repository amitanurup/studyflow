const STORAGE_KEY = "upi-payment-alert-history-v1";
const els = {
  connectionDot: document.querySelector("#connectionDot"),
  connectionStatus: document.querySelector("#connectionStatus"),
  roomLabel: document.querySelector("#roomLabel"),
  mobileLink: document.querySelector("#mobileLink"),
  copyLink: document.querySelector("#copyLink"),
  lanLinks: document.querySelector("#lanLinks"),
  enableSound: document.querySelector("#enableSound"),
  bigAlert: document.querySelector("#bigAlert"),
  emptyAlert: document.querySelector("#emptyAlert"),
  alertAmount: document.querySelector("#alertAmount"),
  alertMeta: document.querySelector("#alertMeta"),
  historyList: document.querySelector("#historyList"),
  clearHistory: document.querySelector("#clearHistory"),
  toast: document.querySelector("#toast")
};

const state = {
  room: "UPI-PAYMENT-ALERT",
  socket: null,
  soundEnabled: false,
  audioContext: null,
  history: loadHistory()
};

initialize();

async function initialize() {
  renderHistory();
  bindEvents();
  await loadInfo();
  connect();
}

function bindEvents() {
  els.copyLink.addEventListener("click", copyMobileLink);
  els.enableSound.addEventListener("click", enableSound);
  els.clearHistory.addEventListener("click", () => {
    state.history = [];
    saveHistory();
    renderHistory();
  });
}

async function loadInfo() {
  try {
    const response = await fetch("/api/info");
    const info = await response.json();
    state.room = info.room;
    els.roomLabel.textContent = info.room;
    els.mobileLink.value = info.mobileUrl;
    els.lanLinks.innerHTML = info.lanUrls
      .map((url) => {
        const mobileUrl = `${url}/mobile.html?room=${encodeURIComponent(info.room)}`;
        return `<a href="${mobileUrl}" target="_blank" rel="noopener">${mobileUrl}</a>`;
      })
      .join("");
  } catch {
    els.connectionStatus.textContent = "Server info load nahi hua";
  }
}

function connect() {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  state.socket = new WebSocket(`${protocol}//${window.location.host}/sync?room=${encodeURIComponent(state.room)}&role=pc`);
  state.socket.addEventListener("open", () => {
    setConnected(true, "PC ready. Mobile link open karo.");
    send({ type: "ping-mobile" });
  });
  state.socket.addEventListener("message", handleMessage);
  state.socket.addEventListener("close", () => {
    setConnected(false, "Disconnected. Reconnecting...");
    window.setTimeout(connect, 1500);
  });
}

function handleMessage(event) {
  const message = JSON.parse(event.data);
  if (message.type === "payment-received") {
    receivePayment(message.payment);
  } else if (message.type === "status") {
    const mobileCount = message.mobileCount || 0;
    setConnected(true, mobileCount ? `${mobileCount} mobile connected` : "Waiting for mobile");
  }
}

function receivePayment(payment) {
  const alert = {
    amount: Number(payment.amount || 0),
    from: payment.from || "Mobile UPI",
    note: payment.note || "Payment received",
    upiApp: payment.upiApp || "UPI",
    receivedAt: payment.receivedAt || new Date().toISOString()
  };
  state.history = [alert, ...state.history].slice(0, 50);
  saveHistory();
  renderHistory();
  els.alertAmount.textContent = `Rs ${alert.amount}`;
  els.alertMeta.textContent = `${alert.upiApp} - ${alert.from}`;
  els.bigAlert.classList.remove("hidden");
  els.emptyAlert.classList.add("hidden");
  playSound();
  showToast(`Payment received: Rs ${alert.amount}`);
}

function enableSound() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) {
    showToast("Browser sound support nahi hai.");
    return;
  }
  state.audioContext = state.audioContext || new AudioContextClass();
  state.audioContext.resume?.();
  state.soundEnabled = true;
  els.enableSound.textContent = "Sound enabled";
  els.enableSound.classList.add("enabled");
  els.enableSound.classList.remove("need");
  playSound();
}

function playSound() {
  if (!state.soundEnabled) {
    els.enableSound.classList.add("need");
    return;
  }
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  const context = state.audioContext || new AudioContextClass();
  state.audioContext = context;
  context.resume?.();
  [880, 1175, 1480, 1175].forEach((frequency, index) => {
    window.setTimeout(() => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.001, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.32, context.currentTime + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.2);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime + 0.22);
    }, index * 145);
  });
}

function renderHistory() {
  if (!state.history.length) {
    els.historyList.innerHTML = '<div class="empty">Payment alert aane par yahan history dikhegi.</div>';
    return;
  }
  els.historyList.innerHTML = state.history
    .map(
      (item) => `
        <article class="payment-item">
          <div>
            <strong>Rs ${escapeHtml(String(item.amount))}</strong>
            <span>${escapeHtml(item.upiApp || "UPI")}</span>
          </div>
          <p>${escapeHtml(item.from || "Mobile UPI")} - ${escapeHtml(item.note || "Payment received")}</p>
          <time>${formatTime(item.receivedAt)}</time>
        </article>
      `
    )
    .join("");
}

async function copyMobileLink() {
  try {
    await navigator.clipboard.writeText(els.mobileLink.value);
    showToast("Mobile link copied.");
  } catch {
    els.mobileLink.select();
    showToast("Link select ho gaya.");
  }
}

function setConnected(connected, text) {
  els.connectionDot.classList.toggle("on", connected);
  els.connectionStatus.textContent = text;
}

function send(message) {
  if (state.socket?.readyState === WebSocket.OPEN) state.socket.send(JSON.stringify(message));
}

function loadHistory() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveHistory() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.history));
}

function formatTime(value) {
  return new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit", second: "2-digit" }).format(new Date(value));
}

function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.add("show");
  window.setTimeout(() => els.toast.classList.remove("show"), 2200);
}

function escapeHtml(text) {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
