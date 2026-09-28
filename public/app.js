const state = {
  data: null,
  lessons: [],
  units: [],
  unitIndex: 0,
  weekly: [],
  exams: [],
  examTimer: null,
  weeklyTimer: null,
  weeklyActivity: null
};

const page = document.body.dataset.page;
const $ = (id) => document.getElementById(id);
const esc = (v = "") => String(v).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[c]));
const attr = esc;

const subjectsFallback = ["الرياضيات","الفيزياء","الكيمياء","الأحياء","اللغة العربية","اللغة الإنجليزية","التربية الدينية"];

function bar(percent, cls = "") {
  const p = Math.max(0, Math.min(100, Number(percent) || 0));
  return `<div class="progress ${cls}"><span style="width:${p}%"></span></div>`;
}

function shell({title, subtitle = "", active = ""}, content) {
  document.title = `${title} | خريطة الدراسة 2026/2027`;
  document.getElementById("app").innerHTML = `
    <main class="container">
      <header class="topbar">
        <a class="brand" href="index.html">
          <span class="brand-mark">🎓</span>
          <span><b>خريطة الدراسة الذكية</b><small>2026 / 2027</small></span>
        </a>
        <nav class="nav">
          <a class="${active === "dashboard" ? "active" : ""}" href="index.html">الرئيسية</a>
          <a class="${active === "subjects" ? "active" : ""}" href="subjects.html">المواد</a>
          <a class="${active === "weekly" ? "active" : ""}" href="weekly.html">الجدول</a>
          <a class="${active === "exams" ? "active" : ""}" href="exams.html">الامتحانات</a>
          <a class="${active === "channels" ? "active" : ""}" href="channels.html">القنوات</a>
        </nav>
        <div class="top-actions"><button id="refresh" class="icon-btn" title="تحديث">↻</button><button id="logout" class="secondary">خروج</button></div>
      </header>
      <section class="page-heading">
        <div><span class="eyebrow">Study Dashboard</span><h1>${title}</h1>${subtitle ? `<p>${subtitle}</p>` : ""}</div>
      </section>
      <div id="error" class="error hidden"></div>
      ${content}
      <footer>مصدر البيانات: Notion • آخر تحديث عند فتح أو تحديث الصفحة</footer>
    </main>`;
  $("logout").onclick = async () => { await fetch("/api/logout", {method:"POST"}); location.href = "/login.html"; };
  $("refresh").onclick = () => location.reload();
}

async function api(url, options) {
  const r = await fetch(url, {cache: "no-store", ...options});
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.details || data.error || data.hint || "حدث خطأ غير متوقع");
  return data;
}

function showError(error) {
  const box = $("error");
  if (!box) return;
  box.textContent = `⚠️ ${error.message || error}`;
  box.classList.remove("hidden");
}

function hideError() { $("error")?.classList.add("hidden"); }

async function loadProgress() {
  state.data = await api("/api/progress");
  return state.data;
}

function countdown(at) {
  const diff = new Date(at).getTime() - Date.now();
  if (!Number.isFinite(diff) || diff <= 0) return {expired:true, text:"انتهى الموعد"};
  const total = Math.floor(diff / 1000);
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return {expired:false, text:`${days} يوم • ${hours} س • ${minutes} د • ${seconds} ث`, days, hours, minutes, seconds};
}

function formatDate(value) {
  if (!value) return "—";
  return new Date(value).toLocaleString("ar-SY", {dateStyle:"medium", timeStyle:"short"});
}

