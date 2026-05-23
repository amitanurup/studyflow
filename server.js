const fs = require("node:fs");
const http = require("node:http");
const https = require("node:https");
const os = require("node:os");
const path = require("node:path");
const Busboy = require("busboy");
const { WebSocketServer, WebSocket } = require("ws");

const port = Number(process.env.PORT || 4173);
const host = process.env.HOST || "0.0.0.0";
const sslKey = process.env.SSL_KEY;
const sslCert = process.env.SSL_CERT;
const secure = Boolean(sslKey && sslCert);
const root = __dirname;
const dataDir = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : root;
const appPassword = process.env.APP_PASSWORD || "";
const authCookieName = "studyflow_auth";
const notesDir = path.join(dataDir, "saved-notes");
const noteFilePattern = /^note-\d{4}-\d{2}-\d{2}T[\d-]+Z-[a-f0-9]{6}\.(jpg|png)$/;
const submissionsDir = path.join(dataDir, "submitted-files");
const submissionsFile = path.join(submissionsDir, "submissions.json");
fs.mkdirSync(notesDir, { recursive: true });
fs.mkdirSync(path.join(submissionsDir, "homework"), { recursive: true });
fs.mkdirSync(path.join(submissionsDir, "study"), { recursive: true });
const publicFiles = new Set([
  "/",
  "/index.html",
  "/styles.css",
  "/reward.js",
  "/app.js",
  "/mobile.html",
  "/mobile.css",
  "/mobile.js"
]);
const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".jpg": "image/jpeg",
  ".png": "image/png"
};

const requestHandler = (request, response) => {
  const protocol = getRequestProtocol(request);
  const url = new URL(request.url, `${protocol}://${request.headers.host}`);
  if (appPassword && url.pathname !== "/login" && !isAuthenticated(request)) {
    if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/notes/") || url.pathname.startsWith("/evidence/")) {
      sendJson(response, 401, { message: "Login required." });
      return;
    }
    showLogin(response);
    return;
  }
  if (appPassword && url.pathname === "/login") {
    handleLogin(request, response);
    return;
  }
  if (url.pathname === "/api/info") {
    const lanAddresses = getLanAddresses();
    const urls = lanAddresses.map((address) => `${protocol}://${address}:${port}`);
    const requestHost = request.headers.host || `localhost:${port}`;
    const requestUrl = `${protocol}://${requestHost}`;
    const requestHostname = requestHost.split(":")[0].toLowerCase();
    const isLocalhost = ["localhost", "127.0.0.1", "::1", "[::1]"].includes(requestHostname);
    const preferredUrl = isLocalhost ? urls[0] || requestUrl : requestUrl;
    response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ secure, urls, requestUrl, preferredUrl }));
    return;
  }
  if (url.pathname === "/api/notes") {
    const notes = getSavedNotes();
    response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify(notes));
    return;
  }
  if (url.pathname === "/api/submissions" && request.method === "GET") {
    response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify(readSubmissions()));
    return;
  }
  if (url.pathname === "/api/submissions" && request.method === "POST") {
    receiveSubmission(request, response);
    return;
  }
  if (url.pathname.startsWith("/evidence/")) {
    serveEvidence(url.pathname, response);
    return;
  }
  if (url.pathname.startsWith("/notes/")) {
    const fileName = path.basename(url.pathname);
    if (!noteFilePattern.test(fileName)) {
      response.writeHead(404);
      response.end("Not found");
      return;
    }
    const filePath = path.join(notesDir, fileName);
    fs.readFile(filePath, (error, contents) => {
      if (error) {
        response.writeHead(404);
        response.end("Not found");
        return;
      }
      response.writeHead(200, { "Content-Type": contentTypes[path.extname(filePath)] });
      response.end(contents);
    });
    return;
  }

  if (!publicFiles.has(url.pathname)) {
    response.writeHead(404);
    response.end("Not found");
    return;
  }

  const filePath = path.join(root, url.pathname === "/" ? "index.html" : url.pathname.slice(1));
  fs.readFile(filePath, (error, contents) => {
    if (error) {
      response.writeHead(500);
      response.end("Unable to load page");
      return;
    }
    response.writeHead(200, { "Content-Type": contentTypes[path.extname(filePath)] });
    response.end(contents);
  });
};

