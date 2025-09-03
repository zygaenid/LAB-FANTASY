/***** CONFIG *****/
const GAS = "https://script.google.com/macros/s/AKfycbyypxn-kbp_g2NEvoz6FQgASEKP2qC_mQ5kK1pIZ9bbSdUFX3U5wRkEkRd3vn4LG0iKvw/exec";
const PROXY = "https://corsproxy.io/?";
let CURRENT_GW = null;
let LOGOS = {}; // filled from GAS (Logos_urls sheet)

/***** HELPERS *****/
const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

function setStatus(msg, isError=false) {
  const el = $("#status"); if (!el) return;
  el.textContent = msg || "";
  el.style.color = isError ? "#c00" : "#555";
}

function fmtKickoff(iso) {
  if (!iso) return "TBC";
  const d = new Date(iso);
  return d.toLocaleString("en-GB", {
    weekday: "short", day: "2-digit", month: "short",
    hour: "2-digit", minute: "2-digit", hour12: false,
    timeZone: "Europe/London"
  });
}

function isLockedFix(fix) {
  if (fix.finished === true || fix.started === true) return true;
  if (!fix.kickoff_time) return false;
  return new Date(fix.kickoff_time) <= new Date();
}

/***** API calls *****/
async function api(path=""){ const r=await fetch(`${GAS}${path}`); if(!r.ok) throw new Error("HTTP "+r.status); return r.json(); }
async function fetchLogos(){ try { LOGOS = await api("?fn=logos"); } catch{ LOGOS = {}; } }
async function fetchPredictions(){ return api(); } // default GET returns predictions rows

/***** EPL data via FPL API *****/
async function loadFPLData() {
  const [fixturesRes, teamsRes] = await Promise.all([
    fetch(PROXY + "https://fantasy.premierleague.com/api/fixtures/"),
    fetch(PROXY + "https://fantasy.premierleague.com/api/bootstrap-static/")
  ]);
  if (!fixturesRes.ok || !teamsRes.ok) throw new Error("FPL API unavailable");
  const fixtures = await fixturesRes.json();
  const teams = await teamsRes.json();

  const teamMap = {};
  teams.teams.forEach(t => { teamMap[t.id] = t.name; });

  const now = new Date();
  const futureFix = fixtures.filter(f => f.kickoff_time && new Date(f.kickoff_time) > now);
  if (futureFix.length > 0) {
    CURRENT_GW = Math.min(...futureFix.map(f => f.event));
  } else {
    const unfinished = fixtures.filter(f => f.finished === false);
    CURRENT_GW = unfinished.length ? unfinished[0].event : Math.max(...fixtures.map(f => f.event || 1));
  }

  const gwFixtures = fixtures
    .filter(f => f.event === CURRENT_GW)
    .sort((a,b)=> new Date(a.kickoff_time||0) - new Date(b.kickoff_time||0));

  return { teamMap, fixtures, gwFixtures };
}

/***** Fixtures render *****/
function renderFixtures(gwFixtures, teamMap) {
  $("#gw-label").textContent = `GW ${CURRENT_GW}`;
  const container = $("#fixtures-container");
  container.innerHTML = "";

  gwFixtures.forEach((fixture, index) => {
    const home = teamMap[fixture.team_h] || `H${fixture.team_h}`;
    const away = teamMap[fixture.team_a] || `A${fixture.team_a}`;
    const timeString = fmtKickoff(fixture.kickoff_time);
    const locked = isLockedFix(fixture);

    const homeLogo = LOGOS[home] || "";
    const awayLogo = LOGOS[away] || "";

    const div = document.createElement("div");
    div.classList.add("fixture");
    if (locked) div.classList.add("locked");

    div.innerHTML = `
      <div class="fixture-header">
        <div class="teams">
          ${homeLogo ? `<img src="${homeLogo}" alt="${home}">` : ""}
          <span>${home}</span>
          <span>&nbsp;vs&nbsp;</span>
          ${awayLogo ? `<img src="${awayLogo}" alt="${away}">` : ""}
          <span>${away}</span>
        </div>
        <div class="kickoff">${timeString}${locked ? ' <span class="lock-badge">Locked</span>' : ''}</div>
      </div>
      <div>
        <input type="number" id="home-${index}" min="0" placeholder="${home}" ${locked ? "disabled" : ""}> -
        <input type="number" id="away-${index}" min="0" placeholder="${away}" ${locked ? "disabled" : ""}>
        <label><input type="radio" name="captain" value="${index}" ${locked ? "disabled" : ""}> Captain</label>
      </div>
    `;
    container.appendChild(div);
  });
}

