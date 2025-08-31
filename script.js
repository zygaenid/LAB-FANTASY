let CURRENT_GW = null;

async function loadPredictionForm() {
  document.getElementById("registration-section").style.display = "none";
  document.getElementById("prediction-section").style.display = "block";

  const proxy = "https://corsproxy.io/?";
  const fixturesRes = await fetch(proxy + "https://fantasy.premierleague.com/api/fixtures/");
  const teamsRes = await fetch(proxy + "https://fantasy.premierleague.com/api/bootstrap-static/");
  const fixtures = await fixturesRes.json();
  const teams = await teamsRes.json();

  const teamMap = {};
  teams.teams.forEach(t => {
    teamMap[t.id] = t.name;
  });

  const upcoming = fixtures.find(f => f.finished === false);
  CURRENT_GW = upcoming?.event || 1;

  const gwFixtures = fixtures
    .filter(f => f.event === CURRENT_GW)
    .sort((a, b) => new Date(a.kickoff_time) - new Date(b.kickoff_time));

  const container = document.getElementById("fixtures-container");
  container.innerHTML = "";

  gwFixtures.forEach((fixture, index) => {
    const home = teamMap[fixture.team_h];
    const away = teamMap[fixture.team_a];
    const kickoff = new Date(fixture.kickoff_time);
    const timeString = kickoff.toLocaleString("en-GB", {
      weekday: "short",
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: "Europe/London"
    });

    const div = document.createElement("div");
    div.classList.add("fixture");
    div.innerHTML = `
      <div style="display:flex; align-items:center; justify-content:space-between;">
        <strong>${home} vs ${away}</strong>
        <span style="font-size: 14px; color: #555;">${timeString}</span>
      </div>
      <div style="margin-top: 5px;">
        <input type="number" id="home-${index}" min="0" required placeholder="${home}" style="width:40px;"> -
        <input type="number" id="away-${index}" min="0" required placeholder="${away}" style="width:40px;">
        <label style="margin-left:10px;"><input type="radio" name="captain" value="${index}"> Captain</label>
      </div>
    `;
    container.appendChild(div);
  });
}

document.getElementById("registration-form").addEventListener("submit", function (e) {
  e.preventDefault();
  loadPredictionForm();
});

document.getElementById("prediction-form").addEventListener("submit", async function (e) {
  e.preventDefault();

  const name = document.getElementById("full-name").value;
  const twitter = document.getElementById("twitter-handle").value;

  const fixtures = document.querySelectorAll("#fixtures-container .fixture");
  const predictions = [];

  fixtures.forEach((fixture, i) => {
    const homeScore = fixture.querySelector(`#home-${i}`).value;
    const awayScore = fixture.querySelector(`#away-${i}`).value;
    const isCaptain = fixture.querySelector(`input[name="captain"][value="${i}"]`)?.checked || false;

    predictions.push({ homeScore, awayScore, isCaptain });
  });

  const payload = {
    name,
    twitter,
    gw: CURRENT_GW,
    predictions
  };

  const response = await fetch("https://script.google.com/macros/s/AKfycbwHiB1PZSBvVfGMTsfXOrMcT5e6vLH-ffPPX-x53EemW-IGsX6K16rcDR8VKPCBfZtPjw/exec", {
    method: "POST",
    body: JSON.stringify(payload),
    headers: {
      "Content-Type": "application/json"
    }
  });

  if (response.ok) {
    alert("✅ Your predictions have been submitted!");
  } else {
    alert("❌ Something went wrong. Please try again.");
  }
});
