const STORAGE_KEY = "studyflow-data-v1";

const defaultData = {
  dailyGoal: 120,
  tasks: [
    {
      id: "sample-1",
      title: "Math Assignment - Chapter 5",
      subject: "Mathematics",
      due: offsetDate(1),
      priority: "high",
      submitted: false,
      attachment: ""
    },
    {
      id: "sample-2",
      title: "Physics Lab Report",
      subject: "Physics",
      due: offsetDate(2),
      priority: "medium",
      submitted: false,
      attachment: "Lab-notes.pdf"
    },
    {
      id: "sample-3",
      title: "English Essay Draft",
      subject: "English",
      due: offsetDate(-1),
      priority: "low",
      submitted: false,
      attachment: ""
    }
  ],
  sessions: [],
  totals: {},
  rewards: {
    milestone16Claimed: false,
    milestone16ClaimedAt: null
  }
};

const state = {
  data: loadData(),
  activeFilter: "all",
  sessionRunning: false,
  sessionStartedAt: null,
  sessionSeconds: 0,
  sessionCreditedSeconds: 0,
  lastTick: null,
  cameraEnabled: false,
  cameraSource: "none",
  cameraStream: null,
  cameraInterval: null,
  presence: false,
  faceDetector: null,
  previousFrame: null,
  lastActivityAt: null,
  signalingSocket: null,
  peerConnection: null,
  pairingRoom: null,
  notes: [],
  submissions: []
};

const els = {
  todayLabel: document.querySelector("#todayLabel"),
  dailyGoal: document.querySelector("#dailyGoal"),
  goalRing: document.querySelector("#goalRing"),
  goalPercent: document.querySelector("#goalPercent"),
  todayMinutes: document.querySelector("#todayMinutes"),
  submittedCount: document.querySelector("#submittedCount"),
  dueSoonCount: document.querySelector("#dueSoonCount"),
  streakCount: document.querySelector("#streakCount"),
  sessionTimer: document.querySelector("#sessionTimer"),
  timerStatus: document.querySelector("#timerStatus"),
  creditStatus: document.querySelector("#creditStatus"),
  startSession: document.querySelector("#startSession"),
  pauseSession: document.querySelector("#pauseSession"),
  finishSession: document.querySelector("#finishSession"),
  openTaskForm: document.querySelector("#openTaskForm"),
  taskForm: document.querySelector("#taskForm"),
  cancelTaskForm: document.querySelector("#cancelTaskForm"),
  taskTitle: document.querySelector("#taskTitle"),
  taskSubject: document.querySelector("#taskSubject"),
  taskDue: document.querySelector("#taskDue"),
  taskPriority: document.querySelector("#taskPriority"),
  taskList: document.querySelector("#taskList"),
  filters: document.querySelector(".filters"),
  cameraToggle: document.querySelector("#cameraToggle"),
  connectPhone: document.querySelector("#connectPhone"),
  sourceLabel: document.querySelector("#sourceLabel"),
  pairPanel: document.querySelector("#pairPanel"),
  closePairing: document.querySelector("#closePairing"),
  roomCode: document.querySelector("#roomCode"),
  mobileLink: document.querySelector("#mobileLink"),
  lanLinks: document.querySelector("#lanLinks"),
  copyLink: document.querySelector("#copyLink"),
  pairStatus: document.querySelector("#pairStatus"),
  cameraPreview: document.querySelector("#cameraPreview"),
  cameraCanvas: document.querySelector("#cameraCanvas"),
  cameraEmpty: document.querySelector("#cameraEmpty"),
  cameraTag: document.querySelector("#cameraTag"),
  presenceSignal: document.querySelector("#presenceSignal"),
  presenceLabel: document.querySelector("#presenceLabel"),
  creditedTime: document.querySelector("#creditedTime"),
  sessionsList: document.querySelector("#sessionsList"),
  clearHistory: document.querySelector("#clearHistory"),
  notesGrid: document.querySelector("#notesGrid"),
  refreshNotes: document.querySelector("#refreshNotes"),
  homeworkProofStatus: document.querySelector("#homeworkProofStatus"),
  homeworkProofCount: document.querySelector("#homeworkProofCount"),
  studyProofStatus: document.querySelector("#studyProofStatus"),
  studyProofForm: document.querySelector("#studyProofForm"),
  studyProofFile: document.querySelector("#studyProofFile"),
  studyProofLink: document.querySelector("#studyProofLink"),
  rewardHours: document.querySelector("#rewardHours"),
  rewardBadge: document.querySelector("#rewardBadge"),
  rewardFill: document.querySelector("#rewardFill"),
  rewardMessage: document.querySelector("#rewardMessage"),
  claimReward: document.querySelector("#claimReward"),
  rewardCard: document.querySelector("#rewardCard"),
  rewardFlash: document.querySelector("#rewardFlash"),
  flashRewardStatus: document.querySelector("#flashRewardStatus"),
  toast: document.querySelector("#toast")
};