/***** Scoring (prediction league): exact=3, outcome=1; captain doubles *****/
function scorePrediction(pHome, pAway, aHome, aAway, isCaptain){
  if (aHome==null || aAway==null || pHome==null || pAway==null) return 0;
  let pts=0;
  if (pHome===aHome && pAway===aAway) pts=3;
  else if (Math.sign(pHome-pAway)===Math.sign(aHome-aAway)) pts=1;
  return isCaptain ? pts*2 : pts;
}

/***** Build GW Leaderboard *****/
async function buildGWLeaderboard(gw, fixturesForGWAll, teamMap) {
  const container = $("#gw-leaderboard");
  container.innerHTML = "<p>Loading…</p>";

  // Real scores from FPL fixtures
  const finished = fixturesForGWAll.filter(f => f.event === gw && (f.finished || f.finished_provisional));
  const sortedFinished = finished.sort((a,b)=> new Date(a.kickoff_time||0)-new Date(b.kickoff_time||0));

  // Get all predictions
  const rows = await fetchPredictions();
  const gwRows = (rows||[]).filter(r => Number(r.GW) === Number(gw));

  const table = [];
  gwRows.forEach(r=>{
    let total = 0, arr=[];
    try { arr = JSON.parse(r.Predictions_JSON || r.Predictions || "[]"); } catch {}
    sortedFinished.forEach((m, i) => {
      const p = arr[i]; if (!p) return;
      const ph = (p.homeScore===""||p.homeScore==null)?null:Number(p.homeScore);
      const pa = (p.awayScore===""||p.awayScore==null)?null:Number(p.awayScore);
      const aHome = m.team_h_score, aAway = m.team_a_score;
      total += scorePrediction(ph, pa, aHome, aAway, !!p.isCaptain);
    });
    table.push({ name:r.Name, twitter:r.Twitter, points: total });
  });

  table.sort((a,b)=> b.points - a.points || (a.name||"").localeCompare(b.name||""));

  // Render
  $("#gw-leaderboard-title").textContent = `GW ${gw} Leaderboard`;
  if (!table.length) { container.innerHTML = "<p>No submissions yet.</p>"; return; }
  let html = `<table><thead><tr><th>#</th><th>Name</th><th>Twitter</th><th>Pts</th></tr></thead><tbody>`;
  table.forEach((r, i) => {
    html += `<tr><td>${i+1}</td><td>${r.name||""}</td><td>${r.twitter||""}</td><td>${r.points}</td></tr>`;
  });
  html += `</tbody></table>`;
  container.innerHTML = html;
}

/***** Build Overall Leaderboard *****/
async function buildOverallLeaderboard(fixturesAll) {
  const container = $("#overall-leaderboard");
  container.innerHTML = "<p>Loading…</p>";

  const rows = await fetchPredictions();
  if (!rows || !rows.length) { container.innerHTML = "<p>No submissions yet.</p>"; return; }

  // Group fixtures by GW with final scores only
  const fixturesByGW = {};
  fixturesAll.forEach(f => {
    if (!fixturesByGW[f.event]) fixturesByGW[f.event] = [];
    fixturesByGW[f.event].push(f);
  });
  Object.keys(fixturesByGW).forEach(gw=>{
    fixturesByGW[gw] = fixturesByGW[gw]
      .filter(f=> f.finished || f.finished_provisional)
      .sort((a,b)=> new Date(a.kickoff_time||0)-new Date(b.kickoff_time||0));
  });

  const users = new Map();
  rows.forEach(r=>{
    const key = (r.Name||"")+"|"+(r.Twitter||"");
    if (!users.has(key)) users.set(key, { name:r.Name, twitter:r.Twitter, points:0 });

    let arr=[]; try{ arr = JSON.parse(r.Predictions_JSON || r.Predictions || "[]"); }catch{}
    const list = fixturesByGW[r.GW] || [];
    list.forEach((m, i)=>{
      const p = arr[i]; if (!p) return;
      const ph = (p.homeScore===""||p.homeScore==null)?null:Number(p.homeScore);
      const pa = (p.awayScore===""||p.awayScore==null)?null:Number(p.awayScore);
      users.get(key).points += scorePrediction(ph, pa, m.team_h_score, m.team_a_score, !!p.isCaptain);
    });
  });

  const table = Array.from(users.values())
    .sort((a,b)=> b.points - a.points || (a.name||"").localeCompare(b.name||""));

  if (!table.length) { container.innerHTML = "<p>No submissions yet.</p>"; return; }

  let html = `<table><thead><tr><th>#</th><th>Name</th><th>Twitter</th><th>Pts</th></tr></thead><tbody>`;
  table.forEach((r, i)=> {
    html += `<tr><td>${i+1}</td><td>${r.name||""}</td><td>${r.twitter||""}</td><td>${r.points}</td></tr>`;
  });
  html += `</tbody></table>`;
  container.innerHTML = html;
}

