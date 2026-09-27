const state = { data: null, lessonRows: [], unitIndex: 0 };
const $ = (id) => document.getElementById(id);

function bar(percent, cls="") { return `<div class="progress ${cls}"><span style="width:${Math.max(0,Math.min(100,percent))}%"></span></div>`; }
function escapeHtml(v="") { return String(v).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;", "'":"&#039;"}[c])); }
function escapeAttr(v="") { return escapeHtml(v); }

function renderSubjects() {
  const filter = $("subjectFilter").value;
  const rows = state.data.subjects.filter(x => filter === "all" || x.subject === filter);
  $("subjects").innerHTML = rows.map(s => `<article class="subject"><div class="subject-top"><div><h3>${escapeHtml(s.subject)}</h3><p>${s.lessons} درس</p></div><div class="percent">${s.percent}%</div></div>${bar(s.percent,"mini-progress")}${Object.values(s.stages).map(x=>`<div class="stage-row"><span>${escapeHtml(x.label)}</span>${bar(x.percent)}<strong>${x.percent}%</strong></div>`).join("")}</article>`).join("");
}

function render() {
  const d = state.data;
  $("overall").textContent = `${d.overallPercent}%`;
  $("overallBar").style.width = `${d.overallPercent}%`;
  $("lessonCount").textContent = d.totalLessons;
  $("subjectCount").textContent = d.subjects.length;
  $("updated").textContent = `آخر تحديث: ${new Date(d.updatedAt).toLocaleString("ar-SY")}`;
  $("subjectFilter").innerHTML = `<option value="all">كل المواد</option>` + d.subjects.map(s=>`<option value="${escapeAttr(s.subject)}">${escapeHtml(s.subject)}</option>`).join("");
  $("stages").innerHTML = Object.values(d.stages).map(s=>`<div class="stage-box"><b>${s.percent}%</b><strong>${escapeHtml(s.label)}</strong><span>${s.done} من ${s.total} درس</span>${bar(s.percent)}</div>`).join("");
  renderSubjects();
}

async function load() {
  $("error").classList.add("hidden"); $("refresh").disabled=true; $("refresh").textContent="جاري التحديث...";
  try { const res=await fetch("/api/progress",{cache:"no-store"}); const data=await res.json(); if(!res.ok) throw new Error(data.hint||data.details||data.error||"تعذر تحميل البيانات"); state.data=data; render(); }
  catch(e){$("error").textContent=`⚠️ ${e.message}`;$("error").classList.remove("hidden");}
  finally{$("refresh").disabled=false;$("refresh").textContent="↻ تحديث";}
}

function getUnits() {
  const subject = $("lessonSubject").value;
  const rows = state.lessonRows.filter(x => subject === "all" || x.subject === subject);
  const units = [...new Set(rows.map(x => x.unit || "دروس بدون وحدة"))];
  return { rows, units };
}

function renderLessons() {
  const { rows, units } = getUnits();
  if (!units.length) { state.unitIndex=0; $("unitTitle").textContent="لا توجد دروس"; $("unitCounter").textContent="0 وحدات"; $("lessons").innerHTML='<div class="empty">لا توجد دروس لهذه المادة.</div>'; $("unitProgress").innerHTML=""; updateUnitButtons(0); return; }
  state.unitIndex = Math.max(0, Math.min(state.unitIndex, units.length-1));
  const unit = units[state.unitIndex];
  const unitRows = rows.filter(x => (x.unit || "دروس بدون وحدة") === unit);
  const completed = unitRows.reduce((sum,x)=>sum+x.stages.filter(s=>s.checked).length,0);
  const total = unitRows.length * 5;
  const percent = total ? Math.round(completed/total*100) : 0;
  $("unitCounter").textContent = `الوحدة ${state.unitIndex+1} من ${units.length}`;
  $("unitTitle").textContent = unit;
  $("unitProgress").innerHTML = `<div><span>إنجاز الوحدة</span><strong>${percent}%</strong></div>${bar(percent)}`;
  $("lessons").innerHTML = unitRows.map(x=>`<div class="lesson-row"><div class="lesson-info"><strong>${escapeHtml(x.lesson)}</strong><p>${escapeHtml(x.subject)}${x.page ? ` • صفحة ${escapeHtml(x.page)}` : ""}</p></div><div class="checks">${x.stages.map(s=>`<label><input type="checkbox" ${s.checked?'checked':''} data-id="${x.id}" data-prop="${escapeAttr(s.property)}"> ${escapeHtml(s.label)}</label>`).join("")}</div></div>`).join("");
  document.querySelectorAll('#lessons input').forEach(cb=>cb.addEventListener('change', async e=>{
    const el=e.target;
    const r=await fetch('/api/lessons/'+el.dataset.id,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({property:el.dataset.prop,checked:el.checked})});
    if(!r.ok){el.checked=!el.checked;alert('تعذر حفظ التغيير في Notion');return;}
    await load(); await loadLessons(false);
  }));
  updateUnitButtons(units.length);
}

