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
    const r = await fetch('/api/channels', {
      cache: 'no-store'
    });

    if (!r.ok) return;

    const rows = await r.json();

    $("channels").innerHTML = rows.map(x => `
      <article class="channel">

        <!-- اسم المادة -->
        <p class="channel-subject">
          ${escapeHtml(x.subject)}
        </p>

        <!-- اسم القناة -->
        ${
          x.channelUrl
            ? `
              <a
                class="channel-link"
                href="${escapeAttr(x.channelUrl)}"
                target="_blank"
                rel="noopener noreferrer"
              >
                🎥 ${escapeHtml(x.name)}
              </a>
            `
            : `
              <h3>
                🎥 ${escapeHtml(x.name)}
              </h3>
            `
        }

        <!-- قائمة التشغيل إن وجدت -->
        ${
          x.playlistName
            ? (
                x.playlistUrl
                  ? `
                    <a
                      class="playlist-link"
                      href="${escapeAttr(x.playlistUrl)}"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      ▶ ${escapeHtml(x.playlistName)}
                    </a>
                  `
                  : `
                    <p class="playlist-name">
                      ▶ ${escapeHtml(x.playlistName)}
                    </p>
                  `
              )
            : ''
        }

      </article>
    `).join('');

  } catch (e) {
    console.error('تعذر تحميل القنوات:', e);
  }
}