function renderDashboard(d, exams) {
  const upcoming = exams
    .filter(x => x.at && new Date(x.at).getTime() > Date.now())
    .sort((a,b) => new Date(a.at) - new Date(b.at))[0];

  shell({title:"لوحة التحكم", subtitle:"ملخص سريع للتقدم العام وموعد الامتحان القادم.", active:"dashboard"}, `
    <section class="hero-grid">
      <article class="card overall-card">
        <div class="card-kicker">التقدم العام</div>
        <div class="overall-value">${d.overallPercent}%</div>
        ${bar(d.overallPercent)}
        <div class="stats-row">
          <div><b>${d.totalLessons}</b><span>درسًا</span></div>
          <div><b>${d.subjects.length}</b><span>مواد</span></div>
          <div><b>${Object.values(d.stages).reduce((s,x)=>s+x.done,0)}</b><span>مراحل منجزة</span></div>
        </div>
      </article>
      <article class="card exam-hero">
        <div class="card-kicker">⏳ الامتحان القادم</div>
        ${upcoming ? `
          <h2>${esc(upcoming.name || upcoming.subject)}</h2>
          <p class="muted">${esc(upcoming.subject)} • ${formatDate(upcoming.at)}</p>
          <div id="mainCountdown" class="countdown-big">${countdown(upcoming.at).text}</div>
          <a class="button" href="exams.html">عرض كل الامتحانات</a>
        ` : `<div class="empty compact">لا يوجد امتحان قادم مسجل حاليًا.<br><a href="exams.html">أضف أول امتحان</a></div>`}
      </article>
    </section>

    <section class="section-block">
      <div class="section-title"><div><h2>📊 نظرة سريعة على المواد</h2><p>اضغط على أي مادة لفتح صفحتها وتفاصيل الوحدات والدروس.</p></div><a class="button secondary" href="subjects.html">كل المواد</a></div>
      <div class="subject-grid">${d.subjects.map(s => `
        <a class="subject-card" href="subject.html?name=${encodeURIComponent(s.subject)}">
          <div class="subject-card-head"><span>${esc(s.subject)}</span><strong>${s.percent}%</strong></div>
          ${bar(s.percent, "mini-progress")}
          <small>${s.lessons} درس</small>
        </a>`).join("")}</div>
    </section>

    <section class="section-block">
      <div class="section-title"><div><h2>🧭 مراحل الدراسة</h2><p>تقدم كل مرحلة على مستوى جميع الدروس.</p></div></div>
      <div class="stage-grid">${Object.values(d.stages).map(s => `
        <article class="stage-card"><strong>${s.percent}%</strong><b>${esc(s.label)}</b><span>${s.done} من ${s.total} درس</span>${bar(s.percent)}</article>`).join("")}</div>
    </section>`);

  if (upcoming) {
    const update = () => { const el = $("mainCountdown"); if (el) el.textContent = countdown(upcoming.at).text; };
    update();
    state.examTimer = setInterval(update, 1000);
  }
}

async function dashboardPage() {
  try {
    const [d, exams] = await Promise.all([loadProgress(), api("/api/exams")]);
    renderDashboard(d, exams);
  } catch (e) {
    shell({title:"لوحة التحكم", subtitle:"ملخص الدراسة لعام 2026/2027.", active:"dashboard"}, `<div class="card empty">تعذر تحميل البيانات.</div>`);
    showError(e);
  }
}

async function subjectsPage() {
  shell({title:"المواد", subtitle:"كل مادة لها صفحة مستقلة حتى تبقى الدراسة مرتبة وواضحة.", active:"subjects"}, `<div id="subjectPageGrid" class="subject-grid large"></div>`);
  try {
    const d = await loadProgress();
    $("subjectPageGrid").innerHTML = d.subjects.map(s => `
      <a class="subject-card detailed" href="subject.html?name=${encodeURIComponent(s.subject)}">
        <div class="subject-card-head"><span>${esc(s.subject)}</span><strong>${s.percent}%</strong></div>
        ${bar(s.percent)}
        <div class="subject-meta"><span>${s.lessons} درس</span><span>فتح المادة ←</span></div>
        <div class="tiny-stages">${Object.values(s.stages).map(x=>`<span>${esc(x.label)}: <b>${x.percent}%</b></span>`).join("")}</div>
      </a>`).join("");
  } catch (e) { showError(e); }
}

function subjectFromUrl() { return new URLSearchParams(location.search).get("name") || ""; }

function renderSubjectPage(d, subjectName) {
  const subject = d.subjects.find(x => x.subject === subjectName);
  if (!subject) {
    shell({title:"المادة غير موجودة", subtitle:"اختر مادة من قائمة المواد.", active:"subjects"}, `<div class="card empty"><a class="button" href="subjects.html">العودة إلى المواد</a></div>`);
    return;
  }
  shell({title:subject.subject, subtitle:`${subject.lessons} درس • إنجاز المادة ${subject.percent}%`, active:"subjects"}, `
    <section class="subject-summary card">
      <div><span class="card-kicker">تقدم المادة</span><strong class="summary-percent">${subject.percent}%</strong></div>
      <div class="summary-progress">${bar(subject.percent)}<small>يمكنك فتح الوحدات والتنقل بينها دون ازدحام الصفحة.</small></div>
    </section>
    <section class="stage-grid compact-stages">${Object.values(subject.stages).map(s=>`<article class="stage-card"><strong>${s.percent}%</strong><b>${esc(s.label)}</b><span>${s.done} من ${s.total}</span>${bar(s.percent)}</article>`).join("")}</section>
    <section class="card lessons-card">
      <div class="section-title"><div><h2>📖 وحدات المادة</h2><p>نعرض وحدة واحدة في كل مرة لتكون المتابعة أسلس.</p></div><a class="button secondary" href="subjects.html">← كل المواد</a></div>
      <div class="unit-toolbar"><button id="prevUnit" class="secondary">→ السابقة</button><div class="unit-current"><span id="unitCounter">—</span><strong id="unitTitle">—</strong></div><button id="nextUnit" class="secondary">التالية ←</button></div>
      <div id="unitProgress"></div>
      <div id="lessons" class="lessons"></div>
    </section>
    <section class="card"><div class="section-title"><div><h2>🎥 مصادر هذه المادة</h2><p>القنوات وقوائم التشغيل المرتبطة بالمادة.</p></div><a class="button secondary" href="channels.html">إدارة المصادر</a></div><div id="subjectChannels" class="channels"></div></section>`);
}