function updateUnitButtons(count) {
  $("prevUnit").disabled = count === 0 || state.unitIndex === 0;
  $("nextUnit").disabled = count === 0 || state.unitIndex >= count-1;
}

async function loadLessons(resetUnit=true) {
  try {
    const r=await fetch("/api/lessons",{cache:"no-store"});
    if(!r.ok) throw new Error("تعذر تحميل الدروس");
    state.lessonRows=await r.json();
    const ss=[...new Set(state.lessonRows.map(x=>x.subject).filter(Boolean))];
    const current=$("lessonSubject").value;
    $("lessonSubject").innerHTML='<option value="all">كل المواد</option>'+ss.map(s=>`<option value="${escapeAttr(s)}">${escapeHtml(s)}</option>`).join('');
    if(ss.includes(current)) $("lessonSubject").value=current;
    if(resetUnit) state.unitIndex=0;
    renderLessons();
  } catch(e) { $("error").textContent=`⚠️ ${e.message}`; $("error").classList.remove("hidden"); }
}

$("refresh").addEventListener("click", load);
$("subjectFilter").addEventListener("change", renderSubjects);
$("lessonSubject").addEventListener("change", ()=>{state.unitIndex=0;renderLessons();});
$("prevUnit").addEventListener("click", ()=>{if(state.unitIndex>0){state.unitIndex--;renderLessons();window.scrollTo({top:document.querySelector('.lessons-card').offsetTop-20,behavior:'smooth'});}});
$("nextUnit").addEventListener("click", ()=>{const {units}=getUnits();if(state.unitIndex<units.length-1){state.unitIndex++;renderLessons();window.scrollTo({top:document.querySelector('.lessons-card').offsetTop-20,behavior:'smooth'});}});
$("logout").addEventListener("click", async ()=>{await fetch('/api/logout',{method:'POST'});location.href='/login.html';});

load();
loadLessons();

async function loadChannels() {
  try {
    const r = await fetch("/api/channels", {
      cache: "no-store"
    });

    const data = await r.json();

    if (!r.ok) {
      throw new Error(data.details || data.error || "تعذر تحميل القنوات");
    }

    const rows = Array.isArray(data) ? data : [];

    $("channels").innerHTML = rows.map(x => `
      <article class="channel">

        <div class="channel-subject">
          ${escapeHtml(x.subject || "")}
        </div>

        ${
          x.channelUrl
            ? `
              <a
                href="${escapeAttr(x.channelUrl)}"
                target="_blank"
                rel="noopener noreferrer"
                class="channel-link"
              >
                🎥 ${escapeHtml(x.name || "")}
              </a>
            `
            : `
              <div class="channel-link">
                🎥 ${escapeHtml(x.name || "")}
              </div>
            `
        }

        ${
          x.playlistName
            ? x.playlistUrl
              ? `
                <a
                  href="${escapeAttr(x.playlistUrl)}"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="playlist-link"
                >
                  ▶ ${escapeHtml(x.playlistName)}
                </a>
              `
              : `
                <div class="playlist-link">
                  ▶ ${escapeHtml(x.playlistName)}
                </div>
              `
            : ""
        }

      </article>
    `).join("");

  } catch (error) {
    console.error("تعذر تحميل القنوات:", error);

    $("channels").innerHTML = `
      <div class="error-message">
        تعذر تحميل القنوات وقوائم التشغيل.
      </div>
    `;
  }
}

// Weekly planner and exam countdowns are stored in Notion, not localStorage.
const dayNames=["الأحد","الاثنين","الثلاثاء","الأربعاء","الخميس","الجمعة","السبت"];
function localDateKey(d=new Date()){ return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; }

