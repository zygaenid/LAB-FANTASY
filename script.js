// ============================
// CONFIG
// ============================
let CURRENT_GW = null;
const GAS = "https://script.google.com/macros/s/AKfycbwHiB1PZSBvVfGMTsfXOrMcT5e6vLH-ffPPX-x53EemW-IGsX6K16rcDR8VKPCBfZtPjw/exec"; // your Web App URL

// Fallback proxy to FPL if GAS gwData isn't set up
const wrap = (u) => "https://api.allorigins.win/raw?url=" + encodeURIComponent(u);

// Small helpers
const $ = (sel) => document.querySelector(sel);
function setStatus(msg, isError=false) {
  const s = $("#status"); if (!s) return;
  s.textContent = msg || "";
  s.style.color = isError ? "#c00" : "#555";
}
function isLockedFromFixture(f) {
  if (f.finished === true || f.finished_provisional === true) return true;
  if (!f.kickoff_time) return false; // no time -> keep open until API marks started/finished
  return new Date(f.kickoff_time) <= new Date();
}

// ============================
// GW PICKING (strict: stay on current until every match finishes)
// ============================
function pickPredictionGWStrict(bootstrap, fixtures) {
  const events = bootstrap?.events || [];
  const current = events.find(e => e.is_current);
  const next    = events.find(e => e.is_next);
  if (!current) return next?.id || events[0]?.id || 1;

  const curId = current.id;
  const curFixtures = fixtures.filter(f => f.event === curId);
  const allFinished = curFixtures.length > 0 &&
    curFixtures.every(f => f.finished === true || f.finished_provisional === true);

  return allFinished ? (next?.id || curId) : curId;
}

// ============================
// DATA LOADERS
// ============================

// Preferred: all-in-one GAS route (from the Apps Script I gave you earlier: fn=gwData)
async function tryLoadViaGAS() {
  try {
    const r = await fetch(`${GAS}?fn=gwData`);
    if (!r.ok) throw new Error("gwData HTTP " + r.status);
    const j = await r.json();
    if (!j.ok && !j.fixtures) throw new Error("gwData not ok");
    return {
      source: "sheet",
      gw: j.gw,
      fixtures: j.fixtures.map(f => ({
        event: j.gw,
        team_h_name: f.home,
        team_a_name: f.away,
        kickoff_time: f.kickoff_time || null,
        started: !!f.started,
        finished: !!f.finished,
        finished_provisional: !!f.finished
      }))
    };
  } catch (e) {
    return null;
  }
}

// Fallback: official FPL endpoints (no sheet enrichment)
async function loadViaFPL() {
  const [bootstrapRes, fixturesRes] = await Promise.all([
    fetch(wrap("https://fantasy.premierleague.com/api/bootstrap-static/")),
    fetch(wrap("https://fantasy.premierleague.com/api/fixtures/")),
  ]);
  if (!bootstrapRes.ok || !fixturesRes.ok) throw new Error("FPL fetch failed");
  const [bootstrap, allFixtures] = [await bootstrapRes.json(), await fixturesRes.json()];

  const teamMap = {};
  (bootstrap.teams || []).forEach(t => teamMap[t.id] = t.name);

  const gw = pickPredictionGWStrict(bootstrap, allFixtures);
  const fixtures = allFixtures
    .filter(f => f.event === gw)
    .map(f => ({
      event: gw,
      team_h_name: teamMap[f.team_h] || `Team ${f.team_h}`,
      team_a_name: teamMap[f.team_a] || `Team ${f.team_a}`,
      kickoff_time: f.kickoff_time || null,
      started: !!f.started,
      finished: !!(f.finished || f.finished_provisional),
      finished_provisional: !!f.finished_provisional
    }));

  return { source: "api", gw, fixtures };
}

// ============================
// RENDER FIXTURES
// ============================
function renderFixtures(fixtures) {
  const container = $("#fixtures-container");
  container.innerHTML = "";

  fixtures
    .sort((a,b) => new Date(a.kickoff_time || 0) - new Date(b.kickoff_time || 0))
    .forEach((f, i) => {
      const kickoff = f.kickoff_time ? new Date(f.kickoff_time) : null;
      const timeString = kickoff
        ? kickoff.toLocaleString("en-GB", {
            weekday:"short", day:"2-digit", month:"short",
            hour:"2-digit", minute:"2-digit", hour12:false, timeZone:"Europe/London"
          })
        : "TBC";

      const locked = f.started === true || isLockedFromFixture(f);
      const disabledAttr = locked ? 'disabled aria-disabled="true"' : "";
      const lockBadge = locked ? `<span style="margin-left:8px;padding:2px 6px;border-radius:6px;background:#eee;font-size:12px;">Locked</span>` : "";

      const div = document.createElement("div");
      div.classList.add("fixture");
      div.innerHTML = `
        <div style="display:flex; align-items:center; justify-content:space-between;">
          <strong>${f.team_h_name} vs ${f.team_a_name}</strong>
          <span style="font-size: 14px; color: #555;">${timeString}${lockBadge}</span>
        </div>
        <div style="margin-top: 5px;">
          <input type="number" id="home-${i}" min="0" placeholder="${f.team_h_name}" style="width:56px;" ${disabledAttr}> -
          <input type="number" id="away-${i}" min="0" placeholder="${f.team_a_name}" style="width:56px;" ${disabledAttr}>
          <label style="margin-left:10px;"><input type="radio" name="captain" value="${i}" ${locked ? "disabled" : ""}> Captain</label>
        </div>
      `;
      container.appendChild(div);
    });
}