function getUnitsForSubject(subjectName) {
  const rows = state.lessons.filter(x => x.subject === subjectName);
  const units = [...new Set(rows.map(x => x.unit || "دروس بدون وحدة"))];
  return {rows, units};
}

function renderLessons(subjectName) {
  const {rows, units} = getUnitsForSubject(subjectName);
  if (!units.length) {
    $("unitCounter").textContent = "لا توجد وحدات";
    $("unitTitle").textContent = "—";
    $("unitProgress").innerHTML = "";
    $("lessons").innerHTML = `<div class="empty">لا توجد دروس مسجلة لهذه المادة.</div>`;
    $("prevUnit").disabled = $("nextUnit").disabled = true;
    return;
  }
  state.unitIndex = Math.max(0, Math.min(state.unitIndex, units.length - 1));
  const unit = units[state.unitIndex];
  const unitRows = rows.filter(x => (x.unit || "دروس بدون وحدة") === unit);
  const checks = unitRows.reduce((sum,x)=>sum+x.stages.filter(s=>s.checked).length,0);
  const total = unitRows.length * 5;
  const percent = total ? Math.round(checks / total * 100) : 0;
  $("unitCounter").textContent = `الوحدة ${state.unitIndex + 1} من ${units.length}`;
  $("unitTitle").textContent = unit;
  $("unitProgress").innerHTML = `<div class="unit-progress-head"><span>إنجاز الوحدة</span><strong>${percent}%</strong></div>${bar(percent)}`;
  $("lessons").innerHTML = unitRows.map(x=>`<article class="lesson-row"><div class="lesson-info"><strong>${esc(x.lesson)}</strong><p>${x.page ? `صفحة ${esc(x.page)}` : ""}</p></div><div class="checks">${x.stages.map(s=>`<label><input type="checkbox" ${s.checked ? "checked" : ""} data-id="${attr(x.id)}" data-prop="${attr(s.property)}"> ${esc(s.label)}</label>`).join("")}</div></article>`).join("");
  $("prevUnit").disabled = state.unitIndex === 0;
  $("nextUnit").disabled = state.unitIndex >= units.length - 1;
  document.querySelectorAll("#lessons input[data-id]").forEach(cb => cb.onchange = async e => {
    const el = e.target;
    try {
      await api(`/api/lessons/${encodeURIComponent(el.dataset.id)}`, {method:"PATCH", headers:{"Content-Type":"application/json"}, body:JSON.stringify({property:el.dataset.prop, checked:el.checked})});
      const old = state.unitIndex;
      await loadProgress();
      await loadLessonsForSubject(subjectName, false);
      state.unitIndex = old;
      renderLessons(subjectName);
    } catch (err) { el.checked = !el.checked; showError(err); }
  });
}

async function loadLessonsForSubject(subjectName, reset = true) {
  state.lessons = await api("/api/lessons");
  if (reset) state.unitIndex = 0;
  renderLessons(subjectName);
}

async function renderSubjectChannels(subjectName) {
  const rows = (await api("/api/channels")).filter(x => x.subject === subjectName);
  $("subjectChannels").innerHTML = rows.length ? rows.map(channelCard).join("") : `<div class="empty">لا توجد مصادر مسجلة لهذه المادة حتى الآن.</div>`;
}