let toastTimeout;

initialize();

function initialize() {
  els.todayLabel.textContent = new Intl.DateTimeFormat("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long"
  }).format(new Date());
  els.taskDue.value = offsetDate(1);
  els.taskDue.min = toDateKey(new Date());
  els.dailyGoal.value = state.data.dailyGoal;
  bindEvents();
  render();
  loadNotes();
  loadSubmissions();
  window.setInterval(tick, 1000);
}

function bindEvents() {
  els.dailyGoal.addEventListener("change", () => {
    state.data.dailyGoal = Math.max(15, Number(els.dailyGoal.value) || 120);
    els.dailyGoal.value = state.data.dailyGoal;
    saveData();
    renderStats();
  });

  els.startSession.addEventListener("click", startSession);
  els.pauseSession.addEventListener("click", pauseSession);
  els.finishSession.addEventListener("click", finishSession);
  els.openTaskForm.addEventListener("click", () => els.taskForm.classList.remove("hidden"));
  els.cancelTaskForm.addEventListener("click", () => els.taskForm.classList.add("hidden"));
  els.taskForm.addEventListener("submit", addTask);
  els.filters.addEventListener("click", changeFilter);
  els.taskList.addEventListener("click", handleTaskAction);
  els.taskList.addEventListener("submit", submitHomeworkProof);
  els.cameraToggle.addEventListener("change", handleCameraToggle);
  els.connectPhone.addEventListener("click", handleMobileConnect);
  els.closePairing.addEventListener("click", disconnectMobileCamera);
  els.copyLink.addEventListener("click", copyMobileLink);
  els.clearHistory.addEventListener("click", clearHistory);
  els.refreshNotes.addEventListener("click", loadNotes);
  els.studyProofForm.addEventListener("submit", submitStudyProof);
  els.claimReward.addEventListener("click", claimReward);
}

function render() {
  renderStats();
  renderTasks();
  renderSessions();
  renderNotes();
  renderDailyProof();
  renderReward();
  renderCameraStatus();
  updateTimerView();
}

function renderStats() {
  const today = toDateKey(new Date());
  const recordedSeconds = state.data.totals[today] || 0;
  const liveSeconds = state.sessionCreditedSeconds;
  const todayTotal = recordedSeconds + liveSeconds;
  const goalSeconds = state.data.dailyGoal * 60;
  const progress = Math.min(100, Math.round((todayTotal / goalSeconds) * 100));
  const submitted = state.data.tasks.filter((task) => isHomeworkSubmitted(task)).length;
  const dueSoon = state.data.tasks.filter((task) => !isHomeworkSubmitted(task) && daysUntil(task.due) <= 2).length;

  els.todayMinutes.textContent = formatMinutes(todayTotal);
  els.submittedCount.textContent = String(submitted);
  els.dueSoonCount.textContent = String(dueSoon);
  els.streakCount.textContent = `${calculateStreak()} days`;
  els.goalPercent.textContent = `${progress}%`;
  els.goalRing.style.setProperty("--progress", progress);
  els.creditedTime.textContent = `${formatMinutes(state.sessionCreditedSeconds)} credited`;
}

