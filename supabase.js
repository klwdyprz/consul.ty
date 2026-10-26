(() => {
  const SUPABASE_URL = "https://jgfdglqcqurbijtqllvu.supabase.co";
  const SUPABASE_ANON_KEY = "sb_publishable_F9R3_WvFIYq3iLRLL9V-8w_wYOabQyW";

  const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  const HOME = {
    student: "dashboard.html",
    professor: "prof-dashboard.html",
    admin: "admin-dashboard.html",
  };

  const CATEGORY = {
    grades: "Grades",
    lessons: "Lessons / Topics",
    requirements: "Requirements / Deadlines",
    attendance: "Attendance",
    other: "Other",
  };

  const pad = (n) => String(n).padStart(2, "0");
  const hhmm = (t) => (t ? t.slice(0, 5) : "");
  const minutesToTime = (m) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
  const code = (id) => String(id).padStart(6, "0");

  function must(res) {
    if (res.error) throw res.error;
    return res.data;
  }

  function today() {
    const d = new Date();
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  function stamp(iso) {
    const d = new Date(iso);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function fullName(p) {
    const mi = p.middle_initial ? ` ${p.middle_initial}` : "";
    const suffix = p.suffix ? ` ${p.suffix}` : "";
    return `${p.first_name || ""}${mi} ${p.last_name || ""}${suffix}`.trim() || "Unnamed";
  }

  const usernameOf = (email) => (email || "").split("@")[0];
  const normRole = (role) => (role === "prof" ? "professor" : role);
  const tableOf = (role) => (normRole(role) === "professor" ? "professors" : "students");

  async function lookupRole(uid) {
    const [admin, prof] = await Promise.all([
      client.from("admins").select("id").eq("id", uid).maybeSingle(),
      client.from("professors").select("id").eq("id", uid).maybeSingle(),
    ]);
    if (admin.data) return "admin";
    if (prof.data) return "professor";
    return "student";
  }

  async function getContext(expected) {
    const { data } = await client.auth.getSession();
    const session = data.session;
    if (!session) {
      window.location.href = "login.html";
      return null;
    }

    const uid = session.user.id;
    const key = `role:${uid}`;
    let role = sessionStorage.getItem(key);
    if (!role) {
      role = await lookupRole(uid);
      sessionStorage.setItem(key, role);
    }

    if (expected && role !== expected) {
      window.location.href = HOME[role] || "login.html";
      return null;
    }
    return { uid, role, email: session.user.email };
  }

  async function signIn(email, password) {
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw error;
    const role = await lookupRole(data.user.id);
    sessionStorage.setItem(`role:${data.user.id}`, role);
    return role;
  }

  async function signUp(email, password, names) {
    const { data, error } = await client.auth.signUp({
      email,
      password,
      options: { data: names, emailRedirectTo: `${window.location.origin}/login.html` },
    });
    if (error) throw error;
    if (data.session) {
      sessionStorage.setItem(`role:${data.user.id}`, "student");
      return "student";
    }
    return null;
  }

  async function signOut() {
    await client.auth.signOut();
    sessionStorage.clear();
    window.location.href = "login.html";
  }

  async function ownRow(role, uid) {
    return must(await client.from(tableOf(role)).select("*").eq("id", uid).single());
  }

  const headerUser = (row) => ({ name: fullName(row), avatar_url: row.avatar_url });

  async function uploadAttachments(consultationId, uid, files, messageId = null) {
    const saved = [];
    for (const file of [...(files || [])]) {
      const safe = file.name.replace(/[^\w.\-]+/g, "_");
      const path = `${consultationId}/${Date.now()}-${safe}`;
      const up = await client.storage.from("attachments").upload(path, file);
      if (up.error) throw up.error;
      must(
        await client.from("consultation_attachments").insert({
          consultation_id: consultationId,
          uploader_id: uid,
          message_id: messageId,
          file_name: file.name,
          path,
          size_bytes: file.size,
        }),
      );
      saved.push({ name: file.name, path });
    }
    return saved;
  }

  function buildThread(r, myRole) {
    const files = r.attachments || [];
    const fileOf = (a) => ({ name: a.file_name, path: a.path });

    const first = {
      id: `c${r.id}`,
      from: myRole === "student" ? "me" : "them",
      body: r.description,
      created_at: stamp(r.created_at),
      attachments: files.filter((a) => !a.message_id).map(fileOf),
    };

    const rest = [...r.messages]
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .map((m) => ({
        id: m.id,
        from: m.sender_role === myRole ? "me" : "them",
        body: m.body,
        created_at: stamp(m.created_at),
        attachments: files.filter((a) => a.message_id === m.id).map(fileOf),
      }));

    return [first, ...rest];
  }

  function scheduleOf(r) {
    const s = Array.isArray(r.schedule) ? r.schedule[0] : r.schedule;
    return s ? { date: s.date, start: hhmm(s.start_time), end: hhmm(s.end_time) } : undefined;
  }

  async function dashboardAnnouncement() {
    const row = must(await client.from("announcements").select("body, active").eq("id", 1).maybeSingle());
    return row && row.active && row.body.trim() ? row.body : null;
  }

  async function attachmentUrl(path) {
    const { data, error } = await client.storage.from("attachments").createSignedUrl(path, 120);
    if (error) throw error;
    return data.signedUrl;
  }

  async function studentDashboard() {
    const ctx = await getContext("student");
    if (!ctx) return null;

    const [me, cons, next, announcement] = await Promise.all([
      ownRow("student", ctx.uid),
      client.from("consultations").select("status").eq("student_id", ctx.uid),
      client.from("schedules").select("date").eq("student_id", ctx.uid)
        .gte("date", today()).order("date").limit(1),
      dashboardAnnouncement(),
    ]);

    const rows = must(cons);
    const upcoming = must(next)[0];
    const solved = rows.filter((r) => r.status === "solved").length;

    return {
      user: headerUser(me),
      upcoming: upcoming ? { date: upcoming.date } : null,
      counts: { submitted: rows.length, solved, pending: rows.length - solved },
      announcement,
    };
  }

  async function studentSchedules() {
    const ctx = await getContext("student");
    if (!ctx) return null;

    const [me, sch] = await Promise.all([
      ownRow("student", ctx.uid),
      client.from("schedules")
        .select("id, date, start_time, end_time, professor:professors(first_name, last_name, middle_initial, suffix)")
        .eq("student_id", ctx.uid),
    ]);

    return {
      user: headerUser(me),
      schedules: must(sch).map((s) => ({
        id: s.id,
        professor: { name: `Prof. ${fullName(s.professor)}` },
        date: s.date,
        start: hhmm(s.start_time),
        end: hhmm(s.end_time),
      })),
    };
  }

  async function studentTickets() {
    const ctx = await getContext("student");
    if (!ctx) return null;

    const [me, res] = await Promise.all([
      ownRow("student", ctx.uid),
      client.from("consultations")
        .select(`id, category, description, status, created_at,
                 professor:professors(first_name, last_name, middle_initial, suffix, email, avatar_url,
                                      available_days, available_start, available_end),
                 messages:consultation_messages(id, body, sender_role, created_at),
                 attachments:consultation_attachments(id, message_id, file_name, path),
                 schedule:schedules(date, start_time, end_time)`)
        .eq("student_id", ctx.uid)
        .order("created_at", { ascending: false }),
    ]);

    const tickets = must(res).map((r) => {
      const p = r.professor;
      return {
        id: r.id,
        code: code(r.id),
        professor: { name: `Prof. ${fullName(p)}`, username: usernameOf(p.email), avatar_url: p.avatar_url },
        category: r.category,
        status: r.status,
        created_at: stamp(r.created_at),
        available:
          r.status === "on-site"
            ? { days: p.available_days, start: hhmm(p.available_start), end: hhmm(p.available_end) }
            : undefined,
        schedule: scheduleOf(r),
        messages: buildThread(r, "student"),
      };
    });

    return { user: headerUser(me), tickets };
  }

  async function sendMessage(ticketId, text, files, slot) {
    try {
      const ctx = await getContext();
      if (!ctx || (ctx.role !== "student" && ctx.role !== "professor")) return null;

      if (slot && ctx.role === "student") {
        const t = must(await client.from("consultations").select("professor_id").eq("id", ticketId).single());
        must(
          await client.from("schedules").insert({
            consultation_id: ticketId,
            student_id: ctx.uid,
            professor_id: t.professor_id,
            date: slot.date,
            start_time: minutesToTime(slot.start),
            end_time: minutesToTime(slot.end),
          }),
        );
      }

      const row = must(
        await client.from("consultation_messages")
          .insert({ consultation_id: ticketId, sender_id: ctx.uid, sender_role: ctx.role, body: text })
          .select("id, body, created_at")
          .single(),
      );

      const message = { id: row.id, from: "me", body: row.body, created_at: stamp(row.created_at), attachments: [] };
      try {
        message.attachments = await uploadAttachments(ticketId, ctx.uid, files, row.id);
      } catch (error) {
        console.error("attachments failed", error);
        message.attachFailed = true;
      }
      return message;
    } catch (error) {
      console.error("sendMessage failed", error);
      return null;
    }
  }

  async function listProfessors() {
    const ctx = await getContext("student");
    if (!ctx) return [];
    const rows = must(
      await client.from("professors")
        .select("id, first_name, last_name, middle_initial, suffix, department")
        .order("last_name"),
    );
    return rows.map((p) => ({ id: p.id, name: `Prof. ${fullName(p)}`, department: p.department }));
  }

  async function submitTicket(fields, files) {
    const ctx = await getContext("student");
    if (!ctx) return null;

    const row = must(
      await client.from("consultations")
        .insert({
          student_id: ctx.uid,
          professor_id: fields.professor,
          subject_code: fields.subject_code,
          section: fields.section,
          category: CATEGORY[fields.category] || fields.category,
          description: fields.description,
        })
        .select("id")
        .single(),
    );

    await uploadAttachments(row.id, ctx.uid, files);
    return row.id;
  }

  async function profDashboard() {
    const ctx = await getContext("professor");
    if (!ctx) return null;

    const [me, cons, next, announcement] = await Promise.all([
      ownRow("professor", ctx.uid),
      client.from("consultations").select("status").eq("professor_id", ctx.uid),
      client.from("schedules").select("date").eq("professor_id", ctx.uid)
        .gte("date", today()).order("date").limit(1),
      dashboardAnnouncement(),
    ]);

    const rows = must(cons);
    const upcoming = must(next)[0];
    const count = (s) => rows.filter((r) => r.status === s).length;

    return {
      user: headerUser(me),
      upcoming: upcoming ? { date: upcoming.date } : null,
      counts: { solved: count("solved"), pending: count("pending"), onsite: count("on-site") },
      announcement,
    };
  }

  async function profTickets() {
    const ctx = await getContext("professor");
    if (!ctx) return null;

    const [me, res] = await Promise.all([
      ownRow("professor", ctx.uid),
      client.from("consultations")
        .select(`id, category, description, status, created_at,
                 student:students(first_name, last_name, middle_initial, suffix, email, avatar_url),
                 messages:consultation_messages(id, body, sender_role, created_at),
                 attachments:consultation_attachments(id, message_id, file_name, path),
                 schedule:schedules(date, start_time, end_time)`)
        .eq("professor_id", ctx.uid)
        .order("created_at", { ascending: false }),
    ]);

    const tickets = must(res).map((r) => ({
      id: r.id,
      code: code(r.id),
      student: { name: fullName(r.student), username: usernameOf(r.student.email), avatar_url: r.student.avatar_url },
      category: r.category,
      status: r.status,
      created_at: stamp(r.created_at),
      schedule: scheduleOf(r),
      messages: buildThread(r, "professor"),
    }));

    return { user: headerUser(me), tickets };
  }

  async function profSetStatus(ticketId, status) {
    try {
      const ctx = await getContext("professor");
      if (!ctx) return false;

      const { error } = await client.rpc("professor_set_status", { p_ticket: ticketId, p_status: status });
      if (error) throw error;
      return true;
    } catch (error) {
      console.error("profSetStatus failed", error);
      return false;
    }
  }

  async function profSchedules() {
    const ctx = await getContext("professor");
    if (!ctx) return null;

    const [me, sch] = await Promise.all([
      ownRow("professor", ctx.uid),
      client.from("schedules")
        .select(`id, date, start_time, end_time,
                 student:students(first_name, last_name, middle_initial, suffix),
                 consultation:consultations(id, section)`)
        .eq("professor_id", ctx.uid),
    ]);

    return {
      user: headerUser(me),
      schedules: must(sch).map((s) => ({
        id: s.id,
        student: { name: fullName(s.student) },
        section: s.consultation.section,
        ticket_code: code(s.consultation.id),
        date: s.date,
        start: hhmm(s.start_time),
        end: hhmm(s.end_time),
      })),
    };
  }

  async function getProfile(role) {
    const r = normRole(role);
    const ctx = await getContext(r);
    if (!ctx) return null;

    const row = await ownRow(r, ctx.uid);
    const common = {
      last_name: row.last_name ?? "",
      first_name: row.first_name ?? "",
      middle_initial: row.middle_initial ?? "",
      suffix: row.suffix ?? "",
      email: row.email ?? "",
    };

    const profile =
      r === "professor"
        ? {
            ...common,
            department: row.department ?? "",
            available: { days: row.available_days || [], start: hhmm(row.available_start), end: hhmm(row.available_end) },
          }
        : {
            ...common,
            phone: row.phone_number ?? "",
            student_number: row.student_number ?? "",
            year_level: row.year_level ?? "",
            program: row.program ?? "",
          };

    return { user: headerUser(row), profile };
  }

  async function saveProfile(role, patch) {
    try {
      const r = normRole(role);
      const ctx = await getContext(r);
      if (!ctx) return false;

      const row = { ...patch };
      if ("phone" in row) {
        row.phone_number = row.phone;
        delete row.phone;
      }
      if (row.available) {
        row.available_days = row.available.days;
        row.available_start = row.available.start;
        row.available_end = row.available.end;
        delete row.available;
      }

      if (row.email && row.email !== ctx.email) {
        const { error } = await client.auth.updateUser({ email: row.email });
        if (error) throw error;
      }

      must(await client.from(tableOf(r)).update(row).eq("id", ctx.uid));
      return true;
    } catch (error) {
      console.error("saveProfile failed", error);
      return false;
    }
  }

  async function uploadPhoto(role, file) {
    try {
      const r = normRole(role);
      const ctx = await getContext(r);
      if (!ctx) return null;

      const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
      const path = `${ctx.uid}/avatar-${Date.now()}.${ext}`;

      const up = await client.storage.from("avatars").upload(path, file, { contentType: file.type });
      if (up.error) throw up.error;

      const url = client.storage.from("avatars").getPublicUrl(path).data.publicUrl;
      must(await client.from(tableOf(r)).update({ avatar_url: url }).eq("id", ctx.uid));
      return url;
    } catch (error) {
      console.error("uploadPhoto failed", error);
      return null;
    }
  }

  async function listNotifications(limit = 20) {
    const ctx = await getContext();
    if (!ctx) return [];
    return must(
      await client.from("notifications")
        .select("id, message, link, read_at, created_at")
        .eq("user_id", ctx.uid)
        .order("created_at", { ascending: false })
        .limit(limit),
    );
  }

  async function unreadCount() {
    const ctx = await getContext();
    if (!ctx) return 0;
    const { count, error } = await client.from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", ctx.uid)
      .is("read_at", null);
    if (error) throw error;
    return count || 0;
  }

  async function markRead(id) {
    must(await client.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", id));
  }

  async function markAllRead() {
    const ctx = await getContext();
    if (!ctx) return;
    must(
      await client.from("notifications")
        .update({ read_at: new Date().toISOString() })
        .eq("user_id", ctx.uid)
        .is("read_at", null),
    );
  }

  async function watchNotifications(onNew) {
    const ctx = await getContext();
    if (!ctx) return () => {};
    const channel = client
      .channel(`notifications:${ctx.uid}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${ctx.uid}` },
        (payload) => onNew(payload.new),
      )
      .subscribe();
    return () => client.removeChannel(channel);
  }

  async function watchThreads(handlers) {
    const ctx = await getContext();
    if (!ctx) return () => {};
    const channel = client
      .channel(`threads:${ctx.uid}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "consultation_messages" },
        (p) => handlers.onMessage && handlers.onMessage(p.new))
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "consultation_attachments" },
        (p) => handlers.onAttachment && handlers.onAttachment(p.new))
      .on("postgres_changes", { event: "*", schema: "public", table: "consultations" },
        (p) => handlers.onTicket && handlers.onTicket(p.new))
      .subscribe();
    return () => client.removeChannel(channel);
  }

  window.db = {
    client, HOME, stamp,
    sendMessage, attachmentUrl, watchThreads,
    signIn, signUp, signOut,
    listNotifications, unreadCount, markRead, markAllRead, watchNotifications,
    studentDashboard, studentSchedules, studentTickets, listProfessors, submitTicket,
    profDashboard, profTickets, profSetStatus, profSchedules,
    getProfile, saveProfile, uploadPhoto,
  };
})();
