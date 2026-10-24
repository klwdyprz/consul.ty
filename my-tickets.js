const SLOT_MINUTES = 30;
const STATUS_LABEL = { solved: "Solved", pending: "Pending", "on-site": "On-site" };
const SENDER_LABEL = { me: "Me", professor: "Professor", student: "Student" };
const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function pad(n) {
  return String(n).padStart(2, "0");
}

const fetchTickets = () => db.studentTickets();

const sendMessage = (ticketId, text, files, slot) => db.sendMessage(ticketId, text, files, slot);

function parseStamp(stamp) {
  const [date, time = "00:00"] = stamp.split(/[ T]/);
  const [year, month, day] = date.split("-");
  const [hour, minute] = time.split(":");
  return { year, month, day, hour: Number(hour), minute };
}

function formatDate(stamp) {
  const { year, month, day } = parseStamp(stamp);
  return `${month}/${day}/${year.slice(-2)}`;
}

function formatTime(stamp) {
  const { hour, minute } = parseStamp(stamp);
  const suffix = hour >= 12 ? "pm" : "am";
  return `${hour % 12 || 12}:${minute}${suffix}`;
}

function groupLabel(stamp) {
  const now = new Date();
  const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  return stamp.slice(0, 10) === today ? "Today" : formatDate(stamp);
}

function ticketCode(ticket) {
  return ticket.code || String(ticket.id).padStart(6, "0");
}

function setAvatar(el, url) {
  if (url) {
    const img = document.createElement("img");
    img.src = url;
    img.alt = "";
    el.replaceChildren(img);
  } else {
    el.replaceChildren();
  }
}

function make(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}

