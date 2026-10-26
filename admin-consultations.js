function pad(n) {
  return String(n).padStart(2, "0");
}

function make(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}

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
  return `${hour % 12 || 12}:${minute}${hour >= 12 ? "pm" : "am"}`;
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

const DOWNLOAD_ICON =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11M7.5 10.5 12 15l4.5-4.5"></path><path d="M4 15v4h16v-4"></path></svg>';

let tickets = [];
const list = document.getElementById("admin-list");
const search = document.getElementById("admin-search");
const exportNote = document.getElementById("export-note");

function matches(ticket, query) {
  if (!query) return true;
  return [ticket.student.name, ticket.professor.name, ticket.category, ticket.code, ticket.text]
    .join(" ")
    .toLowerCase()
    .includes(query);
}

/* ---------- Export: consultation details and the whole in-app chat ---------- */
function download(filename, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportPdf(ticket, messages) {
  const JsPDF = window.jspdf && window.jspdf.jsPDF;
  if (!JsPDF) throw new Error("The PDF export library did not load.");

  const doc = new JsPDF();
  const margin = 15;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const lineHeight = 5.5;
  let y = 20;

  function writeText(value, options = {}) {
    const { size = 10, style = "normal", gap = 3 } = options;
    doc.setFont("helvetica", style);
    doc.setFontSize(size);
    let lines = doc.splitTextToSize(String(value || " "), pageWidth - margin * 2);
    while (lines.length) {
      const availableLines = Math.floor((pageHeight - margin - y) / lineHeight);
      if (availableLines <= 0) {
        doc.addPage();
        y = 20;
        continue;
      }
      const pageLines = lines.splice(0, availableLines);
      doc.text(pageLines, margin, y);
      y += pageLines.length * lineHeight;
      if (lines.length) {
        doc.addPage();
        y = 20;
      }
    }
    y += gap;
  }

  writeText("Consul.ty consultation export", { size: 18, style: "bold", gap: 6 });
  writeText(`Consultation ID: ${ticket.code}`);
  writeText(`Category: ${ticket.category}`);
  writeText(`Student: ${ticket.student.name}`);
  writeText(`Professor: ${ticket.professor.name}`);
  writeText(`Exported: ${formatDate(new Date().toISOString())} ${formatTime(new Date().toISOString())}`, { gap: 8 });

  messages.forEach((message) => {
    writeText(
      `[${formatDate(message.created_at)} ${formatTime(message.created_at)}] ${message.from} (${message.role})`,
      { style: "bold", gap: 2 },
    );
    writeText(message.body, { gap: 2 });
    if (message.files.length) writeText(`Attachments: ${message.files.join(", ")}`, { gap: 5 });
  });

  doc.save(`consultation-${ticket.code}.pdf`);
}

function safeSpreadsheetText(value) {
  const text = String(value == null ? "" : value);
  return /^[\s]*[=+\-@]/.test(text) ? `'${text}` : text;
}

function exportExcel(ticket, messages) {
  if (!window.XLSX) throw new Error("The Excel export library did not load.");

  const workbook = window.XLSX.utils.book_new();
  const overview = [
    ["Consul.ty consultation export"],
    ["Consultation ID", ticket.code],
    ["Category", ticket.category],
    ["Student", ticket.student.name],
    ["Professor", ticket.professor.name],
    ["Exported", `${formatDate(new Date().toISOString())} ${formatTime(new Date().toISOString())}`],
  ].map((row) => row.map(safeSpreadsheetText));
  const detailsSheet = window.XLSX.utils.aoa_to_sheet(overview);
  detailsSheet["!cols"] = [{ wch: 24 }, { wch: 36 }];
  window.XLSX.utils.book_append_sheet(workbook, detailsSheet, "Consultation");

  const messageRows = [
    ["Date", "Time", "From", "Role", "Message", "Attachments"],
    ...messages.map((message) => [
      formatDate(message.created_at),
      formatTime(message.created_at),
      message.from,
      message.role,
      message.body,
      message.files.join(", "),
    ]),
  ].map((row) => row.map(safeSpreadsheetText));
  const messagesSheet = window.XLSX.utils.aoa_to_sheet(messageRows);
  messagesSheet["!cols"] = [
    { wch: 14 },
    { wch: 12 },
    { wch: 24 },
    { wch: 14 },
    { wch: 60 },
    { wch: 36 },
  ];
  window.XLSX.utils.book_append_sheet(workbook, messagesSheet, "Messages");

  const content = window.XLSX.write(workbook, { bookType: "xlsx", type: "array" });
  download(
    `consultation-${ticket.code}.xlsx`,
    content,
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  );
}

async function exportTicket(ticket, format, button, menu) {
  button.disabled = true;
  menu.querySelector("summary").setAttribute("aria-disabled", "true");
  exportNote.hidden = true;
  try {
    const messages = await db.adminThread(ticket);
    if (format === "pdf") exportPdf(ticket, messages);
    else exportExcel(ticket, messages);
  } catch (error) {
    console.error("Export failed.", error);
    exportNote.textContent = "Couldn't export that conversation. Check your connection and try again.";
    exportNote.hidden = false;
  } finally {
    button.disabled = false;
    menu.querySelector("summary").removeAttribute("aria-disabled");
  }
}

/* ---------- Render ---------- */
function render() {
  list.replaceChildren();
  const query = search.value.trim().toLowerCase();
  const found = tickets.filter((t) => matches(t, query)).sort((a, b) => b.updated_at.localeCompare(a.updated_at));

  if (!found.length) {
    list.append(make("li", "tk-empty", tickets.length ? "No consultations match your search." : "No consultations yet."));
    return;
  }

  found.forEach((ticket) => {
    const avatar = make("span", "tk-avatar");
    setAvatar(avatar, ticket.student.avatar_url);

    const top = make("div", "adm-item-top");
    top.append(make("strong", "", ticket.student.name), make("time", "", formatTime(ticket.updated_at)));

    const body = make("div");
    body.append(
      top,
      make("span", "adm-item-cat", ticket.category),
      make("span", "adm-item-prev", ticket.preview),
      make("p", "adm-item-meta", `Consultation ID: ${ticket.code} · To ${ticket.professor.name}`),
    );

    const menu = make("details", "adm-export-menu");
    const button = make("summary", "adm-export");
    button.innerHTML = `${DOWNLOAD_ICON}Export`;
    button.setAttribute("aria-label", `Export consultation ${ticket.code}`);
    button.addEventListener("click", (event) => {
      if (button.getAttribute("aria-disabled") === "true") event.preventDefault();
    });
    const options = make("div", "adm-export-options");
    [
      ["pdf", "PDF (.pdf)"],
      ["excel", "Excel (.xlsx)"],
    ].forEach(([format, label]) => {
      const option = make("button", "", label);
      option.type = "button";
      option.addEventListener("click", () => {
        if (button.getAttribute("aria-disabled") === "true") return;
        menu.open = false;
        exportTicket(ticket, format, option, menu);
      });
      options.append(option);
    });
    menu.append(button, options);

    const item = make("li", "adm-item");
    item.append(avatar, body, menu);
    list.append(item);
  });
}

search.addEventListener("input", render);

db.adminTickets()
  .then((data) => {
    if (!data) return;
    tickets = data.tickets;
    render();
  })
  .catch((error) => {
    console.error("Couldn't load consultations.", error);
    list.replaceChildren(make("li", "tk-empty", "Couldn't load consultations."));
  });