const server = secure
  ? https.createServer({ key: fs.readFileSync(sslKey), cert: fs.readFileSync(sslCert) }, requestHandler)
  : http.createServer(requestHandler);
const sockets = new WebSocketServer({ noServer: true });
const rooms = new Map();

server.on("upgrade", (request, socket, head) => {
  if (appPassword && !isAuthenticated(request)) {
    socket.destroy();
    return;
  }
  const url = new URL(request.url, `${getRequestProtocol(request)}://${request.headers.host}`);
  if (url.pathname !== "/signal") {
    socket.destroy();
    return;
  }
  const room = url.searchParams.get("room");
  const role = url.searchParams.get("role");
  if (!room || !["viewer", "phone"].includes(role)) {
    socket.destroy();
    return;
  }
  sockets.handleUpgrade(request, socket, head, (webSocket) => {
    sockets.emit("connection", webSocket, { room, role });
  });
});

sockets.on("connection", (socket, client) => {
  const room = rooms.get(client.room) || {};
  room[client.role]?.close();
  room[client.role] = socket;
  rooms.set(client.room, room);

  if (client.role === "phone" && room.viewer?.readyState === WebSocket.OPEN) {
    room.viewer.send(JSON.stringify({ type: "phone-ready" }));
  }

  socket.on("message", (rawMessage) => {
    if (rawMessage.length > 8_000_000) {
      socket.send(JSON.stringify({ type: "note-error", message: "Photo file too large." }));
      return;
    }
    let message;
    try {
      message = JSON.parse(rawMessage.toString());
    } catch (error) {
      return;
    }
    if (client.role === "phone" && message.type === "note-photo") {
      const note = saveNotePhoto(message.dataUrl);
      if (!note) {
        socket.send(JSON.stringify({ type: "note-error", message: "Photo save nahi ho saki." }));
        return;
      }
      const savedMessage = JSON.stringify({ type: "note-saved", note });
      socket.send(savedMessage);
      if (room.viewer?.readyState === WebSocket.OPEN) room.viewer.send(savedMessage);
      return;
    }
    const targetRole = client.role === "phone" ? "viewer" : "phone";
    if (room[targetRole]?.readyState === WebSocket.OPEN) {
      room[targetRole].send(JSON.stringify(message));
    }
  });

  socket.on("close", () => {
    if (room[client.role] !== socket) return;
    delete room[client.role];
    const targetRole = client.role === "phone" ? "viewer" : "phone";
    if (room[targetRole]?.readyState === WebSocket.OPEN) {
      room[targetRole].send(JSON.stringify({ type: client.role === "phone" ? "phone-stopped" : "viewer-stopped" }));
    }
    if (!room.viewer && !room.phone) rooms.delete(client.room);
  });
});

server.listen(port, host, () => {
  const label = secure ? "Secure StudyFlow" : "StudyFlow";
  console.log(`${label} running at ${secure ? "https" : "http"}://localhost:${port}`);
  console.log(`Data directory: ${dataDir}`);
  console.log(`Password protection: ${appPassword ? "enabled" : "disabled"}`);
  getLanAddresses().forEach((address) => console.log(`Phone link base: ${secure ? "https" : "http"}://${address}:${port}`));
  if (!secure) console.log("Mobile camera permission requires HTTPS. Use local SSL or a cloud host with HTTPS.");
});

function getRequestProtocol(request) {
  return (request.headers["x-forwarded-proto"] || (secure ? "https" : "http")).split(",")[0].trim();
}

function isAuthenticated(request) {
  const cookieHeader = request.headers.cookie || "";
  return cookieHeader.split(";").map((cookie) => cookie.trim()).includes(`${authCookieName}=1`);
}

function handleLogin(request, response) {
  if (request.method !== "POST") {
    showLogin(response);
    return;
  }
  const chunks = [];
  request.on("data", (chunk) => chunks.push(chunk));
  request.on("end", () => {
    const params = new URLSearchParams(Buffer.concat(chunks).toString("utf8"));
    if (params.get("password") !== appPassword) {
      showLogin(response, true);
      return;
    }
    response.writeHead(302, {
      "Set-Cookie": `${authCookieName}=1; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000`,
      Location: "/"
    });
    response.end();
  });
}

