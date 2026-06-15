const MATCH_KEY = "2026-06-19-korea-mexico";
const MATCH_DATE_LABEL = "2026.06.19.(금)";
const STORAGE_KEY = `${MATCH_KEY}-10000-bet-fallback-v1`;
const STAKE = 10000;
const API_BASE = "";
const POLL_INTERVAL_MS = 3000;

const $ = (selector) => document.querySelector(selector);

const refs = {
  todayLabel: $("#todayLabel"),
  homeName: $("#homeName"),
  awayName: $("#awayName"),
  homePickLabel: $("#homePickLabel"),
  awayPickLabel: $("#awayPickLabel"),
  homeScoreLabel: $("#homeScoreLabel"),
  awayScoreLabel: $("#awayScoreLabel"),
  finalHomeLabel: $("#finalHomeLabel"),
  finalAwayLabel: $("#finalAwayLabel"),
  participantCount: $("#participantCount"),
  potTotal: $("#potTotal"),
  popularPick: $("#popularPick"),
  formError: $("#formError"),
  entryForm: $("#entryForm"),
  pickList: $("#pickList"),
  emptyState: $("#emptyState"),
  copyButton: $("#copyButton"),
  resetButton: $("#resetButton"),
  settleButton: $("#settleButton"),
  settlementBox: $("#settlementBox"),
  storageHint: $("#storageHint"),
  homeMeterLabel: $("#homeMeterLabel"),
  awayMeterLabel: $("#awayMeterLabel"),
  homeMeterCount: $("#homeMeterCount"),
  drawMeterCount: $("#drawMeterCount"),
  awayMeterCount: $("#awayMeterCount"),
  homeMeterBar: $("#homeMeterBar"),
  drawMeterBar: $("#drawMeterBar"),
  awayMeterBar: $("#awayMeterBar"),
};

const defaultState = {
  teams: {
    home: "한국",
    away: "멕시코",
  },
  picks: [],
};

let state = fallbackState();
let usingSharedServer = false;
let isSyncing = false;

function fallbackState() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (stored?.dateKey === MATCH_KEY) {
      return {
        ...defaultState,
        ...stored,
        teams: { ...defaultState.teams, ...stored.teams },
        picks: Array.isArray(stored.picks) ? stored.picks : [],
      };
    }
  } catch {
    localStorage.removeItem(STORAGE_KEY);
  }

  return {
    ...defaultState,
    dateKey: MATCH_KEY,
    picks: [],
  };
}

function saveFallbackState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