function channelCard(x) {
  return `<article class="channel"><span class="tag">${esc(x.subject || "")}</span><h3>${esc(x.name || "قناة بدون اسم")}</h3>${x.channelUrl ? `<a href="${attr(x.channelUrl)}" target="_blank" rel="noopener noreferrer">🎥 فتح القناة</a>` : ""}${x.playlistName ? (x.playlistUrl ? `<a href="${attr(x.playlistUrl)}" target="_blank" rel="noopener noreferrer">▶ ${esc(x.playlistName)}</a>` : `<span class="source-note">▶ ${esc(x.playlistName)}</span>`) : ""}${x.notes ? `<p>${esc(x.notes)}</p>` : ""}</article>`;
}

async function subjectPage() {
  const subjectName = subjectFromUrl();
  try {
    const d = await loadProgress();
    renderSubjectPage(d, subjectName);
    if (!d.subjects.some(x => x.subject === subjectName)) return;
    await loadLessonsForSubject(subjectName);
    await renderSubjectChannels(subjectName);
    $("prevUnit").onclick = () => { if (state.unitIndex > 0) { state.unitIndex--; renderLessons(subjectName); } };
    $("nextUnit").onclick = () => { const {units} = getUnitsForSubject(subjectName); if (state.unitIndex < units.length - 1) { state.unitIndex++; renderLessons(subjectName); } };
  } catch (e) {
    if (!document.getElementById("app").innerHTML) shell({title:"المادة", active:"subjects"}, "");
    showError(e);
  }
}

function weeklyForm() {
  return `<form id="weeklyForm" class="form-grid"><select name="day" required>${["الأحد","الاثنين","الثلاثاء","الأربعاء","الخميس","الجمعة","السبت"].map(x=>`<option>${x}</option>`).join("")}</select><input name="subject" placeholder="المادة" required><input name="task" placeholder="المهمة / الدرس" required><input name="time" type="time" aria-label="الوقت"><button class="button" type="submit">＋ إضافة</button></form>`;
}

function activityLevelClass(percent) {
  const p = Number(percent) || 0;
  if (p <= 0) return "activity-0";
  if (p < 25) return "activity-1";
  if (p < 50) return "activity-2";
  if (p < 75) return "activity-3";
  if (p < 100) return "activity-4";
  return "activity-5";
}

function weekLabel(x) {
  if (!x?.start) return "أسبوع";
  const start = new Date(`${x.start}T00:00:00Z`);
  const end = new Date(`${x.end}T00:00:00Z`);
  const fmt = d => d.toLocaleDateString("ar-SY", {day:"numeric", month:"short", timeZone:"UTC"});
  return `${fmt(start)} — ${fmt(end)}`;
}

function renderWeeklyActivity(payload) {
  const weeks = payload?.weeks || [];
  const current = payload?.current;
  state.weeklyActivity = payload;

  const totalCompleted = weeks.reduce((sum, x) => sum + Number(x.completed || 0), 0);
  const activeWeeks = weeks.filter(x => Number(x.completed || 0) > 0).length;
  const average = weeks.length ? Math.round(weeks.reduce((sum, x) => sum + Number(x.percent || 0), 0) / weeks.length) : 0;

  $("weeklyActivity").innerHTML = `
    <section class="weekly-activity card">
      <div class="section-title activity-heading">
        <div>
          <h2>📈 نشاط السنة</h2>
          <p>كل مربع يمثل أسبوعًا واحدًا، ويحتفظ بنشاطه حتى نهاية 2026/2027.</p>
        </div>
        ${current ? `<span class="current-week-badge">الأسبوع الحالي: ${esc(weekLabel(current))}</span>` : ""}
      </div>
      <div class="activity-summary">
        <div><strong>${activeWeeks}</strong><span>أسابيع نشطة</span></div>
        <div><strong>${totalCompleted}</strong><span>مهام منجزة</span></div>
        <div><strong>${average}%</strong><span>متوسط النشاط</span></div>
        ${current ? `<div><strong>${current.completed}/${current.total}</strong><span>هذا الأسبوع</span></div>` : ""}
      </div>
      <div class="activity-scroll">
        <div class="activity-calendar">
          <div class="activity-months-wrap">
            <div class="activity-weekday-spacer"></div>
            <div class="activity-months">${weeks.map((x,i) => {
              const month = new Date(`${x.start}T00:00:00Z`).toLocaleDateString("ar-SY", {month:"short", timeZone:"UTC"});
              const prev = i ? new Date(`${weeks[i-1].start}T00:00:00Z`).getUTCMonth() : -1;
              const curMonth = new Date(`${x.start}T00:00:00Z`).getUTCMonth();
              return curMonth !== prev ? `<span style="grid-column:${i+1}">${esc(month)}</span>` : "";
            }).join("")}</div>
          </div>
          <div class="activity-board">
            <div class="activity-weekdays" aria-hidden="true"><span>أحد</span><span>اثن</span><span>ثلا</span><span>أرب</span><span>خمي</span><span>جمع</span><span>سبت</span></div>
            <div class="activity-grid" aria-label="نشاط الأسابيع">
              ${weeks.map((x,i) => Array.from({length:7},(_,day) => `<button type="button" class="activity-cell ${activityLevelClass(x.percent)} ${current && x.start===current.start ? "is-current" : ""}" title="${esc(weekLabel(x))} • ${x.completed}/${x.total} منجز (${x.percent}%)" aria-label="${esc(weekLabel(x))}، ${x.percent}%" data-activity-index="${i}"></button>`).join("")).join("")}
            </div>
          </div>
        </div>
      </div>
      <div class="activity-legend"><span>أقل</span><i class="activity-cell activity-0"></i><i class="activity-cell activity-1"></i><i class="activity-cell activity-2"></i><i class="activity-cell activity-3"></i><i class="activity-cell activity-4"></i><i class="activity-cell activity-5"></i><span>أعلى</span></div>
      <div id="activityDetails" class="activity-details"></div>
    </section>`;

  document.querySelectorAll("[data-activity-index]").forEach(btn => btn.onclick = () => {
    const x = weeks[Number(btn.dataset.activityIndex)];
    $("activityDetails").innerHTML = x ? `<div><b>${esc(weekLabel(x))}</b><span>${x.completed} من ${x.total} مهمة منجزة</span><strong>${x.percent}%</strong></div>` : "";
  });
}