function showLogin(response, failed = false) {
  response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  response.end(`<!doctype html>
<html lang="hi">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>StudyFlow Login</title>
  <style>
    body{min-height:100vh;margin:0;display:grid;place-items:center;background:#071525;color:#edf4ff;font-family:Arial,sans-serif}
    form{width:min(92vw,380px);border:1px solid rgba(173,196,222,.18);border-radius:18px;padding:26px;background:#0d2239;box-shadow:0 18px 50px rgba(0,0,0,.28)}
    h1{margin:0 0 8px;font-size:28px} p{margin:0 0 18px;color:#9db2cc} input,button{width:100%;box-sizing:border-box;border-radius:10px;padding:12px;font:inherit}
    input{border:1px solid rgba(173,196,222,.22);background:#071525;color:white;margin-bottom:12px} button{border:0;background:#7367f6;color:white;font-weight:700}
    .error{color:#ff9ab0;margin-bottom:12px}
  </style>
</head>
<body>
  <form method="post" action="/login">
    <h1>StudyFlow</h1>
    <p>Public app access ke liye password enter karein.</p>
    ${failed ? '<div class="error">Wrong password. Try again.</div>' : ''}
    <input name="password" type="password" placeholder="App password" required autofocus />
    <button type="submit">Open dashboard</button>
  </form>
</body>
</html>`);
}

function getLanAddresses() {
  const addresses = [];
  for (const interfaces of Object.values(os.networkInterfaces())) {
    for (const entry of interfaces || []) {
      if (entry.family === "IPv4" && !entry.internal && !entry.address.startsWith("169.254.")) {
        addresses.push(entry.address);
      }
    }
  }
  return addresses.sort((left, right) => Number(!left.startsWith("192.168.")) - Number(!right.startsWith("192.168.")));
}

function saveNotePhoto(dataUrl) {
  if (typeof dataUrl !== "string") return null;
  const match = /^data:(image\/(?:jpeg|png));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!match) return null;
  const extension = match[1] === "image/png" ? "png" : "jpg";
  const contents = Buffer.from(match[2], "base64");
  if (!contents.length || contents.length > 5_000_000) return null;
  const now = new Date();
  const timestamp = now.toISOString().replaceAll(":", "-").replace(".", "-");
  const suffix = Math.random().toString(16).slice(2, 8).padEnd(6, "0");
  const fileName = `note-${timestamp}-${suffix}.${extension}`;
  fs.writeFileSync(path.join(notesDir, fileName), contents);
  return {
    fileName,
    createdAt: now.toISOString(),
    url: `/notes/${fileName}`
  };
}

