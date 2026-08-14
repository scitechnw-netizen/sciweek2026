(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const els = {
    configError:$("configError"), landing:$("landingView"), lookupForm:$("lookupForm"),
    studentCode:$("studentCode"), lookupBtn:$("lookupBtn"), lookupResult:$("lookupResult"),
    lookupMessage:$("lookupMessage"), studentName:$("studentName"), studentClass:$("studentClass"),
    startBtn:$("startGameBtn"), game:$("gameView"), gameName:$("gameStudentName"),
    gameClass:$("gameStudentClass"), correct:$("correctCount"), progress:$("progressBar"),
    roundStat:$("roundStat"), attempts:$("attemptStat"), chestStatus:$("chestStatus"),
    chestLabel:$("chestLabel"), finishEarly:$("finishEarlyBtn"), missionCounter:$("missionCounter"),
    signNumber:$("signNumber"), answerGrid:$("answerGrid"), feedback:$("answerFeedback"),
    options:{A:$("optionA"),B:$("optionB"),C:$("optionC"),D:$("optionD")},
    complete:$("completeView"), completeTitle:$("completeTitle"), completeText:$("completeText"),
    finalCorrect:$("finalCorrect"), finalPrize:$("finalPrize"), clearLocal:$("clearLocalBtn"),
    milestone:$("milestoneModal"), continueBtn:$("continueBtn"), finishAt10:$("finishAt10Btn"),
    toast:$("toast"), loading:$("loadingOverlay")
  };

  let pendingStudent = null;
  let sessionToken = localStorage.getItem("treasure_session_token") || "";
  let busy = false;

  function show(el, yes=true){ if (!el) return; el.classList.toggle("hidden", !yes); }
  function loading(yes){ show(els.loading, yes); }
  function message(el, text, type="error"){
    el.textContent = text; el.className = "inline-alert " + (type === "success" ? "success" : "");
    show(el, true);
  }
  function toast(text, type="success"){
    els.toast.textContent = text; els.toast.className = "toast " + type; show(els.toast,true);
    clearTimeout(toast.t); toast.t=setTimeout(()=>show(els.toast,false),2600);
  }
  function safeText(v){ return v == null ? "" : String(v); }
  function pretty(v){
    return safeText(v)
      .replace(/\$\\text\{CO\}\\_2\$/g,"CO₂")
      .replace(/\$\\text\{CH\}\\_4\$/g,"CH₄")
      .replace(/\$\\text\{N\}\\_2\\text\{O\}\$/g,"N₂O")
      .replace(/\$\\text\{O\}\\_2\$/g,"O₂")
      .replace(/\$\\Omega\$/g,"Ω")
      .replace(/\$E = mc\^2\$/g,"E = mc²")
      .replace(/\$F = ma\$/g,"F = ma")
      .replace(/\$V = IR\$/g,"V = IR")
      .replace(/\$P = IV\$/g,"P = IV")
      .replace(/\$\\pi\$/g,"π")
      .replace(/\$\\rightarrow\$/g,"→");
  }
  async function rpc(name,args={}){
    if (!window.treasureDB) throw new Error("ยังไม่ได้ตั้งค่า Supabase");
    const {data,error}=await window.treasureDB.rpc(name,args);
    if(error) throw new Error(error.message || "เชื่อมต่อฐานข้อมูลไม่สำเร็จ");
    return data;
  }
  function normalizeState(data){ return data && data.state ? data.state : data; }

  async function restore(){
    if(!sessionToken) return;
    try{
      loading(true);
      const data=await rpc("hunt_get_state",{p_token:sessionToken});
      if(data && data.ok === false) throw new Error(data.message || "ไม่พบเซสชัน");
      renderState(normalizeState(data));
    }catch(e){
      localStorage.removeItem("treasure_session_token"); sessionToken="";
      show(els.landing,true); show(els.game,false); show(els.complete,false);
    }finally{loading(false)}
  }

  function renderState(s){
    if(!s) return;
    show(els.landing,false);
    if(s.status==="finished_small" || s.status==="finished_big"){
      renderComplete(s); return;
    }
    show(els.game,true); show(els.complete,false);
    els.gameName.textContent=s.student_name || "-";
    els.gameClass.textContent=s.class_name || "";
    const c=Number(s.correct_count||0), round=Number(s.current_round||Math.min(c+1,25));
    els.correct.textContent=c;
    els.progress.style.width=Math.min(100,(c/25)*100)+"%";
    els.roundStat.textContent=Math.min(round,25)+"/25";
    els.attempts.textContent=Number(s.total_attempts||0);
    els.missionCounter.textContent="MISSION "+String(Math.min(round,25)).padStart(2,"0")+" / 25";
    if(c>=10){
      els.chestStatus.classList.remove("locked"); els.chestStatus.classList.add("unlocked");
      els.chestLabel.textContent="ปลดล็อกแล้ว";
      show(els.finishEarly, s.status==="playing");
    }else{
      els.chestStatus.classList.add("locked"); els.chestStatus.classList.remove("unlocked");
      els.chestLabel.textContent="อีก "+(10-c)+" ข้อเพื่อปลดล็อก";
      show(els.finishEarly,false);
    }
    if(s.status==="milestone"){
      show(els.milestone,true); return;
    }
    show(els.milestone,false);
    if(s.current){
      els.signNumber.textContent=s.current.sign_number;
      ["A","B","C","D"].forEach(k=>els.options[k].textContent=pretty(s.current.options[k]));
    }
  }

  function renderComplete(s){
    show(els.landing,false); show(els.game,false); show(els.milestone,false); show(els.complete,true);
    const big=s.status==="finished_big";
    els.completeTitle.textContent=big ? "พิชิตรางวัลใหญ่สำเร็จ!" : "ยินดีด้วย!";
    els.completeText.textContent=big
      ? "คุณตอบคำถามครบ 25 ข้อ และทำภารกิจตามล่าหาสมบัติสำเร็จ"
      : "คุณปลดล็อกหีบสมบัติและเลือกจบภารกิจเรียบร้อยแล้ว";
    els.finalCorrect.textContent=s.correct_count || 0;
    els.finalPrize.textContent=big ? "รางวัลใหญ่" : "หีบสมบัติ";
  }

  els.lookupForm?.addEventListener("submit",async(e)=>{
    e.preventDefault(); if(busy) return;
    const code=els.studentCode.value.trim(); if(!code) return;
    busy=true; els.lookupBtn.disabled=true; show(els.lookupMessage,false); show(els.lookupResult,false);
    try{
      const data=await rpc("hunt_lookup_student",{p_student_code:code});
      if(!data?.found){
        message(els.lookupMessage,data?.message||"ไม่พบรหัสนักเรียน");
        pendingStudent=null; return;
      }
      if(data.already_played){
        message(els.lookupMessage,"รหัสนี้เริ่มภารกิจไปแล้ว หากเป็นการเล่นค้างจากเครื่องเดิม ให้เปิดหน้าเดิมอีกครั้ง หรือติดต่อผู้ดูแลระบบ");
        pendingStudent=null; return;
      }
      pendingStudent={code,full_name:data.full_name,class_name:data.class_name||""};
      els.studentName.textContent=data.full_name; els.studentClass.textContent=data.class_name||"";
      show(els.lookupResult,true);
    }catch(err){message(els.lookupMessage,err.message)}
    finally{busy=false; els.lookupBtn.disabled=false}
  });

  els.startBtn?.addEventListener("click",async()=>{
    if(!pendingStudent || busy) return;
    busy=true; loading(true);
    try{
      const data=await rpc("hunt_start_game",{p_student_code:pendingStudent.code});
      if(!data?.ok) throw new Error(data?.message||"เริ่มเกมไม่สำเร็จ");
      sessionToken=data.token; localStorage.setItem("treasure_session_token",sessionToken);
      renderState(data.state);
    }catch(err){message(els.lookupMessage,err.message)}
    finally{busy=false;loading(false)}
  });

  els.answerGrid?.addEventListener("click",async(e)=>{
    const btn=e.target.closest(".answer-btn"); if(!btn || busy || !sessionToken) return;
    busy=true; [...els.answerGrid.querySelectorAll(".answer-btn")].forEach(b=>b.disabled=true);
    show(els.feedback,false);
    try{
      const option=btn.dataset.option;
      const data=await rpc("hunt_submit_answer",{p_token:sessionToken,p_option:option});
      if(!data?.ok) throw new Error(data?.message||"ส่งคำตอบไม่สำเร็จ");
      if(data.correct){
        btn.classList.add("correct");
        els.feedback.textContent="ถูกต้อง! กำลังเปิดภารกิจถัดไป...";
        els.feedback.className="answer-feedback good"; show(els.feedback,true);
        setTimeout(()=>{ btn.classList.remove("correct"); show(els.feedback,false); renderState(data.state); },600);
      }else{
        btn.classList.add("wrong");
        els.feedback.textContent="ยังไม่ถูก ลองตรวจคำถามบนป้ายอีกครั้ง";
        els.feedback.className="answer-feedback bad"; show(els.feedback,true);
        setTimeout(()=>btn.classList.remove("wrong"),500);
        renderState(data.state);
      }
    }catch(err){toast(err.message,"error")}
    finally{busy=false; [...els.answerGrid.querySelectorAll(".answer-btn")].forEach(b=>b.disabled=false)}
  });

  els.continueBtn?.addEventListener("click",async()=>{
    if(busy)return; busy=true; loading(true);
    try{const d=await rpc("hunt_continue",{p_token:sessionToken}); if(!d?.ok)throw new Error(d?.message||"ดำเนินการไม่ได้"); renderState(d.state)}
    catch(e){toast(e.message,"error")}finally{busy=false;loading(false)}
  });
  async function finishGame(){
    if(busy)return; busy=true; loading(true);
    try{const d=await rpc("hunt_finish_game",{p_token:sessionToken}); if(!d?.ok)throw new Error(d?.message||"จบเกมไม่ได้"); renderState(d.state)}
    catch(e){toast(e.message,"error")}finally{busy=false;loading(false)}
  }
  els.finishAt10?.addEventListener("click",finishGame);
  els.finishEarly?.addEventListener("click",()=>{
    if(confirm("ยืนยันจบภารกิจตอนนี้หรือไม่? เมื่อจบแล้วจะไม่สามารถกลับมาเล่นต่อได้")) finishGame();
  });
  els.clearLocal?.addEventListener("click",()=>{
    localStorage.removeItem("treasure_session_token"); sessionToken=""; location.href="./index.html";
  });

  if(window.TREASURE_CONFIG_ERROR){
    show(els.configError,true); show(els.landing,false);
  }else{
    restore();
  }
})();
