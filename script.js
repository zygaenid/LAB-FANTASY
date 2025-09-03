/***** CONFIG *****/
const GAS = "https://script.google.com/macros/s/AKfycbwvaEjyda8VWiRcQbvlkzXek4acaGUHaQjt6kRqc48ONE5aFg64WgGwHDJIy2C5wIXcKw/exec";
let CURRENT_GW = null;

// Helpers
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

/***** LOADERS *****/
async function loadFixtures() {
  const r = await fetch(`${GAS}?fn=gwData`);
  const j = await r.json();
  CURRENT_GW = j.gw;
  renderFixtures(j.fixtures);
  setStatus(`GW ${CURRENT_GW} fixtures loaded.`);
  await paintRealScores(j.fixtures, CURRENT_GW);
}

function renderFixtures(fixtures) {
  const container = $("#fixtures-container");
  container.innerHTML = "";
  fixtures.forEach((f, i) => {
    const kickoff = f.kickoff_time ? new Date(f.kickoff_time) : null;
    const timeString = kickoff ? kickoff.toLocaleString("en-GB",{weekday:"short", day:"2-digit", month:"short", hour:"2-digit", minute:"2-digit"}) : "TBC";
    const locked = isLockedFromFixture(f);
    const disabled = locked ? "disabled" : "";
    const div = document.createElement("div");
    div.classList.add("fixture");
    div.innerHTML = `
      <div style="display:flex; justify-content:space-between;">
        <strong>${f.home} vs ${f.away}</strong>
        <span>${timeString} ${locked ? "(Locked)" : ""}</span>
      </div>
      <div style="margin-top:5px;">
        <input type="number" id="home-${i}" placeholder="${f.home}" style="width:40px;" ${disabled}> -
        <input type="number" id="away-${i}" placeholder="${f.away}" style="width:40px;" ${disabled}>
        <label><input type="radio" name="captain" value="${i}" ${disabled}> Captain</label>
        <span id="realscore-${i}" style="margin-left:8px; color:#444;"></span>
      </div>`;
    container.appendChild(div);
  });
}

async function paintRealScores(fixtures, gw){
  const r = await fetch(`${GAS}?fn=realScores&gw=${gw}`);
  const j = await r.json();
  j.matches.forEach((m, i) => {
    const el = document.getElementById(`realscore-${i}`);
    if (!el) return;
    if (m.finished && m.real_home_goals != null) {
      el.textContent = `(${m.real_home_goals}–${m.real_away_goals})`;
    } else if (m.started) {
      el.textContent = "(LIVE)";
    }
  });
}

/***** LEADERBOARDS *****/
async function fetchPredictions(){ const r=await fetch(GAS); return r.json(); }
async function fetchRealScores(gw){ const r=await fetch(`${GAS}?fn=realScores&gw=${gw}`); return r.json(); }

function scorePrediction(pHome,pAway,aHome,aAway,isCaptain){
  if (aHome==null||aAway==null||pHome==null||pAway==null) return 0;
  let pts=0;
  const predDiff=pHome-pAway, actDiff=aHome-aAway;
  if(pHome===aHome && pAway===aAway) pts=3;
  else if(Math.sign(predDiff)===Math.sign(actDiff)) pts=1;
  return isCaptain?pts*2:pts;
}

async function buildGWLeaderboard(gw){
  const [scores, preds] = await Promise.all([fetchRealScores(gw), fetchPredictions()]);
  const rows = preds.filter(r=>Number(r.GW)===Number(gw));
  const table=[];
  rows.forEach(r=>{
    let total=0;
    let arr=[];
    try{arr=JSON.parse(r.Predictions_JSON||"[]");}catch{}
    scores.matches.forEach((m,i)=>{
      const p=arr[i]; if(!p) return;
      total+=scorePrediction(Number(p.homeScore),Number(p.awayScore),m.real_home_goals,m.real_away_goals,p.isCaptain);
    });
    table.push({name:r.Name,twitter:r.Twitter,points:total});
  });
  table.sort((a,b)=>b.points-a.points);
  renderLeaderboard(`GW ${gw} Leaderboard`,table);
}

async function buildOverallLeaderboard(){
  const preds=await fetchPredictions();
  const gws=[...new Set(preds.map(r=>Number(r.GW)))];
  const scoresMap={};
  for(const gw of gws){ scoresMap[gw]=(await fetchRealScores(gw)).matches; }
  const users={};
  preds.forEach(r=>{
    if(!users[r.Name]) users[r.Name]={name:r.Name,twitter:r.Twitter,points:0};
    let arr=[]; try{arr=JSON.parse(r.Predictions_JSON||"[]");}catch{}
    const matches=scoresMap[r.GW]||[];
    matches.forEach((m,i)=>{
      const p=arr[i]; if(!p) return;
      users[r.Name].points+=scorePrediction(Number(p.homeScore),Number(p.awayScore),m.real_home_goals,m.real_away_goals,p.isCaptain);
    });
  });
  const table=Object.values(users).sort((a,b)=>b.points-a.points);
  renderLeaderboard("Overall Leaderboard",table);
}

function renderLeaderboard(title,rows){
  const host=$("#leaderboard");
  host.innerHTML=`<h3>${title}</h3>`;
  if(!rows.length){host.innerHTML+="<p>No data yet.</p>";return;}
  const html=["<table><tr><th>Rank</th><th>Name</th><th>Twitter</th><th>Pts</th></tr>"];
  rows.forEach((r,i)=>{html.push(`<tr><td>${i+1}</td><td>${r.name}</td><td>${r.twitter}</td><td>${r.points}</td></tr>`);});
  html.push("</table>");
  host.innerHTML+=html.join("");
}

/***** EVENTS *****/
$("#registration-form").addEventListener("submit",e=>{
  e.preventDefault(); loadFixtures(); $("#registration-section").style.display="none"; $("#prediction-section").style.display="block";
});
$("#prediction-form").addEventListener("submit",async e=>{
  e.preventDefault();
  const name=$("#full-name").value, twitter=$("#twitter-handle").value;
  const fixtures=document.querySelectorAll("#fixtures-container .fixture");
  const preds=[];
  fixtures.forEach((f,i)=>{
    preds.push({
      homeScore:$("#home-"+i).value,
      awayScore:$("#away-"+i).value,
      isCaptain:f.querySelector(`input[name="captain"][value="${i}"]`)?.checked||false
    });
  });
  const payload={name,twitter,gw:CURRENT_GW,predictions:preds};
  const res=await fetch(GAS,{method:"POST",body:JSON.stringify(payload),headers:{"Content-Type":"application/json"}});
  if(res.ok){setStatus("✅ Predictions submitted!");alert("✅ Predictions submitted!");}
  else {setStatus("❌ Error",true);}
});
$("#btn-gw-leaderboard").addEventListener("click",()=>buildGWLeaderboard(CURRENT_GW));
$("#btn-overall-leaderboard").addEventListener("click",()=>buildOverallLeaderboard());