function getSavedNotes() {
  return fs
    .readdirSync(notesDir)
    .filter((fileName) => noteFilePattern.test(fileName))
    .map((fileName) => {
      const stats = fs.statSync(path.join(notesDir, fileName));
      return {
        fileName,
        createdAt: stats.mtime.toISOString(),
        url: `/notes/${fileName}`
      };
    })
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

function receiveSubmission(request, response) {
  let busboy;
  try {
    busboy = Busboy({
      headers: request.headers,
      limits: { files: 1, fileSize: 10 * 1024 * 1024, fields: 5 }
    });
  } catch (error) {
    sendJson(response, 400, { message: "Valid upload form required." });
    return;
  }

  const fields = {};
  let upload = null;
  let fileTooLarge = false;
  busboy.on("field", (name, value) => {
    if (["category", "date", "taskId", "title"].includes(name)) fields[name] = value.slice(0, 120);
  });
  busboy.on("file", (name, stream, info) => {
    if (name !== "proof") {
      stream.resume();
      return;
    }
    const chunks = [];
    stream.on("data", (chunk) => chunks.push(chunk));
    stream.on("limit", () => {
      fileTooLarge = true;
    });
    stream.on("end", () => {
      upload = {
        buffer: Buffer.concat(chunks),
        originalName: path.basename(info.filename || "proof-file"),
        mimeType: info.mimeType
      };
    });
  });
  busboy.on("close", () => {
    if (fileTooLarge) {
      sendJson(response, 413, { message: "Proof file 10 MB se chhoti honi chahiye." });
      return;
    }
    const error = validateSubmission(fields, upload);
    if (error) {
      sendJson(response, 400, { message: error });
      return;
    }
    const submission = writeSubmission(fields, upload);
    sendJson(response, 201, submission);
  });
  request.pipe(busboy);
}

function validateSubmission(fields, upload) {
  if (!["homework", "study"].includes(fields.category)) return "Submission type invalid hai.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fields.date || "")) return "Submission date missing hai.";
  if (fields.category === "homework" && !fields.taskId) return "Homework task missing hai.";
  if (!upload || !upload.buffer.length) return "Proof file upload compulsory hai.";
  const allowed = new Set([
    "image/jpeg",
    "image/png",
    "image/webp",
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ]);
  if (!allowed.has(upload.mimeType)) return "Image, PDF ya Word proof file upload karein.";
  return null;
}

function writeSubmission(fields, upload) {
  const extension = evidenceExtension(upload.mimeType);
  const timestamp = new Date().toISOString().replaceAll(":", "-").replace(".", "-");
  const suffix = Math.random().toString(16).slice(2, 8).padEnd(6, "0");
  const fileName = `${fields.category}-${fields.date}-${timestamp}-${suffix}.${extension}`;
  fs.writeFileSync(path.join(submissionsDir, fields.category, fileName), upload.buffer);
  const submission = {
    id: `${fields.category}-${timestamp}-${suffix}`,
    category: fields.category,
    date: fields.date,
    taskId: fields.taskId || "",
    title: fields.title || "",
    originalName: upload.originalName,
    fileName,
    mimeType: upload.mimeType,
    createdAt: new Date().toISOString(),
    url: `/evidence/${fields.category}/${fileName}`
  };
  let submissions = readSubmissions();
  if (submission.category === "study") {
    const replaced = submissions.find((entry) => entry.category === "study" && entry.date === submission.date);
    if (replaced) deleteEvidence(replaced);
    submissions = submissions.filter((entry) => !(entry.category === "study" && entry.date === submission.date));
  }
  if (submission.category === "homework") {
    const replaced = submissions.find((entry) => entry.category === "homework" && entry.taskId === submission.taskId);
    if (replaced) deleteEvidence(replaced);
    submissions = submissions.filter((entry) => !(entry.category === "homework" && entry.taskId === submission.taskId));
  }
  submissions.unshift(submission);
  fs.writeFileSync(submissionsFile, JSON.stringify(submissions, null, 2));
  return submission;
}

function readSubmissions() {
  try {
    return JSON.parse(fs.readFileSync(submissionsFile, "utf8"));
  } catch (error) {
    return [];
  }
}

function serveEvidence(requestPath, response) {
  const parts = requestPath.split("/").filter(Boolean);
  if (parts.length !== 3 || parts[0] !== "evidence" || !["homework", "study"].includes(parts[1])) {
    response.writeHead(404);
    response.end("Not found");
    return;
  }
  const fileName = path.basename(parts[2]);
  const submission = readSubmissions().find((entry) => entry.category === parts[1] && entry.fileName === fileName);
  if (!submission) {
    response.writeHead(404);
    response.end("Not found");
    return;
  }
  fs.readFile(path.join(submissionsDir, submission.category, fileName), (error, contents) => {
    if (error) {
      response.writeHead(404);
      response.end("Not found");
      return;
    }
    response.writeHead(200, { "Content-Type": submission.mimeType });
    response.end(contents);
  });
}

function deleteEvidence(submission) {
  const filePath = path.join(submissionsDir, submission.category, submission.fileName);
  try {
    fs.unlinkSync(filePath);
  } catch (error) {
    // An already-removed proof file should not block replacement.
  }
}

function evidenceExtension(mimeType) {
  return {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "application/pdf": "pdf",
    "application/msword": "doc",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx"
  }[mimeType];
}

function sendJson(response, status, body) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(body));
}
