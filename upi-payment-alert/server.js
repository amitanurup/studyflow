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
      lanUrls: getLanAddresses().map((address) => `http://${address}:${port}`),
      note: "UPI apps ke private notifications browser automatically read nahi kar sakta. Mobile page se alert bhejein."
    });
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

function sendJson(response, data) {
  response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
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
