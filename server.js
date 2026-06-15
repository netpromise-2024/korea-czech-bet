const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const http = require("node:http");
const path = require("node:path");

const PORT = Number(process.env.PORT || 4173);
const PUBLIC_DIR = path.join(__dirname, "outputs", "soccer-bet");
const DATA_FILE = process.env.DATA_FILE || path.join("/tmp", "korea-czech-bet-state.json");
const STAKE = 10000;
const MATCH_KEY = "2026-06-19-korea-mexico";

const defaultState = {
  dateKey: MATCH_KEY,
  teams: {
    home: "한국",
    away: "멕시코",
  },
  picks: [],
};

let state = { ...defaultState, teams: { ...defaultState.teams }, picks: [] };
let writeQueue = Promise.resolve();

function normalizeState(input = {}) {
  if (input.dateKey !== MATCH_KEY) {
    return {
      ...defaultState,
      dateKey: MATCH_KEY,
      teams: { ...defaultState.teams },
      picks: [],
    };
  }

  return {
    ...defaultState,
    ...input,
    dateKey: MATCH_KEY,
    teams: { ...defaultState.teams, ...input.teams },
    picks: Array.isArray(input.picks) ? input.picks : [],
  };
}

async function loadState() {
  try {
    const data = await fs.readFile(DATA_FILE, "utf8");
    state = normalizeState(JSON.parse(data));
  } catch {
    state = normalizeState(defaultState);
  }
  await saveState();
}

function saveState() {
  writeQueue = writeQueue.then(async () => {
    await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });
    await fs.writeFile(DATA_FILE, JSON.stringify(state, null, 2));
  });
  return writeQueue;
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(payload));
}

function sendText(response, statusCode, message) {
  response.writeHead(statusCode, {
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(message);
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 100_000) {
        request.destroy();
        reject(new Error("Request body too large"));
      }
    });
    request.on("end", () => resolve(body));
    request.on("error", reject);
  });
}

function winnerFromScore(homeScore, awayScore) {
  if (homeScore > awayScore) return "home";
  if (awayScore > homeScore) return "away";
  return "draw";
}

function sanitizePick(input) {
  const name = String(input.name || "").trim().replace(/\s+/g, " ");
  const winner = input.winner;
  const homeScore = Number(input.homeScore);
  const awayScore = Number(input.awayScore);

  if (name.length < 2 || name.length > 14) {
    return { error: "이름은 두 글자 이상 14글자 이하로 입력해주세요." };
  }

  if (!["home", "draw", "away"].includes(winner)) {
    return { error: "승리팀 값이 올바르지 않습니다." };
  }

  if (
    !Number.isInteger(homeScore) ||
    !Number.isInteger(awayScore) ||
    homeScore < 0 ||
    awayScore < 0 ||
    homeScore > 30 ||
    awayScore > 30
  ) {
    return { error: "스코어는 0부터 30 사이의 정수만 가능합니다." };
  }

  if (winnerFromScore(homeScore, awayScore) !== winner) {
    return { error: "승리팀과 스코어의 승패가 맞지 않습니다." };
  }

  return {
    pick: {
      id: input.id || crypto.randomUUID(),
      name,
      winner,
      homeScore,
      awayScore,
      stake: STAKE,
      createdAt: input.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  };
}

async function handleApi(request, response, url) {
  state = normalizeState(state);

  if (request.method === "GET" && url.pathname === "/api/state") {
    return sendJson(response, 200, state);
  }

  if (request.method === "POST" && url.pathname === "/api/picks") {
    const body = JSON.parse((await readBody(request)) || "{}");
    const { pick, error } = sanitizePick(body);
    if (error) return sendText(response, 400, error);

    const existing = state.picks.find((entry) => entry.name.toLowerCase() === pick.name.toLowerCase());
    state.picks = existing
      ? state.picks.map((entry) => (entry.id === existing.id ? { ...pick, id: existing.id } : entry))
      : [pick, ...state.picks];

    await saveState();
    return sendJson(response, 200, state);
  }

  if (request.method === "DELETE" && url.pathname.startsWith("/api/picks/")) {
    const id = decodeURIComponent(url.pathname.replace("/api/picks/", ""));
    state.picks = state.picks.filter((entry) => entry.id !== id);
    await saveState();
    return sendJson(response, 200, state);
  }

  if (request.method === "POST" && url.pathname === "/api/reset") {
    state = normalizeState({ ...defaultState, dateKey: MATCH_KEY, picks: [] });
    await saveState();
    return sendJson(response, 200, state);
  }

  return sendText(response, 404, "Not found");
}

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
};

async function serveStatic(request, response, url) {
  const rawPath = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
  const filePath = path.normalize(path.join(PUBLIC_DIR, rawPath));

  if (!filePath.startsWith(PUBLIC_DIR)) {
    return sendText(response, 403, "Forbidden");
  }

  try {
    const file = await fs.readFile(filePath);
    response.writeHead(200, {
      "Content-Type": contentTypes[path.extname(filePath)] || "application/octet-stream",
    });
    response.end(file);
  } catch {
    sendText(response, 404, "Not found");
  }
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host}`);

  try {
    if (url.pathname.startsWith("/api/")) {
      await handleApi(request, response, url);
      return;
    }

    await serveStatic(request, response, url);
  } catch (error) {
    sendText(response, 500, error.message || "Server error");
  }
});

loadState().then(() => {
  server.listen(PORT, () => {
    console.log(`korea-czech-bet listening on ${PORT}`);
  });
});
