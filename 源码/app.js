/* 未名岛 · private, offline, and yours. Everything stays in this browser. */
(() => {
  'use strict';
  const KEY = 'weiming-island-v1';
  const MAX_TEXT = 100000;
  const $ = id => document.getElementById(id);
  const $$ = selector => Array.from(document.querySelectorAll(selector));
  const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
  const uid = () => window.crypto && crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  const localDate = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  const shiftedDate = (key, offset) => { const date = new Date(`${key}T12:00:00`); date.setDate(date.getDate() + offset); return localDate(date); };
  const validDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T12:00:00`).getTime()) && localDate(new Date(`${value}T12:00:00`)) === value;
  let state;
  let journalDate = localDate();
  let journalSave = null;
  let toastTimeout = null;
  let timerNotice = '每完成一次专注，岛上就多一份生机。';
  let breathingFrame = null;
  let storageWarned = false;
  let storageHealthy = true;
  let storageLocked = false;
  let currentView = 'home';
  let sceneProgress = null;
  let renderedDay = localDate();
  let lastStorageRaw = null;
  let journalRemoteCopy = null;
  let lastConflictRaw = null;
  const defaults = () => ({
    version: 1, name: '未名岛', duration: 25, breakDuration: 5,
    weather: 'clear', night: true, volume: 0.42,
    reducedMotion: Boolean(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches),
    tasks: [], journals: {}, sessions: [],
    timer: { mode: 'work', duration: 1500, remaining: 1500, deadline: null, running: false }
  });

  function sanitize(raw, strict = false) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) || raw.version !== 1) throw new Error('文件版本不受支持。请选择本岛导出的备份。');
    if (strict) validateBackupState(raw);
    const clean = defaults();
    clean.name = typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim().slice(0, 18) : clean.name;
    clean.duration = Number.isFinite(raw.duration) ? Math.round(clamp(raw.duration, 5, 120)) : 25;
    clean.breakDuration = Number.isFinite(raw.breakDuration) ? Math.round(clamp(raw.breakDuration, 1, 60)) : 5;
    clean.weather = ['clear', 'rain', 'snow'].includes(raw.weather) ? raw.weather : 'clear';
    clean.night = raw.night === true;
    clean.reducedMotion = typeof raw.reducedMotion === 'boolean' ? raw.reducedMotion : clean.reducedMotion;
    clean.volume = Number.isFinite(raw.volume) ? clamp(raw.volume, 0, 1) : 0.42;
    const taskIds = new Set();
    clean.tasks = (Array.isArray(raw.tasks) ? raw.tasks : []).slice(0, 5000).filter(task => task && typeof task.text === 'string' && task.text.trim()).map(task => {
      let id = typeof task.id === 'string' && task.id.length <= 100 ? task.id : uid();
      if (taskIds.has(id)) id = uid();
      taskIds.add(id);
      return { id, text: task.text.slice(0, 240), done: task.done === true, createdAt: Number.isFinite(task.createdAt) ? task.createdAt : Date.now() };
    });
    clean.journals = {};
    if (raw.journals && typeof raw.journals === 'object' && !Array.isArray(raw.journals)) {
      Object.entries(raw.journals).slice(0, 10000).forEach(([date, value]) => { if (validDate(date) && typeof value === 'string') clean.journals[date] = value.slice(0, MAX_TEXT); });
    }
    const sessionIds = new Set();
    clean.sessions = (Array.isArray(raw.sessions) ? raw.sessions : []).slice(-100000).filter(item => item && validDate(item.date) && Number.isFinite(item.minutes) && item.minutes > 0 && item.minutes <= 120).map(item => {
      let id = typeof item.id === 'string' && item.id.length <= 100 ? item.id : uid();
      if (sessionIds.has(id)) return null;
      sessionIds.add(id);
      return { id, date: item.date, at: Number.isFinite(item.at) ? item.at : new Date(`${item.date}T12:00:00`).getTime(), minutes: Math.round(item.minutes * 10) / 10 };
    }).filter(Boolean);
    if (raw.timer && typeof raw.timer === 'object') {
      const source = raw.timer;
      const mode = source.mode === 'break' ? 'break' : 'work';
      const duration = Number.isFinite(source.duration) ? Math.round(clamp(source.duration, 1, 7200)) : (mode === 'work' ? clean.duration : clean.breakDuration) * 60;
      const running = source.running === true && Number.isFinite(source.deadline) && source.deadline > 0 && source.deadline < Date.now() + 7201 * 1000;
      clean.timer = { mode, duration, remaining: Number.isFinite(source.remaining) ? clamp(source.remaining, 0, duration) : duration, running, deadline: running ? source.deadline : null };
    }
    return clean;
  }

  function validateBackupState(raw) {
    const fail = () => { throw new Error('备份结构或数值不完整，原来的岛没有改变。'); };
    if (typeof raw.name !== 'string' || !raw.name.trim() || raw.name.length > 18 ||
        !Number.isInteger(raw.duration) || raw.duration < 5 || raw.duration > 120 ||
        !Number.isInteger(raw.breakDuration) || raw.breakDuration < 1 || raw.breakDuration > 60 ||
        !['clear', 'rain', 'snow'].includes(raw.weather) || typeof raw.night !== 'boolean' ||
        !Number.isFinite(raw.volume) || raw.volume < 0 || raw.volume > 1 ||
        !Array.isArray(raw.tasks) || raw.tasks.length > 5000 ||
        !Array.isArray(raw.sessions) || raw.sessions.length > 100000 ||
        !raw.journals || typeof raw.journals !== 'object' || Array.isArray(raw.journals) ||
        !raw.timer || typeof raw.timer !== 'object' || Array.isArray(raw.timer)) fail();
    if (raw.reducedMotion !== undefined && typeof raw.reducedMotion !== 'boolean') fail();
    const ids = new Set();
    raw.tasks.forEach(task => {
      if (!task || typeof task.id !== 'string' || !task.id || task.id.length > 100 || ids.has(task.id) ||
          typeof task.text !== 'string' || !task.text.trim() || task.text.length > 240 ||
          typeof task.done !== 'boolean' || !Number.isFinite(task.createdAt)) fail();
      ids.add(task.id);
    });
    const journals = Object.entries(raw.journals);
    if (journals.length > 10000 || journals.some(([date, value]) => !validDate(date) || typeof value !== 'string' || value.length > MAX_TEXT)) fail();
    ids.clear();
    raw.sessions.forEach(session => {
      if (!session || typeof session.id !== 'string' || !session.id || session.id.length > 100 || ids.has(session.id) ||
          !validDate(session.date) || !Number.isFinite(session.at) || !Number.isFinite(session.minutes) || session.minutes <= 0 || session.minutes > 120) fail();
      ids.add(session.id);
    });
    const timer = raw.timer;
    if (!['work', 'break'].includes(timer.mode) || !Number.isInteger(timer.duration) || timer.duration < 1 || timer.duration > 7200 ||
        !Number.isFinite(timer.remaining) || timer.remaining < 0 || timer.remaining > timer.duration || typeof timer.running !== 'boolean' ||
        (timer.running ? !Number.isFinite(timer.deadline) || timer.deadline <= 0 || timer.deadline > Date.now() + 7201000 : timer.deadline !== null)) fail();
  }

  function toast(message, undo) {
    const node = $('toast');
    if (!node) return;
    window.clearTimeout(toastTimeout);
    node.textContent = message;
    if (undo) {
      const action = document.createElement('button');
      action.type = 'button'; action.textContent = '撤销删除';
      action.addEventListener('click', () => { undo(); node.hidden = true; window.clearTimeout(toastTimeout); }, { once: true });
      node.append(action);
    }
    node.classList.add('visible');
    node.hidden = false;
    toastTimeout = window.setTimeout(() => { node.classList.remove('visible'); node.hidden = true; }, undo ? 8000 : 3800);
  }

  function persist() {
    try {
      if (storageLocked) throw new Error('recovery storage unavailable');
      const raw = JSON.stringify(state);
      localStorage.setItem(KEY, raw);
      lastStorageRaw = raw;
      storageHealthy = true;
      if ($('storage-status')) $('storage-status').textContent = '已保存在此浏览器';
      return true;
    } catch (_) {
      storageHealthy = false;
      if (!storageWarned) { toast(storageLocked ? '原存档无法安全备份，已暂停写入。请先导出当前记录。' : '浏览器存储不可用或已满。请导出备份，避免丢失。'); storageWarned = true; }
      if ($('storage-status')) $('storage-status').textContent = '尚未保存，请导出备份';
      return false;
    }
  }

  function load() {
    let saved = null;
    try {
      saved = localStorage.getItem(KEY);
      lastStorageRaw = saved;
      return saved ? sanitize(JSON.parse(saved)) : defaults();
    } catch (_) {
      storageHealthy = false;
      let recovered = false;
      if (saved) {
        try { localStorage.setItem(`${KEY}-recovery-${Date.now()}`, saved); recovered = true; }
        catch (_) { storageLocked = true; }
      }
      window.setTimeout(() => toast(recovered ? '原存档格式异常，原始内容已另存本地恢复副本。已打开一座新岛。' : storageLocked ? '原存档异常且无法备份，已暂停写入。请先导出当前记录。' : '浏览器存档无法读取。新记录请及时导出备份。'), 500);
      return defaults();
    }
  }

  function remainingSeconds() {
    return clamp(state.timer.running ? Math.ceil((state.timer.deadline - Date.now()) / 1000) : Math.ceil(state.timer.remaining), 0, state.timer.duration);
  }

  function renderTimer() {
    const remaining = remainingSeconds();
    if ($('timer-display')) $('timer-display').textContent = `${String(Math.floor(remaining / 60)).padStart(2, '0')}:${String(remaining % 60).padStart(2, '0')}`;
    if ($('timer-label')) $('timer-label').textContent = state.timer.mode === 'work' ? '把这一刻，留给一件事' : '休息一下，让风经过';
    if ($('timer-toggle')) {
      $('timer-toggle').textContent = state.timer.running ? '暂停片刻' : remaining < state.timer.duration ? (state.timer.mode === 'work' ? '继续专注' : '继续休息') : state.timer.mode === 'work' ? '开始专注' : '开始休息';
      $('timer-toggle').setAttribute('aria-label', state.timer.running ? '暂停计时' : '开始计时');
    }
    if ($('timer-notice')) { $('timer-notice').textContent = timerNotice; $('timer-notice').hidden = !timerNotice; }
    ['work', 'break'].forEach(mode => {
      const button = $(`timer-${mode}`);
      if (button) { button.classList.toggle('active', state.timer.mode === mode); button.setAttribute('aria-pressed', String(state.timer.mode === mode)); }
    });
    $$('#timer-presets [data-minutes]').forEach(button => {
      const selected = state.timer.mode === 'work' && Number(button.dataset.minutes) * 60 === state.timer.duration;
      button.classList.toggle('active', selected); button.setAttribute('aria-pressed', String(selected));
    });
    const progress = $('timer-progress');
    if (progress) {
      const fraction = state.timer.duration ? (state.timer.duration - remaining) / state.timer.duration : 0;
      if (progress.tagName.toLowerCase() === 'circle') {
        const length = 2 * Math.PI * Number(progress.getAttribute('r'));
        progress.style.strokeDasharray = `${length}`;
        progress.style.strokeDashoffset = `${length * (1 - fraction)}`;
      } else progress.style.setProperty('--progress', `${fraction * 100}%`);
    }
    document.title = `${state.timer.running ? `${String(Math.floor(remaining / 60)).padStart(2, '0')}:${String(remaining % 60).padStart(2, '0')} · ` : ''}${state.name}`;
  }

  function completeTimer() {
    // A different page may have paused, reset, or already completed this timer.
    if (storageHealthy && !storageLocked) {
      const shared = readSharedState();
      if (shared) {
        const local = state.timer;
        const remote = shared.state.timer;
        const sameTimer = local.mode === remote.mode && local.running === remote.running && local.deadline === remote.deadline && local.duration === remote.duration;
        if (shared.raw !== lastStorageRaw) receiveSharedState(shared.state, shared.raw);
        if (!sameTimer) return;
      }
    }
    const finished = state.timer;
    if (finished.mode === 'work') {
      const at = finished.deadline || Date.now();
      const id = `focus-${Math.round(at)}-${finished.duration}`;
      if (!state.sessions.some(session => session.id === id)) state.sessions.push({ id, date: localDate(new Date(at)), at, minutes: Math.round(finished.duration / 6) / 10 });
      timerNotice = '这一段专注，已经留在岛上。准备好再开始休息。';
      state.timer = { mode: 'break', duration: state.breakDuration * 60, remaining: state.breakDuration * 60, running: false, deadline: null };
    } else {
      timerNotice = '休息结束了。下一件事，慢慢来。';
      state.timer = { mode: 'work', duration: state.duration * 60, remaining: state.duration * 60, running: false, deadline: null };
    }
    persist(); renderTimer(); renderStats(); toast(finished.mode === 'work' ? '又一段专注，抵达了。' : '休息好了，随时出发。');
  }

  function tick() {
    if (state.timer.running && remainingSeconds() <= 0) completeTimer();
    else renderTimer();
    const today = localDate();
    if (today !== renderedDay) {
      const previous = renderedDay; renderedDay = today;
      flushJournal();
      if (journalDate === previous && document.activeElement !== $('journal-input')) { journalDate = today; renderJournal(); }
      if ($('journal-date')) $('journal-date').max = today;
      if ($('journal-next')) $('journal-next').disabled = journalDate >= today;
      renderStats(); renderPreview(); renderName();
    }
    if ($('current-date')) $('current-date').textContent = new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' }).format(new Date());
  }

  function toggleTimer() {
    if (state.timer.running && remainingSeconds() <= 0) { completeTimer(); return; }
    if (state.timer.running) { state.timer.remaining = remainingSeconds(); state.timer.running = false; state.timer.deadline = null; }
    else {
      if (state.timer.remaining <= 0) state.timer.remaining = state.timer.duration;
      state.timer.deadline = Date.now() + state.timer.remaining * 1000; state.timer.running = true; timerNotice = '';
    }
    persist(); renderTimer();
  }

  function switchTimer(mode, minutes) {
    if (state.timer.running && remainingSeconds() <= 0) completeTimer();
    state.timer = { mode, duration: minutes * 60, remaining: minutes * 60, deadline: null, running: false };
    timerNotice = ''; persist(); renderTimer();
  }

  function renderTasks(focusId) {
    const list = $('task-list');
    if (!list) return;
    list.replaceChildren();
    state.tasks.forEach(task => {
      const row = document.createElement('li'); row.className = `task-item${task.done ? ' completed' : ''}`;
      const label = document.createElement('label'); label.className = 'task-label';
      const check = document.createElement('input'); check.type = 'checkbox'; check.className = 'task-check'; check.checked = task.done;
      check.setAttribute('aria-label', `${task.done ? '取消完成' : '完成'}：${task.text}`);
      check.addEventListener('change', () => {
        task.done = check.checked; persist();
        row.classList.toggle('completed', task.done);
        check.setAttribute('aria-label', `${task.done ? '取消完成' : '完成'}：${task.text}`);
        renderTaskCount();
      });
      const text = document.createElement('span'); text.className = 'task-text'; text.textContent = task.text;
      const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'task-delete'; remove.textContent = '×'; remove.title = '删除这件事'; remove.setAttribute('aria-label', `删除：${task.text}`);
      remove.addEventListener('click', () => {
        const position = state.tasks.findIndex(item => item.id === task.id);
        state.tasks = state.tasks.filter(item => item.id !== task.id); persist(); renderTasks();
        if ($('task-input')) $('task-input').focus();
        toast('这件小事已经移走。', () => {
          if (!state.tasks.some(item => item.id === task.id)) state.tasks.splice(Math.max(0, position), 0, task);
          persist(); renderTasks(task.id);
        });
      });
      label.append(check, text); row.append(label, remove); list.append(row);
      if (focusId === task.id) check.focus();
    });
    renderTaskCount();
    if ($('task-empty')) $('task-empty').hidden = state.tasks.length > 0;
  }

  function renderTaskCount() {
    const pending = state.tasks.filter(task => !task.done).length;
    if ($('task-count')) $('task-count').textContent = state.tasks.length ? `${pending} 件待办 · ${state.tasks.length - pending} 件完成` : '0 件';
  }

  function renderJournal() {
    journalRemoteCopy = null;
    if ($('journal-date')) { $('journal-date').value = journalDate; $('journal-date').max = localDate(); }
    if ($('journal-input')) $('journal-input').value = state.journals[journalDate] || '';
    if ($('journal-status')) $('journal-status').textContent = state.journals[journalDate] ? journalSave ? '正在保存…' : journalSavedLabel() : '写下来的，都会被好好收着';
    if ($('journal-next')) $('journal-next').disabled = journalDate >= localDate();
    renderPreview();
  }

  function renderPreview() {
    if (!$('journal-preview')) return;
    const today = state.journals[localDate()] || '';
    $('journal-preview').textContent = today.trim() ? today.trim().slice(0, 85) + (today.trim().length > 85 ? '…' : '') : '今天有什么值得留住的？哪怕只是一阵风。';
  }

  function flushJournal() {
    if (!journalSave) return;
    window.clearTimeout(journalSave); journalSave = null;
    const success = persist();
    if ($('journal-status')) $('journal-status').textContent = success ? journalSavedLabel() : '存储失败，请导出备份';
    renderPreview(); renderStats();
  }

  function journalSavedLabel() {
    if (!storageHealthy) return '尚未保存，请导出备份';
    const length = (state.journals[journalDate] || '').length;
    return length >= MAX_TEXT ? '已保存 · 已达 100000 字符上限' : length >= MAX_TEXT - 1000 ? '已保存 · 接近 100000 字符上限' : '已保存在此浏览器';
  }

  function readSharedState(fallbackRaw) {
    try {
      const raw = localStorage.getItem(KEY) || fallbackRaw;
      if (!raw) return null;
      return { raw, state: sanitize(JSON.parse(raw), true) };
    } catch (_) { return null; }
  }

  function preserveJournalVersion(raw) {
    if (!raw || raw === lastConflictRaw) return;
    try {
      let key = `${KEY}-recovery-${Date.now()}`;
      while (localStorage.getItem(key) !== null) key += '-copy';
      localStorage.setItem(key, raw);
      lastConflictRaw = raw;
      toast('另一页面也更新了这一天。已保留本页草稿，另一版本已存为恢复副本。');
    } catch (_) {
      storageLocked = true; storageHealthy = false;
      toast('另一页面更新了手记，但恢复副本无法写入。已暂停保存，请先导出本页备份。');
    }
  }

  function receiveSharedState(incoming, raw, render = true) {
    const editor = $('journal-input');
    const editing = editor && document.activeElement === editor;
    const dirty = journalSave !== null;
    const localText = dirty && editor ? editor.value : state.journals[journalDate] || '';
    const remoteText = incoming.journals[journalDate] || '';
    if (state.timer.mode !== incoming.timer.mode || state.timer.deadline !== incoming.timer.deadline) timerNotice = '';
    if (dirty && localText !== remoteText) preserveJournalVersion(raw);
    state = incoming;
    lastStorageRaw = raw;
    if (dirty) {
      if (localText) state.journals[journalDate] = localText;
      else delete state.journals[journalDate];
    } else if (editing && editor.value !== remoteText) {
      // Keep the caret and visible text still. If typing continues, archive the
      // remote version before accepting the next local edit; otherwise blur
      // shows the latest version without issuing a write.
      journalRemoteCopy = raw;
      if ($('journal-status')) $('journal-status').textContent = '另一页面已更新 · 离开编辑区后显示';
    } else journalRemoteCopy = null;
    if (!render) return;
    renderName(); renderTimer(); renderTasks(); renderStats(); updateEnvironment(); renderPreview();
    if (!editing) renderJournal();
    if ($('sound-volume') && document.activeElement !== $('sound-volume')) $('sound-volume').value = `${Math.round(state.volume * 100)}`;
    if (window.IslandAudio) window.IslandAudio.setVolume(state.volume);
    if ($('storage-status')) $('storage-status').textContent = storageHealthy ? '已同步另一页面' : '尚未保存，请导出备份';
  }

  function onStorage(event) {
    if (event.key !== KEY || (event.storageArea && event.storageArea !== localStorage)) return;
    const shared = readSharedState(event.newValue);
    if (!shared || shared.raw === lastStorageRaw) return;
    receiveSharedState(shared.state, shared.raw);
  }

  function selectJournal(date) {
    if (!validDate(date) || date > localDate()) { toast('请选择今天或更早的一天。'); renderJournal(); return; }
    flushJournal(); journalDate = date; renderJournal();
  }

  function renderStats() {
    const today = localDate();
    const byDay = new Map();
    state.sessions.forEach(session => byDay.set(session.date, (byDay.get(session.date) || 0) + session.minutes));
    const todaySessions = state.sessions.filter(session => session.date === today);
    if ($('stat-minutes')) $('stat-minutes').textContent = `${Math.round(todaySessions.reduce((sum, session) => sum + session.minutes, 0))}`;
    if ($('stat-sessions')) $('stat-sessions').textContent = `${state.sessions.length}`;
    let streak = 0;
    let cursor = byDay.has(today) ? today : shiftedDate(today, -1);
    while (byDay.has(cursor)) { streak += 1; cursor = shiftedDate(cursor, -1); }
    if ($('stat-streak')) $('stat-streak').textContent = `${streak}`;
    if (sceneProgress !== state.sessions.length && window.IslandScene && typeof window.IslandScene.setProgress === 'function') {
      sceneProgress = state.sessions.length;
      window.IslandScene.setProgress(sceneProgress);
    }
    if ($('week-chart')) {
      const days = Array.from({ length: 7 }, (_, index) => shiftedDate(today, index - 6));
      const max = Math.max(30, ...days.map(day => byDay.get(day) || 0));
      $('week-chart').replaceChildren();
      days.forEach(day => {
        const column = document.createElement('div'); column.className = `week-column${day === today ? ' today' : ''}`;
        const minutes = byDay.get(day) || 0;
        column.title = `${day}：${Math.round(minutes)} 分钟`;
        const bar = document.createElement('span'); bar.className = 'week-bar'; bar.style.height = `${minutes ? Math.max(5, minutes / max * 100) : 3}%`; bar.setAttribute('aria-label', column.title);
        const label = document.createElement('span'); label.className = 'week-day'; label.textContent = day === today ? '今' : ['日', '一', '二', '三', '四', '五', '六'][new Date(`${day}T12:00:00`).getDay()];
        column.append(bar, label); $('week-chart').append(column);
      });
      $('week-chart').setAttribute('aria-label', `近 7 天共专注 ${Math.round(days.reduce((sum, day) => sum + (byDay.get(day) || 0), 0))} 分钟`);
    }
    if ($('heatmap')) {
      $('heatmap').replaceChildren();
      for (let index = 0; index < 35; index += 1) {
        const day = shiftedDate(today, index - 34);
        const minutes = byDay.get(day) || 0;
        const cell = document.createElement('span'); cell.className = 'heat-cell';
        cell.dataset.level = `${minutes >= 100 ? 4 : minutes >= 60 ? 3 : minutes >= 25 ? 2 : minutes > 0 ? 1 : 0}`;
        cell.title = `${day} · ${Math.round(minutes)} 分钟${state.journals[day] ? ' · 写过日记' : ''}`;
        cell.setAttribute('aria-label', cell.title);
        $('heatmap').append(cell);
      }
    }
  }

  function updateEnvironment() {
    document.body.dataset.weather = state.weather;
    document.body.classList.toggle('is-night', state.night);
    document.body.classList.toggle('reduced-motion', state.reducedMotion);
    document.documentElement.dataset.time = state.night ? 'night' : 'day';
    $$('[data-weather]').forEach(button => { const selected = button.dataset.weather === state.weather; button.classList.toggle('active', selected); button.setAttribute('aria-pressed', String(selected)); });
    if ($('time-toggle')) {
      const button = $('time-toggle');
      const title = state.night ? '切换到黎明' : '切换到夜晚';
      button.setAttribute('aria-pressed', String(state.night)); button.setAttribute('aria-label', title); button.title = title;
      const label = Array.from(button.childNodes).find(node => node.nodeType === 3);
      if (label) label.nodeValue = state.night ? '夜色正好' : '晨光刚好';
      else button.prepend(document.createTextNode(state.night ? '夜色正好' : '晨光刚好'));
    }
    window.dispatchEvent(new CustomEvent('island:weather', { detail: { weather: state.weather } }));
    window.dispatchEvent(new CustomEvent('island:time', { detail: { night: state.night } }));
    if (window.IslandScene && typeof window.IslandScene.setWeather === 'function') window.IslandScene.setWeather(state.weather);
    if (window.IslandScene && typeof window.IslandScene.setTime === 'function') window.IslandScene.setTime(state.night ? 'night' : 'dawn');
    if (window.IslandScene && typeof window.IslandScene.setReducedMotion === 'function') window.IslandScene.setReducedMotion(state.reducedMotion);
  }

  function renderName() {
    if ($('island-name')) $('island-name').textContent = state.name;
    if ($('greeting')) { const hour = new Date().getHours(); $('greeting').textContent = hour < 6 ? '夜深了，岛还亮着灯' : hour < 11 ? '早安，今天也从容一点' : hour < 17 ? '午后好，给自己一小段留白' : '晚上好，欢迎回到岛上'; }
  }

  function switchView(view) {
    if (!['home', 'journal', 'tools'].includes(view)) return;
    flushJournal(); currentView = view;
    ['home', 'journal', 'tools'].forEach(name => { const section = $(`view-${name}`); if (section) section.hidden = name !== view; });
    $$('[data-view]').forEach(button => { const selected = button.dataset.view === view; button.classList.toggle('active', selected); if (button.closest('nav')) { if (selected) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current'); button.title = `${{ home: '岛上', journal: '手记', tools: '工具' }[button.dataset.view]}${selected ? ' · 当前页面' : ''}`; } });
    if (view === 'journal') renderJournal();
    if (view === 'tools') updateTool();
  }

  function showDialog(id) {
    const dialog = $(id);
    if (!dialog) return;
    if (id === 'settings-dialog') { $('settings-name').value = state.name; $('settings-duration').value = state.duration; if ($('settings-motion')) $('settings-motion').checked = state.reducedMotion; updateRecoveryButton(); }
    if (typeof dialog.showModal === 'function') { if (!dialog.open) dialog.showModal(); }
    else { dialog.setAttribute('open', ''); dialog.hidden = false; }
    if (id === 'breathe-dialog') startBreathing();
  }

  function closeDialog(dialog) {
    if (!dialog) return;
    if (typeof dialog.close === 'function') dialog.close(); else { dialog.removeAttribute('open'); dialog.hidden = true; }
    if (dialog.id === 'breathe-dialog') stopBreathing();
  }

  function download(name, text, mime) {
    const blob = new Blob([text], { type: mime });
    const link = document.createElement('a'); const url = URL.createObjectURL(blob);
    link.href = url; link.download = name; document.body.append(link); link.click(); link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  function backup() {
    flushJournal();
    if (state.timer.running && remainingSeconds() <= 0) completeTimer();
    const snapshot = JSON.parse(JSON.stringify(state));
    snapshot.timer.remaining = remainingSeconds(); snapshot.timer.running = false; snapshot.timer.deadline = null;
    download(`未名岛-备份-${localDate()}.json`, JSON.stringify({ schema: 'weiming-island', version: 1, exportedAt: new Date().toISOString(), state: snapshot }, null, 2), 'application/json;charset=utf-8');
    toast('备份已导出，记得把它收好。');
  }

  async function importBackup(file) {
    if (!file) return;
    if (file.size > 12 * 1024 * 1024) { toast('这个备份太大了，请选择小于 12 MB 的文件。'); return; }
    try {
      const parsed = JSON.parse(await file.text());
      if (parsed.schema !== 'weiming-island' || parsed.version !== 1) throw new Error('这不是未名岛支持的备份文件。');
      const imported = sanitize(parsed.state, true);
      if (!window.confirm(`导入将替换这座岛的日记、待办和专注记录。\n备份包含 ${imported.tasks.length} 件待办、${Object.keys(imported.journals).length} 篇日记、${imported.sessions.length} 次专注。\n建议先导出当前备份。确定替换吗？`)) return;
      flushJournal();
      imported.timer.running = false; imported.timer.deadline = null;
      try {
        localStorage.setItem(`${KEY}-before-import`, JSON.stringify(state));
        localStorage.setItem(KEY, JSON.stringify(imported));
      } catch (_) { throw new Error('没有足够存储空间安全导入。请先导出当前备份，再清理浏览器空间。'); }
      state = imported; timerNotice = ''; storageHealthy = true; storageLocked = false; storageWarned = false;
      renderAll(); toast('备份已抵达，导入前的存档也已在本地保留。');
      return true;
    } catch (error) { toast(error instanceof SyntaxError ? '文件不是有效的 JSON，原来的岛没有改变。' : error.message || '备份无法读取，原来的岛没有改变。'); }
    return false;
  }

  function recoveryEntries() {
    const entries = [];
    try {
      for (let index = 0; index < localStorage.length; index += 1) {
        const key = localStorage.key(index);
        if (key !== `${KEY}-before-import` && !key.startsWith(`${KEY}-recovery-`)) continue;
        const raw = localStorage.getItem(key);
        const stamp = Number((key.match(/recovery-(\d+)/) || [])[1]) || 0;
        let snapshot = null;
        try { snapshot = sanitize(JSON.parse(raw), true); } catch (_) { /* The original bytes can still be exported. */ }
        entries.push({ key, raw, snapshot, stamp });
      }
    } catch (_) { /* Storage can be unavailable in private browser policies. */ }
    return entries.sort((a, b) => b.stamp - a.stamp);
  }

  function updateRecoveryButton() {
    let button = $('data-recovery');
    if (!button) {
      const area = document.querySelector('.backup-area');
      if (!area) return;
      button = document.createElement('button'); button.id = 'data-recovery';
      button.type = 'button'; button.className = 'text-button recovery-link'; button.textContent = '找回之前的版本 ↗';
      button.addEventListener('click', showRecoveries); area.append(button);
    }
    button.hidden = !recoveryEntries().length;
  }

  function showRecoveries() {
    const list = $('recovery-list');
    if (!list) return;
    list.replaceChildren();
    recoveryEntries().forEach(entry => {
      const row = document.createElement('div'); row.className = 'recovery-row';
      const copy = document.createElement('div');
      const title = document.createElement('strong');
      title.textContent = entry.stamp ? new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(entry.stamp)) : '上次导入之前';
      const description = document.createElement('p');
      description.textContent = entry.snapshot ? `${entry.snapshot.tasks.length} 件小事 · ${Object.keys(entry.snapshot.journals).length} 篇手记 · ${entry.snapshot.sessions.length} 次专注` : '原始存档 · 可导出后检查内容';
      copy.append(title, description);
      const actions = document.createElement('div'); actions.className = 'recovery-row-actions';
      const pack = () => {
        const snapshot = JSON.parse(JSON.stringify(entry.snapshot));
        if (snapshot.timer.running) snapshot.timer.remaining = clamp(Math.ceil((snapshot.timer.deadline - Date.now()) / 1000), 0, snapshot.timer.duration);
        snapshot.timer.running = false; snapshot.timer.deadline = null;
        return JSON.stringify({ schema: 'weiming-island', version: 1, exportedAt: new Date().toISOString(), state: snapshot }, null, 2);
      };
      const exportButton = document.createElement('button'); exportButton.type = 'button'; exportButton.className = 'outline-button'; exportButton.textContent = '导出';
      exportButton.setAttribute('aria-label', `导出${title.textContent}的恢复副本`);
      exportButton.addEventListener('click', () => download(`未名岛-恢复副本-${entry.stamp || '导入前'}.json`, entry.snapshot ? pack() : entry.raw, 'application/json;charset=utf-8'));
      actions.append(exportButton);
      if (entry.snapshot) {
        const restore = document.createElement('button'); restore.type = 'button'; restore.className = 'outline-button'; restore.textContent = '恢复';
        restore.setAttribute('aria-label', `恢复${title.textContent}的记录`);
        restore.addEventListener('click', async () => {
          const file = new File([pack()], 'recovery.json', { type: 'application/json' });
          if (await importBackup(file)) { closeDialog($('recovery-dialog')); closeDialog($('settings-dialog')); }
        });
        actions.append(restore);
      }
      row.append(copy, actions); list.append(row);
    });
    if (!list.childElementCount) { list.textContent = '暂时没有旧版本。日常记录可以随时导出备份。'; }
    showDialog('recovery-dialog');
  }

  function exportJournals() {
    flushJournal();
    const entries = Object.entries(state.journals).filter(([, value]) => value.trim()).sort(([a], [b]) => b.localeCompare(a));
    if (!entries.length) { toast('写下第一句话，再把它带走吧。'); return; }
    download(`岛上手记-${localDate()}.md`, `# ${state.name} · 岛上手记\n\n` + entries.map(([date, text]) => `## ${date}\n\n${text}\n`).join('\n---\n\n'), 'text/markdown;charset=utf-8');
    toast('所有手记已导出为 Markdown。');
  }

  function updateSoundUI() {
    const active = window.IslandAudio ? window.IslandAudio.getActive() : [];
    $$('[data-sound]').forEach(button => { const enabled = active.includes(button.dataset.sound); button.classList.toggle('active', enabled); button.setAttribute('aria-pressed', String(enabled)); });
    if ($('sound-toggle')) { $('sound-toggle').classList.toggle('playing', active.length > 0); $('sound-toggle').setAttribute('aria-label', active.length ? `环境声正在播放：${active.length} 种，打开声音设置` : '打开环境声音设置'); }
  }

  const toolConfig = {
    text: ['字数统计', '清空', '把文字放在这里，看看它有多长。'],
    json: ['格式化', '压缩', '在这里粘贴 JSON。格式化同时会检查语法。'],
    base64: ['编码', '解码', '支持中文与其他 Unicode 字符的 Base64 转换。'],
    url: ['编码', '解码', '对 URL 参数进行编码或解码。'],
    choose: ['帮我选一个', '清空', '每行放一个选项，让岛上的风替你选。']
  };

  function updateTool() {
    const kind = $('tool-select') ? $('tool-select').value : 'text';
    const config = toolConfig[kind] || toolConfig.text;
    if ($('tool-primary')) $('tool-primary').textContent = config[0];
    if ($('tool-secondary')) $('tool-secondary').textContent = config[1];
    if ($('tool-hint')) $('tool-hint').textContent = config[2];
    if ($('tool-input')) $('tool-input').placeholder = config[2];
    if ($('tool-output')) { $('tool-output').textContent = ''; $('tool-output').classList.remove('error'); }
  }

  function formatJSON(input, compact) {
    // Validate the grammar, then format original tokens. Numeric lexemes, key
    // order, duplicate keys and escape sequences remain exactly as supplied.
    JSON.parse(input);
    const tokens = input.match(/"(?:\\.|[^"\\])*"|[{}\[\],:]|true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/g) || [];
    if (compact) return tokens.join('');
    let depth = 0;
    let result = '';
    const newline = () => { if (depth > 120) throw new Error('JSON 嵌套超过 120 层，请先缩小处理范围。'); result += '\n' + '  '.repeat(depth); };
    tokens.forEach((token, index) => {
      if (token === '{' || token === '[') {
        result += token; depth += 1;
        if (!((token === '{' && tokens[index + 1] === '}') || (token === '[' && tokens[index + 1] === ']'))) newline();
      } else if (token === '}' || token === ']') {
        depth -= 1;
        if (!((token === '}' && tokens[index - 1] === '{') || (token === ']' && tokens[index - 1] === '['))) newline();
        result += token;
      } else if (token === ',') { result += token; newline(); }
      else result += token === ':' ? ': ' : token;
    });
    return result;
  }

  function runTool(secondary = false) {
    if (!$('tool-select') || !$('tool-input') || !$('tool-output')) return;
    const kind = $('tool-select').value;
    const input = $('tool-input').value;
    const output = $('tool-output'); output.classList.remove('error');
    try {
      let result = '';
      if ((kind === 'text' || kind === 'choose') && secondary) { $('tool-input').value = ''; output.textContent = ''; return; }
      if (kind === 'text') {
        const chars = Array.from(input);
        const han = (input.match(/\p{Script=Han}/gu) || []).length;
        const latin = (input.match(/[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*/g) || []).length;
        const words = han + latin;
        result = `字符（含空白）  ${chars.length}\n字符（不含空白）  ${Array.from(input.replace(/\s/gu, '')).length}\n中文字  ${han}\n英文单词 / 数字组  ${latin}\n行数  ${input ? input.split(/\r?\n/).length : 0}\n预计阅读  ${words ? Math.max(1, Math.ceil(words / 300)) : 0} 分钟`;
      } else if (kind === 'json') result = formatJSON(input, secondary);
      else if (kind === 'base64') {
        if (secondary) {
          const binary = atob(input.replace(/\s/g, ''));
          result = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(Uint8Array.from(binary, char => char.charCodeAt(0)));
        } else {
          const bytes = new TextEncoder().encode(input);
          let binary = ''; for (let index = 0; index < bytes.length; index += 8192) binary += String.fromCharCode(...bytes.subarray(index, index + 8192));
          result = btoa(binary);
        }
      } else if (kind === 'url') result = secondary ? decodeURIComponent(input) : encodeURIComponent(input);
      else if (kind === 'choose') {
        const options = input.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
        if (!options.length) throw new Error('先写下至少一个选项，每行一个。');
        const random = new Uint32Array(1); let index;
        if (window.crypto && crypto.getRandomValues) {
          const limit = Math.floor(4294967296 / options.length) * options.length;
          do { crypto.getRandomValues(random); } while (random[0] >= limit);
          index = random[0] % options.length;
        } else index = Math.floor(Math.random() * options.length);
        result = `风替你选了：\n\n${options[index]}`;
      }
      output.textContent = result;
    } catch (error) {
      output.classList.add('error');
      output.textContent = kind === 'base64' ? '无法解码：请检查 Base64 是否完整，以及内容是否为 UTF-8 文字。' : kind === 'url' ? '无法解码：URL 编码格式不完整。' : `还差一点：${error.message}`;
    }
  }

  async function copyOutput() {
    const value = $('tool-output') ? $('tool-output').textContent : '';
    if (!value) { toast('先生成一些内容吧。'); return; }
    try {
      if (!navigator.clipboard || !window.isSecureContext) throw new Error('fallback');
      await navigator.clipboard.writeText(value);
    } catch (_) {
      const text = document.createElement('textarea'); text.value = value; text.style.position = 'fixed'; text.style.opacity = '0'; document.body.append(text); text.select();
      const copied = document.execCommand('copy'); text.remove();
      if (!copied) { toast('自动复制不可用，请选中结果后手动复制。'); return; }
    }
    toast('已复制。');
  }

  function startBreathing() {
    stopBreathing(); const started = performance.now();
    const animate = now => {
      const elapsed = (now - started) / 1000;
      const cycle = elapsed % 14;
      const label = cycle < 4 ? '慢慢吸气' : cycle < 8 ? '轻轻停留' : '缓缓呼气';
      const remaining = Math.ceil(cycle < 4 ? 4 - cycle : cycle < 8 ? 8 - cycle : 14 - cycle);
      const scale = cycle < 4 ? 0.65 + cycle / 4 * 0.35 : cycle < 8 ? 1 : 1 - (cycle - 8) / 6 * 0.35;
      if ($('breath-label')) $('breath-label').textContent = `${label} · ${remaining}`;
      if ($('breath-orb')) $('breath-orb').style.transform = state.reducedMotion ? 'none' : `scale(${scale})`;
      breathingFrame = requestAnimationFrame(animate);
    };
    breathingFrame = requestAnimationFrame(animate);
  }
  function stopBreathing() { if (breathingFrame) cancelAnimationFrame(breathingFrame); breathingFrame = null; }

  function toggleFocus(force) {
    const enabled = typeof force === 'boolean' ? force : !document.body.classList.contains('focus-mode');
    document.body.classList.toggle('focus-mode', enabled);
    if ($('focus-toggle')) { $('focus-toggle').classList.toggle('active', enabled); $('focus-toggle').setAttribute('aria-pressed', String(enabled)); $('focus-toggle').title = enabled ? '退出专注（Esc）' : '进入专注模式'; }
    if (enabled) switchView('home');
  }

  function renderAll() {
    renderName(); renderTimer(); renderTasks(); renderJournal(); renderStats(); updateEnvironment(); updateSoundUI();
    if ($('sound-volume')) $('sound-volume').value = `${Math.round(state.volume * 100)}`;
    if (window.IslandAudio) window.IslandAudio.setVolume(state.volume);
    switchView(currentView); tick();
  }

  function bind() {
    const on = (id, event, handler) => { if ($(id)) $(id).addEventListener(event, handler); };
    on('timer-toggle', 'click', toggleTimer);
    on('timer-reset', 'click', () => switchTimer(state.timer.mode, state.timer.duration / 60));
    on('timer-work', 'click', () => switchTimer('work', state.duration));
    on('timer-break', 'click', () => switchTimer('break', state.breakDuration));
    $$('#timer-presets [data-minutes]').forEach(button => button.addEventListener('click', () => { const minutes = Number(button.dataset.minutes); if (minutes >= 5 && minutes <= 120) { state.duration = minutes; switchTimer('work', minutes); } }));
    on('focus-toggle', 'click', () => toggleFocus());
    on('task-form', 'submit', event => {
      event.preventDefault(); const input = $('task-input'); if (!input) return; const text = input.value.trim();
      if (!text) { input.focus(); return; }
      if (state.tasks.length >= 5000) { toast('已经有很多待办了，先给完成的事情腾些空间吧。'); return; }
      state.tasks.push({ id: uid(), text: text.slice(0, 240), done: false, createdAt: Date.now() }); input.value = ''; persist(); renderTasks(); input.focus();
    });
    on('journal-input', 'input', () => {
      if (journalRemoteCopy) { preserveJournalVersion(journalRemoteCopy); journalRemoteCopy = null; }
      const value = $('journal-input').value.slice(0, MAX_TEXT);
      if ($('journal-input').value.length > MAX_TEXT) { $('journal-input').value = value; toast('这一天已写满 100000 字符，余下的文字可以留给明天。'); }
      if (value) state.journals[journalDate] = value; else delete state.journals[journalDate];
      if ($('journal-status')) $('journal-status').textContent = value.length >= MAX_TEXT - 1000 ? '正在保存… · 接近 100000 字符上限' : '正在保存…';
      window.clearTimeout(journalSave); journalSave = window.setTimeout(flushJournal, 450);
    });
    on('journal-input', 'blur', () => { if (journalRemoteCopy && journalSave === null) renderJournal(); });
    on('journal-date', 'change', () => selectJournal($('journal-date').value));
    on('journal-prev', 'click', () => selectJournal(shiftedDate(journalDate, -1)));
    on('journal-next', 'click', () => selectJournal(shiftedDate(journalDate, 1)));
    on('journal-export', 'click', exportJournals);
    $$('[data-view]').forEach(button => button.addEventListener('click', () => switchView(button.dataset.view)));
    $$('[data-weather]').forEach(button => button.addEventListener('click', () => { if (['clear', 'rain', 'snow'].includes(button.dataset.weather)) { state.weather = button.dataset.weather; persist(); updateEnvironment(); } }));
    on('time-toggle', 'click', () => { state.night = !state.night; persist(); updateEnvironment(); });
    on('sound-toggle', 'click', () => { const panel = $('sound-panel'); if (!panel) return; panel.hidden = !panel.hidden; $('sound-toggle').setAttribute('aria-expanded', String(!panel.hidden)); });
    $$('[data-sound]').forEach(button => button.addEventListener('click', () => { try { if (!window.IslandAudio) throw new Error('环境声音暂不可用。'); window.IslandAudio.toggle(button.dataset.sound); updateSoundUI(); } catch (error) { toast(error.message); } }));
    on('sound-volume', 'input', () => { state.volume = clamp(Number($('sound-volume').value) / 100, 0, 1); if (window.IslandAudio) window.IslandAudio.setVolume(state.volume); persist(); });
    on('settings-open', 'click', () => showDialog('settings-dialog'));
    $$('[data-dialog]').forEach(button => button.addEventListener('click', () => showDialog(button.dataset.dialog)));
    $$('[data-close]').forEach(button => button.addEventListener('click', () => closeDialog(button.closest('dialog'))));
    $$('dialog').forEach(dialog => { dialog.addEventListener('click', event => { if (event.target === dialog) { const rect = dialog.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) closeDialog(dialog); } }); dialog.addEventListener('close', () => { if (dialog.id === 'breathe-dialog') stopBreathing(); }); });
    on('settings-form', 'submit', event => {
      event.preventDefault(); const name = $('settings-name').value.trim(); const minutes = Number($('settings-duration').value);
      if (!name || name.length > 18 || !Number.isFinite(minutes) || minutes < 5 || minutes > 120 || !Number.isInteger(minutes)) { toast('岛名请写 1–18 个字，专注时长请填 5–120 的整数。'); return; }
      state.name = name; state.duration = minutes; state.reducedMotion = $('settings-motion') ? $('settings-motion').checked : false;
      if (!state.timer.running && state.timer.mode === 'work' && state.timer.remaining === state.timer.duration) state.timer = { mode: 'work', duration: minutes * 60, remaining: minutes * 60, deadline: null, running: false };
      persist(); renderName(); renderTimer(); updateEnvironment(); closeDialog($('settings-dialog')); toast('小岛已经记住了。');
    });
    on('data-export', 'click', backup);
    on('data-import', 'click', () => { if ($('data-file')) $('data-file').click(); });
    on('data-file', 'change', async () => { const input = $('data-file'); await importBackup(input.files[0]); input.value = ''; });
    on('data-reset', 'click', () => {
      if (!window.confirm('要清空这座岛的所有日记、待办和专注记录吗？此操作无法撤销。\n请先导出备份。')) return;
      flushJournal(); state = defaults(); timerNotice = ''; journalDate = localDate(); storageLocked = false; if (window.IslandAudio) window.IslandAudio.stopAll(); persist(); renderAll(); closeDialog($('settings-dialog')); toast('潮水退去，一座新岛留了下来。');
    });
    on('tool-select', 'change', updateTool);
    on('tool-primary', 'click', () => runTool(false));
    on('tool-secondary', 'click', () => runTool(true));
    on('copy-output', 'click', copyOutput);
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape') {
        toggleFocus(false);
        const openDialogs = $$('dialog[open]'); openDialogs.forEach(closeDialog);
        if ($('sound-panel')) $('sound-panel').hidden = true;
        if ($('sound-toggle')) $('sound-toggle').setAttribute('aria-expanded', 'false');
      }
      if (event.code === 'Space' && currentView === 'home' && !event.repeat && !event.altKey && !event.ctrlKey && !event.metaKey && !$$('dialog[open]').length && !event.target.closest('input,textarea,select,button,a,[contenteditable="true"]')) { event.preventDefault(); toggleTimer(); }
    });
    document.addEventListener('pointerdown', event => { const panel = $('sound-panel'); const toggle = $('sound-toggle'); if (panel && toggle && !panel.hidden && !panel.contains(event.target) && !toggle.contains(event.target)) { panel.hidden = true; toggle.setAttribute('aria-expanded', 'false'); } });
    document.addEventListener('visibilitychange', () => { if (document.hidden) flushJournal(); else { tick(); renderStats(); renderPreview(); renderName(); } });
    window.addEventListener('beforeunload', () => { flushJournal(); });
    window.addEventListener('pagehide', () => { flushJournal(); });
    window.addEventListener('storage', onStorage);
  }

  function init() {
    state = load();
    if ($('journal-input')) $('journal-input').maxLength = MAX_TEXT;
    if (window.IslandScene && typeof window.IslandScene.init === 'function') window.IslandScene.init($('island-canvas'));
    bind(); renderAll(); updateTool();
    window.setInterval(tick, 250);
    window.IslandApp = { exportBackup: backup, showView: switchView, getSnapshot: () => JSON.parse(JSON.stringify(state)), storageKey: KEY };
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true }); else init();
})();