/***** Build GW Results (per match predictions + points) *****/
async function buildGWResults(gw, fixturesAll, teamMap) {
  const host = $("#gw-results");
  host.innerHTML = "<p>Loading…</p>";

  // GW fixtures sorted by kickoff
  const list = fixturesAll
    .filter(f => f.event === gw)
    .sort((a,b)=> new Date(a.kickoff_time||0) - new Date(b.kickoff_time||0));

  // Only show points if game finished (else 0)
  const rows = await fetchPredictions();
  const gwRows = (rows||[]).filter(r => Number(r.GW) === Number(gw));

  let html = "";
  list.forEach((m, idx) => {
    const home = teamMap[m.team_h] || `H${m.team_h}`;
    const away = teamMap[m.team_a] || `A${m.team_a}`;
    const finished = (m.finished || m.finished_provisional) && (m.team_h_score!=null && m.team_a_score!=null);
    const real = finished ? `(${m.team_h_score}–${m.team_a_score})` : "(TBC)";
    html += `<h3 style="margin-top:18px;">${home} vs ${away} ${real}</h3>`;
    html += `<table><thead><tr><th>#</th><th>Name</th><th>Twitter</th><th>Prediction</th><th>Captain</th><th>Pts</th></tr></thead><tbody>`;

    const rowsForThisMatch = [];
    gwRows.forEach((r, i) => {
      let arr=[]; try{ arr=JSON.parse(r.Predictions_JSON || r.Predictions || "[]");}catch{}
      const p = arr[idx];
      if (!p) return;
      const ph = (p.homeScore===""||p.homeScore==null)?null:Number(p.homeScore);
      const pa = (p.awayScore===""||p.awayScore==null)?null:Number(p.awayScore);
      const pts = finished ? scorePrediction(ph, pa, m.team_h_score, m.team_a_score, !!p.isCaptain) : 0;
      rowsForThisMatch.push({
        name:r.Name, twitter:r.Twitter,
        pred: (ph==null || pa==null) ? "-" : `${ph}–${pa}`,
        cap: p.isCaptain ? "⭐" : "",
        pts
      });
    });

    rowsForThisMatch.sort((a,b)=> b.pts - a.pts || (a.name||"").localeCompare(b.name||""));
    rowsForThisMatch.forEach((r, i)=>{
      html += `<tr><td>${i+1}</td><td>${r.name||""}</td><td>${r.twitter||""}</td><td>${r.pred}</td><td>${r.cap}</td><td>${r.pts}</td></tr>`;
    });
    html += `</tbody></table>`;
  });

  $("#gw-results-title").textContent = `GW ${gw} Results`;
  host.innerHTML = html || "<p>No predictions yet.</p>";
}

/***** Main load (Predict view) *****/
async function loadPredictView() {
  try {
    $("#registration-section").style.display = "none";
    $("#prediction-section").style.display = "block";
    $("#gw-leaderboard-section").style.display = "none";
    $("#overall-section").style.display = "none";
    $("#gw-results-section").style.display = "none";

    setStatus("Loading fixtures…");

    await fetchLogos();
    const { teamMap, fixtures, gwFixtures } = await loadFPLData();

    renderFixtures(gwFixtures, teamMap);

    setStatus(`GW ${CURRENT_GW} fixtures loaded.`);
  } catch (err) {
    console.error(err);
    setStatus("Failed to load fixtures.", true);
  }
}

