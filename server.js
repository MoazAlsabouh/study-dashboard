require("dotenv").config();
const express = require("express");
const path = require("path");
const crypto = require("crypto");
const { Client } = require("@notionhq/client");

const app = express();
const port = process.env.PORT || 3000;
const SESSION_COOKIE = "study_session";
const AUTH_EMAIL = (process.env.AUTH_EMAIL || "").trim();
const AUTH_PASSWORD_HASH = (process.env.AUTH_PASSWORD_HASH || "").trim();
const SESSION_SECRET = process.env.SESSION_SECRET || "";

if (!AUTH_EMAIL || !AUTH_PASSWORD_HASH || !SESSION_SECRET) {
  console.error("Missing required authentication environment variables: AUTH_EMAIL, AUTH_PASSWORD_HASH, SESSION_SECRET");
  process.exit(1);
}
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

if (!process.env.NOTION_TOKEN) {
  console.warn("NOTION_TOKEN is missing. Copy .env.example to .env and add your integration token.");
}

const notion = new Client({ auth: process.env.NOTION_TOKEN });
const DATA_SOURCE_ID = process.env.NOTION_DATA_SOURCE_ID;
const CHANNELS_DATA_SOURCE_ID = process.env.NOTION_CHANNELS_DATA_SOURCE_ID;
const CHANNELS_DATABASE_ID = process.env.NOTION_CHANNELS_DATABASE_ID;
const WEEKLY_DATA_SOURCE_ID = process.env.NOTION_WEEKLY_DATA_SOURCE_ID;
const EXAMS_DATA_SOURCE_ID = process.env.NOTION_EXAMS_DATA_SOURCE_ID;
const WEEKLY_ACTIVITY_DATA_SOURCE_ID = process.env.NOTION_WEEKLY_ACTIVITY_DATA_SOURCE_ID || "eb7fb5f2-79b7-450d-b207-d2bb9e202733";

async function getChannelsDataSourceId() {
  // إذا تم تحديد Data Source ID مباشرة، استخدمه.
  if (CHANNELS_DATA_SOURCE_ID) {
    try {
      await notion.dataSources.retrieve({
        data_source_id: CHANNELS_DATA_SOURCE_ID
      });

      return CHANNELS_DATA_SOURCE_ID;
    } catch (error) {
      // قد تكون القيمة Database ID بدل Data Source ID.
      console.warn(
        "NOTION_CHANNELS_DATA_SOURCE_ID ليس Data Source ID صالحًا، سيتم محاولة اكتشافه من قاعدة البيانات."
      );
    }
  }

  // إذا تم تحديد Database ID، استخرج منه الـ Data Source.
  const databaseId =
    CHANNELS_DATABASE_ID || CHANNELS_DATA_SOURCE_ID;

  if (!databaseId) {
    throw new Error(
      "لم يتم إعداد NOTION_CHANNELS_DATA_SOURCE_ID أو NOTION_CHANNELS_DATABASE_ID."
    );
  }

  const database = await notion.databases.retrieve({
    database_id: databaseId
  });

  const dataSources = database.data_sources || [];

  if (!dataSources.length) {
    throw new Error(
      "لم يتم العثور على Data Source داخل قاعدة بيانات القنوات."
    );
  }

  // نبحث أولًا عن Data Source باسم القنوات وقوائم التشغيل.
  const preferred = dataSources.find(
    x => x.name === "القنوات وقوائم التشغيل"
  );

  return (preferred || dataSources[0]).id;
}

app.use(express.json());

function sign(value) {
  return crypto.createHmac("sha256", SESSION_SECRET).update(value).digest("base64url");
}