// ============================
// LEADERBOARD (reads LAB_Predictions via your doGet)
// ============================
async function loadLeaderboard(gw) {
  try {
    const r = await fetch(GAS); // your existing doGet returns all rows
    if (!r.ok) throw new Error("preds HTTP " + r.status);
    const rows = await r.json(); // array of rows [{Timestamp, Name, Twitter, GW, Predictions}, ...]
    const list = rows.filter(x => Number(x.GW) === Number(gw));

    const host = $("#leaderboard");
    if (!host) return;
    if (!list.length) { host.innerHTML = "<p>No submissions yet.</p>"; return; }

    // Simple table of submissions (name + number of predictions + captain index)
    const html = [
      `<h3 style="margin-top:20px;">Submissions for GW ${gw}</h3>`,
      `<table style="width:100%; border-collapse:collapse;">`,
      `<thead><tr><th style="text-align:left;border-bottom:1px solid #ddd;">Name</th><th style="text-align:left;border-bottom:1px solid #ddd;">Twitter</th><th style="text-align:left;border-bottom:1px solid #ddd;">Predictions</th></tr></thead>`,
      `<tbody>`
    ];
    list.forEach(row => {
      let preds = [];
      try { preds = JSON.parse(row.Predictions || row.Predictions_JSON || "[]"); } catch {}
      html.push(
        `<tr>
          <td style="padding:6px 0;">${row.Name || ""}</td>
          <td style="padding:6px 0;">${row.Twitter || ""}</td>
          <td style="padding:6px 0;">${preds.length} picks</td>
        </tr>`
      );
    });
    html.push(`</tbody></table>`);
    host.innerHTML = html.join("");
  } catch (e) {
    console.error(e);
    const host = $("#leaderboard");
    if (host) host.innerHTML = "<p>Could not load leaderboard.</p>";
  }
}

// ============================
// MAIN: build the prediction form
// ============================
async function loadPredictionForm() {
  $("#registration-section").style.display = "none";
  $("#prediction-section").style.display = "block";
  setStatus("Loading fixtures…");

  try {
    // 1) Try your GAS (sheet-driven). 2) Fallback to official API.
    const viaGAS = await tryLoadViaGAS();
    const data = viaGAS || await loadViaFPL();

    CURRENT_GW = data.gw;
    renderFixtures(data.fixtures);
    setStatus(`GW ${CURRENT_GW} fixtures loaded ${viaGAS ? "(sheet)" : "(API)"}.`);

    // load leaderboard (from sheet) for this GW
    await loadLeaderboard(CURRENT_GW);
  } catch (err) {
    console.error(err);
    setStatus("Failed to load fixtures. Please refresh.", true);
  }
}

// ============================
// FORM HOOKS
// ============================
document.getElementById("registration-form").addEventListener("submit", function (e) {
  e.preventDefault();
  loadPredictionForm();
});

document.getElementById("prediction-form").addEventListener("submit", async function (e) {
  e.preventDefault();

  try {
    const name = $("#full-name").value.trim();
    const twitter = $("#twitter-handle").value.trim();

    const fixtures = document.querySelectorAll("#fixtures-container .fixture");
    const predictions = [];
    let unlockedCount = 0;

    fixtures.forEach((fixture, i) => {
      const homeInput = fixture.querySelector(`#home-${i}`);
      const awayInput = fixture.querySelector(`#away-${i}`);
      const locked = homeInput.disabled && awayInput.disabled;

      const homeScore = locked ? null : (homeInput.value !== "" ? Number(homeInput.value) : null);
      const awayScore = locked ? null : (awayInput.value !== "" ? Number(awayInput.value) : null);
      const isCaptain = locked ? false : (fixture.querySelector(`input[name="captain"][value="${i}"]`)?.checked || false);

      if (!locked) unlockedCount++;
      predictions.push({ homeScore, awayScore, isCaptain, locked });
    });

    if (!name) {
      alert("Please enter your full name.");
      return;
    }
    if (unlockedCount === 0) {
      alert("All fixtures are locked. Predictions open next GW.");
      return;
    }
    const captainCount = predictions.filter(p => p.isCaptain).length;
    if (captainCount !== 1) {
      alert("Please select exactly one Captain among unlocked fixtures.");
      return;
    }

    const payload = { name, twitter, gw: CURRENT_GW, predictions };
    setStatus("Submitting…");
    const response = await fetch(GAS, {
      method: "POST",
      body: JSON.stringify(payload),
      headers: { "Content-Type": "application/json" }
    });

    if (response.ok) {
      setStatus("✅ Your predictions have been submitted!");
      alert("✅ Your predictions have been submitted!");
      // refresh leaderboard after submit
      await loadLeaderboard(CURRENT_GW);
    } else {
      throw new Error("Submit failed");
    }
  } catch (err) {
    console.error(err);
    setStatus("❌ Something went wrong. Please try again.", true);
    alert("❌ Something went wrong. Please try again.");
  }
});