function renderTasks() {
  const tasks = state.data.tasks.filter((task) => {
    if (state.activeFilter === "submitted") return isHomeworkSubmitted(task);
    if (state.activeFilter === "pending") return !isHomeworkSubmitted(task);
    return true;
  });

  if (!tasks.length) {
    els.taskList.innerHTML = '<div class="empty-state">Is filter me koi homework nahi hai.</div>';
    return;
  }

  els.taskList.innerHTML = tasks
    .sort((a, b) => Number(isHomeworkSubmitted(a)) - Number(isHomeworkSubmitted(b)) || a.due.localeCompare(b.due))
    .map((task) => {
      const submission = getHomeworkSubmission(task.id);
      return `
        <article class="task ${submission ? "submitted" : ""}">
          <div>
            <p class="task-title">${escapeHtml(task.title)}</p>
            <p class="task-meta">
              <span>${escapeHtml(task.subject)}</span>
              <span>Due ${formatDueDate(task.due)}</span>
              <span class="priority ${task.priority}">${task.priority}</span>
            </p>
          </div>
          <div class="task-actions">
            <button class="task-action" data-action="remove" data-id="${task.id}">Delete</button>
          </div>
          ${
            submission
              ? `<p class="submitted-proof">Submitted with proof: <a href="${encodeURI(submission.url)}" target="_blank" rel="noopener">${escapeHtml(submission.originalName)}</a></p>`
              : `<form class="homework-upload" data-task-id="${task.id}">
                   <input name="proof" type="file" accept="image/*,.pdf,.doc,.docx" required aria-label="Upload proof for ${escapeHtml(task.title)}" />
                   <button class="btn btn-primary" type="submit">Upload & submit</button>
                 </form>`
          }
        </article>
      `;
    })
    .join("");
}

function renderSessions() {
  if (!state.data.sessions.length) {
    els.sessionsList.innerHTML = '<div class="empty-state">Study session finish karne par history yahan dikhegi.</div>';
    return;
  }

  els.sessionsList.innerHTML = state.data.sessions
    .slice(0, 5)
    .map(
      (session) => `
        <article class="session-record">
          <strong>${formatMinutes(session.creditedSeconds)}</strong>
          <span>${formatSessionDate(session.date)} · ${session.cameraSource === "mobile" ? "Mobile camera" : session.cameraMode ? "Laptop camera" : "Manual"}</span>
        </article>
      `
    )
    .join("");
}

function renderNotes() {
  if (!state.notes.length) {
    els.notesGrid.innerHTML = '<div class="empty-state">Phone se note photo capture karne par yahan dikhegi.</div>';
    return;
  }

  els.notesGrid.innerHTML = state.notes
    .map(
      (note) => `
        <article class="note-photo">
          <img src="${encodeURI(note.url)}" alt="Captured note photo" loading="lazy" />
          <div>
            <strong>${escapeHtml(note.fileName)}</strong>
            <span>${formatSessionDate(note.createdAt)}</span>
            <a href="${encodeURI(note.url)}" target="_blank" rel="noopener">Open photo</a>
          </div>
        </article>
      `
    )
    .join("");
}

async function loadNotes() {
  try {
    const response = await fetch("/api/notes");
    if (!response.ok) throw new Error("Notes unavailable");
    state.notes = await response.json();
    renderNotes();
  } catch (error) {
    els.notesGrid.innerHTML = '<div class="empty-state">Photos save karne ke liye app Node server se start karein.</div>';
  }
}

function renderDailyProof() {
  const today = toDateKey(new Date());
  const homeworkCount = state.submissions.filter(
    (submission) => submission.category === "homework" && submission.date === today
  ).length;
  const studySubmission = getTodayStudySubmission();
  els.homeworkProofCount.textContent = `${homeworkCount} proof uploaded today`;
  els.homeworkProofStatus.textContent = homeworkCount ? "Uploaded today" : "Pending today";
  els.homeworkProofStatus.classList.toggle("done", homeworkCount > 0);
  els.studyProofStatus.textContent = studySubmission ? "Submitted today" : "Pending today";
  els.studyProofStatus.classList.toggle("done", Boolean(studySubmission));
  els.studyProofLink.classList.toggle("hidden", !studySubmission);
  if (studySubmission) {
    els.studyProofLink.href = studySubmission.url;
    els.studyProofLink.textContent = `Open proof: ${studySubmission.originalName}`;
  }
}