function renderWeekly(rows) {
  const today = ["الأحد","الاثنين","الثلاثاء","الأربعاء","الخميس","الجمعة","السبت"][new Date().getDay()];
  $("weeklyList").innerHTML = ["الأحد","الاثنين","الثلاثاء","الأربعاء","الخميس","الجمعة","السبت"].map(day => {
    const items = rows.filter(x=>x.day===day);
    if (!items.length) return "";
    return `<section class="day-block ${day===today ? "today" : ""}"><div class="day-head"><h3>${day}</h3><span>${items.filter(x=>x.done).length}/${items.length} منجز</span></div>${items.map(x=>`<article class="task-row"><label><input type="checkbox" data-week-id="${attr(x.id)}" ${x.done ? "checked" : ""}><span><b>${esc(x.subject)}</b> — ${esc(x.task)}${x.time ? ` <small>(${esc(x.time)})</small>` : ""}</span></label><button class="danger-link" data-delweek-id="${attr(x.id)}">حذف</button></article>`).join("")}</section>`;
  }).join("") || `<div class="empty">لم تضف أي مهام بعد.</div>`;
  document.querySelectorAll("[data-week-id]").forEach(el => el.onchange = async () => {
    try {
      await api(`/api/weekly/${el.dataset.weekId}`, {method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({done:el.checked})});
      state.weekly=await api("/api/weekly");
      renderWeekly(state.weekly);
      renderWeeklyActivity(await api("/api/weekly/activity"));
    } catch(e){el.checked=!el.checked;showError(e);}
  });
  document.querySelectorAll("[data-delweek-id]").forEach(el => el.onclick = async () => {
    if (!confirm("حذف هذه المهمة؟")) return;
    try {
      await api(`/api/weekly/${el.dataset.delweekId}`, {method:"DELETE"});
      state.weekly=await api("/api/weekly");
      renderWeekly(state.weekly);
      renderWeeklyActivity(await api("/api/weekly/activity"));
    } catch(e){showError(e);}
  });
}

async function refreshWeeklyView() {
  const before = state.weeklyActivity?.current?.start || "";
  state.weekly = await api("/api/weekly");
  const activity = await api("/api/weekly/activity");
  renderWeekly(state.weekly);
  renderWeeklyActivity(activity);
  return before !== (activity.current?.start || "");
}

async function weeklyPage() {
  shell({title:"الجدول الأسبوعي", subtitle:"يُعاد ضبط علامات الإنجاز كل يوم خميس، ويُحفظ نشاط كل أسبوع في سجل السنة كاملة.", active:"weekly"}, `<section class="card">${weeklyForm()}</section><div id="weeklyList" class="days"></div><div id="weeklyActivity"></div>`);
  try {
    await refreshWeeklyView();
    $("weeklyForm").onsubmit = async e => {
      e.preventDefault();
      const f = new FormData(e.target);
      try { await api("/api/weekly", {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({day:f.get("day"),subject:f.get("subject"),task:f.get("task"),time:f.get("time")})}); e.target.reset(); await refreshWeeklyView(); }
      catch(err){showError(err);}
    };
    clearInterval(state.weeklyTimer);
    state.weeklyTimer = setInterval(async () => {
      try { await refreshWeeklyView(); } catch(e) { console.error(e); }
    }, 60000);
  } catch(e){showError(e);}
}

