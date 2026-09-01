const state = { data: null };

const $ = (id) => document.getElementById(id);

function bar(percent, cls="") {
  return `<div class="progress ${cls}"><span style="width:${percent}%"></span></div>`;
}

function renderSubjects() {
  const filter = $("subjectFilter").value;
  const rows = state.data.subjects.filter(x => filter === "all" || x.subject === filter);

  $("subjects").innerHTML = rows.map(s => `
    <article class="subject">
      <div class="subject-top">
        <div>
          <h3>${escapeHtml(s.subject)}</h3>
          <p>${s.lessons} درس</p>
        </div>
        <div class="percent">${s.percent}%</div>
      </div>
      ${bar(s.percent, "mini-progress")}
      ${Object.values(s.stages).map(x => `
        <div class="stage-row">
          <span>${escapeHtml(x.label)}</span>
          ${bar(x.percent)}
          <strong>${x.percent}%</strong>
        </div>
      `).join("")}
    </article>
  `).join("");
}

function render() {
  const d = state.data;
  $("overall").textContent = `${d.overallPercent}%`;
  $("overallBar").style.width = `${d.overallPercent}%`;
  $("lessonCount").textContent = d.totalLessons;
  $("subjectCount").textContent = d.subjects.length;
  $("updated").textContent = `آخر تحديث: ${new Date(d.updatedAt).toLocaleString("ar-SY")}`;

  $("subjectFilter").innerHTML =
    `<option value="all">كل المواد</option>` +
    d.subjects.map(s => `<option value="${escapeAttr(s.subject)}">${escapeHtml(s.subject)}</option>`).join("");

  $("stages").innerHTML = Object.values(d.stages).map(s => `
    <div class="stage-box">
      <b>${s.percent}%</b>
      <strong>${escapeHtml(s.label)}</strong>
      <span>${s.done} من ${s.total} درس</span>
      ${bar(s.percent)}
    </div>
  `).join("");

  renderSubjects();
}

async function load() {
  $("error").classList.add("hidden");
  $("refresh").disabled = true;
  $("refresh").textContent = "جاري التحديث...";
  try {
    const res = await fetch("/api/progress", { cache: "no-store" });
    const data = await res.json();
    if (!res.ok) throw new Error(data.hint || data.details || data.error || "تعذر تحميل البيانات");
    state.data = data;
    render();
  } catch (e) {
    $("error").textContent = `⚠️ ${e.message}`;
    $("error").classList.remove("hidden");
  } finally {
    $("refresh").disabled = false;
    $("refresh").textContent = "↻ تحديث";
  }
}

function escapeHtml(v="") {
  return String(v).replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#039;" }[c]));
}
function escapeAttr(v="") { return escapeHtml(v); }

$("refresh").addEventListener("click", load);
$("subjectFilter").addEventListener("change", renderSubjects);
load();

async function loadLessons(){try{const r=await fetch("/api/lessons",{cache:"no-store"});if(!r.ok)return;window.lessonRows=await r.json();const ss=[...new Set(window.lessonRows.map(x=>x.subject).filter(Boolean))];$("lessonSubject").innerHTML='<option value="all">كل المواد</option>'+ss.map(s=>`<option>${escapeHtml(s)}</option>`).join('');renderLessons()}catch{}}
function renderLessons(){const f=$("lessonSubject").value;const rows=(window.lessonRows||[]).filter(x=>f==='all'||x.subject===f);$("lessons").innerHTML=rows.map(x=>`<div class="lesson-row"><div class="lesson-info"><strong>${escapeHtml(x.lesson)}</strong><p>${escapeHtml(x.subject)}${x.unit?' • '+escapeHtml(x.unit):''}</p></div><div class="checks">${x.stages.map(s=>`<label><input type="checkbox" ${s.checked?'checked':''} data-id="${x.id}" data-prop="${escapeAttr(s.property)}"> ${escapeHtml(s.label)}</label>`).join('')}</div></div>`).join('');document.querySelectorAll('#lessons input').forEach(cb=>cb.addEventListener('change',async e=>{const el=e.target;const r=await fetch('/api/lessons/'+el.dataset.id,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({property:el.dataset.prop,checked:el.checked})});if(!r.ok){el.checked=!el.checked;alert('تعذر حفظ التغيير في Notion');return}await load();await loadLessons()}))}
$("lessonSubject").addEventListener('change',renderLessons);
async function loadChannels(){try{const r=await fetch('/api/channels',{cache:'no-store'});if(!r.ok)return;const rows=await r.json();$("channels").innerHTML=rows.map(x=>`<article class="channel"><h3>🎥 ${escapeHtml(x.name)}</h3><p>${escapeHtml(x.subject)}${x.playlistName?' • '+escapeHtml(x.playlistName):''}</p>${x.channelUrl?`<a href="${escapeAttr(x.channelUrl)}" target="_blank" rel="noopener">رابط القناة</a>`:''}${x.playlistUrl?`<a href="${escapeAttr(x.playlistUrl)}" target="_blank" rel="noopener">قائمة التشغيل</a>`:''}</article>`).join('')}catch{}}
$("channelForm").addEventListener('submit',async e=>{e.preventDefault();const r=await fetch('/api/channels',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(Object.fromEntries(new FormData(e.target).entries()))});if(!r.ok){alert('تعذر إضافة المصدر');return}e.target.reset();loadChannels()});
loadLessons();loadChannels();