function renderReward() {
  const verifiedSeconds = StudyReward.calculateVerifiedStudySeconds(state.data.sessions, state.submissions);
  const unlocked = StudyReward.isUnlocked(verifiedSeconds);
  const claimed = Boolean(state.data.rewards?.milestone16Claimed);
  const progress = StudyReward.calculateProgress(verifiedSeconds);
  const remainingSeconds = Math.max(0, StudyReward.TARGET_SECONDS - verifiedSeconds);
  const hours = verifiedSeconds / 3600;
  els.rewardHours.textContent = `${formatHours(hours)} / 16h`;
  els.rewardFill.style.width = `${progress}%`;
  els.rewardBadge.className = `reward-badge${claimed ? " claimed" : unlocked ? " unlocked" : ""}`;
  els.rewardBadge.textContent = claimed ? "Claimed" : unlocked ? "Unlocked" : "Locked";
  els.rewardCard.classList.toggle("unlocked", unlocked && !claimed);
  els.rewardCard.classList.toggle("claimed", claimed);
  els.rewardFlash.classList.toggle("unlocked", unlocked && !claimed);
  els.rewardFlash.classList.toggle("claimed", claimed);
  els.flashRewardStatus.textContent = claimed ? "CLAIMED" : unlocked ? "UNLOCKED" : "LOCKED";
  els.claimReward.classList.toggle("hidden", !unlocked || claimed);

  if (claimed) {
    els.rewardMessage.textContent = "Gift claim recorded: choose one study gift up to Rs 50.";
  } else if (unlocked) {
    els.rewardMessage.textContent = "Milestone complete! Your Rs 50 max gift is ready to claim.";
  } else {
    els.rewardMessage.textContent = `${formatRemainingHours(remainingSeconds)} verified study remaining.`;
  }
}

async function loadSubmissions() {
  try {
    const response = await fetch("/api/submissions");
    if (!response.ok) throw new Error("Submissions unavailable");
    state.submissions = await response.json();
    renderStats();
    renderTasks();
    renderDailyProof();
    renderReward();
  } catch (error) {
    showToast("Strict uploads ke liye Node server start karein.");
  }
}

function startSession() {
  state.sessionRunning = true;
  state.sessionStartedAt ||= new Date().toISOString();
  state.lastTick = Date.now();
  els.startSession.disabled = true;
  els.pauseSession.disabled = false;
  els.finishSession.disabled = false;
  els.timerStatus.textContent = "Studying";
  els.timerStatus.classList.add("running");
  showToast("Study session started. Focus on your next task.");
  updateTimerView();
}

function pauseSession() {
  state.sessionRunning = false;
  state.lastTick = null;
  els.startSession.disabled = false;
  els.startSession.textContent = "Resume";
  els.pauseSession.disabled = true;
  els.timerStatus.textContent = "Paused";
  els.timerStatus.classList.remove("running");
  updateTimerView();
}

function finishSession() {
  if (!state.sessionStartedAt) return;

  const credited = Math.round(state.sessionCreditedSeconds);
  const date = toDateKey(new Date());
  if (credited > 0) {
    state.data.totals[date] = (state.data.totals[date] || 0) + credited;
    state.data.sessions.unshift({
      id: crypto.randomUUID(),
      date: new Date().toISOString(),
      creditedSeconds: credited,
      elapsedSeconds: Math.round(state.sessionSeconds),
      cameraMode: state.cameraEnabled,
      cameraSource: state.cameraSource
    });
  }

  state.sessionRunning = false;
  state.sessionStartedAt = null;
  state.sessionSeconds = 0;
  state.sessionCreditedSeconds = 0;
  state.lastTick = null;
  els.startSession.disabled = false;
  els.startSession.textContent = "Start study";
  els.pauseSession.disabled = true;
  els.finishSession.disabled = true;
  els.timerStatus.textContent = "Ready";
  els.timerStatus.classList.remove("running");
  saveData();
  render();
  showToast(credited ? "Session saved. Great progress today!" : "No credited study time to save.");
}