function timeToMinutes(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function minutesToTime(mins) {
  return `${pad(Math.floor(mins / 60))}:${pad(mins % 60)}`;
}

function minutesLabel(mins) {
  const h = Math.floor(mins / 60);
  return `${h % 12 || 12}:${pad(mins % 60)}${h >= 12 ? "pm" : "am"}`;
}

function hoursLabel(available) {
  const days = available.days.map((d) => DAY_NAMES[d]).join(", ");
  return `Every ${days} ${minutesLabel(timeToMinutes(available.start))}-${minutesLabel(timeToMinutes(available.end))}`;
}

function upcomingDates(available, count = 4) {
  const found = [];
  const start = new Date();
  start.setHours(0, 0, 0, 0);

  for (let i = 1; i <= 60 && found.length < count; i++) {
    const day = new Date(start);
    day.setDate(start.getDate() + i);
    if (available.days.includes(day.getDay())) {
      found.push(`${day.getFullYear()}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}`);
    }
  }
  return found;
}

function slotsFor(available) {
  const slots = [];
  const end = timeToMinutes(available.end);
  for (let t = timeToMinutes(available.start); t + SLOT_MINUTES <= end; t += SLOT_MINUTES) {
    slots.push({ start: t, end: t + SLOT_MINUTES });
  }
  return slots;
}

let tickets = [];
let selectedId = null;
let currentUser = {};
let selectedSlot = null;

const searchInput = document.getElementById("ticket-search");
const thread = document.getElementById("thread");
const onsiteBox = document.getElementById("onsite");
const hoursLabelEl = document.getElementById("d-hours-label");
const hoursEl = document.getElementById("d-hours");
const pickButton = document.getElementById("pick-btn");
const replyForm = document.getElementById("reply-form");
const replyText = document.getElementById("reply-text");
const replyNote = document.getElementById("reply-note");
const attachInput = document.getElementById("attach-input");

function refreshMeta(ticket) {
  const last = ticket.messages[ticket.messages.length - 1];
  ticket.body = last.body;
  ticket.updated_at = last.created_at;
  ticket.last_sender = last.from === "me" ? "me" : "professor";
}

function byRecent(a, b) {
  return b.updated_at.localeCompare(a.updated_at);
}

function renderUser(user) {
  currentUser = user;
  document.getElementById("user-name").textContent = user.name;
  setAvatar(document.getElementById("user-avatar"), user.avatar_url);
}

function matchesSearch(ticket, query) {
  if (!query) return true;
  const haystack = [
    ticket.professor.name,
    ticket.professor.username,
    ticket.category,
    ticketCode(ticket),
    ...ticket.messages.map((m) => m.body),
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(query);
}

function renderList() {
  const list = document.getElementById("ticket-list");
  list.replaceChildren();

  if (!tickets.length) {
    list.append(make("p", "tk-empty", "No tickets yet. Submit a consultation ticket to get started."));
    return;
  }

  const query = searchInput.value.trim().toLowerCase();
  const sorted = tickets.filter((t) => matchesSearch(t, query)).sort(byRecent);

  if (!sorted.length) {
    list.append(make("p", "tk-empty", "No consultations match your search."));
    return;
  }

  let currentGroup = null;
  let cards = null;

  sorted.forEach((ticket) => {
    const label = groupLabel(ticket.updated_at);

    if (label !== currentGroup) {
      currentGroup = label;
      list.append(make("h2", "tk-group", label));
      cards = make("ul", "tk-cards");
      list.append(cards);
    }

    const item = make("li");
    const card = make("button", "tk-card");
    card.type = "button";
    card.dataset.id = ticket.id;
    card.setAttribute("aria-current", String(ticket.id === selectedId));

    const avatar = make("span", "tk-avatar");
    setAvatar(avatar, ticket.professor.avatar_url);

    const sender = SENDER_LABEL[ticket.last_sender] || ticket.professor.name;
    const top = make("div", "tk-card-top");
    top.append(make("strong", "", sender), make("time", "", formatTime(ticket.updated_at)));

    const text = make("div");
    text.append(
      top,
      make("span", "tk-card-id", `Consultation ID: ${ticketCode(ticket)}`),
      make("span", "tk-card-cat", ticket.category),
      make("span", "tk-card-preview", ticket.body),
    );

    card.append(avatar, text);
    card.addEventListener("click", () => selectTicket(ticket.id));
    item.append(card);
    cards.append(item);
  });
}

async function openFile(file) {
  const win = window.open("", "_blank");
  try {
    const url = await db.attachmentUrl(file.path);
    if (win) win.location.href = url;
    else window.location.href = url;
  } catch (error) {
    if (win) win.close();
    console.error("Couldn't open attachment.", error);
  }
}

function messageEl(message, ticket) {
  const mine = message.from === "me";
  const sender = mine ? { name: "Me", avatar_url: currentUser.avatar_url } : ticket.professor;
  const item = make("li", `mail ${mine ? "is-me" : "is-them"}`);

  const avatar = make("span", "tk-avatar mail-avatar");
  setAvatar(avatar, sender.avatar_url);

  const who = make("div", "mail-who");
  who.append(make("strong", "", sender.name));
  if (!mine) who.append(make("small", "", `<${sender.username}>`));

  const when = make("time", "mail-when", `${formatDate(message.created_at)} · ${formatTime(message.created_at)}`);

  const head = make("header", "mail-head");
  head.append(avatar, who, when);
  item.append(head, make("p", "mail-body", message.body));

  if (message.attachments && message.attachments.length) {
    const files = make("div", "mail-files");
    message.attachments.forEach((file) => {
      const btn = make("button", "mail-file", file.name);
      btn.type = "button";
      btn.title = "Open attachment";
      btn.addEventListener("click", () => openFile(file));
      files.append(btn);
    });
    item.append(files);
  }

  return item;
}

function renderThread(ticket, stick) {
  const nearBottom = thread.scrollHeight - thread.scrollTop - thread.clientHeight < 120;
  thread.replaceChildren(...ticket.messages.map((m) => messageEl(m, ticket)));
  if (stick || nearBottom) thread.scrollTop = thread.scrollHeight;
}

function renderDetail(ticket, stick = false) {
  document.getElementById("d-name").textContent = ticket.professor.name;
  document.getElementById("d-username").textContent = `<${ticket.professor.username}>`;
  document.getElementById("d-date").textContent = formatDate(ticket.created_at);
  document.getElementById("d-time").textContent = formatTime(ticket.created_at);
  document.getElementById("d-id").textContent = `Consultation ID: ${ticketCode(ticket)}`;
  document.getElementById("d-subject").textContent = `Re: ${ticket.category}`;
  setAvatar(document.getElementById("d-avatar"), ticket.professor.avatar_url);

  const status = document.getElementById("d-status");
  status.textContent = STATUS_LABEL[ticket.status] || ticket.status;
  status.classList.toggle("is-pending", ticket.status === "pending");
  status.classList.toggle("is-onsite", ticket.status === "on-site");

  if (ticket.schedule) {
    const s = ticket.schedule;
    onsiteBox.hidden = false;
    hoursLabelEl.textContent = "Scheduled:";
    hoursEl.textContent = `${formatDate(s.date)} · ${minutesLabel(timeToMinutes(s.start))}-${minutesLabel(timeToMinutes(s.end))}`;
    pickButton.hidden = true;
  } else if (ticket.status === "on-site" && ticket.available) {
    onsiteBox.hidden = false;
    hoursLabelEl.textContent = "Available hours:";
    hoursEl.textContent = hoursLabel(ticket.available);
    pickButton.hidden = false;
  } else {
    onsiteBox.hidden = true;
  }

  renderThread(ticket, stick);
}

function resetPicker() {
  selectedSlot = null;
  pickButton.textContent = "Click to select Date and Time";
  pickButton.classList.remove("is-set");
}

function selectTicket(id) {
  const ticket = tickets.find((t) => t.id === id);
  if (!ticket) return;

  selectedId = id;
  document.getElementById("ticket-detail").hidden = false;
  replyForm.reset();
  document.getElementById("attach-names").textContent = "";
  replyNote.hidden = true;
  resetPicker();
  renderDetail(ticket, true);

  document.querySelectorAll(".tk-card").forEach((card) => {
    card.setAttribute("aria-current", String(Number(card.dataset.id) === id));
  });
  history.replaceState(null, "", `?id=${id}`);
}

searchInput.addEventListener("input", renderList);

const pickDialog = document.getElementById("pick-dialog");
const pickForm = document.getElementById("pick-form");
const pickDates = document.getElementById("pick-dates");
const pickTimes = document.getElementById("pick-times");

function chip(name, value, label, checked) {
  const wrap = make("label", "tk-chip");
  const input = document.createElement("input");
  input.type = "radio";
  input.name = name;
  input.value = value;
  input.required = true;
  input.checked = checked;
  wrap.append(input, make("span", "", label));
  return wrap;
}

pickButton.addEventListener("click", () => {
  const ticket = tickets.find((t) => t.id === selectedId);
  if (!ticket || !ticket.available) return;

  const dates = upcomingDates(ticket.available);
  const slots = slotsFor(ticket.available);

  pickDates.replaceChildren(
    ...dates.map((date, i) => chip("date", date, formatDate(date), selectedSlot ? selectedSlot.date === date : i === 0)),
  );
  pickTimes.replaceChildren(
    ...slots.map((slot, i) =>
      chip(
        "time",
        slot.start,
        `${minutesLabel(slot.start)}-${minutesLabel(slot.end)}`,
        selectedSlot ? selectedSlot.start === slot.start : i === 0,
      ),
    ),
  );

  pickDialog.showModal();
});

document.getElementById("pick-cancel").addEventListener("click", () => pickDialog.close());

pickForm.addEventListener("submit", () => {
  const data = new FormData(pickForm);
  const start = Number(data.get("time"));
  selectedSlot = { date: data.get("date"), start, end: start + SLOT_MINUTES };

  const range = `${minutesLabel(selectedSlot.start)}-${minutesLabel(selectedSlot.end)}`;
  pickButton.textContent = `${formatDate(selectedSlot.date)} · ${range}`;
  pickButton.classList.add("is-set");

  const rest = replyText.value.replace(/^Selected Date:.*\nTime:.*\n*/, "");
  const block = `Selected Date: ${formatDate(selectedSlot.date)}\nTime: ${range}`;
  replyText.value = rest ? `${block}\n\n${rest}` : block;
});

document.getElementById("attach-btn").addEventListener("click", () => attachInput.click());

attachInput.addEventListener("change", () => {
  document.getElementById("attach-names").textContent = [...attachInput.files].map((f) => f.name).join(", ");
});

replyText.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && (event.ctrlKey || event.metaKey) && !event.isComposing) {
    event.preventDefault();
    replyForm.requestSubmit();
  }
});

