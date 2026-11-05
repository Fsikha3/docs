// Circle Locator - consent-based location sharing server (zero dependencies).
// Every member joins a circle with an invite code and can stop sharing or leave at any time.
const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, "data.json");
const PUBLIC = path.join(__dirname, "public");
const STALE_MS = 24 * 60 * 60 * 1000; // drop location older than 24h

let db = { circles: {} }; // code -> { name, members: { id: {name, token, sharing, loc} } }
try { db = JSON.parse(fs.readFileSync(DATA_FILE, "utf8")); } catch {}
let dirty = false;
setInterval(() => {
  if (!dirty) return;
  dirty = false;
  fs.writeFile(DATA_FILE, JSON.stringify(db), () => {});
}, 5000);

const rid = (n) => crypto.randomBytes(n).toString("hex");
const code = () => rid(3).toUpperCase(); // e.g. A1B2C3

function send(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve) => {
    let s = "";
    req.on("data", (c) => { s += c; if (s.length > 10000) req.destroy(); });
    req.on("end", () => { try { resolve(JSON.parse(s || "{}")); } catch { resolve({}); } });
  });
}

function findByToken(token) {
  for (const [c, circle] of Object.entries(db.circles)) {
    for (const [id, m] of Object.entries(circle.members)) {
      if (m.token === token) return { code: c, circle, id, member: m };
    }
  }
  return null;
}

const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css",
  ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png" };

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  const p = url.pathname;

  if (p.startsWith("/api/")) {
    const b = req.method === "POST" ? await readBody(req) : {};
    const name = String(b.name || "").trim().slice(0, 40);

    // Create a circle; creator becomes first member.
    if (p === "/api/circles" && req.method === "POST") {
      if (!name || !String(b.circleName || "").trim()) return send(res, 400, { error: "name and circleName required" });
      const c = code();
      const id = rid(4), token = rid(16);
      db.circles[c] = { name: String(b.circleName).trim().slice(0, 40), members: { [id]: { name, token, sharing: false, loc: null } } };
      dirty = true;
      return send(res, 200, { code: c, id, token });
    }

    // Join with an invite code.
    if (p === "/api/join" && req.method === "POST") {
      const c = String(b.code || "").toUpperCase();
      const circle = db.circles[c];
      if (!circle || !name) return send(res, 404, { error: "Invalid code or missing name" });
      const id = rid(4), token = rid(16);
      circle.members[id] = { name, token, sharing: false, loc: null };
      dirty = true;
      return send(res, 200, { code: c, id, token });
    }

    const me = findByToken(String(b.token || url.searchParams.get("token") || ""));
    if (!me) return send(res, 401, { error: "Unauthorized" });

    // Member explicitly turns sharing on/off.
    if (p === "/api/sharing" && req.method === "POST") {
      me.member.sharing = !!b.on;
      if (!b.on) me.member.loc = null; // stopping also erases last known location
      dirty = true;
      return send(res, 200, { sharing: me.member.sharing });
    }

    // Post own location (only accepted while sharing is on).
    if (p === "/api/location" && req.method === "POST") {
      const { lat, lng, accuracy } = b;
      if (!me.member.sharing) return send(res, 403, { error: "Sharing is off" });
      if (typeof lat !== "number" || typeof lng !== "number" || Math.abs(lat) > 90 || Math.abs(lng) > 180)
        return send(res, 400, { error: "Bad coordinates" });
      me.member.loc = { lat, lng, accuracy: Number(accuracy) || null, t: Date.now() };
      dirty = true;
      return send(res, 200, { ok: true });
    }

    // See circle members who are currently sharing.
    if (p === "/api/members" && req.method === "GET") {
      const now = Date.now();
      const members = Object.entries(me.circle.members).map(([id, m]) => ({
        id, name: m.name, me: id === me.id, sharing: m.sharing,
        loc: m.sharing && m.loc && now - m.loc.t < STALE_MS ? m.loc : null,
      }));
      return send(res, 200, { code: me.code, circle: me.circle.name, members });
    }

    // Leave circle and delete all own data.
    if (p === "/api/leave" && req.method === "POST") {
      delete me.circle.members[me.id];
      if (!Object.keys(me.circle.members).length) delete db.circles[me.code];
      dirty = true;
      return send(res, 200, { ok: true });
    }
    return send(res, 404, { error: "Not found" });
  }

  // Static files
  let f = path.normalize(path.join(PUBLIC, p === "/" ? "index.html" : p));
  if (!f.startsWith(PUBLIC)) { res.writeHead(403); return res.end(); }
  fs.readFile(f, (err, data) => {
    if (err) { res.writeHead(404); return res.end("Not found"); }
    res.writeHead(200, { "Content-Type": MIME[path.extname(f)] || "application/octet-stream" });
    res.end(data);
  });
});

server.listen(PORT, () => console.log(`Circle Locator running on http://localhost:${PORT}`));
