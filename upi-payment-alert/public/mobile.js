const params = new URLSearchParams(window.location.search);
const state = {
  room: params.get("room") || "UPI-PAYMENT-ALERT",
  socket: null
};

const els = {
  mobileDot: document.querySelector("#mobileDot"),
  mobileStatus: document.querySelector("#mobileStatus"),
  paymentForm: document.querySelector("#paymentForm"),
  amount: document.querySelector("#amount"),
  upiApp: document.querySelector("#upiApp"),
  from: document.querySelector("#from"),
  note: document.querySelector("#note"),
  quickButtons: document.querySelector(".quick-buttons")
};

initialize();

function initialize() {
  connect();
  els.paymentForm.addEventListener("submit", sendPayment);
  els.quickButtons.addEventListener("click", (event) => {
    const button = event.target.closest("[data-amount]");
    if (!button) return;
    els.amount.value = button.dataset.amount;
    els.amount.focus();
  });
}

function connect() {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  state.socket = new WebSocket(`${protocol}//${window.location.host}/sync?room=${encodeURIComponent(state.room)}&role=mobile`);
  state.socket.addEventListener("open", () => setStatus(true, "Connected to PC"));
  state.socket.addEventListener("message", handleMessage);
  state.socket.addEventListener("close", () => {
    setStatus(false, "Disconnected. Reconnecting...");
    window.setTimeout(connect, 1500);
  });
}

function handleMessage(event) {
  const message = JSON.parse(event.data);
  if (message.type === "sent") {
    setStatus(true, `Sent to PC: Rs ${message.payment.amount}`);
  } else if (message.type === "status") {
    setStatus((message.pcCount || 0) > 0, message.pcCount ? "PC connected" : "Waiting for PC");
  } else if (message.type === "pc-ready") {
    setStatus(true, "PC ready for payment alerts");
  }
}

function sendPayment(event) {
  event.preventDefault();
  const amount = Number(els.amount.value);
  if (!amount || amount < 1) {
    setStatus(false, "Valid amount enter karo");
    return;
  }
  if (state.socket?.readyState !== WebSocket.OPEN) {
    setStatus(false, "PC connection ready nahi hai");
    return;
  }
  state.socket.send(
    JSON.stringify({
      type: "payment-received",
      payment: {
        amount,
        upiApp: els.upiApp.value,
        from: els.from.value.trim() || "Customer",
        note: els.note.value.trim() || "Payment received",
        receivedAt: new Date().toISOString()
      }
    })
  );
  els.amount.value = "";
  els.note.value = "";
}

function setStatus(connected, text) {
  els.mobileDot.classList.toggle("on", connected);
  els.mobileStatus.textContent = text;
}
