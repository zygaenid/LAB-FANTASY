/***** CONFIG *****/
const GAS = "https://script.google.com/macros/s/AKfycbyypxn-kbp_g2NEvoz6FQgASEKP2qC_mQ5kK1pIZ9bbSdUFX3U5wRkEkRd3vn4LG0iKvw/exec";
let CURRENT_GW = null;

/***** HELPERS *****/
const $ = (sel) => document.querySelector(sel);
function setStatus(msg, isError=false) {
  const s = $("#status"); if (!s) return;
  s.textContent = msg || "";
  s.style.color = isError ? "#c00" : "#555";
}
function norm(s){ return String(s||"").toLowerCase().replace(/[\u2019']/g,"").replace(/[^a-z0-9 ]+/g," ").replace(/\s+/g," ").trim(); }
const ALIASES = {
  "manchester city":"man city","manchester united":"man utd","tottenham hotspur":"spurs",
  "wolverhampton wanderers":"wolves","west ham united":"west ham","afc bournemouth":"bournemouth",
  "nottingham forest":"nott'm forest","brighton and hove albion":"brighton","newcastle united":"newcastle",
  "leeds united":"leeds","sheffield united":"sheffield utd"
};
function sameTeamName(a){ const n=norm(a); return ALIASES[n] || n; }
function isLockedFromFixture(f) {
  if (f.finished) return true;
  if (!f.kickoff_time) return false;
  return new Date(f.kickoff_time) <= new Date();
}

/***** API CALLS *****/
async function api(path=""){ const r=await fetch(`${GAS}${path}`); if(!r.ok) throw new Error("HTTP "+r.status); return r.json(); }
async function getGWData(){ return api(`?fn=gwData`); }
async function getRealScores(gw){ return api(`?fn=realScores&gw=${gw}`); }
async function getAllPredictions(){ return api(); }

/***** SCORING (prediction league) *****/
// exact = 3, correct outcome = 1; captain doubles
function scorePrediction(pHome, pAway, aHome, aAway, isCaptain){
  if (aHome==null || aAway==null || pHome==null || pAway==null) return 0;
  let pts=0;
  if (pHome===aHome && pAway===aAway) pts=3;
  else if (Math.sign(pHome-pAway)===Math.sign(aHome-aAway)) pts=1;
  return isCaptain ? pts*2 : pts;
}

/***** RENDER FIXTURES *****/
function renderFixtures(fixtures) {
  const container = $("#fixtures-container");
  container.innerHTML = "";

  fixtures
    .sort((a,b)=> new Date(a.kickoff_time||0) - new Date(b.kickoff_time||0))
    .forEach((f, i) => {
      const kickoff = f.kickoff_time ? new Date(f.kickoff_time) : null;
      const timeString = kickoff
        ? kickoff.toLocaleString("en-GB", { weekday:"short", day:"2-digit", month:"short", hour:"2-digit", minute:"2-digit" })
        : "TBC";

      const locked = isLockedFromFixture(f);
      const disabledAttr = locked ? 'disabled aria-disabled="true"' : "";
      const lockBadge = locked ? `<span style="margin-left:8px;padding:2px 6px;border-radius:6px;background:#eee;font-size:12px;">Locked</span>` : "";

      const div = document.createElement("div");
      div.classList.add("fixture");
      if (locked) div.classList.add("locked");
      div.innerHTML = `
        <div style="display:flex; align-items:center; justify-content:space-between; gap:8px;">
          <div style="display:flex; gap:8px; align-items:center;">
            <strong>${f.home} vs ${f.away}</strong>
            <span id="realscore-${i}" style="font-size:14px; color:#222;"></span>
          </div>
          <span style="font-size: 14px; color: #555;">${timeString}${lockBadge}</span>
        </div>
        <div style="margin-top: 6px;">
          <input type="number" id="home-${i}" min="0" placeholder="${f.home}" style="width:56px;" ${disabledAttr}> -
          <input type="number" id="away-${i}" min="0" placeholder="${f.away}" style="width:56px;" ${disabledAttr}>
          <label style="margin-left:10px;"><input type="radio" name="captain" value="${i}" ${locked ? "disabled" : ""}> Captain</label>
        </div>
      `;
      container.appendChild(div);
    });
}

/***** REAL SCORE BADGES *****/
async function paintRealScores(fixtures, gw){
  try{
    const j = await getRealScores(gw);
    const matches = j.matches || [];
    // Build lookup by normalized pair
    const byPair = new Map();
    matches.forEach(m => {
      const key = sameTeamName(m.home) + "|" + sameTeamName(m.away);
      byPair.set(key, m);
    });

    fixtures.forEach((f, i) => {
      const key = sameTeamName(f.home) + "|" + sameTeamName(f.away);
      const m = byPair.get(key);
      const el = document.getElementById(`realscore-${i}`);
      if (!el || !m) return;
      if (m.finished && m.real_home_goals != null && m.real_away_goals != null) {
        el.textContent = `(${m.real_home_goals}–${m.real_away_goals})`;
      } else if (m.started) {
        el.textContent = `(LIVE)`;
      } else {
        el.textContent = ``;
      }
    });
  } catch (e) {
    console.warn("Real scores unavailable", e);
  }
}

/***** LEADERBOARD RENDER *****/
function renderLeaderboard(title, rows){
  const host=$("#leaderboard");
  host.innerHTML=`<h3>${title}</h3>`;
  if(!rows.length){host.innerHTML+="<p>No data yet.</p>";return;}
  const html=["<table><thead><tr><th>Rank</th><th>Name</th><th>Twitter</th><th>Pts</th></tr></thead><tbody>"];
  rows.forEach((r,i)=>{html.push(`<tr><td>${i+1}</td><td>${r.name||""}</td><td>${r.twitter||""}</td><td>${r.points}</td></tr>`);});
  html.push("</tbody></table>");
  host.innerHTML+=html.join("");
}

/***** BUILD GW LEADERBOARD *****/
async function buildGWLeaderboard(gw){
  try{
    const [scoresRes, preds] = await Promise.all([getRealScores(gw), getAllPredictions()]);
    const matches = scoresRes.matches || [];
    const rows = (preds || []).filter(r => Number(r.GW) === Number(gw));

    const table=[];
    rows.forEach(r=>{
      let total=0, arr=[];
      try{arr=JSON.parse(r.Predictions_JSON||r.Predictions||"[]");}catch{}
      matches.forEach((m,i)=>{
        const p=arr[i]; if(!p) return;
        const ph = (p.homeScore===""||p.homeScore==null)?null:Number(p.homeScore);
        const pa = (p.awayScore===""||p.awayScore==null)?null:Number(p.awayScore);
        total += scorePrediction(ph, pa, m.finished?m.real_home_goals:null, m.finished?m.real_away_goals:null, !!p.isCaptain);
      });
      table.push({name:r.Name, twitter:r.Twitter, points:total});
    });

    table.sort((a,b)=> b.points - a.points || (a.name||"").localeCompare(b.name||""));
    renderLeaderboard(`GW ${gw} Leaderboard`, table);
  }catch(e){
    console.error(e);
    setStatus("Failed to build GW leaderboard.", true);
  }
}

/***** BUILD OVERALL LEADERBOARD *****/
async function buildOverallLeaderboard(){
  try{
    const preds = await getAllPredictions();
    const gws = [...new Set((preds||[]).map(r=>Number(r.GW)).filter(n=>!isNaN(n)))].sort((a,b)=>a-b);

    // Preload real scores per GW
    const realByGW = new Map();
    for (const gw of gws) {
      const rs = await getRealScores(gw);
      realByGW.set(gw, rs.matches || []);
    }

    const users = new Map();
    preds.forEach(r=>{
      const key = (r.Name||"")+"|"+(r.Twitter||"");
      if(!users.has(key)) users.set(key, {name:r.Name, twitter:r.Twitter, points:0});
      let arr=[]; try{arr=JSON.parse(r.Predictions_JSON||r.Predictions||"[]");}catch{}
      const matches = realByGW.get(Number(r.GW)) || [];
      matches.forEach((m,i)=>{
        const p=arr[i]; if(!p) return;
        const ph = (p.homeScore===""||p.homeScore==null)?null:Number(p.homeScore);
        const pa = (p.awayScore===""||p.awayScore==null)?null:Number(p.awayScore);
        users.get(key).points += scorePrediction(ph, pa, m.finished?m.real_home_goals:null, m.finished?m.real_away_goals:null, !!p.isCaptain);
      });
    });

    const table = Array.from(users.values()).sort((a,b)=> b.points - a.points || (a.name||"").localeCompare(b.name||""));
    renderLeaderboard("Overall Leaderboard", table);
  }catch(e){
    console.error(e);
    setStatus("Failed to build overall leaderboard.", true);
  }
}

/***** MAIN LOAD *****/
async function loadFixtures() {
  try{
    $("#registration-section").style.display = "none";
    $("#prediction-section").style.display = "block";
    setStatus("Loading fixtures…");

    const j = await getGWData();
    if (!j || !j.ok) throw new Error("gwData not ok");
    CURRENT_GW = j.gw;
    const fixtures = j.fixtures || [];

    renderFixtures(fixtures);
    await paintRealScores(fixtures, CURRENT_GW);

    setStatus(`GW ${CURRENT_GW} fixtures loaded.`);
  }catch(err){
    console.error(err);
    setStatus("Failed to load fixtures. Check API deployment & CORS.", true);
  }
}

/***** EVENTS *****/
document.getElementById("registration-form").addEventListener("submit", (e)=>{
  e.preventDefault();
  loadFixtures();
});

document.getElementById("prediction-form").addEventListener("submit", async (e)=>{
  e.preventDefault();
  try{
    const name = $("#full-name").value.trim();
    const twitter = $("#twitter-handle").value.trim();
    if (!name){ alert("Please enter your full name."); return; }

    const fixtures = document.querySelectorAll("#fixtures-container .fixture");
    const predictions = [];
    let unlocked = 0;

    fixtures.forEach((f, i) => {
      const home = f.querySelector(`#home-${i}`);
      const away = f.querySelector(`#away-${i}`);
      const isLocked = home.disabled && away.disabled;

      const homeScore = isLocked ? null : (home.value !== "" ? Number(home.value) : null);
      const awayScore = isLocked ? null : (away.value !== "" ? Number(away.value) : null);
      const isCaptain = isLocked ? false : (f.querySelector(`input[name="captain"][value="${i}"]`)?.checked || false);

      if (!isLocked) unlocked++;
      predictions.push({ homeScore, awayScore, isCaptain, locked: isLocked });
    });

    if (unlocked === 0){ alert("All fixtures are locked. Predictions open next GW."); return; }
    const captainCount = predictions.filter(p => p.isCaptain).length;
    if (captainCount !== 1){ alert("Please select exactly one Captain among unlocked fixtures."); return; }

    setStatus("Submitting…");

    const res = await fetch(GAS, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, twitter, gw: CURRENT_GW, predictions })
    });
    if(!res.ok) throw new Error("Submit failed");

    setStatus("✅ Predictions submitted!");
    alert("✅ Predictions submitted!");

  }catch(err){
    console.error(err);
    setStatus("❌ Submission failed", true);
    alert("❌ Something went wrong. Please try again.");
  }
});

const btnGW = document.getElementById("btn-gw-leaderboard");
if (btnGW) btnGW.addEventListener("click", () => buildGWLeaderboard(CURRENT_GW));
const btnAll = document.getElementById("btn-overall-leaderboard");
if (btnAll) btnAll.addEventListener("click", () => buildOverallLeaderboard());
