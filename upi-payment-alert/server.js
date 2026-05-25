const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { WebSocketServer, WebSocket } = require("ws");

const port = Number(process.env.PORT || 4180);
const host = process.env.HOST || "0.0.0.0";
const root = path.join(__dirname, "public");
const roomName = "UPI-PAYMENT-ALERT";
const rooms = new Map();

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8"
};

const server = http.createServer((request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || `localhost:${port}`}`);
  if (url.pathname === "/api/info") {
    sendJson(response, {
      room: roomName,
      pcUrl: getRequestBaseUrl(request),
      mobileUrl: `${getRequestBaseUrl(request)}/mobile.html?room=${encodeURIComponent(roomName)}`,
      smsBridgeUrl: `${getRequestBaseUrl(request)}/api/sms-payment`,
      lanUrls: getLanAddresses().map((address) => `http://${address}:${port}`),
      note: "Automatic SMS sync ke liye Android SMS Bridge app ko SMS permission aur smsBridgeUrl chahiye."
    });
    return;
  }
  if (url.pathname === "/api/sms-payment" && request.method === "POST") {
    receiveSmsPayment(request, response);
    return;
  }

  const filePath = getStaticFilePath(url.pathname);
  if (!filePath) {
    response.writeHead(404);
    response.end("Not found");
    return;
  }

  fs.readFile(filePath, (error, contents) => {
    if (error) {
      response.writeHead(404);
      response.end("Not found");
      return;
    }
    response.writeHead(200, { "Content-Type": contentTypes[path.extname(filePath)] || "application/octet-stream" });
    response.end(contents);
  });
});

const sockets = new WebSocketServer({ noServer: true });

server.on("upgrade", (request, socket, head) => {
  const url = new URL(request.url, `http://${request.headers.host || `localhost:${port}`}`);
  if (url.pathname !== "/sync") {
    socket.destroy();
    return;
  }
  const room = url.searchParams.get("room") || roomName;
  const role = url.searchParams.get("role");
  if (!["pc", "mobile"].includes(role)) {
    socket.destroy();
    return;
  }
  sockets.handleUpgrade(request, socket, head, (webSocket) => {
    sockets.emit("connection", webSocket, { room, role });
  });
});

sockets.on("connection", (socket, client) => {
  const room = rooms.get(client.room) || { pc: new Set(), mobile: new Set() };
  room[client.role].add(socket);
  rooms.set(client.room, room);

  broadcast(room.pc, { type: "status", message: "Mobile connected", mobileCount: room.mobile.size });
  broadcast(room.mobile, { type: "status", message: "PC connected", pcCount: room.pc.size });

  socket.on("message", (rawMessage) => {
    let message;
    try {
      message = JSON.parse(rawMessage.toString());
    } catch {
      return;
    }

    if (client.role === "mobile" && message.type === "payment-received") {
      const payment = sanitizePayment(message.payment);
      broadcast(room.pc, { type: "payment-received", payment });
      socket.send(JSON.stringify({ type: "sent", payment }));
      return;
    }

    if (client.role === "pc" && message.type === "ping-mobile") {
      broadcast(room.mobile, { type: "pc-ready" });
    }
  });

  socket.on("close", () => {
    room[client.role].delete(socket);
    broadcast(room.pc, { type: "status", message: "Connection updated", mobileCount: room.mobile.size });
    broadcast(room.mobile, { type: "status", message: "Connection updated", pcCount: room.pc.size });
    if (!room.pc.size && !room.mobile.size) rooms.delete(client.room);
  });
});

server.listen(port, host, () => {
  console.log(`UPI Payment Alert running at http://localhost:${port}`);
  getLanAddresses().forEach((address) => console.log(`Mobile/PC on same Wi-Fi: http://${address}:${port}`));
});

function getStaticFilePath(urlPath) {
  const safePath = urlPath === "/" ? "/index.html" : urlPath;
  if (!["/index.html", "/mobile.html", "/styles.css", "/app.js", "/mobile.js"].includes(safePath)) return null;
  return path.join(root, safePath.slice(1));
}

function getRequestBaseUrl(request) {
  return `http://${request.headers.host || `localhost:${port}`}`;
}

function getLanAddresses() {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter((network) => network && network.family === "IPv4" && !network.internal)
    .map((network) => network.address);
}

function sendJson(response, data, statusCode = 200) {
  response.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(data));
}

function broadcast(clients, message) {
  const text = JSON.stringify(message);
  clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) client.send(text);
  });
}

function sanitizePayment(payment = {}) {
  return {
    amount: Math.max(0, Math.round(Number(payment.amount || 0))),
    from: String(payment.from || "Mobile UPI").slice(0, 80),
    note: String(payment.note || "Payment received").slice(0, 120),
    upiApp: String(payment.upiApp || "UPI").slice(0, 40),
    receivedAt: payment.receivedAt || new Date().toISOString()
  };
}

function receiveSmsPayment(request, response) {
  readJsonBody(request, (error, body) => {
    if (error) {
      sendJson(response, { ok: false, message: "Invalid JSON body." }, 400);
      return;
    }
    const parsed = parseUpiSms(body.sms || body.message || "", body.sender || "");
    if (!parsed) {
      sendJson(response, { ok: false, message: "UPI credit SMS parse nahi hua." }, 422);
      return;
    }
    const payment = sanitizePayment({
      ...parsed,
      receivedAt: body.receivedAt || new Date().toISOString()
    });
    const room = rooms.get(roomName);
    if (room) broadcast(room.pc, { type: "payment-received", payment });
    sendJson(response, { ok: true, payment });
  });
}

function readJsonBody(request, callback) {
  const chunks = [];
  let size = 0;
  request.on("data", (chunk) => {
    size += chunk.length;
    if (size > 64_000) request.destroy();
    chunks.push(chunk);
  });
  request.on("end", () => {
    try {
      callback(null, JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"));
    } catch (error) {
      callback(error);
    }
  });
}

function parseUpiSms(message, sender = "") {
  const text = String(message).replace(/\s+/g, " ").trim();
  const lower = text.toLowerCase();
  const hasCreditSignal = /\b(credited|received|deposited|cr|credit)\b/.test(lower);
  const hasDebitSignal = /\b(debited|spent|sent|paid|withdrawn|purchase|dr|debit)\b/.test(lower);
  if (!hasCreditSignal || hasDebitSignal) return null;

  const amountMatch = text.match(/(?:rs\.?|inr|₹)\s*([0-9][0-9,]*(?:\.\d{1,2})?)/i);
  if (!amountMatch) return null;
  const amount = Number(amountMatch[1].replace(/,/g, ""));
  if (!amount || amount <= 0) return null;

  const fromMatch =
    text.match(/\bfrom\s+([A-Z0-9 ._-]{2,40}?)(?:\s+on|\s+via|\s+upi|\s+ref|\s+utr|\.|,|$)/i) ||
    text.match(/\bby\s+([A-Z0-9 ._-]{2,40}?)(?:\s+on|\s+via|\s+upi|\s+ref|\s+utr|\.|,|$)/i) ||
    text.match(/\bVPA\s+([A-Z0-9._-]+@[A-Z0-9._-]+)/i);

  const refMatch = text.match(/\b(?:ref|utr|upi ref|txn|transaction)\s*(?:no|id|number)?[:\s.-]*([A-Z0-9]{6,24})/i);
  return {
    amount,
    from: fromMatch ? fromMatch[1].trim() : sender || "SMS payment",
    note: refMatch ? `SMS auto read - Ref ${refMatch[1]}` : "SMS auto read",
    upiApp: sender || "Bank SMS"
  };
}