async function apiRequest(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
    ...options,
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Request failed: ${response.status}`);
  }

  return response.json();
}

function applyRemoteState(nextState) {
  state = {
    ...defaultState,
    ...nextState,
    teams: { ...defaultState.teams, ...nextState.teams },
    picks: Array.isArray(nextState.picks) ? nextState.picks : [],
  };
  usingSharedServer = true;
  render();
}

async function syncState({ silent = false } = {}) {
  if (isSyncing) return;
  isSyncing = true;

  try {
    const nextState = await apiRequest("/api/state");
    applyRemoteState(nextState);
  } catch {
    usingSharedServer = false;
    if (!silent) render();
  } finally {
    isSyncing = false;
  }
}

function formatWon(value) {
  return new Intl.NumberFormat("ko-KR", {
    style: "currency",
    currency: "KRW",
    maximumFractionDigits: 0,
  }).format(value);
}

function teamName(key) {
  if (key === "draw") return "무승부";
  return state.teams[key] || defaultState.teams[key];
}

function winnerFromScore(home, away) {
  if (home > away) return "home";
  if (away > home) return "away";
  return "draw";
}

function sanitizeScore(value) {
  const score = Number(value);
  if (!Number.isInteger(score) || score < 0 || score > 30) return null;
  return score;
}

function normalizeName(value) {
  return value.trim().replace(/\s+/g, " ");
}

function setLabels() {
  refs.todayLabel.textContent = MATCH_DATE_LABEL;
  refs.homeName.textContent = state.teams.home;
  refs.awayName.textContent = state.teams.away;
  refs.homePickLabel.textContent = state.teams.home;
  refs.awayPickLabel.textContent = state.teams.away;
  refs.homeScoreLabel.textContent = `${state.teams.home} 점수`;
  refs.awayScoreLabel.textContent = `${state.teams.away} 점수`;
  refs.finalHomeLabel.textContent = state.teams.home;
  refs.finalAwayLabel.textContent = state.teams.away;
  refs.homeMeterLabel.textContent = state.teams.home;
  refs.awayMeterLabel.textContent = state.teams.away;
  refs.storageHint.textContent = usingSharedServer
    ? "모두에게 실시간 공유됨"
    : "이 브라우저에만 임시 저장됨";
}

function countByWinner() {
  return state.picks.reduce(
    (totals, pick) => {
      totals[pick.winner] += 1;
      return totals;
    },
    { home: 0, draw: 0, away: 0 },
  );
}

function getPopularPick(counts) {
  const max = Math.max(counts.home, counts.draw, counts.away);
  if (max === 0) return "-";

  const winners = ["home", "draw", "away"].filter((key) => counts[key] === max);
  return winners.map(teamName).join(", ");
}

function predictionLabel(winner) {
  return winner === "draw" ? "무승부" : `${teamName(winner)} 승`;
}

function pickDescription(pick) {
  return `${predictionLabel(pick.winner)} · ${formatWon(STAKE)}`;
}

function renderSummary() {
  const counts = countByWinner();
  const total = state.picks.length || 1;

  refs.participantCount.textContent = `${state.picks.length}명`;
  refs.potTotal.textContent = formatWon(state.picks.length * STAKE);
  refs.popularPick.textContent = getPopularPick(counts);

  refs.homeMeterCount.textContent = counts.home;
  refs.drawMeterCount.textContent = counts.draw;
  refs.awayMeterCount.textContent = counts.away;
  refs.homeMeterBar.style.width = `${(counts.home / total) * 100}%`;
  refs.drawMeterBar.style.width = `${(counts.draw / total) * 100}%`;
  refs.awayMeterBar.style.width = `${(counts.away / total) * 100}%`;
}

function createPickNode(pick) {
  const item = document.createElement("article");
  item.className = "pick-item";

  const main = document.createElement("div");
  main.className = "pick-main";

  const name = document.createElement("strong");
  name.textContent = pick.name;

  const detail = document.createElement("span");
  detail.textContent = pickDescription(pick);

  const score = document.createElement("div");
  score.className = "score-badge";
  score.textContent = `${pick.homeScore}:${pick.awayScore}`;

  const deleteButton = document.createElement("button");
  deleteButton.className = "delete-button";
  deleteButton.type = "button";
  deleteButton.title = `${pick.name} 삭제`;
  deleteButton.setAttribute("aria-label", `${pick.name} 삭제`);
  deleteButton.textContent = "×";
  deleteButton.addEventListener("click", () => deletePick(pick.id));

  main.append(name, detail);
  item.append(main, score, deleteButton);
  return item;
}

function renderPicks() {
  refs.pickList.replaceChildren();
  refs.emptyState.hidden = state.picks.length > 0;

  state.picks.forEach((pick) => {
    refs.pickList.append(createPickNode(pick));
  });
}

function renderSettlement(homeScore, awayScore) {
  const winner = winnerFromScore(homeScore, awayScore);
  const exactMatches = state.picks.filter(
    (pick) => pick.homeScore === homeScore && pick.awayScore === awayScore,
  );
  const winnerMatches = state.picks.filter((pick) => pick.winner === winner);

  refs.settlementBox.replaceChildren();

  const result = document.createElement("strong");
  result.textContent = `결과 ${homeScore}:${awayScore} · ${teamName(winner)}`;

  const exact = document.createElement("span");
  exact.textContent = exactMatches.length
    ? `정확한 스코어: ${exactMatches.map((pick) => pick.name).join(", ")}`
    : "정확한 스코어를 맞힌 사람은 없습니다.";

  const winnerOnly = document.createElement("span");
  winnerOnly.textContent = winnerMatches.length
    ? `승리팀 적중: ${winnerMatches.map((pick) => pick.name).join(", ")}`
    : "승리팀 적중자도 없습니다.";

  refs.settlementBox.append(result, exact, winnerOnly);
}

function render() {
  setLabels();
  renderSummary();
  renderPicks();
}

function validatePick({ name, winner, homeScore, awayScore }) {
  if (name.length < 2) {
    return "이름은 두 글자 이상으로 입력해주세요.";
  }

  if (homeScore === null || awayScore === null) {
    return "스코어는 0부터 30 사이의 정수만 가능합니다.";
  }

  const predictedWinner = winnerFromScore(homeScore, awayScore);
  if (winner !== predictedWinner) {
    return "승리팀과 스코어의 승패가 맞지 않습니다.";
  }

  return "";
}

async function handleEntrySubmit(event) {
  event.preventDefault();
  refs.formError.textContent = "";

  const formData = new FormData(refs.entryForm);
  const name = normalizeName(formData.get("playerName") || "");
  const winner = formData.get("winner");
  const homeScore = sanitizeScore(formData.get("homeScore"));
  const awayScore = sanitizeScore(formData.get("awayScore"));
  const error = validatePick({ name, winner, homeScore, awayScore });

  if (error) {
    refs.formError.textContent = error;
    return;
  }

  const previous = state.picks.find((pick) => pick.name.toLowerCase() === name.toLowerCase());
  if (previous && !confirm(`${name} 이름의 기존 예측을 바꿀까요?`)) {
    return;
  }

  const pick = {
    id: previous?.id || crypto.randomUUID(),
    name,
    winner,
    homeScore,
    awayScore,
    createdAt: new Date().toISOString(),
  };

  try {
    const nextState = await apiRequest("/api/picks", {
      method: "POST",
      body: JSON.stringify(pick),
    });
    applyRemoteState(nextState);
  } catch {
    state.picks = previous
      ? state.picks.map((entry) => (entry.id === previous.id ? pick : entry))
      : [pick, ...state.picks];
    usingSharedServer = false;
    saveFallbackState();
    render();
  }

  refs.entryForm.reset();
  refs.entryForm.elements.winner.value = winner;
  $("#homeScore").value = homeScore;
  $("#awayScore").value = awayScore;
}

async function deletePick(id) {
  try {
    const nextState = await apiRequest(`/api/picks/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    applyRemoteState(nextState);
  } catch {
    state.picks = state.picks.filter((entry) => entry.id !== id);
    usingSharedServer = false;
    saveFallbackState();
    render();
  }
}