function tick() {
  if (!state.sessionRunning) return;
  const now = Date.now();
  const delta = state.lastTick ? (now - state.lastTick) / 1000 : 1;
  state.lastTick = now;
  state.sessionSeconds += delta;

  if (!state.cameraEnabled || state.presence) {
    state.sessionCreditedSeconds += delta;
  }

  updateTimerView();
  renderStats();
}

function updateTimerView() {
  els.sessionTimer.textContent = formatClock(state.sessionSeconds);
  if (state.cameraEnabled) {
    els.creditStatus.textContent = state.presence ? "Presence confirmed" : "Waiting for presence";
  } else {
    els.creditStatus.textContent = "Manual tracking";
  }
}

function addTask(event) {
  event.preventDefault();
  state.data.tasks.unshift({
    id: crypto.randomUUID(),
    title: els.taskTitle.value.trim(),
    subject: els.taskSubject.value.trim(),
    due: els.taskDue.value,
    priority: els.taskPriority.value,
    submitted: false,
    attachment: ""
  });
  saveData();
  els.taskForm.reset();
  els.taskDue.value = offsetDate(1);
  els.taskForm.classList.add("hidden");
  render();
  showToast("Homework added to your list.");
}

function changeFilter(event) {
  const button = event.target.closest("[data-filter]");
  if (!button) return;
  state.activeFilter = button.dataset.filter;
  document.querySelectorAll(".chip").forEach((chip) => chip.classList.toggle("active", chip === button));
  renderTasks();
}

function handleTaskAction(event) {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  const task = state.data.tasks.find((entry) => entry.id === button.dataset.id);
  if (!task) return;

  if (button.dataset.action === "remove") {
    state.data.tasks = state.data.tasks.filter((entry) => entry.id !== task.id);
    showToast("Homework deleted.");
  }

  saveData();
  render();
}

async function submitHomeworkProof(event) {
  if (!event.target.matches(".homework-upload")) return;
  event.preventDefault();
  const task = state.data.tasks.find((entry) => entry.id === event.target.dataset.taskId);
  const file = event.target.elements.proof.files[0];
  if (!task || !file) {
    showToast("Homework proof file select karein.");
    return;
  }
  const submission = await uploadSubmission({
    category: "homework",
    date: toDateKey(new Date()),
    taskId: task.id,
    title: task.title,
    file
  });
  if (!submission) return;
  task.submitted = true;
  saveData();
  state.submissions.unshift(submission);
  render();
  showToast("Homework proof upload hua. Submission complete.");
}

async function submitStudyProof(event) {
  event.preventDefault();
  const today = toDateKey(new Date());
  if (!(state.data.totals[today] > 0)) {
    showToast("Pehle aaj ka study session finish karein, phir proof upload karein.");
    return;
  }
  const file = els.studyProofFile.files[0];
  if (!file) {
    showToast("Daily study proof file select karein.");
    return;
  }
  const submission = await uploadSubmission({
    category: "study",
    date: today,
    title: "Daily study proof",
    file
  });
  if (!submission) return;
  state.submissions = [submission, ...state.submissions.filter((entry) => !(entry.category === "study" && entry.date === today))];
  els.studyProofForm.reset();
  renderDailyProof();
  renderReward();
  showToast("Aaj ka study proof submitted.");
}

async function uploadSubmission({ category, date, taskId = "", title, file }) {
  const body = new FormData();
  body.append("category", category);
  body.append("date", date);
  body.append("taskId", taskId);
  body.append("title", title);
  body.append("proof", file);
  try {
    const response = await fetch("/api/submissions", { method: "POST", body });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || "Upload failed");
    return result;
  } catch (error) {
    showToast(error.message || "Proof upload nahi ho saka.");
    return null;
  }
}

function isHomeworkSubmitted(task) {
  return Boolean(getHomeworkSubmission(task.id));
}

function getHomeworkSubmission(taskId) {
  return state.submissions.find((submission) => submission.category === "homework" && submission.taskId === taskId);
}

function getTodayStudySubmission() {
  const today = toDateKey(new Date());
  return state.submissions.find((submission) => submission.category === "study" && submission.date === today);
}

