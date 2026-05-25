const room = new URLSearchParams(window.location.search).get("room");
const elements = {
  roomLabel: document.querySelector("#roomLabel"),
  preview: document.querySelector("#mobilePreview"),
  captureCanvas: document.querySelector("#captureCanvas"),
  previewEmpty: document.querySelector("#previewEmpty"),
  liveTag: document.querySelector("#liveTag"),
  facingMode: document.querySelector("#facingMode"),
  shareCamera: document.querySelector("#shareCamera"),
  captureNote: document.querySelector("#captureNote"),
  stopCamera: document.querySelector("#stopCamera"),
  paymentForm: document.querySelector("#paymentForm"),
  paymentAmount: document.querySelector("#paymentAmount"),
  paymentFrom: document.querySelector("#paymentFrom"),
  paymentNote: document.querySelector("#paymentNote"),
  status: document.querySelector("#connectionStatus")
};

const state = {
  socket: null,
  peer: null,
  stream: null
};

initialize();

function initialize() {
  elements.roomLabel.textContent = room || "NONE";
  elements.shareCamera.disabled = !room;
  if (!room) {
    setStatus("Pairing link laptop se open karein.", true);
    return;
  }
  connectToLaptop();
  elements.shareCamera.addEventListener("click", shareCamera);
  elements.captureNote.addEventListener("click", captureNotePhoto);
  elements.stopCamera.addEventListener("click", stopCamera);
  elements.paymentForm.addEventListener("submit", sendPaymentAlert);
}

function connectToLaptop() {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  state.socket = new WebSocket(`${protocol}//${window.location.host}/signal?room=${room}&role=phone`);
  state.socket.addEventListener("open", () => setStatus("Laptop paired. Camera share karne ke liye button tap karein."));
  state.socket.addEventListener("message", handleSignalMessage);
  state.socket.addEventListener("close", () => setStatus("Laptop connection close ho gaya.", true));
}

async function shareCamera() {
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
    setStatus("Mobile camera ke liye HTTPS secure link zaroori hai.", true);
    return;
  }

  try {
    state.stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: elements.facingMode.value }, width: { ideal: 720 } },
      audio: false
    });
    elements.preview.srcObject = state.stream;
    elements.previewEmpty.classList.add("hidden");
    elements.liveTag.textContent = "SHARING";
    elements.liveTag.classList.add("on");
    elements.shareCamera.classList.add("hidden");
    elements.captureNote.classList.remove("hidden");
    elements.stopCamera.classList.remove("hidden");
    await createOffer();
    setStatus("Camera connect ho raha hai...");
  } catch (error) {
    setStatus("Camera permission nahi mili ya camera busy hai.", true);
  }
}

async function createOffer() {
  state.peer?.close();
  state.peer = new RTCPeerConnection({
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
  });
  state.stream.getTracks().forEach((track) => state.peer.addTrack(track, state.stream));
  state.peer.addEventListener("icecandidate", (event) => {
    if (event.candidate) sendSignal({ type: "candidate", candidate: event.candidate });
  });
  state.peer.addEventListener("connectionstatechange", () => {
    if (state.peer.connectionState === "connected") setStatus("Live: laptop study tracking ke liye mobile camera use kar raha hai.");
    if (["failed", "disconnected"].includes(state.peer.connectionState)) setStatus("Video connection interrupt ho gaya.", true);
  });
  const offer = await state.peer.createOffer();
  await state.peer.setLocalDescription(offer);
  sendSignal({ type: "offer", sdp: state.peer.localDescription });
}

function captureNotePhoto() {
  if (!state.stream || elements.preview.readyState < 2) {
    setStatus("Camera preview ready hone ke baad photo click karein.", true);
    return;
  }
  const canvas = elements.captureCanvas;
  const videoWidth = elements.preview.videoWidth;
  const videoHeight = elements.preview.videoHeight;
  const scale = Math.min(1, 1600 / Math.max(videoWidth, videoHeight));
  canvas.width = Math.round(videoWidth * scale);
  canvas.height = Math.round(videoHeight * scale);
  canvas.getContext("2d").drawImage(elements.preview, 0, 0, canvas.width, canvas.height);
  const dataUrl = canvas.toDataURL("image/jpeg", 0.88);
  if (dataUrl.length > 7_000_000) {
    setStatus("Photo bahut large hai. Camera ko notes ke kareeb laakar retry karein.", true);
    return;
  }
  if (!sendSignal({ type: "note-photo", dataUrl })) {
    setStatus("Laptop connection ready nahi hai.", true);
    return;
  }
  setStatus("Photo PC par save ho rahi hai...");
}

function sendPaymentAlert(event) {
  event.preventDefault();
  const amount = Number(elements.paymentAmount.value);
  if (!amount || amount < 1) {
    setStatus("Valid payment amount enter karein.", true);
    return;
  }
  const sent = sendSignal({
    type: "payment-received",
    payment: {
      amount,
      from: elements.paymentFrom.value.trim() || "Mobile UPI",
      note: elements.paymentNote.value.trim() || "Payment received",
      receivedAt: new Date().toISOString()
    }
  });
  if (!sent) {
    setStatus("Laptop connection ready nahi hai. PC par Connect mobile camera open rakhein.", true);
    return;
  }
  elements.paymentAmount.value = "";
  elements.paymentNote.value = "";
  setStatus(`Payment alert sent to PC: Rs ${amount}`);
}

async function handleSignalMessage(event) {
  const message = JSON.parse(event.data);
  if (message.type === "answer" && state.peer) {
    await state.peer.setRemoteDescription(message.sdp);
  } else if (message.type === "candidate" && state.peer) {
    await state.peer.addIceCandidate(message.candidate);
  } else if (message.type === "viewer-stopped") {
    stopCamera();
    setStatus("Laptop ne pairing disconnect kar di.", true);
  } else if (message.type === "note-saved") {
    setStatus(`Saved on PC: ${message.note.fileName}`);
  } else if (message.type === "note-error") {
    setStatus(message.message || "Photo save nahi ho saki.", true);
  }
}

function stopCamera() {
  sendSignal({ type: "phone-stopped" });
  state.stream?.getTracks().forEach((track) => track.stop());
  state.peer?.close();
  state.stream = null;
  state.peer = null;
  elements.preview.srcObject = null;
  elements.previewEmpty.classList.remove("hidden");
  elements.liveTag.textContent = "OFF";
  elements.liveTag.classList.remove("on");
  elements.shareCamera.classList.remove("hidden");
  elements.captureNote.classList.add("hidden");
  elements.stopCamera.classList.add("hidden");
  setStatus("Sharing stopped. Dobara start kar sakte hain.");
}

function sendSignal(message) {
  if (state.socket?.readyState === WebSocket.OPEN) {
    state.socket.send(JSON.stringify(message));
    return true;
  }
  return false;
}

function setStatus(text, error = false) {
  elements.status.textContent = text;
  elements.status.classList.toggle("error", error);
}
