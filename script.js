async function loadPredictionForm() {
  document.getElementById("registration-section").style.display = "none";
  document.getElementById("prediction-section").style.display = "block";

  const fixturesRes = await fetch('https://fantasy.premierleague.com/api/fixtures/');
  const teamsRes = await fetch('https://fantasy.premierleague.com/api/bootstrap-static/');
  const fixtures = await fixturesRes.json();
  const teams = await teamsRes.json();

  const teamMap = {};
  teams.teams.forEach(t => {
    teamMap[t.id] = t.name;
  });

  const currentGW = fixtures.find(f => f.finished === false)?.event;
  const gwFixtures = fixtures
    .filter(f => f.event === currentGW)
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
      <div>
        <input type="number" id="home-${index}" min="0" required> -
        <input type="number" id="away-${index}" min="0" required>
        <label><input type="radio" name="captain" value="${index}"> Captain</label>
      </div>
    `;
    container.appendChild(div);
  });
}

document.getElementById("registration-form").addEventListener("submit", function(e) {
  e.preventDefault();
  loadPredictionForm();
});