function createSession() {
  const payload = Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

function isAuthenticated(req) {
  const raw = req.headers.cookie || "";
  const match = raw.split(";").map(x => x.trim()).find(x => x.startsWith(`${SESSION_COOKIE}=`));
  if (!match) return false;
  const token = decodeURIComponent(match.slice(SESSION_COOKIE.length + 1));
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return false;
  const expected = sign(payload);
  if (signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return false;
  try {
    return JSON.parse(Buffer.from(payload, "base64url").toString()).exp > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

function requireAuth(req, res, next) {
  if (isAuthenticated(req)) return next();
  if (req.path.startsWith("/api/")) return res.status(401).json({ error: "غير مصرح. سجّل الدخول أولاً." });
  return res.redirect("/login.html");
}

app.get("/login.html", (_req, res) => res.sendFile(path.join(__dirname, "public", "login.html")));
app.get("/login.css", (_req, res) => res.sendFile(path.join(__dirname, "public", "login.css")));
app.get("/login.js", (_req, res) => res.sendFile(path.join(__dirname, "public", "login.js")));
app.post("/api/login", (req, res) => {
  const { email, password } = req.body || {};
  const passwordOk = password && verifyPassword(String(password), AUTH_PASSWORD_HASH);
  if (String(email || "").trim().toLowerCase() !== AUTH_EMAIL.toLowerCase() || !passwordOk) {
    return res.status(401).json({ error: "البريد الإلكتروني أو كلمة السر غير صحيحة." });
  }
  res.setHeader("Set-Cookie", `${SESSION_COOKIE}=${encodeURIComponent(createSession())}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL_SECONDS}`);
  res.json({ ok: true });
});
app.post("/api/logout", requireAuth, (_req, res) => {
  res.setHeader("Set-Cookie", `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
  res.json({ ok: true });
});

function verifyPassword(password, encoded) {
  try {
    const [scheme, n, r, p, saltB64, keyB64] = encoded.split("$");
    if (scheme !== "scrypt") return false;
    const salt = Buffer.from(saltB64, "base64url");
    const expected = Buffer.from(keyB64, "base64url");
    const actual = crypto.scryptSync(password, salt, expected.length, { N: Number(n), r: Number(r), p: Number(p) });
    return crypto.timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

app.get("/", (req, res) => res.redirect(isAuthenticated(req) ? "/index.html" : "/login.html"));
app.use(requireAuth);
app.use(express.static(path.join(__dirname, "public"), { index: false }));

function valueOf(prop) {
  if (!prop) return null;
  if (prop.type === "title") return prop.title?.map(x => x.plain_text).join("") || "";
  if (prop.type === "rich_text") return prop.rich_text?.map(x => x.plain_text).join("") || "";
  if (prop.type === "select") return prop.select?.name || "";
  if (prop.type === "status") return prop.status?.name || "";
  if (prop.type === "checkbox") return !!prop.checkbox;
  if (prop.type === "number") return prop.number;
  if (prop.type === "url") return prop.url || "";
  if (prop.type === "formula") return prop.formula?.number ?? prop.formula?.string ?? prop.formula?.boolean ?? null;
  return null;
}

function toLesson(page) {
  const p = page.properties || {};
  const titleProp = Object.values(p).find(x => x.type === "title");
  return {
    id: page.id,
    lesson: valueOf(titleProp),
    subject: valueOf(p["المادة"]),
    unit: valueOf(p["الوحدة"]) || "دروس بدون وحدة",
    page: valueOf(p["الصفحة"]),
    first: valueOf(p["الدراسة الأولى"]) === true,
    review1: valueOf(p["المراجعة الأولى"]) === true,
    review2: valueOf(p["المراجعة الثانية"]) === true,
    retention: valueOf(p["مراجعة التثبيت"]) === true,
    final: valueOf(p["المراجعة الامتحانية الأخيرة"]) === true
  };
}

async function getAllLessons() {
  let results = [];
  let cursor;
  do {
    const response = await notion.dataSources.query({ data_source_id: DATA_SOURCE_ID, start_cursor: cursor, page_size: 100 });
    results.push(...response.results);
    cursor = response.has_more ? response.next_cursor : undefined;
  } while (cursor);
  return results.map(toLesson);
}

app.get("/api/lessons", async (_req, res) => {
  try {
    const lessons = await getAllLessons();
    const stages = [["first","الدراسة الأولى"],["review1","المراجعة الأولى"],["review2","المراجعة الثانية"],["retention","مراجعة التثبيت"],["final","المراجعة الامتحانية الأخيرة"]];
    res.json(lessons.map(x => ({ id:x.id, lesson:x.lesson, subject:x.subject, unit:x.unit, stages:stages.map(([key,label]) => ({ property:label, label, checked:x[key] })) })));
  } catch(e) { res.status(500).json({error:e.message}); }
});

app.patch("/api/lessons/:id", async (req,res) => {
  try {
    const allowed=["الدراسة الأولى","المراجعة الأولى","المراجعة الثانية","مراجعة التثبيت","المراجعة الامتحانية الأخيرة"];
    const {property,checked}=req.body||{};
    if(!allowed.includes(property)||typeof checked!=="boolean") return res.status(400).json({error:"بيانات غير صالحة"});
    await notion.pages.update({page_id:req.params.id,properties:{[property]:{checkbox:checked}}});
    res.json({ok:true});
  } catch(e){res.status(500).json({error:e.message});}
});

app.get("/api/channels", async (_req, res) => {
  try {
    const dataSourceId = await getChannelsDataSourceId();
    const rows = await queryAllDataSource(dataSourceId);
    res.json(rows.map(page => {
      const q = page.properties || {};
      return {
        id: page.id,
        subject: valueOf(q["المادة"]),
        name: valueOf(q["اسم القناة"] || Object.values(q).find(x => x.type === "title")),
        channelUrl: valueOf(q["رابط القناة"]),
        playlistName: valueOf(q["اسم قائمة التشغيل"]),
        playlistUrl: valueOf(q["رابط قائمة التشغيل"]),
        notes: valueOf(q["ملاحظات"])
      };
    }));
  } catch (error) {
    console.error("Channels API error:", error);
    res.status(500).json({ error: "تعذر تحميل القنوات وقوائم التشغيل.", details: error.message });
  }
});

app.post("/api/channels", async (req, res) => {
  try {
    const {name, subject, channelUrl, playlistName, playlistUrl, notes} = req.body || {};
    if (!name || !subject) return res.status(400).json({error:"اسم القناة والمادة مطلوبان."});
    const dataSourceId = await getChannelsDataSourceId();
    const page = await notion.pages.create({
      parent: { data_source_id: dataSourceId },
      properties: {
        "اسم القناة": titleProp(name),
        "المادة": { select: { name: String(subject) } },
        "رابط القناة": { url: channelUrl ? String(channelUrl) : null },
        "اسم قائمة التشغيل": textProp(playlistName || ""),
        "رابط قائمة التشغيل": { url: playlistUrl ? String(playlistUrl) : null },
        "ملاحظات": textProp(notes || "")
      }
    });
    const q = page.properties || {};
    res.json({
      id: page.id,
      subject: valueOf(q["المادة"]),
      name: valueOf(q["اسم القناة"] || Object.values(q).find(x => x.type === "title")),
      channelUrl: valueOf(q["رابط القناة"]),
      playlistName: valueOf(q["اسم قائمة التشغيل"]),
      playlistUrl: valueOf(q["رابط قائمة التشغيل"]),
      notes: valueOf(q["ملاحظات"])
    });
  } catch (error) {
    console.error("Channels create error:", error);
    res.status(500).json({error:"تعذر حفظ المصدر في Notion.", details:error.message});
  }
});

async function queryAllDataSource(dataSourceId) {
  if (!dataSourceId) throw new Error("لم يتم إعداد Data Source ID.");
  let results = [];
  let cursor;
  do {
    const response = await notion.dataSources.query({
      data_source_id: dataSourceId,
      start_cursor: cursor,
      page_size: 100
    });
    results.push(...response.results);
    cursor = response.has_more ? response.next_cursor : undefined;
  } while (cursor);
  return results;
}

function textProp(value) {
  return { rich_text: [{ type: "text", text: { content: String(value || "") } }] };
}
function titleProp(value) {
  return { title: [{ type: "text", text: { content: String(value || "") } }] };
}

function toWeekly(page) {
  const p = page.properties || {};
  const date = p["تاريخ الإنجاز"]?.date?.start || "";
  return {
    id: page.id,
    day: valueOf(p["اليوم"]),
    subject: valueOf(p["المادة"]),
    task: valueOf(p["المهمة"] || Object.values(p).find(x => x.type === "title")),
    time: valueOf(p["الوقت"]),
    done: valueOf(p["منجز"]) === true,
    doneDate: date ? date.slice(0, 10) : ""
  };
}

function toWeeklyActivity(page) {
  const p = page.properties || {};
  return {
    id: page.id,
    name: valueOf(p["الأسبوع"] || Object.values(p).find(x => x.type === "title")),
    start: p["بداية الأسبوع"]?.date?.start || "",
    end: p["نهاية الأسبوع"]?.date?.start || "",
    completed: Number(valueOf(p["المكتمل"]) || 0),
    total: Number(valueOf(p["الإجمالي"]) || 0),
    percent: Number(valueOf(p["النسبة"]) || 0),
    level: valueOf(p["المستوى"]) || "لا نشاط"
  };
}

function isoDate(d) {
  return d.toISOString().slice(0, 10);
}

function dateOnly(value) {
  return new Date(`${value}T00:00:00Z`);
}

// The weekly cycle starts every Thursday and ends Wednesday.
// We use Asia/Damascus for the calendar boundary so Vercel's UTC timezone cannot
// accidentally reset the planner a few hours early/late.
function damascusDateParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Damascus",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short"
  }).formatToParts(date);
  const get = type => parts.find(x => x.type === type)?.value;
  return { year: Number(get("year")), month: Number(get("month")), day: Number(get("day")), weekday: get("weekday") };
}

function localCalendarDate(date = new Date()) {
  const p = damascusDateParts(date);
  return new Date(Date.UTC(p.year, p.month - 1, p.day));
}

function currentWeeklyWindow(date = new Date()) {
  const today = localCalendarDate(date);
  const day = today.getUTCDay(); // Sunday=0 ... Thursday=4
  const daysSinceThursday = (day - 4 + 7) % 7;
  const start = new Date(today);
  start.setUTCDate(start.getUTCDate() - daysSinceThursday);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 6);
  return { start: isoDate(start), end: isoDate(end) };
}

function activityLevel(percent) {
  if (percent <= 0) return "لا نشاط";
  if (percent < 25) return "نشاط منخفض";
  if (percent < 50) return "نشاط متوسط";
  if (percent < 75) return "نشاط جيد";
  if (percent < 100) return "نشاط مرتفع";
  return "نشاط كامل";
}

async function getWeeklyRows() {
  return (await queryAllDataSource(WEEKLY_DATA_SOURCE_ID)).map(toWeekly);
}

async function getWeeklyActivityRows() {
  return (await queryAllDataSource(WEEKLY_ACTIVITY_DATA_SOURCE_ID)).map(toWeeklyActivity);
}

async function updateWeeklyActivity(activity, completed, total) {
  const percent = total ? Math.round((completed / total) * 100) : 0;
  await notion.pages.update({
    page_id: activity.id,
    properties: {
      "المكتمل": { number: completed },
      "الإجمالي": { number: total },
      "النسبة": { number: percent },
      "المستوى": { select: { name: activityLevel(percent) } }
    }
  });
  return { ...activity, completed, total, percent, level: activityLevel(percent) };
}

async function syncWeeklyCycle(force = false) {
  const rows = await getWeeklyRows();
  const activities = await getWeeklyActivityRows();
  const window = currentWeeklyWindow();
  const current = activities.find(x => x.start === window.start);

  // The pre-created yearly activity rows are used as the reset marker:
  // total=0 means the new Thursday cycle has not been initialized yet.
  // Before resetting, capture the previous week's final checkbox state.
  if (current && (force || current.total === 0)) {
    const previous = activities
      .filter(x => x.end && x.end < window.start)
      .sort((a, b) => b.start.localeCompare(a.start))[0];

    if (previous && rows.length) {
      const completed = rows.filter(x => x.done).length;
      await updateWeeklyActivity(previous, completed, rows.length);
    }

    if (rows.length) {
      await Promise.all(rows.map(row => notion.pages.update({
        page_id: row.id,
        properties: {
          "منجز": { checkbox: false },
          "تاريخ الإنجاز": { date: null }
        }
      })));
    }

    if (current) {
      await updateWeeklyActivity(current, 0, rows.length);
    }
  }

  const freshRows = await getWeeklyRows();
  const freshActivities = await getWeeklyActivityRows();
  const active = freshActivities.find(x => x.start === window.start) || null;
  return { rows: freshRows, activities: freshActivities, current: active, window };
}

async function refreshCurrentWeeklyActivity() {
  const rows = await getWeeklyRows();
  const activities = await getWeeklyActivityRows();
  const window = currentWeeklyWindow();
  const current = activities.find(x => x.start === window.start);
  if (current) {
    await updateWeeklyActivity(current, rows.filter(x => x.done).length, rows.length);
  }
  return { rows, activities: await getWeeklyActivityRows(), current, window };
}

app.get("/api/weekly", async (_req, res) => {
  try {
    const result = await syncWeeklyCycle();
    res.json(result.rows);
  } catch(e) { res.status(500).json({error:e.message}); }
});

app.get("/api/weekly/activity", async (_req, res) => {
  try {
    const result = await syncWeeklyCycle();
    res.json({ weeks: result.activities, current: result.current, window: result.window });
  } catch(e) { res.status(500).json({error:e.message}); }
});

app.post("/api/weekly", async (req, res) => {
  try {
    const {day, subject, task, time} = req.body || {};
    if (!day || !subject || !task) return res.status(400).json({error:"اليوم والمادة والمهمة مطلوبة."});
    const page = await notion.pages.create({
      parent: { data_source_id: WEEKLY_DATA_SOURCE_ID },
      properties: {
        "المهمة": titleProp(task),
        "اليوم": { select: { name: String(day) } },
        "المادة": textProp(subject),
        "الوقت": textProp(time || ""),
        "منجز": { checkbox: false }
      }
    });
    await refreshCurrentWeeklyActivity();
    res.json(toWeekly(page));
  } catch(e) { res.status(500).json({error:e.message}); }
});

app.patch("/api/weekly/:id", async (req, res) => {
  try {
    const {done} = req.body || {};
    if (typeof done !== "boolean") return res.status(400).json({error:"حالة الإنجاز غير صالحة."});
    await notion.pages.update({
      page_id: req.params.id,
      properties: {
        "منجز": { checkbox: done },
        "تاريخ الإنجاز": done ? { date: { start: isoDate(localCalendarDate()) } } : { date: null }
      }
    });
    const activity = await refreshCurrentWeeklyActivity();
    res.json({ok:true, activity:activity.current});
  } catch(e) { res.status(500).json({error:e.message}); }
});

app.delete("/api/weekly/:id", async (req, res) => {
  try {
    await notion.pages.update({page_id:req.params.id, archived:true});
    await refreshCurrentWeeklyActivity();
    res.json({ok:true});
  } catch(e) { res.status(500).json({error:e.message}); }
});

app.get("/api/exams", async (_req, res) => {
  try { res.json((await queryAllDataSource(EXAMS_DATA_SOURCE_ID)).map(toExam)); }
  catch(e) { res.status(500).json({error:e.message}); }
});

app.post("/api/exams", async (req, res) => {
  try {
    const {subject, name, at} = req.body || {};
    if (!subject || !at) return res.status(400).json({error:"المادة وموعد الامتحان مطلوبان."});
    const page = await notion.pages.create({
      parent: { data_source_id: EXAMS_DATA_SOURCE_ID },
      properties: {
        "الامتحان": titleProp(name || subject),
        "المادة": textProp(subject),
        "الموعد": { date: { start: new Date(at).toISOString() } }
      }
    });
    res.json(toExam(page));
  } catch(e) { res.status(500).json({error:e.message}); }
});

app.delete("/api/exams/:id", async (req, res) => {
  try { await notion.pages.update({page_id:req.params.id, archived:true}); res.json({ok:true}); }
  catch(e) { res.status(500).json({error:e.message}); }
});

app.post("/api/local-migrate", async (req, res) => {
  try {
    const weekly = Array.isArray(req.body?.weekly) ? req.body.weekly : [];
    const exams = Array.isArray(req.body?.exams) ? req.body.exams : [];
    const migrated = {weekly:0, exams:0};
    for (const x of weekly) {
      const page = await notion.pages.create({
        parent:{data_source_id:WEEKLY_DATA_SOURCE_ID},
        properties:{
          "المهمة":titleProp(x.task || ""),
          "اليوم":{select:{name:String(x.day || "الأحد")}},
          "المادة":textProp(x.subject || ""),
          "الوقت":textProp(x.time || ""),
          "منجز":{checkbox:Boolean(x.doneDate)},
          "تاريخ الإنجاز": x.doneDate ? {date:{start:x.doneDate}} : {date:null}
        }
      });
      migrated.weekly++;
    }
    for (const x of exams) {
      if (!x.at) continue;
      await notion.pages.create({
        parent:{data_source_id:EXAMS_DATA_SOURCE_ID},
        properties:{
          "الامتحان":titleProp(x.name || x.subject || "امتحان"),
          "المادة":textProp(x.subject || ""),
          "الموعد":{date:{start:new Date(x.at).toISOString()}}
        }
      });
      migrated.exams++;
    }
    res.json({ok:true,migrated});
  } catch(e) { res.status(500).json({error:e.message}); }
});

app.get("/api/progress", async (_req, res) => {
  try {
    if (!process.env.NOTION_TOKEN || !DATA_SOURCE_ID) return res.status(500).json({error:"Notion is not configured.",hint:"Create .env from .env.example and add NOTION_TOKEN."});
    const lessons = await getAllLessons();
    const subjects = [...new Set(lessons.map(x => x.subject).filter(Boolean))].sort();
    const stages = [["first","الدراسة الأولى"],["review1","المراجعة الأولى"],["review2","المراجعة الثانية"],["retention","مراجعة التثبيت"],["final","المراجعة الامتحانية الأخيرة"]];
    const stageProgress = Object.fromEntries(stages.map(([key, label]) => { const done=lessons.filter(x=>x[key]).length; return [key,{label,done,total:lessons.length,percent:lessons.length?Math.round(done/lessons.length*100):0}]; }));
    const subjectProgress = subjects.map(subject => { const rows=lessons.filter(x=>x.subject===subject); const stage=Object.fromEntries(stages.map(([key,label])=>{const done=rows.filter(x=>x[key]).length;return [key,{label,done,total:rows.length,percent:rows.length?Math.round(done/rows.length*100):0}];})); const completedStages=rows.reduce((sum,x)=>sum+stages.filter(([key])=>x[key]).length,0); const totalChecks=rows.length*stages.length; return {subject,lessons:rows.length,percent:totalChecks?Math.round(completedStages/totalChecks*100):0,stages:stage}; });
    const totalChecks=lessons.length*stages.length; const completedChecks=lessons.reduce((sum,x)=>sum+stages.filter(([key])=>x[key]).length,0);
    res.json({academicYear:"2026/2027",updatedAt:new Date().toISOString(),totalLessons:lessons.length,overallPercent:totalChecks?Math.round(completedChecks/totalChecks*100):0,stages:stageProgress,subjects:subjectProgress});
  } catch (error) { console.error(error); res.status(500).json({ error:"Failed to read Notion.", details:error.message }); }
});

if (require.main === module) app.listen(port, () => console.log(`Study dashboard: http://localhost:${port}`));
module.exports = app;