/***** Events *****/
$("#registration-form").addEventListener("submit", (e)=>{
  e.preventDefault(); loadPredictView();
});

$("#prediction-form").addEventListener("submit", async (e)=>{
  e.preventDefault();
  try {
    const name = $("#full-name").value.trim();
    const twitter = $("#twitter-handle").value.trim();
    if (!name) { alert("Please enter your full name."); return; }

    const fixtures = $$("#fixtures-container .fixture");
    const predictions = [];
    let unlocked = 0;

    fixtures.forEach((f, i) => {
      const home = f.querySelector(`#home-${i}`);
      const away = f.querySelector(`#away-${i}`);
      const locked = home.disabled && away.disabled;

      const homeScore = locked ? null : (home.value !== "" ? Number(home.value) : null);
      const awayScore = locked ? null : (away.value !== "" ? Number(away.value) : null);
      const isCaptain = locked ? false : (f.querySelector(`input[name="captain"][value="${i}"]`)?.checked || false);

      if (!locked) unlocked++;
      predictions.push({ homeScore, awayScore, isCaptain, locked });
    });

    if (unlocked === 0){ alert("All fixtures are locked. Predictions open next GW."); return; }
    const capCount = predictions.filter(p => p.isCaptain).length;
    if (capCount !== 1){ alert("Select exactly one Captain among unlocked fixtures."); return; }

    setStatus("Submitting…");
    const res = await fetch(GAS, {
      method:"POST",
      headers:{ "Content-Type":"application/json" },
      body: JSON.stringify({ name, twitter, gw: CURRENT_GW, predictions })
    });
    if(!res.ok) throw new Error("Submit failed");
    setStatus("✅ Predictions submitted!");
    alert("✅ Predictions submitted!");
  } catch (e) {
    console.error(e);
    setStatus("❌ Submission failed", true);
    alert("❌ Something went wrong. Please try again.");
  }
});

/***** Nav Buttons *****/
$("#nav-predict").addEventListener("click", ()=> {
  $("#registration-section").style.display = "block";
  $("#prediction-section").style.display = "none";
  $("#gw-leaderboard-section").style.display = "none";
  $("#overall-section").style.display = "none";
  $("#gw-results-section").style.display = "none";
  $("#status").textContent = "";
});

$("#nav-gw-leaderboard").addEventListener("click", async ()=> {
  $("#registration-section").style.display = "none";
  $("#prediction-section").style.display = "none";
  $("#gw-leaderboard-section").style.display = "block";
  $("#overall-section").style.display = "none";
  $("#gw-results-section").style.display = "none";

  // default to CURRENT_GW (or 1)
  const { fixtures } = await loadFPLData();
  const gw = CURRENT_GW || 1;
  $("#gw-input").value = gw;
  const teamMap = {}; // not needed for leaderboard
  await buildGWLeaderboard(gw, fixtures, teamMap);
});

$("#btn-load-gw-leaderboard").addEventListener("click", async ()=> {
  const gw = Number($("#gw-input").value || 1);
  const { fixtures } = await loadFPLData();
  await buildGWLeaderboard(gw, fixtures, {});
});

$("#nav-overall").addEventListener("click", async ()=> {
  $("#registration-section").style.display = "none";
  $("#prediction-section").style.display = "none";
  $("#gw-leaderboard-section").style.display = "none";
  $("#overall-section").style.display = "block";
  $("#gw-results-section").style.display = "none";

  const { fixtures } = await loadFPLData();
  await buildOverallLeaderboard(fixtures);
});

$("#nav-gw-results").addEventListener("click", async ()=> {
  $("#registration-section").style.display = "none";
  $("#prediction-section").style.display = "none";
  $("#gw-leaderboard-section").style.display = "none";
  $("#overall-section").style.display = "none";
  $("#gw-results-section").style.display = "block";

  const { fixtures, teamMap } = await loadFPLData();
  $("#gw-results-input").value = CURRENT_GW || 1;
  await buildGWResults(CURRENT_GW || 1, fixtures, teamMap);
});

$("#btn-load-gw-results").addEventListener("click", async ()=> {
  const gw = Number($("#gw-results-input").value || 1);
  const { fixtures, teamMap } = await loadFPLData();
  await buildGWResults(gw, fixtures, teamMap);
});