function addMessage(ticket, message) {
  const existing = ticket.messages.find((m) => m.id === message.id);
  if (!existing) {
    ticket.messages.push(message);
    return;
  }
  (message.attachments || []).forEach((file) => {
    if (!existing.attachments.some((a) => a.path === file.path)) existing.attachments.push(file);
  });
}

replyForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const ticket = tickets.find((t) => t.id === selectedId);
  const text = replyText.value.trim();
  if (!ticket || !text) return;

  const files = [...attachInput.files];
  const slot = selectedSlot;
  const button = replyForm.querySelector(".tk-send");
  button.disabled = true;
  const sent = await sendMessage(ticket.id, text, files, slot);
  button.disabled = false;

  if (!sent) {
    replyNote.textContent = slot
      ? "Couldn't send. That time may already be taken, so pick another one."
      : "Couldn't send your message. Try again.";
    replyNote.hidden = false;
    return;
  }

  if (slot) {
    ticket.schedule = { date: slot.date, start: minutesToTime(slot.start), end: minutesToTime(slot.end) };
  }
  addMessage(ticket, sent);
  refreshMeta(ticket);

  replyForm.reset();
  document.getElementById("attach-names").textContent = "";
  resetPicker();
  replyNote.textContent = sent.attachFailed ? "Sent, but the attachments couldn't be uploaded." : "";
  replyNote.hidden = !sent.attachFailed;

  renderDetail(ticket, true);
  renderList();
});

