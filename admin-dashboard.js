const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const DEPT_COLORS = ["#0566c8", "#3d97ff", "#b9d4fb", "#dce5f1"];

function make(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}

/* ---------- Announcement ---------- */
const box = document.getElementById("announce-box");
const text = document.getElementById("announce-text");
const form = document.getElementById("announce-form");
const input = document.getElementById("announce-input");
const toggle = document.getElementById("announce-switch");
const editBtn = document.getElementById("announce-edit");
const note = document.getElementById("announce-note");
let announcement = { body: "", active: false };

function say(msg) {
  note.textContent = msg;
  note.hidden = !msg;
}

function renderAnnouncement() {
  text.textContent = announcement.body || "No announcement yet.";
  toggle.setAttribute("aria-checked", String(announcement.active));
  box.classList.toggle("is-off", !announcement.active);
}

function setEditing(editing) {
  form.hidden = !editing;
  text.hidden = editing;
  editBtn.hidden = editing;
  if (editing) {
    input.value = announcement.body;
    input.focus();
  }
}

async function save(next, button) {
  if (button) button.disabled = true;
  const ok = await db.adminSaveAnnouncement(next);
  if (button) button.disabled = false;
  if (!ok) {
    say("Couldn't save the announcement. Try again.");
    return false;
  }
  announcement = next;
  renderAnnouncement();
  say("");
  return true;
}

toggle.addEventListener("click", () => {
  const next = { ...announcement, active: !announcement.active };
  toggle.disabled = true;
  save(next).finally(() => (toggle.disabled = false));
});

editBtn.addEventListener("click", () => setEditing(true));
document.getElementById("announce-cancel").addEventListener("click", () => setEditing(false));

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const ok = await save({ ...announcement, body: input.value.trim() }, form.querySelector(".is-primary"));
  if (ok) setEditing(false);
});

/* ---------- Charts ---------- */
function renderWeekly(weekly) {
  const max = Math.max(...weekly, 1);
  document.getElementById("weekly-total").textContent = weekly.reduce((a, b) => a + b, 0);

  document.getElementById("weekly-rows").replaceChildren(
    ...DAYS.map((day, i) => {
      const row = make("li", "dash-row");
      const bar = make("div", "dash-bar");
      bar.setAttribute("role", "progressbar");
      bar.setAttribute("aria-label", day);
      bar.setAttribute("aria-valuemin", "0");
      bar.setAttribute("aria-valuemax", max);
      bar.setAttribute("aria-valuenow", weekly[i]);
      const fill = make("span", "dash-bar-fill");
      fill.style.width = `${(weekly[i] / max) * 100}%`;
      bar.append(fill);
      row.append(make("span", "dash-label", day), bar, make("span", "dash-count", weekly[i]));
      return row;
    }),
  );
}

function renderDepartments(departments) {
  const total = departments.reduce((sum, d) => sum + d.count, 0);
  document.getElementById("donut-total").textContent = total;
  const legend = document.getElementById("legend");
  const donut = document.getElementById("donut");

  if (!total) {
    legend.replaceChildren(make("li", "adm-empty", "No tickets yet."));
    return;
  }

  // top 3 departments get their own colour, the rest are grouped
  const shown = departments.slice(0, 3);
  const rest = departments.slice(3).reduce((sum, d) => sum + d.count, 0);
  if (rest) shown.push({ name: "Others", count: rest });

  let angle = 0;
  const stops = [];
  legend.replaceChildren(
    ...shown.map((d, i) => {
      const pct = (d.count / total) * 100;
      stops.push(`${DEPT_COLORS[i]} ${angle}% ${angle + pct}%`);
      angle += pct;

      const li = make("li");
      const swatch = make("i");
      swatch.style.background = DEPT_COLORS[i];
      li.append(swatch, make("span", "", d.name), make("b", "", `${Math.round(pct)}%`));
      return li;
    }),
  );
  donut.style.background = `conic-gradient(${stops.join(", ")})`;
}

db.adminDashboard().then((data) => {
  if (!data) return;
  announcement = data.announcement;
  renderAnnouncement();
  renderWeekly(data.weekly);
  renderDepartments(data.departments);
}).catch((error) => {
  console.error("Couldn't load the admin dashboard.", error);
  say("Couldn't load dashboard data.");
});