function examCard(x) {
  return `<article class="exam-card"><div><span class="tag">${esc(x.subject)}</span><h3>${esc(x.name || x.subject)}</h3><p>${formatDate(x.at)}</p></div><div class="exam-count" data-countdown="${attr(x.at)}">${countdown(x.at).text}</div><button class="danger-link" data-delexam-id="${attr(x.id)}">حذف</button></article>`;
}

function renderExams(rows) {
  const sorted = [...rows].sort((a,b)=>new Date(a.at)-new Date(b.at));
  $("examList").innerHTML = sorted.length ? sorted.map(examCard).join("") : `<div class="empty">لا توجد امتحانات مسجلة.</div>`;
  document.querySelectorAll("[data-delexam-id]").forEach(el => el.onclick = async () => {
    if (!confirm("حذف هذا الامتحان؟")) return;
    try { await api(`/api/exams/${el.dataset.delexamId}`, {method:"DELETE"}); state.exams=await api("/api/exams"); renderExams(state.exams); } catch(e){showError(e);}
  });
}

function updateExamTimers() { document.querySelectorAll("[data-countdown]").forEach(el => el.textContent = countdown(el.dataset.countdown).text); }

async function examsPage() {
  shell({title:"الامتحانات", subtitle:"كل المواعيد محفوظة في Notion، والعد التنازلي يتحدث تلقائيًا.", active:"exams"}, `<section class="card"><form id="examForm" class="form-grid"><input name="subject" placeholder="المادة" required><input name="name" placeholder="اسم الامتحان"><input name="date" type="date" required><input name="time" type="time" required><button class="button" type="submit">＋ إضافة امتحان</button></form></section><div id="examList" class="exam-list"></div>`);
  try {
    state.exams = await api("/api/exams");
    renderExams(state.exams);
    $("examForm").onsubmit = async e => {
      e.preventDefault();
      const f = new FormData(e.target);
      try { await api("/api/exams", {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({subject:f.get("subject"),name:f.get("name"),at:`${f.get("date")}T${f.get("time")}`})}); e.target.reset(); state.exams=await api("/api/exams"); renderExams(state.exams); }
      catch(err){showError(err);}
    };
    setInterval(updateExamTimers, 1000);
  } catch(e){showError(e);}
}

function channelsForm() {
  return `<form id="channelForm" class="form-grid six"><input name="name" placeholder="اسم القناة" required><select name="subject" required><option value="">اختر المادة</option>${subjectsFallback.map(x=>`<option>${x}</option>`).join("")}</select><input name="channelUrl" type="url" placeholder="رابط القناة"><input name="playlistName" placeholder="اسم قائمة التشغيل"><input name="playlistUrl" type="url" placeholder="رابط قائمة التشغيل"><input name="notes" placeholder="ملاحظات"><button class="button" type="submit">＋ إضافة المصدر</button></form>`;
}

async function channelsPage() {
  shell({title:"القنوات وقوائم التشغيل", subtitle:"اجمع مصادر الشرح في مكان واحد، ويمكنك أيضًا فتحها من صفحة كل مادة.", active:"channels"}, `<section class="card">${channelsForm()}</section><div id="channelList" class="channels large"></div>`);
  try {
    const render = async () => { const rows=await api("/api/channels"); $("channelList").innerHTML=rows.length ? rows.map(channelCard).join("") : `<div class="empty">لا توجد مصادر بعد.</div>`; };
    await render();
    $("channelForm").onsubmit = async e => {
      e.preventDefault(); const f=new FormData(e.target);
      try { await api("/api/channels", {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(Object.fromEntries(f.entries()))}); e.target.reset(); await render(); }
      catch(err){showError(err);}
    };
  } catch(e){showError(e);}
}

(async function init(){
  hideError();
  if (page === "dashboard") return dashboardPage();
  if (page === "subjects") return subjectsPage();
  if (page === "subject") return subjectPage();
  if (page === "weekly") return weeklyPage();
  if (page === "exams") return examsPage();
  if (page === "channels") return channelsPage();
})();
