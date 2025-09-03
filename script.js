/***** SIMPLE, STABLE VERSION (like before) *****/

const GAS = "https://script.google.com/macros/s/AKfycbyypxn-kbp_g2NEvoz6FQgASEKP2qC_mQ5kK1pIZ9bbSdUFX3U5wRkEkRd3vn4LG0iKvw/exec";
const PROXY = "https://corsproxy.io/?";
let CURRENT_GW = null;

const $ = (s) => document.querySelector(s);

function setStatus(msg, isError=false) {
  const el = $("#status"); if (!el) return;
  el.textContent = msg || "";
  el.style.color = isError ? "#c00" : "#555";
}

function isLocked(fix) {
  // lock if finished OR started OR kickoff passed
  if (fix.finished === true || fix.started === true) return true;
  if (!fix.kickoff_time) return false;
  return new Date(fix.kickoff_time) <= new Date();
}

function fmtKickoff(iso) {
  if (!iso) return "TBC";
  const d = new Date(iso);
  // Show in UK time
  return d.toLocaleString("en-GB", {
    weekday: "short", day: "2-digit", month: "short",
    hour: "2-digit", minute: "2-digit", hour12: false,
    timeZone: "Europe/London"
  });
}

async function loadPredictionForm() {
  $("#registration-section").style.display = "none";
  $("#prediction-section").style.display = "block";
  setStatus("Loading fixtures…");

  try {
    // Fetch FPL data (via proxy to avoid CORS)
    const [fixturesRes, teamsRes] = await Promise.all([
      fetch(PROXY + "https://fantasy.premierleague.com/api/fixtures/"),
      fetch(PROXY + "https://fantasy.premierleague.com/api/bootstrap-static/")
    ]);

    if (!fixturesRes.ok || !teamsRes.ok) throw new Error("FPL API unavailable");

    const fixtures = await fixturesRes.json();
    const teams = await teamsRes.json();

    // Build team map
    const teamMap = {};
    teams.teams.forEach(t => { teamMap[t.id] = t.name; });

    // Determine the next upcoming GW (any fixture with kickoff in the future)
    const now = new Date();
    const futureFix = fixtures.filter(f => f.kickoff_time && new Date(f.kickoff_time) > now);
    if (futureFix.length > 0) {
      CURRENT_GW = Math.min(...futureFix.map(f => f.event));
    } else {
      // Fallback: pick the first unfinished GW; else last event found
      const unfinished = fixtures.filter(f => f.finished === false);
      CURRENT_GW = unfinished.length ? unfinished[0].event : Math.max(...fixtures.map(f => f.event || 1));
    }

    // Get fixtures for CURRENT_GW
    const gwFixtures = fixtures
      .filter(f => f.event === CURRENT_GW)
      .sort((a, b) => new Date(a.kickoff_time || 0) - new Date(b.kickoff_time || 0));

    // Render
    const container = $("#fixtures-container");
    container.innerHTML = "";

    gwFixtures.forEach((fixture, index) => {
      const home = teamMap[fixture.team_h] || `H${fixture.team_h}`;
      const away = teamMap[fixture.team_a] || `A${fixture.team_a}`;
      const timeString = fmtKickoff(fixture.kickoff_time);
      const locked = isLocked(fixture);

      const div = document.createElement("div");
      div.classList.add("fixture");
      if (locked) div.classList.add("locked");

      div.innerHTML = `
        <div style="display:flex; align-items:center; justify-content:space-between;">
          <strong>${home} vs ${away}</strong>
          <span style="font-size:14px; color:#555;">${timeString}${locked ? ' · Locked' : ''}</span>
        </div>
        <div style="margin-top:6px;">
          <input type="number" id="home-${index}" min="0" placeholder="${home}" style="width:56px;" ${locked ? "disabled" : ""}> -
          <input type="number" id="away-${index}" min="0" placeholder="${away}" style="width:56px;" ${locked ? "disabled" : ""}>
          <label style="margin-left:10px;">
            <input type="radio" name="captain" value="${index}" ${locked ? "disabled" : ""}> Captain
          </label>
        </div>
      `;
      container.appendChild(div);
    });

    setStatus(`GW ${CURRENT_GW} fixtures loaded.`);
  } catch (err) {
    console.error(err);
    setStatus("Failed to load fixtures.", true);
  }
}

/* Registration → show fixtures */
document.getElementById("registration-form").addEventListener("submit", (e) => {
  e.preventDefault();
  loadPredictionForm();
});

/* Submit predictions */
document.getElementById("prediction-form").addEventListener("submit", async (e) => {
  e.preventDefault();

  try {
    const name = document.getElementById("full-name").value.trim();
    const twitter = document.getElementById("twitter-handle").value.trim();
    if (!name) { alert("Please enter your full name."); return; }

    const fixtures = document.querySelectorAll("#fixtures-container .fixture");
    const predictions = [];
    let unlockedCount = 0;

    fixtures.forEach((fixture, i) => {
      const homeEl = fixture.querySelector(`#home-${i}`);
      const awayEl = fixture.querySelector(`#away-${i}`);
      const locked = homeEl.disabled && awayEl.disabled;

      const homeScore = locked ? null : (homeEl.value !== "" ? Number(homeEl.value) : null);
      const awayScore = locked ? null : (awayEl.value !== "" ? Number(awayEl.value) : null);
      const isCaptain = locked ? false : (fixture.querySelector(`input[name="captain"][value="${i}"]`)?.checked || false);

      if (!locked) unlockedCount++;
      predictions.push({ homeScore, awayScore, isCaptain, locked });
    });

    if (unlockedCount === 0) {
      alert("All fixtures are locked. Predictions open next GW."); 
      return;
    }

    const captainCount = predictions.filter(p => p.isCaptain).length;
    if (captainCount !== 1) {
      alert("Please select exactly one Captain among unlocked fixtures.");
      return;
    }

    setStatus("Submitting…");

    const res = await fetch(GAS, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, twitter, gw: CURRENT_GW, predictions })
    });

    if (!res.ok) throw new Error("Submit failed");

    setStatus("✅ Predictions submitted!");
    alert("✅ Your predictions have been submitted!");
  } catch (err) {
    console.error(err);
    setStatus("❌ Submission failed", true);
    alert("❌ Something went wrong. Please try again.");
  }
});
