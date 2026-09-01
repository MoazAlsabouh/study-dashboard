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

app.get("/api/channels", async (_req,res) => {
  try {
    const r=await notion.dataSources.query({data_source_id:CHANNELS_DATA_SOURCE_ID,page_size:100});
    res.json(r.results.map(page=>{const q=page.properties||{};return {id:page.id,name:valueOf(q["اسم القناة"]),subject:valueOf(q["المادة"]),channelUrl:valueOf(q["رابط القناة"]),playlistName:valueOf(q["اسم قائمة التشغيل"]),playlistUrl:valueOf(q["رابط قائمة التشغيل"]),notes:valueOf(q["ملاحظات"])};}));
  } catch(e){res.status(500).json({error:e.message});}
});

app.post("/api/channels", async (req,res) => {
  try {
    const {name,subject,channelUrl,playlistName,playlistUrl,notes}=req.body||{};
    if(!name||!subject) return res.status(400).json({error:"اسم القناة والمادة مطلوبان"});
    const text=v=>v?[{text:{content:v}}]:[];
    const props={"اسم القناة":{title:text(name)},"المادة":{select:{name:subject}},"رابط القناة":{url:channelUrl||null},"اسم قائمة التشغيل":{rich_text:text(playlistName)},"رابط قائمة التشغيل":{url:playlistUrl||null},"ملاحظات":{rich_text:text(notes)}};
    const page=await notion.pages.create({parent:{data_source_id:CHANNELS_DATA_SOURCE_ID},properties:props});
    res.json({ok:true,id:page.id});
  }catch(e){res.status(500).json({error:e.message});}
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
