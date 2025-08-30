const fixtures = [
  { id: "f1", home: "Arsenal", away: "Chelsea" },
  { id: "f2", home: "Liverpool", away: "Man City" },
  { id: "f3", home: "Tottenham", away: "Everton" }
];

// Storage helpers
const load = (k, fb) => {
  try { return JSON.parse(localStorage.getItem(k)) ?? fb; }
  catch { return fb; }
};
const save = (k, v) => localStorage.setItem(k, JSON.stringify(v));

// Keys
const LS_USERS = "lf_users";
const LS_PRED  = "lf_predictions";
const LS_RES   = "lf_results";
const LS_SCORE = "lf_scores";
const LS_CUR   = "lf_current";

// DOM
const regForm = document.getElementById("registration-form");
const predSection = document.getElementById("prediction-section");
const predForm = document.getElementById("prediction-form");
const fixturesContainer = document.getElementById("fixtures-container");
const adminSection = document.getElementById("admin-section");
const adminForm = document.getElementById("admin-form");
const adminFixturesContainer = document.getElementById("admin-fixtures-container");

// Registration
regForm.addEventListener("submit", e => {
  e.preventDefault();
  const name = document.getElementById("full-name").value.trim();
  const twitter = document.getElementById("twitter-handle").value.trim();
  if (!name || !twitter) return;

  const users = load(LS_USERS, []);
  if (!users.find(u => u.twitter.toLowerCase() === twitter.toLowerCase())) {
    users.push({ name, twitter });
    save(LS_USERS, users);
  }

  localStorage.setItem(LS_CUR, twitter);
  loadPredictionForm();

  if (twitter.toLowerCase() === "admin") {
    adminSection.style.display = "block";
    renderAdminForm();
  }
});

// Prediction form
function loadPredictionForm() {
  document.getElementById("registration-section").style.display = "none";
  predSection.style.display = "block";

  const handle = localStorage.getItem(LS_CUR);
  if (!handle) return;

  const preds = load(LS_PRED, {});
  const myPred = preds[handle] || { captainIndex:null, picks:{} };

  fixturesContainer.innerHTML = "";
  fixtures.forEach((fx, i) => {
    const saved = myPred.picks[fx.id] || { h:"", a:"" };
    const div = document.createElement("div");
    div.className = "fixture";
    div.innerHTML = `
      <strong>${fx.home} vs ${fx.away}</strong><br>
      ${fx.home} <input type="number" id="h-${i}" min="0" value="${saved.h}">
      -
      <input type="number" id="a-${i}" min="0" value="${saved.a}"> ${fx.away}
      <label>
        <input type="radio" name="captain" value="${i}" ${myPred.captainIndex==i?"checked":""}>
        Captain
      </label>
    `;
    fixturesContainer.appendChild(div);
  });
}

predForm.addEventListener("submit", e => {
  e.preventDefault();
  const handle = localStorage.getItem(LS_CUR);
  if (!handle) return;

  const picks = {};
  fixtures.forEach((fx,i)=>{
    const h = parseInt(document.getElementById(`h-${i}`).value,10);
    const a = parseInt(document.getElementById(`a-${i}`).value,10);
    if (!isNaN(h) && !isNaN(a)) picks[fx.id] = {h,a};
  });
  const cap = document.querySelector('input[name="captain"]:checked');
  const captainIndex = cap ? parseInt(cap.value,10) : null;

  const preds = load(LS_PRED, {});
  preds[handle] = { captainIndex, picks };
  save(LS_PRED, preds);

  alert("Predictions saved!");
  renderLeaderboard();
});

// Admin
function renderAdminForm() {
  const results = load(LS_RES, {});
  adminFixturesContainer.innerHTML = "";
  fixtures.forEach((fx,i)=>{
    const saved = results[fx.id] || {h:"",a:""};
    const row = document.createElement("div");
    row.className = "fixture";
    row.innerHTML = `
      <strong>${fx.home} vs ${fx.away}</strong><br>
      ${fx.home} <input type="number" id="rh-${i}" min="0" value="${saved.h}">
      -
      <input type="number" id="ra-${i}" min="0" value="${saved.a}"> ${fx.away}
    `;
    adminFixturesContainer.appendChild(row);
  });
}

adminForm.addEventListener("submit", e=>{
  e.preventDefault();
  const res = {};
  fixtures.forEach((fx,i)=>{
    const h = parseInt(document.getElementById(`rh-${i}`).value,10);
    const a = parseInt(document.getElementById(`ra-${i}`).value,10);
    if (!isNaN(h) && !isNaN(a)) res[fx.id] = {h,a};
  });
  save(LS_RES, res);
  scoreAll();
  alert("Results saved, scores updated!");
  renderLeaderboard();
});

// Scoring
function outcome(h,a){ return Math.sign(h-a); }
function pointsFor(pred,act){
  if (pred.h===act.h && pred.a===act.a) return 3;
  return outcome(pred.h,pred.a)===outcome(act.h,act.a)?1:0;
}

function scoreAll(){
  const users = load(LS_USERS, []);
  const preds = load(LS_PRED, {});
  const res   = load(LS_RES, {});
  const scores = {};
  users.forEach(u=>{
    const h = u.twitter;
    const p = preds[h];
    let total = 0;
    if (p && p.picks){
      fixtures.forEach((fx,i)=>{
        const pr = p.picks[fx.id];
        const rs = res[fx.id];
        if (pr && rs){
          let pts = pointsFor(pr,rs);
          if (p.captainIndex===i) pts*=2;
          total+=pts;
        }
      });
    }
    scores[h]=total;
  });
  save(LS_SCORE, scores);
}

// Leaderboard
function renderLeaderboard(){
  const lb = document.getElementById("leaderboard");
  const users = load(LS_USERS,[]);
  const scores = load(LS_SCORE,{});
  const rows = users.map(u=>({name:u.name, handle:u.twitter, pts:scores[u.twitter]||0}))
                    .sort((a,b)=>b.pts-a.pts || a.name.localeCompare(b.name));
  if (rows.length===0){ lb.innerHTML="<p>No players yet.</p>"; return; }
  lb.innerHTML = `
    <h2>Leaderboard</h2>
    <table>
      <tr><th>#</th><th>Name</th><th>Handle</th><th>Points</th></tr>
      ${rows.map((r,i)=>`<tr><td>${i+1}</td><td>${r.name}</td><td>@${r.handle}</td><td>${r.pts}</td></tr>`).join("")}
    </table>
  `;
}

// Init
(function init(){
  if (localStorage.getItem(LS_CUR)){
    loadPredictionForm();
  }
  renderLeaderboard();
})();