function claimReward() {
  const verifiedSeconds = StudyReward.calculateVerifiedStudySeconds(state.data.sessions, state.submissions);
  if (!StudyReward.isUnlocked(verifiedSeconds) || state.data.rewards.milestone16Claimed) return;
  state.data.rewards.milestone16Claimed = true;
  state.data.rewards.milestone16ClaimedAt = new Date().toISOString();
  saveData();
  renderReward();
  showToast("Gift claimed! Rs 50 tak ka study gift ready hai.");
}

async function handleCameraToggle() {
  if (els.cameraToggle.checked) {
    disconnectMobileCamera();
    await enableCamera();
  } else {
    disableCamera();
  }
}

async function enableCamera() {
  if (!navigator.mediaDevices?.getUserMedia) {
    els.cameraToggle.checked = false;
    showToast("Is browser me camera access supported nahi hai.");
    return;
  }

  try {
    state.cameraStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 420 } },
      audio: false
    });
    state.cameraEnabled = true;
    state.cameraSource = "laptop";
    els.cameraPreview.srcObject = state.cameraStream;
    els.cameraEmpty.classList.add("hidden");
    state.faceDetector = "FaceDetector" in window ? new FaceDetector({ fastMode: true, maxDetectedFaces: 1 }) : null;
    state.cameraInterval = window.setInterval(analyzePresence, 1500);
    analyzePresence();
    renderCameraStatus();
    showToast("Camera focus mode on. Video device par hi process hota hai.");
  } catch (error) {
    els.cameraToggle.checked = false;
    showToast("Camera permission nahi mili. Manual timer available hai.");
  }
}

function disableCamera() {
  if (state.cameraSource === "laptop") {
    state.cameraStream?.getTracks().forEach((track) => track.stop());
  }
  window.clearInterval(state.cameraInterval);
  state.cameraEnabled = false;
  state.cameraSource = "none";
  state.cameraStream = null;
  state.cameraInterval = null;
  state.faceDetector = null;
  state.previousFrame = null;
  state.lastActivityAt = null;
  state.presence = false;
  els.cameraPreview.srcObject = null;
  els.cameraEmpty.classList.remove("hidden");
  renderCameraStatus();
}

async function handleMobileConnect() {
  if (state.cameraSource === "mobile" || state.pairingRoom) {
    disconnectMobileCamera();
    return;
  }
  if (state.cameraEnabled) {
    els.cameraToggle.checked = false;
    disableCamera();
  }

  state.pairingRoom = createRoomCode();
  els.roomCode.textContent = state.pairingRoom;
  els.pairPanel.classList.remove("hidden");
  els.connectPhone.textContent = "Disconnect mobile";
  els.pairStatus.textContent = "Creating mobile link...";

  try {
    const response = await fetch("/api/info");
    if (!response.ok) throw new Error("Pairing server unavailable");
    const info = await response.json();
    const baseUrl = info.preferredUrl || window.location.origin;
    const phoneUrl = new URL("/mobile.html", baseUrl);
    phoneUrl.searchParams.set("room", state.pairingRoom);
    els.mobileLink.value = phoneUrl.href;
    renderLanLinks(info.urls || []);
    connectSignaling();
    els.pairStatus.textContent = info.secure
      ? "Phone link ready. Waiting for camera..."
      : "HTTPS required on phone for camera permission. See setup steps.";
  } catch (error) {
    els.mobileLink.value = "";
    renderLanLinks([]);
    els.pairStatus.textContent = "Run with node server.js to enable phone pairing.";
  }
}

function renderLanLinks(urls) {
  if (!urls.length) {
    els.lanLinks.classList.add("hidden");
    els.lanLinks.innerHTML = "";
    return;
  }
  els.lanLinks.classList.remove("hidden");
  els.lanLinks.innerHTML = `
    <strong>Same Wi-Fi par phone se in laptop addresses ko open kar sakte hain:</strong>
    ${urls.map((url) => `<a href="${url}" target="_blank" rel="noopener">${url}</a>`).join("")}
  `;
}

function connectSignaling() {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  state.signalingSocket = new WebSocket(`${protocol}//${window.location.host}/signal?room=${state.pairingRoom}&role=viewer`);
  state.signalingSocket.addEventListener("message", handleSignalMessage);
  state.signalingSocket.addEventListener("close", () => {
    if (state.pairingRoom && state.cameraSource !== "mobile") {
      els.pairStatus.textContent = "Pairing connection closed.";
    }
  });
}