function liveMessage(row) {
  const ticket = tickets.find((t) => t.id === row.consultation_id);
  if (!ticket) return;

  addMessage(ticket, {
    id: row.id,
    from: row.sender_role === "student" ? "me" : "them",
    body: row.body,
    created_at: db.stamp(row.created_at),
    attachments: [],
  });
  refreshMeta(ticket);
  renderList();
  if (ticket.id === selectedId) renderDetail(ticket, false);
}

function liveAttachment(row) {
  const ticket = tickets.find((t) => t.id === row.consultation_id);
  if (!ticket) return;

  const message = row.message_id ? ticket.messages.find((m) => m.id === row.message_id) : ticket.messages[0];
  if (!message || message.attachments.some((a) => a.path === row.path)) return;

  message.attachments.push({ name: row.file_name, path: row.path });
  if (ticket.id === selectedId) renderDetail(ticket, false);
}

function liveTicket(row) {
  const ticket = tickets.find((t) => t.id === row.id);
  if (!ticket || ticket.status === row.status) return;

  ticket.status = row.status;
  if (ticket.id === selectedId) renderDetail(ticket, false);
}

const nav = document.querySelector(".dash-nav");
const currentNavItem = nav.querySelector(".is-active");
const dropdownToggle = document.querySelector(".dash-dropdown-toggle");
const dropdownMenu = document.getElementById("consultations-menu");

function movePill(target) {
  const navBox = nav.getBoundingClientRect();
  const box = target.getBoundingClientRect();

  nav.style.setProperty("--pill-x", `${box.left - navBox.left - nav.clientLeft}px`);
  nav.style.setProperty("--pill-w", `${box.width}px`);
}

function setDropdown(open) {
  dropdownToggle.setAttribute("aria-expanded", String(open));
  dropdownMenu.hidden = !open;
  movePill(currentNavItem);
}

dropdownToggle.addEventListener("click", () => {
  setDropdown(dropdownToggle.getAttribute("aria-expanded") !== "true");
});

document.addEventListener("click", (event) => {
  if (!event.target.closest(".dash-dropdown")) setDropdown(false);
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    setDropdown(false);
    dropdownToggle.focus();
  }
});

document.fonts.ready.then(() => {
  movePill(currentNavItem);
  requestAnimationFrame(() => nav.classList.add("is-ready"));
});
window.addEventListener("resize", () => movePill(currentNavItem));

fetchTickets().then((data) => {
  if (!data) return;
  tickets = data.tickets;
  tickets.forEach(refreshMeta);
  renderUser(data.user);

  const wanted = Number(new URLSearchParams(location.search).get("id"));
  const first = tickets.find((t) => t.id === wanted) || [...tickets].sort(byRecent)[0];
  selectedId = first ? first.id : null;

  renderList();
  if (first) selectTicket(first.id);
  else document.getElementById("ticket-detail").hidden = true;

  db.watchThreads({ onMessage: liveMessage, onAttachment: liveAttachment, onTicket: liveTicket }).catch((error) =>
    console.warn("Live messages unavailable.", error),
  );
});
