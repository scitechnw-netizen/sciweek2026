(() => {
  "use strict";
  const $=id=>document.getElementById(id);
  const loginView=$("adminLoginView"), app=$("adminApp"), loginForm=$("adminLoginForm"), loginMsg=$("adminLoginMessage"),
        loadingEl=$("adminLoading"), toastEl=$("adminToast"), sidebar=document.querySelector(".admin-sidebar");
  let adminToken=sessionStorage.getItem("treasure_admin_token")||"";
  let students=[],questions=[],results=[],csvRows=[],studentOffset=0,resultOffset=0;
  let confirmAction=null;

  function show(el,yes=true){if(el)el.classList.toggle("hidden",!yes)}
  function loading(v){show(loadingEl,v)}
  function toast(t,type="success"){toastEl.textContent=t;toastEl.className="toast "+type;show(toastEl,true);clearTimeout(toast.t);toast.t=setTimeout(()=>show(toastEl,false),2600)}
  function msg(el,t,ok=false){el.textContent=t;el.className="inline-alert "+(ok?"success":"");show(el,true)}
  async function rpc(name,args={}){
    if(!window.treasureDB)throw new Error("ยังไม่ได้ตั้งค่า Supabase");
    const {data,error}=await window.treasureDB.rpc(name,args);
    if(error)throw new Error(error.message||"เชื่อมต่อฐานข้อมูลไม่สำเร็จ");
    return data;
  }
  async function arpc(name,args={}){return rpc(name,{p_admin_token:adminToken,...args})}
  function escCSV(v){const s=String(v??"");return /[",\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s}
  function fmtDate(v){if(!v)return "-";try{return new Intl.DateTimeFormat("th-TH",{dateStyle:"short",timeStyle:"short"}).format(new Date(v))}catch{return v}}
  function statusBadge(status){
    const map={playing:["กำลังเล่น","blue"],milestone:["ครบ 10 ข้อ","gold"],finished_small:["จบรับรางวัล","green"],finished_big:["รางวัลใหญ่","gold"]};
    const m=map[status]||["ยังไม่เล่น",""];return `<span class="badge ${m[1]}">${m[0]}</span>`;
  }
  function safe(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}

  async function doLogin(password){
    const d=await rpc("hunt_admin_login",{p_password:password});
    if(!d?.ok)throw new Error(d?.message||"รหัสผ่านไม่ถูกต้อง");
    adminToken=d.token;sessionStorage.setItem("treasure_admin_token",adminToken);show(loginView,false);show(app,true);await loadDashboard();
  }
  loginForm?.addEventListener("submit",async e=>{
    e.preventDefault();show(loginMsg,false);loading(true);
    try{await doLogin($("adminPassword").value)}
    catch(err){msg(loginMsg,err.message)}
    finally{loading(false)}
  });

  async function validateSession(){
    if(!adminToken)return false;
    try{const d=await arpc("hunt_admin_dashboard");if(!d?.ok)return false;renderDashboard(d);return true}catch{return false}
  }

  const titles={dashboard:"ภาพรวมระบบ",students:"จัดการนักเรียน",questions:"จัดการข้อสอบ",results:"ผลการเล่น",settings:"ตั้งค่าระบบ"};
  document.querySelectorAll(".nav-item[data-tab]").forEach(btn=>btn.addEventListener("click",async()=>{
    const tab=btn.dataset.tab;
    document.querySelectorAll(".nav-item[data-tab]").forEach(b=>b.classList.toggle("active",b===btn));
    document.querySelectorAll(".admin-tab").forEach(s=>s.classList.remove("active"));
    $("tab-"+tab).classList.add("active");$("pageTitle").textContent=titles[tab];sidebar?.classList.remove("open");
    if(tab==="dashboard")await loadDashboard();
    if(tab==="students"){studentOffset=0;students=[];await loadStudents(true)}
    if(tab==="questions")await loadQuestions();
    if(tab==="results"){resultOffset=0;results=[];await loadResults(true)}
  }));
  $("mobileMenuBtn")?.addEventListener("click",()=>sidebar?.classList.toggle("open"));

  function renderDashboard(d){
    $("statStudents").textContent=d.students_total??0;$("statStarted").textContent=d.started_total??0;
    $("statSmall").textContent=d.finished_small??0;$("statBig").textContent=d.finished_big??0;
    $("questionHealth").textContent=(d.active_questions??0)+"/129";$("signHealth").textContent=(d.active_signs??0)+"/43";
    $("playingNow").textContent=d.playing_now??0;
  }
  async function loadDashboard(){try{const d=await arpc("hunt_admin_dashboard");if(!d?.ok)throw new Error("เซสชันหมดอายุ");renderDashboard(d)}catch(e){logoutLocal();msg(loginMsg,"เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่")}}
  $("refreshDashboardBtn")?.addEventListener("click",loadDashboard);

  async function loadStudents(reset=false){
    if(reset){studentOffset=0;students=[]}
    const search=$("studentSearch").value.trim();
    const d=await arpc("hunt_admin_list_students",{p_search:search,p_limit:200,p_offset:studentOffset});
    if(!d?.ok)throw new Error(d?.message||"โหลดรายชื่อไม่สำเร็จ");
    students=reset?d.items:[...students,...d.items];studentOffset=students.length;renderStudents(d.total);
  }
  function renderStudents(total){
    const tb=$("studentsTableBody");
    if(!students.length){tb.innerHTML='<tr><td colspan="5" class="empty-cell">ไม่พบรายชื่อนักเรียน</td></tr>'}
    else tb.innerHTML=students.map(s=>`<tr>
      <td><strong>${safe(s.student_code)}</strong></td><td>${safe(s.full_name)}</td><td>${safe(s.class_name||"-")}</td>
      <td>${s.active?'<span class="badge green">ใช้งาน</span>':'<span class="badge red">ปิดใช้งาน</span>'}</td>
      <td>${s.game_status?statusBadge(s.game_status):'<span class="badge">ยังไม่เล่น</span>'}</td></tr>`).join("");
    $("studentCountLabel").textContent=`แสดง ${students.length} จาก ${total} รายการ`;
    show($("loadMoreStudentsBtn"),students.length<total);
  }
  let studentSearchTimer;
  $("studentSearch")?.addEventListener("input",()=>{clearTimeout(studentSearchTimer);studentSearchTimer=setTimeout(()=>loadStudents(true).catch(e=>toast(e.message,"error")),300)});
  $("refreshStudentsBtn")?.addEventListener("click",()=>loadStudents(true).catch(e=>toast(e.message,"error")));
  $("loadMoreStudentsBtn")?.addEventListener("click",()=>loadStudents(false).catch(e=>toast(e.message,"error")));

  function parseCSV(text){
    const rows=[];let row=[],field="",quote=false;
    for(let i=0;i<text.length;i++){
      const c=text[i],n=text[i+1];
      if(c==='"'&&quote&&n==='"'){field+='"';i++;continue}
      if(c==='"'){quote=!quote;continue}
      if(c===","&&!quote){row.push(field);field="";continue}
      if((c==="\n"||c==="\r")&&!quote){
        if(c==="\r"&&n==="\n")i++;row.push(field);field="";
        if(row.some(x=>x.trim()!==""))rows.push(row);row=[];continue
      }
      field+=c;
    }
    row.push(field);if(row.some(x=>x.trim()!==""))rows.push(row);
    if(!rows.length)return [];
    const headers=rows.shift().map(h=>h.replace(/^\uFEFF/,"").trim().toLowerCase());
    const idx=(...names)=>headers.findIndex(h=>names.includes(h));
    const ci=idx("student_code","รหัสนักเรียน","รหัส"),ni=idx("full_name","ชื่อ-สกุล","ชื่อสกุล","ชื่อ"),cl=idx("class_name","ห้อง","ชั้น");
    if(ci<0||ni<0)throw new Error("CSV ต้องมีคอลัมน์ student_code และ full_name");
    return rows.map(r=>({student_code:(r[ci]||"").trim(),full_name:(r[ni]||"").trim(),class_name:cl>=0?(r[cl]||"").trim():""})).filter(r=>r.student_code&&r.full_name);
  }
  function previewCSV(){
    $("csvRowCount").textContent=csvRows.length;$("csvPreviewBody").innerHTML=csvRows.slice(0,8).map(r=>`<tr><td>${safe(r.student_code)}</td><td>${safe(r.full_name)}</td><td>${safe(r.class_name)}</td></tr>`).join("");
    show($("csvPreviewWrap"),true);
  }
  async function handleFile(file){
    if(!file)return;
    try{csvRows=parseCSV(await file.text());if(!csvRows.length)throw new Error("ไม่พบรายชื่อในไฟล์");$("csvFileName").textContent=file.name;previewCSV()}
    catch(e){toast(e.message,"error")}
  }
  $("openImportBtn")?.addEventListener("click",()=>show($("importModal"),true));
  $("chooseCsvBtn")?.addEventListener("click",()=>$("csvFileInput").click());
  $("csvFileInput")?.addEventListener("change",e=>handleFile(e.target.files[0]));
  const dz=$("csvDropZone");
  ["dragenter","dragover"].forEach(ev=>dz?.addEventListener(ev,e=>{e.preventDefault();dz.classList.add("dragover")}));
  ["dragleave","drop"].forEach(ev=>dz?.addEventListener(ev,e=>{e.preventDefault();dz.classList.remove("dragover")}));
  dz?.addEventListener("drop",e=>handleFile(e.dataTransfer.files[0]));
  $("confirmImportBtn")?.addEventListener("click",async()=>{
    if(!csvRows.length)return;loading(true);
    try{
      let done=0;
      for(let i=0;i<csvRows.length;i+=300){
        const batch=csvRows.slice(i,i+300);
        const d=await arpc("hunt_admin_upsert_students",{p_rows:batch});
        if(!d?.ok)throw new Error(d?.message||"นำเข้าไม่สำเร็จ");done+=batch.length;
      }
      toast(`นำเข้าสำเร็จ ${done} รายชื่อ`);show($("importModal"),false);csvRows=[];await loadStudents(true);await loadDashboard();
    }catch(e){toast(e.message,"error")}finally{loading(false)}
  });

  async function loadQuestions(){
    const d=await arpc("hunt_admin_list_questions");if(!d?.ok)throw new Error(d?.message||"โหลดข้อสอบไม่สำเร็จ");
    questions=d.items||[];buildSignFilter();renderQuestions();
  }
  function buildSignFilter(){
    const sel=$("signFilter"),current=sel.value;sel.innerHTML='<option value="">ทุกป้าย</option>';
    [...new Set(questions.map(q=>q.sign_number))].sort((a,b)=>a-b).forEach(n=>{const o=document.createElement("option");o.value=n;o.textContent="ป้าย "+n;sel.appendChild(o)});sel.value=current;
  }
  function renderQuestions(){
    const term=$("questionSearch").value.trim().toLowerCase(),sf=$("signFilter").value;
    const list=questions.filter(q=>(!sf||String(q.sign_number)===sf)&&(!term||[q.sign_number,q.sign_title,q.question_text].join(" ").toLowerCase().includes(term)));
    const tb=$("questionsTableBody");
    if(!list.length){tb.innerHTML='<tr><td colspan="6" class="empty-cell">ไม่พบข้อสอบ</td></tr>';return}
    tb.innerHTML=list.map(q=>`<tr>
      <td><strong>${q.sign_number}</strong></td><td>${q.question_no}</td>
      <td><span class="question-title">${safe(q.sign_title)}</span><span class="question-preview">${safe(q.question_text)}</span></td>
      <td><span class="badge gold">${({A:"ก",B:"ข",C:"ค",D:"ง"})[q.correct_option]||q.correct_option}</span></td>
      <td>${q.active?'<span class="badge green">ใช้งาน</span>':'<span class="badge red">ปิด</span>'}</td>
      <td><button class="row-btn edit-question" data-id="${q.id}">แก้ไข</button></td></tr>`).join("");
  }
  $("questionSearch")?.addEventListener("input",renderQuestions);$("signFilter")?.addEventListener("change",renderQuestions);
  $("refreshQuestionsBtn")?.addEventListener("click",()=>loadQuestions().catch(e=>toast(e.message,"error")));
  $("questionsTableBody")?.addEventListener("click",e=>{
    const b=e.target.closest(".edit-question");if(!b)return;const q=questions.find(x=>String(x.id)===b.dataset.id);if(!q)return;
    $("qId").value=q.id;$("qSignTitle").value=q.sign_title;$("qText").value=q.question_text;$("qA").value=q.option_a;$("qB").value=q.option_b;$("qC").value=q.option_c;$("qD").value=q.option_d;$("qCorrect").value=q.correct_option;$("qActive").checked=!!q.active;
    $("questionModalTitle").textContent=`ป้าย ${q.sign_number} · ข้อ ${q.question_no}`;show($("questionModal"),true);
  });
  $("questionForm")?.addEventListener("submit",async e=>{
    e.preventDefault();loading(true);
    try{
      const d=await arpc("hunt_admin_save_question",{p_question_id:Number($("qId").value),p_sign_title:$("qSignTitle").value.trim(),p_question_text:$("qText").value.trim(),p_option_a:$("qA").value.trim(),p_option_b:$("qB").value.trim(),p_option_c:$("qC").value.trim(),p_option_d:$("qD").value.trim(),p_correct_option:$("qCorrect").value,p_active:$("qActive").checked});
      if(!d?.ok)throw new Error(d?.message||"บันทึกไม่สำเร็จ");toast("บันทึกข้อสอบแล้ว");show($("questionModal"),false);await loadQuestions();await loadDashboard();
    }catch(err){toast(err.message,"error")}finally{loading(false)}
  });

  async function loadResults(reset=false){
    if(reset){resultOffset=0;results=[]}
    const d=await arpc("hunt_admin_list_results",{p_search:$("resultSearch").value.trim(),p_status:$("resultStatusFilter").value,p_limit:200,p_offset:resultOffset});
    if(!d?.ok)throw new Error(d?.message||"โหลดผลไม่สำเร็จ");
    results=reset?d.items:[...results,...d.items];resultOffset=results.length;renderResults(d.total);
  }
  function renderResults(total){
    const tb=$("resultsTableBody");
    if(!results.length){tb.innerHTML='<tr><td colspan="7" class="empty-cell">ยังไม่มีผลการเล่น</td></tr>'}
    else tb.innerHTML=results.map(r=>`<tr>
      <td><strong>${safe(r.full_name)}</strong><br><span style="color:#6f889a">${safe(r.student_code)}</span></td><td>${safe(r.class_name||"-")}</td>
      <td><strong>${r.correct_count}/25</strong></td><td>${r.total_attempts}</td><td>${statusBadge(r.status)}</td><td>${fmtDate(r.started_at)}</td>
      <td><button class="row-btn danger reset-player" data-code="${safe(r.student_code)}" data-name="${safe(r.full_name)}">รีเซ็ต</button></td></tr>`).join("");
    $("resultCountLabel").textContent=`แสดง ${results.length} จาก ${total} รายการ`;show($("loadMoreResultsBtn"),results.length<total);
  }
  let resultTimer;
  $("resultSearch")?.addEventListener("input",()=>{clearTimeout(resultTimer);resultTimer=setTimeout(()=>loadResults(true).catch(e=>toast(e.message,"error")),300)});
  $("resultStatusFilter")?.addEventListener("change",()=>loadResults(true).catch(e=>toast(e.message,"error")));
  $("refreshResultsBtn")?.addEventListener("click",()=>loadResults(true).catch(e=>toast(e.message,"error")));
  $("loadMoreResultsBtn")?.addEventListener("click",()=>loadResults(false).catch(e=>toast(e.message,"error")));
  $("resultsTableBody")?.addEventListener("click",e=>{
    const b=e.target.closest(".reset-player");if(!b)return;
    openConfirm("รีเซ็ตผู้เล่น",`ต้องการรีเซ็ต ${b.dataset.name} (${b.dataset.code}) ใช่หรือไม่? ประวัติการเล่นรอบนี้จะถูกลบและนักเรียนจะเล่นใหม่ได้`,async()=>{
      loading(true);try{const d=await arpc("hunt_admin_reset_student",{p_student_code:b.dataset.code});if(!d?.ok)throw new Error(d?.message||"รีเซ็ตไม่สำเร็จ");toast("รีเซ็ตผู้เล่นแล้ว");await loadResults(true);await loadDashboard()}catch(err){toast(err.message,"error")}finally{loading(false)}
    });
  });
  $("exportResultsBtn")?.addEventListener("click",()=>{
    const h=["student_code","full_name","class_name","correct_count","total_attempts","status","started_at","finished_at"];
    const lines=[h.join(","),...results.map(r=>h.map(k=>escCSV(r[k])).join(","))];
    const blob=new Blob(["\uFEFF"+lines.join("\n")],{type:"text/csv;charset=utf-8"}),a=document.createElement("a");
    a.href=URL.createObjectURL(blob);a.download="treasure-hunt-results.csv";a.click();URL.revokeObjectURL(a.href);
  });

  $("changePasswordForm")?.addEventListener("submit",async e=>{
    e.preventDefault();show($("settingsMessage"),false);
    const cur=$("currentPassword").value,nw=$("newPassword").value,cf=$("confirmPassword").value;
    if(nw!==cf){msg($("settingsMessage"),"รหัสผ่านใหม่ไม่ตรงกัน");return}
    loading(true);try{
      const d=await arpc("hunt_admin_change_password",{p_current_password:cur,p_new_password:nw});
      if(!d?.ok)throw new Error(d?.message||"เปลี่ยนรหัสผ่านไม่สำเร็จ");
      msg($("settingsMessage"),"เปลี่ยนรหัสผ่านเรียบร้อย",true);e.target.reset();
    }catch(err){msg($("settingsMessage"),err.message)}finally{loading(false)}
  });

  function openConfirm(title,text,fn){$("confirmTitle").textContent=title;$("confirmText").textContent=text;confirmAction=fn;show($("confirmModal"),true)}
  $("confirmCancelBtn")?.addEventListener("click",()=>{confirmAction=null;show($("confirmModal"),false)});
  $("confirmOkBtn")?.addEventListener("click",async()=>{const fn=confirmAction;confirmAction=null;show($("confirmModal"),false);if(fn)await fn()});
  document.querySelectorAll("[data-close]").forEach(b=>b.addEventListener("click",()=>show($(b.dataset.close),false)));

  function logoutLocal(){adminToken="";sessionStorage.removeItem("treasure_admin_token");show(app,false);show(loginView,true)}
  $("logoutBtn")?.addEventListener("click",async()=>{try{if(adminToken)await arpc("hunt_admin_logout")}catch{}logoutLocal()});

  if(window.TREASURE_CONFIG_ERROR){msg(loginMsg,"ยังไม่ได้ตั้งค่า Supabase ในไฟล์ config.js")}
  else validateSession().then(ok=>{if(ok){show(loginView,false);show(app,true)}else logoutLocal()});
})();