async function handleSignalMessage(event) {
  const message = JSON.parse(event.data);
  if (message.type === "phone-ready") {
    els.pairStatus.textContent = "Phone connected. Share camera tap karein.";
    return;
  }
  if (message.type === "note-saved") {
    state.notes = [message.note, ...state.notes.filter((note) => note.fileName !== message.note.fileName)];
    renderNotes();
    showToast("Note photo PC par save ho gayi.");
    return;
  }
  if (message.type === "offer") {
    await acceptMobileOffer(message.sdp);
    return;
  }
  if (message.type === "candidate" && state.peerConnection) {
    await state.peerConnection.addIceCandidate(message.candidate);
    return;
  }
  if (message.type === "phone-stopped") {
    disconnectMobileCamera();
    showToast("Mobile camera disconnected.");
  }
}

async function acceptMobileOffer(offer) {
  state.peerConnection?.close();
  state.peerConnection = new RTCPeerConnection({
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
  });
  state.peerConnection.addEventListener("icecandidate", (event) => {
    if (event.candidate) sendSignal({ type: "candidate", candidate: event.candidate });
  });
  state.peerConnection.addEventListener("track", (event) => activateMobileCamera(event.streams[0]));
  state.peerConnection.addEventListener("connectionstatechange", () => {
    if (["disconnected", "failed", "closed"].includes(state.peerConnection?.connectionState)) {
      disconnectMobileCamera();
    }
  });
  await state.peerConnection.setRemoteDescription(offer);
  const answer = await state.peerConnection.createAnswer();
  await state.peerConnection.setLocalDescription(answer);
  sendSignal({ type: "answer", sdp: state.peerConnection.localDescription });
}

function activateMobileCamera(stream) {
  state.cameraStream = stream;
  state.cameraEnabled = true;
  state.cameraSource = "mobile";
  els.cameraPreview.srcObject = stream;
  els.cameraEmpty.classList.add("hidden");
  state.faceDetector = "FaceDetector" in window ? new FaceDetector({ fastMode: true, maxDetectedFaces: 1 }) : null;
  window.clearInterval(state.cameraInterval);
  state.cameraInterval = window.setInterval(analyzePresence, 1500);
  analyzePresence();
  els.pairStatus.textContent = "Mobile camera is live on laptop.";
  renderCameraStatus();
  showToast("Mobile camera connected for study tracking.");
}

function sendSignal(message) {
  if (state.signalingSocket?.readyState === WebSocket.OPEN) {
    state.signalingSocket.send(JSON.stringify(message));
  }
}

function disconnectMobileCamera() {
  const wasMobile = state.cameraSource === "mobile";
  state.peerConnection?.close();
  state.signalingSocket?.close();
  state.peerConnection = null;
  state.signalingSocket = null;
  state.pairingRoom = null;
  els.pairPanel.classList.add("hidden");
  els.connectPhone.textContent = "Connect mobile camera";
  if (wasMobile) disableCamera();
}

async function copyMobileLink() {
  if (!els.mobileLink.value) return;
  try {
    await navigator.clipboard.writeText(els.mobileLink.value);
    showToast("Mobile pairing link copied.");
  } catch (error) {
    els.mobileLink.select();
    showToast("Pairing link select kiya gaya. Copy karein.");
  }
}