async function copySummary() {
  const lines = [
    "오늘 축구 만원빵",
    `${state.teams.home} VS ${state.teams.away}`,
    `참가자 ${state.picks.length}명 · 총 판돈 ${formatWon(state.picks.length * STAKE)}`,
    "",
    ...state.picks.map(
      (pick) => `${pick.name}: ${predictionLabel(pick.winner)} / ${pick.homeScore}:${pick.awayScore}`,
    ),
  ];

  try {
    await navigator.clipboard.writeText(lines.join("\n"));
    refs.copyButton.title = "복사 완료";
    setTimeout(() => {
      refs.copyButton.title = "요약 복사";
    }, 1100);
  } catch {
    refs.copyButton.title = "복사 실패";
  }
}

async function resetBoard() {
  if (!confirm("오늘 판의 참가자를 모두 지울까요?")) return;

  try {
    const nextState = await apiRequest("/api/reset", { method: "POST" });
    applyRemoteState(nextState);
  } catch {
    state = {
      ...defaultState,
      dateKey: MATCH_KEY,
      picks: [],
    };
    usingSharedServer = false;
    saveFallbackState();
    render();
  }

  refs.settlementBox.innerHTML = "<span>결과를 입력하면 당첨 후보가 여기에 표시됩니다.</span>";
}

refs.entryForm.addEventListener("submit", handleEntrySubmit);
refs.copyButton.addEventListener("click", copySummary);
refs.resetButton.addEventListener("click", resetBoard);
refs.settleButton.addEventListener("click", () => {
  const homeScore = sanitizeScore($("#finalHomeScore").value);
  const awayScore = sanitizeScore($("#finalAwayScore").value);
  if (homeScore === null || awayScore === null) return;
  renderSettlement(homeScore, awayScore);
});

render();
syncState();
setInterval(() => syncState({ silent: true }), POLL_INTERVAL_MS);