async function loadWeekly(){
  const r=await fetch("/api/weekly",{cache:"no-store"});
  const data=await r.json();
  if(!r.ok) throw new Error(data.error||"تعذر تحميل جدول الأسبوع");
  renderWeekly(data);
}
function renderWeekly(rows=[]){
  const today=dayNames[new Date().getDay()], date=localDateKey();
  const todays=rows.filter(x=>x.day===today);
  const done=todays.filter(x=>x.done && x.doneDate===date).length;
  $("weekly").innerHTML=`<h3>${today} — ${date}</h3><p>إنجاز اليوم: ${done} / ${todays.length} (${todays.length?Math.round(done/todays.length*100):0}%)</p>`+
    (rows.length ? dayNames.map(day=>{
      const items=rows.filter(x=>x.day===day);
      return items.length ? `<h3>${day}</h3>`+items.map(x=>`<article class="channel"><label><input type="checkbox" data-week-id="${x.id}" ${x.done?'checked':''}> <b>${escapeHtml(x.subject)}</b> — ${escapeHtml(x.task)} ${x.time?`(${escapeHtml(x.time)})`:""}</label> <button class="secondary" data-delweek-id="${x.id}">حذف</button></article>`).join("") : "";
    }).join("") : '<p class="empty">لم تضف حصصًا بعد.</p>');
  document.querySelectorAll("[data-week-id]").forEach(el=>el.onchange=async()=>{
    const r=await fetch(`/api/weekly/${el.dataset.weekId}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({done:el.checked})});
    if(!r.ok){el.checked=!el.checked;alert("تعذر حفظ التغيير في Notion");return;}
    await loadWeekly();
  });
  document.querySelectorAll("[data-delweek-id]").forEach(el=>el.onclick=async()=>{
    if(!confirm("حذف هذه الحصة؟")) return;
    const r=await fetch(`/api/weekly/${el.dataset.delweekId}`,{method:"DELETE"});
    if(!r.ok){alert("تعذر حذف الحصة من Notion");return;}
    await loadWeekly();
  });
}
$("weeklyForm").addEventListener("submit",async e=>{
  e.preventDefault();
  const f=new FormData(e.target);
  const body=Object.fromEntries(f.entries());
  const r=await fetch("/api/weekly",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
  if(!r.ok){const x=await r.json();alert(x.error||"تعذر الحفظ");return;}
  e.target.reset(); await loadWeekly();
});

async function loadExams(){
  const r=await fetch("/api/exams",{cache:"no-store"});
  const data=await r.json();
  if(!r.ok) throw new Error(data.error||"تعذر تحميل الامتحانات");
  renderExams(data);
}
function renderExams(rows=[]){
  $("exams").innerHTML=rows.length ? rows.map(x=>{
    const ms=new Date(x.at)-Date.now();
    if(ms<=0) return `<article class="channel"><h3>${escapeHtml(x.subject)}${x.name?` — ${escapeHtml(x.name)}`:""} </h3><p>انتهى موعد الامتحان</p><button data-delexam-id="${x.id}" class="secondary">حذف</button></article>`;
    let sec=Math.floor(ms/1000), days=Math.floor(sec/86400); sec-=days*86400;
    let hours=Math.floor(sec/3600); sec-=hours*3600;
    let mins=Math.floor(sec/60); sec%=60;
    return `<article class="channel"><h3>${escapeHtml(x.subject)} ${x.name?`— ${escapeHtml(x.name)}`:""}</h3><p>${new Date(x.at).toLocaleString("ar-SY")}</p><strong>${days} يوم • ${hours} ساعة • ${mins} دقيقة • ${sec} ثانية</strong><br><button data-delexam-id="${x.id}" class="secondary">حذف</button></article>`;
  }).join("") : '<p class="empty">لم تضف امتحانات بعد.</p>';
  document.querySelectorAll("[data-delexam-id]").forEach(el=>el.onclick=async()=>{
    if(!confirm("حذف هذا الامتحان؟")) return;
    const r=await fetch(`/api/exams/${el.dataset.delexamId}`,{method:"DELETE"});
    if(!r.ok){alert("تعذر حذف الامتحان من Notion");return;}
    await loadExams();
  });
}
$("examForm").addEventListener("submit",async e=>{
  e.preventDefault();
  const f=new FormData(e.target);
  const date=f.get("date"), time=f.get("time");
  const r=await fetch("/api/exams",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({subject:f.get("subject"),name:f.get("name"),at:`${date}T${time}`})});
  if(!r.ok){const x=await r.json();alert(x.error||"تعذر الحفظ");return;}
  e.target.reset(); await loadExams();
});

async function migrateOldLocalData(){
  try{
    const weekly=JSON.parse(localStorage.getItem("study_weekly")||"[]");
    const exams=JSON.parse(localStorage.getItem("study_exams")||"[]");
    if(!weekly.length && !exams.length) return;
    const r=await fetch("/api/local-migrate",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({weekly,exams})});
    if(r.ok){
      localStorage.removeItem("study_weekly");
      localStorage.removeItem("study_exams");
    }
  }catch(e){console.warn("Local data migration skipped:",e);}
}
loadWeekly().catch(e=>{ $("error").textContent=`⚠️ ${e.message}`;$("error").classList.remove("hidden"); });
loadExams().catch(e=>{ $("error").textContent=`⚠️ ${e.message}`;$("error").classList.remove("hidden"); });
migrateOldLocalData().then(()=>Promise.all([loadWeekly(),loadExams()])).catch(()=>{});
setInterval(()=>loadExams().catch(()=>{}),1000);