async function analyzePresence() {
  if (!state.cameraEnabled || els.cameraPreview.readyState < 2) return;
  const canvas = els.cameraCanvas;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  canvas.width = 80;
  canvas.height = 55;
  context.drawImage(els.cameraPreview, 0, 0, canvas.width, canvas.height);

  if (state.faceDetector) {
    try {
      const faces = await state.faceDetector.detect(canvas);
      state.presence = faces.length > 0;
      renderCameraStatus("Face presence");
      return;
    } catch (error) {
      state.faceDetector = null;
    }
  }

  const frame = context.getImageData(0, 0, canvas.width, canvas.height).data;
  if (!state.previousFrame) {
    state.previousFrame = new Uint8ClampedArray(frame);
    state.presence = true;
    state.lastActivityAt = Date.now();
  } else {
    let brightness = 0;
    let difference = 0;
    for (let index = 0; index < frame.length; index += 16) {
      brightness += frame[index] + frame[index + 1] + frame[index + 2];
      difference += Math.abs(frame[index] - state.previousFrame[index]);
      difference += Math.abs(frame[index + 1] - state.previousFrame[index + 1]);
      difference += Math.abs(frame[index + 2] - state.previousFrame[index + 2]);
    }
    const litFrame = brightness / (frame.length / 16) > 35;
    const hasMotion = difference / (frame.length / 16) > 1.3;
    if (litFrame && hasMotion) {
      state.lastActivityAt = Date.now();
    }
    state.presence = litFrame && Date.now() - (state.lastActivityAt || 0) < 60000;
    state.previousFrame = new Uint8ClampedArray(frame);
  }
  renderCameraStatus("Activity signal");
}

function renderCameraStatus(method) {
  const on = state.cameraEnabled;
  els.cameraTag.textContent = on ? (state.cameraSource === "mobile" ? "LIVE - PHONE" : "LIVE - LOCAL") : "OFF";
  els.cameraTag.classList.toggle("active", on);
  els.presenceSignal.classList.toggle("active", on && state.presence);
  els.sourceLabel.textContent =
    state.cameraSource === "mobile"
      ? "Mobile camera connected"
      : state.cameraSource === "laptop"
        ? "Laptop camera active"
        : "No camera connected";

  if (!on) {
    els.presenceLabel.textContent = "Tracking disabled";
  } else if (state.presence) {
    els.presenceLabel.textContent = `${method || "Presence"} detected`;
  } else {
    els.presenceLabel.textContent = "Away / no presence";
  }
  updateTimerView();
}

function clearHistory() {
  state.data.sessions = [];
  state.data.totals = {};
  saveData();
  render();
  showToast("Study history cleared.");
}

function calculateStreak() {
  let streak = 0;
  const date = new Date();
  while ((state.data.totals[toDateKey(date)] || 0) > 0) {
    streak += 1;
    date.setDate(date.getDate() - 1);
  }
  return streak;
}

function loadData() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return saved
      ? { ...defaultData, ...saved, rewards: { ...defaultData.rewards, ...saved.rewards } }
      : structuredClone(defaultData);
  } catch (error) {
    return structuredClone(defaultData);
  }
}

function saveData() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.data));
}

function showToast(message) {
  window.clearTimeout(toastTimeout);
  els.toast.textContent = message;
  els.toast.classList.add("show");
  toastTimeout = window.setTimeout(() => els.toast.classList.remove("show"), 2700);
}

function createRoomCode() {
  return crypto.getRandomValues(new Uint32Array(1))[0].toString(36).slice(0, 6).toUpperCase();
}

function offsetDate(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return toDateKey(date);
}

function toDateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function daysUntil(dateString) {
  const today = new Date(`${toDateKey(new Date())}T00:00:00`);
  const due = new Date(`${dateString}T00:00:00`);
  return Math.ceil((due - today) / 86400000);
}

function formatDueDate(dateString) {
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short" }).format(new Date(`${dateString}T00:00:00`));
}

function formatSessionDate(dateString) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(dateString));
}

function formatClock(seconds) {
  const wholeSeconds = Math.floor(seconds);
  const hours = Math.floor(wholeSeconds / 3600);
  const minutes = Math.floor((wholeSeconds % 3600) / 60);
  const remaining = wholeSeconds % 60;
  return [hours, minutes, remaining].map((value) => String(value).padStart(2, "0")).join(":");
}

function formatMinutes(seconds) {
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
}

function formatHours(hours) {
  if (hours === 0) return "0h";
  if (Number.isInteger(hours)) return `${hours}h`;
  return `${hours.toFixed(1)}h`;
}

function formatRemainingHours(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.ceil((seconds % 3600) / 60);
  if (!minutes) return `${hours}h`;
  if (!hours) return `${minutes}m`;
  return `${hours}h ${minutes}m`;
}

function escapeHtml(text) {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
