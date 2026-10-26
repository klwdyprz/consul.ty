/* Admin data layer. Loads after supabase.js and adds admin calls onto the same `db` object.
   
   consultation_messages, consultation_attachments, plus the new announcements table (admin.sql).
   The "admin all" RLS policies already give admins read/write on everything. */
(() => {
  const client = db.client;

  const must = (res) => {
    if (res.error) throw res.error;
    return res.data;
  };

  const nameOf = (p) => {
    if (!p) return "Unknown";
    const mi = p.middle_initial ? ` ${p.middle_initial}` : "";
    const suffix = p.suffix ? ` ${p.suffix}` : "";
    return `${p.first_name || ""}${mi} ${p.last_name || ""}${suffix}`.trim() || "Unnamed";
  };

  const code = (id) => String(id).padStart(6, "0");

  /* Signed-in admin or redirect */
  async function adminUser() {
    const { data } = await client.auth.getSession();
    if (!data.session) {
      window.location.href = "login.html";
      return null;
    }
    const uid = data.session.user.id;
    const admin = await client.from("admins").select("username").eq("id", uid).maybeSingle();
    if (!admin.data) {
      const [prof] = await Promise.all([client.from("professors").select("id").eq("id", uid).maybeSingle()]);
      window.location.href = prof.data ? db.HOME.professor : db.HOME.student;
      return null;
    }
    return { name: admin.data.username, avatar_url: null };
  }

  // Monday 00:00 of the current week
  function weekStart() {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return d;
  }

  db.adminDashboard = async () => {
    const user = await adminUser();
    if (!user) return null;

    const [ann, rows] = await Promise.all([
      client.from("announcements").select("body, active").eq("id", 1).maybeSingle(),
      client.from("consultations").select("created_at, professor:professors(department)"),
    ]);

    const start = weekStart().getTime();
    const weekly = [0, 0, 0, 0, 0, 0, 0];
    const byDept = {};

    must(rows).forEach((r) => {
      const date = new Date(r.created_at);
      if (date.getTime() >= start) weekly[(date.getDay() + 6) % 7] += 1;
      const dept = (r.professor && r.professor.department) || "Unassigned";
      byDept[dept] = (byDept[dept] || 0) + 1;
    });

    const departments = Object.entries(byDept)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);

    return { user, announcement: ann.data || { body: "", active: false }, weekly, departments };
  };

  db.adminSaveAnnouncement = async ({ body, active }) => {
    const { error } = await client
      .from("announcements")
      .upsert({ id: 1, body, active, updated_at: new Date().toISOString() });
    return !error;
  };

  db.adminTickets = async () => {
    const user = await adminUser();
    if (!user) return null;

    const rows = must(
      await client
        .from("consultations")
        .select(
          `id, category, description, created_at,
           student:students(first_name, middle_initial, last_name, suffix, avatar_url),
           professor:professors(first_name, middle_initial, last_name, suffix),
           messages:consultation_messages(body, created_at)`,
        ),
    );

    const tickets = rows.map((r) => {
      const msgs = [...(r.messages || [])].sort((a, b) => a.created_at.localeCompare(b.created_at));
      const last = msgs[msgs.length - 1];
      return {
        id: r.id,
        code: code(r.id),
        category: r.category,
        description: r.description,
        created_at: db.stamp(r.created_at),
        student: { name: nameOf(r.student), avatar_url: r.student && r.student.avatar_url },
        professor: { name: nameOf(r.professor) },
        updated_at: db.stamp(last ? last.created_at : r.created_at),
        preview: last ? last.body : r.description,
        text: [r.description, ...msgs.map((m) => m.body)].join(" "),
      };
    });
    return { user, tickets };
  };

  /* Full conversation for the export (messages + the files attached to each) */
  db.adminThread = async (ticket) => {
    const [msgs, files] = await Promise.all([
      client
        .from("consultation_messages")
        .select("id, body, sender_role, created_at")
        .eq("consultation_id", ticket.id)
        .order("created_at"),
      client
        .from("consultation_attachments")
        .select("message_id, file_name")
        .eq("consultation_id", ticket.id),
    ]);

    const messages = must(msgs);
    const attachments = must(files);
    const conversation = [];
    if (ticket.description) {
      conversation.push({
        id: null,
        from: ticket.student.name,
        role: "student",
        body: ticket.description,
        created_at: ticket.created_at,
      });
    }
    conversation.push(...messages.map((m) => ({
      id: m.id,
      from: m.sender_role === "student" ? ticket.student.name : ticket.professor.name,
      role: m.sender_role,
      body: m.body,
      created_at: db.stamp(m.created_at),
    })));

    return conversation.map((message, index) => ({
      ...message,
      // Attachments without a message_id belong to the original request, or the first reply if absent.
      files: attachments
        .filter((a) => a.message_id === message.id || (a.message_id == null && index === 0))
        .map((a) => a.file_name),
    }));
  };

  /* Log Out button in the header (both admin pages) */
  const logout = document.getElementById("logout-btn");
  if (logout) logout.addEventListener("click", () => db.signOut());
})();