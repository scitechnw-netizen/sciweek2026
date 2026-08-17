(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const els = {
    configError:$('configError'), closed:$('gameClosedView'), closedMessage:$('gameClosedMessage'), checkOpen:$('checkGameOpenBtn'), landing:$('landingView'), lookupForm:$('lookupForm'),
    studentCode:$('studentCode'), lookupBtn:$('lookupBtn'), lookupResult:$('lookupResult'),
    lookupMessage:$('lookupMessage'), studentName:$('studentName'), studentClass:$('studentClass'),
    startBtn:$('startGameBtn'), game:$('gameView'), gameName:$('gameStudentName'),
    gameClass:$('gameStudentClass'), correct:$('correctCount'), progress:$('progressBar'),
    roundStat:$('roundStat'), attempts:$('attemptStat'), chestStatus:$('chestStatus'),
    chestLabel:$('chestLabel'), finishEarly:$('finishEarlyBtn'), missionCounter:$('missionCounter'),
    signNumber:$('signNumber'), questionNumber:$('questionNumber'), answerGrid:$('answerGrid'),
    feedback:$('answerFeedback'), attemptWarning:$('attemptWarning'),
    selectedAnswerText:$('selectedAnswerText'), submitAnswerBtn:$('submitAnswerBtn'),
    options:{A:$('optionA'),B:$('optionB'),C:$('optionC'),D:$('optionD')},
    locked:$('lockedView'), lockedSign:$('lockedSignNumber'), lockedQuestion:$('lockedQuestionNumber'), retryUnlock:$('retryUnlockBtn'),
    complete:$('completeView'), completeTitle:$('completeTitle'), completeText:$('completeText'),
    finalCorrect:$('finalCorrect'), finalPrize:$('finalPrize'), clearLocal:$('clearLocalBtn'),
    milestone:$('milestoneModal'), continueBtn:$('continueBtn'), finishAt10:$('finishAt10Btn'),
    toast:$('toast'), loading:$('loadingOverlay')
  };

  const OPTION_LABEL = {A:'ก', B:'ข', C:'ค', D:'ง'};
  let pendingStudent = null;
  let sessionToken = localStorage.getItem('treasure_session_token') || '';
  let busy = false;
  let selectedOption = '';
  let currentState = null;
  let gameClosed = false;

  function show(el, yes=true){ if (!el) return; el.classList.toggle('hidden', !yes); }
  function loading(yes){ show(els.loading, yes); }
  function message(el, text, type='error'){
    el.textContent = text;
    el.className = 'inline-alert ' + (type === 'success' ? 'success' : '');
    show(el, true);
  }
  function toast(text, type='success'){
    els.toast.textContent = text;
    els.toast.className = 'toast ' + type;
    show(els.toast,true);
    clearTimeout(toast.t);
    toast.t=setTimeout(()=>show(els.toast,false),2600);
  }
  function safeText(v){ return v == null ? '' : String(v); }
  function pretty(v){
    return safeText(v)
      .replace(/\$\\text\{CO\}\\_2\$/g,'CO₂')
      .replace(/\$\\text\{CH\}\\_4\$/g,'CH₄')
      .replace(/\$\\text\{N\}\\_2\\text\{O\}\$/g,'N₂O')
      .replace(/\$\\text\{O\}\\_2\$/g,'O₂')
      .replace(/\$\\Omega\$/g,'Ω')
      .replace(/\$E = mc\^2\$/g,'E = mc²')
      .replace(/\$F = ma\$/g,'F = ma')
      .replace(/\$V = IR\$/g,'V = IR')
      .replace(/\$P = IV\$/g,'P = IV')
      .replace(/\$\\pi\$/g,'π')
      .replace(/\$\\rightarrow\$/g,'→');
  }
  async function rpc(name,args={}){
    if (!window.treasureDB) throw new Error('ยังไม่ได้ตั้งค่า Supabase');
    const {data,error}=await window.treasureDB.rpc(name,args);
    if(error) throw new Error(error.message || 'เชื่อมต่อฐานข้อมูลไม่สำเร็จ');
    return data;
  }
  function normalizeState(data){ return data && data.state ? data.state : data; }

  function isFinishedState(s){ return s?.status === 'finished_small' || s?.status === 'finished_big'; }

  function renderGameClosed(text='ปิดการเล่นเกมประจำวัน มาเริ่มเล่นใหม่วันหลังจ้า'){
    gameClosed = true;
    show(els.landing,false); show(els.game,false); show(els.locked,false); show(els.complete,false); show(els.milestone,false);
    if(els.closedMessage) els.closedMessage.textContent = text || 'ปิดการเล่นเกมประจำวัน มาเริ่มเล่นใหม่วันหลังจ้า';
    show(els.closed,true);
  }

  async function checkGameAvailability({resumeWhenOpen=false,silent=false}={}){
    try{
      const d=await rpc('hunt_game_status');
      if(d?.ok === false) return false;
      if(d?.game_open === false){
        if(!isFinishedState(currentState)) renderGameClosed(d.message);
        return false;
      }
      gameClosed=false;
      if(resumeWhenOpen && els.closed && !els.closed.classList.contains('hidden')){
        show(els.closed,false);
        if(sessionToken) await restore();
        else show(els.landing,true);
        if(!silent) toast('เปิดการเล่นเกมแล้ว เล่นต่อได้เลย');
      }
      return true;
    }catch(e){
      if(!silent) toast(e.message,'error');
      return null;
    }
  }

  function resetAnswerSelection(){
    selectedOption = '';
    els.answerGrid?.querySelectorAll('.answer-btn').forEach(btn=>{
      btn.classList.remove('selected','wrong','correct');
      btn.disabled = false;
    });
    if(els.submitAnswerBtn) els.submitAnswerBtn.disabled = true;
    if(els.selectedAnswerText) els.selectedAnswerText.textContent = 'ยังไม่ได้เลือกคำตอบ';
  }

  function setFeedback(text,type){
    if(!els.feedback) return;
    els.feedback.textContent = text;
    els.feedback.className = 'answer-feedback ' + (type === 'good' ? 'good' : 'bad');
    show(els.feedback,true);
  }

  function renderAttemptWarning(current){
    const used = Number(current?.attempts || 0);
    if(used === 1){
      els.attemptWarning.textContent = '⚠️ ตอบผิดแล้ว 1 ครั้ง — คุณตอบได้อีกเพียง 1 ครั้งเท่านั้น';
      els.attemptWarning.className = 'attempt-warning danger';
      show(els.attemptWarning,true);
    }else{
      els.attemptWarning.textContent = '';
      show(els.attemptWarning,false);
    }
  }

  async function restore(){
    if(!sessionToken) return;
    try{
      loading(true);
      const data=await rpc('hunt_get_state',{p_token:sessionToken});
      if(data && data.ok === false) throw new Error(data.message || 'ไม่พบเซสชัน');
      const state=normalizeState(data);
      currentState=state;
      if(state?.game_open === false && !isFinishedState(state)) renderGameClosed(state.game_closed_message);
      else renderState(state);
    }catch(e){
      localStorage.removeItem('treasure_session_token');
      sessionToken='';
      show(els.closed,false); show(els.landing,true); show(els.game,false); show(els.locked,false); show(els.complete,false);
    }finally{loading(false)}
  }

  function renderState(s){
    if(!s) return;
    currentState=s;
    if(s.game_open === false && !isFinishedState(s)){ renderGameClosed(s.game_closed_message); return; }
    gameClosed=false; show(els.closed,false);
    show(els.landing,false);
    show(els.feedback,false);
    show(els.milestone,false);

    if(s.status === 'locked'){
      renderLocked(s);
      return;
    }
    if(s.status==='finished_small' || s.status==='finished_big'){
      renderComplete(s);
      return;
    }

    show(els.locked,false);
    show(els.game,true);
    show(els.complete,false);
    els.gameName.textContent=s.student_name || '-';
    els.gameClass.textContent=s.class_name || '';
    const c=Number(s.correct_count||0), round=Number(s.current_round||Math.min(c+1,25));
    els.correct.textContent=c;
    els.progress.style.width=Math.min(100,(c/25)*100)+'%';
    els.roundStat.textContent=Math.min(round,25)+'/25';
    els.attempts.textContent=Number(s.total_attempts||0);
    els.missionCounter.textContent='MISSION '+String(Math.min(round,25)).padStart(2,'0')+' / 25';

    if(c>=10){
      els.chestStatus.classList.remove('locked'); els.chestStatus.classList.add('unlocked');
      els.chestLabel.textContent='ปลดล็อกแล้ว';
      show(els.finishEarly, s.status==='playing');
    }else{
      els.chestStatus.classList.add('locked'); els.chestStatus.classList.remove('unlocked');
      els.chestLabel.textContent='อีก '+(10-c)+' ข้อเพื่อปลดล็อก';
      show(els.finishEarly,false);
    }

    if(s.status==='milestone'){
      show(els.milestone,true);
      return;
    }

    if(s.current){
      els.signNumber.textContent=s.current.sign_number;
      els.questionNumber.textContent=s.current.question_no || '-';
      ['A','B','C','D'].forEach(k=>els.options[k].textContent=pretty(s.current.options[k]));
      resetAnswerSelection();
      renderAttemptWarning(s.current);
    }
  }

  function renderLocked(s){
    show(els.game,false);
    show(els.complete,false);
    show(els.milestone,false);
    show(els.locked,true);
    els.lockedSign.textContent=s.current?.sign_number ?? '-';
    els.lockedQuestion.textContent=s.current?.question_no ?? '-';
  }

  function renderComplete(s){
    show(els.closed,false); show(els.landing,false); show(els.game,false); show(els.locked,false); show(els.milestone,false); show(els.complete,true);
    const big=s.status==='finished_big';
    els.completeTitle.textContent=big ? 'พิชิตรางวัลใหญ่สำเร็จ!' : 'ยินดีด้วย!';
    els.completeText.textContent=big
      ? 'คุณตอบคำถามครบ 25 ข้อ และทำภารกิจตามล่าหาสมบัติสำเร็จ'
      : 'คุณปลดล็อกหีบสมบัติและเลือกจบภารกิจเรียบร้อยแล้ว';
    els.finalCorrect.textContent=s.correct_count || 0;
    els.finalPrize.textContent=big ? 'รางวัลใหญ่' : 'หีบสมบัติ';
  }

  els.lookupForm?.addEventListener('submit',async(e)=>{
    e.preventDefault(); if(busy) return;
    const code=els.studentCode.value.trim(); if(!code) return;
    busy=true; els.lookupBtn.disabled=true; show(els.lookupMessage,false); show(els.lookupResult,false);
    try{
      const data=await rpc('hunt_lookup_student',{p_student_code:code});
      if(data?.game_closed){ renderGameClosed(data.message); pendingStudent=null; return; }
      if(!data?.found){
        message(els.lookupMessage,data?.message||'ไม่พบรหัสนักเรียน');
        pendingStudent=null; return;
      }
      if(data.already_played){
        message(els.lookupMessage,'รหัสนี้เริ่มภารกิจไปแล้ว หากเป็นการเล่นค้างจากเครื่องเดิม ให้เปิดหน้าเดิมอีกครั้ง หรือติดต่อผู้ดูแลระบบ');
        pendingStudent=null; return;
      }
      pendingStudent={code,full_name:data.full_name,class_name:data.class_name||''};
      els.studentName.textContent=data.full_name; els.studentClass.textContent=data.class_name||'';
      show(els.lookupResult,true);
    }catch(err){message(els.lookupMessage,err.message)}
    finally{busy=false; els.lookupBtn.disabled=false}
  });

  els.startBtn?.addEventListener('click',async()=>{
    if(!pendingStudent || busy) return;
    busy=true; loading(true);
    try{
      const data=await rpc('hunt_start_game',{p_student_code:pendingStudent.code});
      if(data?.game_closed){ renderGameClosed(data.message); return; }
      if(!data?.ok) throw new Error(data?.message||'เริ่มเกมไม่สำเร็จ');
      sessionToken=data.token; localStorage.setItem('treasure_session_token',sessionToken);
      renderState(data.state);
    }catch(err){message(els.lookupMessage,err.message)}
    finally{busy=false;loading(false)}
  });

  // เลือกคำตอบก่อน ยังไม่ส่งทันที
  els.answerGrid?.addEventListener('click',(e)=>{
    const btn=e.target.closest('.answer-btn');
    if(!btn || busy || !sessionToken || btn.disabled) return;
    selectedOption=btn.dataset.option;
    els.answerGrid.querySelectorAll('.answer-btn').forEach(b=>b.classList.toggle('selected',b===btn));
    els.selectedAnswerText.textContent='เลือกคำตอบ '+OPTION_LABEL[selectedOption]+' แล้ว';
    els.submitAnswerBtn.disabled=false;
    show(els.feedback,false);
  });

  // ส่งคำตอบเมื่อผู้เล่นยืนยันแล้วเท่านั้น
  els.submitAnswerBtn?.addEventListener('click',async()=>{
    if(!selectedOption || busy || !sessionToken) return;
    busy=true;
    const option=selectedOption;
    const btn=els.answerGrid.querySelector(`.answer-btn[data-option="${option}"]`);
    els.answerGrid.querySelectorAll('.answer-btn').forEach(b=>b.disabled=true);
    els.submitAnswerBtn.disabled=true;
    show(els.feedback,false);

    try{
      const data=await rpc('hunt_submit_answer',{p_token:sessionToken,p_option:option});
      if(data?.game_closed){ renderGameClosed(data.message); return; }
      if(!data?.ok) throw new Error(data?.message||'ส่งคำตอบไม่สำเร็จ');

      if(data.correct){
        btn?.classList.add('correct');
        setFeedback('✓ ตอบถูกต้อง! กำลังเปิดภารกิจถัดไป...','good');
        setTimeout(()=>renderState(data.state),750);
      }else if(data.locked || data.state?.status === 'locked'){
        btn?.classList.add('wrong');
        setFeedback('✕ ตอบผิดครั้งที่ 2 — ระบบล็อกภารกิจแล้ว','bad');
        setTimeout(()=>renderState(data.state),900);
      }else{
        renderState(data.state);
        const wrongBtn=els.answerGrid.querySelector(`.answer-btn[data-option="${option}"]`);
        wrongBtn?.classList.add('wrong');
        setFeedback('✕ คำตอบไม่ถูกต้อง — คุณตอบได้อีกเพียง 1 ครั้ง','bad');
        setTimeout(()=>wrongBtn?.classList.remove('wrong'),600);
      }
    }catch(err){
      toast(err.message,'error');
      els.answerGrid.querySelectorAll('.answer-btn').forEach(b=>b.disabled=false);
      els.submitAnswerBtn.disabled=!selectedOption;
    }finally{
      busy=false;
    }
  });

  els.retryUnlock?.addEventListener('click',async()=>{
    if(busy || !sessionToken) return;
    busy=true; loading(true);
    try{
      const d=await rpc('hunt_get_state',{p_token:sessionToken});
      if(d?.ok===false) throw new Error(d?.message||'ตรวจสอบสถานะไม่สำเร็จ');
      const state=normalizeState(d);
      renderState(state);
      if(state?.status==='locked') toast('ยังไม่ได้ปลดล็อก กรุณาติดต่อผู้ดูแลระบบ','error');
      else toast('ปลดล็อกแล้ว เล่นต่อได้เลย');
    }catch(e){toast(e.message,'error')}finally{busy=false;loading(false)}
  });

  els.continueBtn?.addEventListener('click',async()=>{
    if(busy)return; busy=true; loading(true);
    try{const d=await rpc('hunt_continue',{p_token:sessionToken}); if(d?.game_closed){renderGameClosed(d.message);return} if(!d?.ok)throw new Error(d?.message||'ดำเนินการไม่ได้'); renderState(d.state)}
    catch(e){toast(e.message,'error')}finally{busy=false;loading(false)}
  });

  async function finishGame(){
    if(busy)return; busy=true; loading(true);
    try{const d=await rpc('hunt_finish_game',{p_token:sessionToken}); if(d?.game_closed){renderGameClosed(d.message);return} if(!d?.ok)throw new Error(d?.message||'จบเกมไม่ได้'); renderState(d.state)}
    catch(e){toast(e.message,'error')}finally{busy=false;loading(false)}
  }
  els.finishAt10?.addEventListener('click',finishGame);
  els.finishEarly?.addEventListener('click',()=>{
    if(confirm('ยืนยันจบภารกิจตอนนี้หรือไม่? เมื่อจบแล้วจะไม่สามารถกลับมาเล่นต่อได้')) finishGame();
  });
  els.clearLocal?.addEventListener('click',()=>{
    localStorage.removeItem('treasure_session_token'); sessionToken=''; location.href='./index.html';
  });

  els.checkOpen?.addEventListener('click',async()=>{
    if(busy)return;busy=true;loading(true);
    try{
      const open=await checkGameAvailability({resumeWhenOpen:true});
      if(open===false) toast('วันนี้ยังปิดการเล่นเกมอยู่นะ มาใหม่วันหลังจ้า','error');
    }finally{busy=false;loading(false)}
  });

  async function initialAvailability(){
    if(sessionToken){ await restore(); return; }
    const open=await checkGameAvailability({silent:true});
    if(open!==false) show(els.landing,true);
  }

  // ตรวจสถานะเปิด/ปิดเป็นระยะ เพื่อให้ผู้เล่นที่เปิดหน้าเกมค้างอยู่ได้รับแจ้งเตือนด้วย
  setInterval(()=>{
    if(document.hidden || busy || window.TREASURE_CONFIG_ERROR) return;
    checkGameAvailability({resumeWhenOpen:true,silent:true});
  },10000);
  document.addEventListener('visibilitychange',()=>{
    if(!document.hidden && !busy && !window.TREASURE_CONFIG_ERROR) checkGameAvailability({resumeWhenOpen:true,silent:true});
  });

  if(window.TREASURE_CONFIG_ERROR){
    show(els.configError,true); show(els.landing,false);
  }else{
    initialAvailability();
  }
})();
