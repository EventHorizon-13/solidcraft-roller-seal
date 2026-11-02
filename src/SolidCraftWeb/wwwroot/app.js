"use strict";

const els = {};
const state = { columns: [], flags: new Set(), rows: [], defaults: {}, currentJob: null, poll: null };
const settingIds = ["exportDxf","exportStep","exportPdf","exportCsv"];

document.addEventListener("DOMContentLoaded", () => {
  for (const id of ["apiToken","accessDialog","accessForm","accessClose","accessSubmit","accessError","csvFile","importBtn","addBtn","validateBtn","rowCount","grid","jobPanel","jobActions",
    "exportDxf","exportStep","exportPdf","exportCsv",
    "stepBtn","dxfBtn","pdfBtn","jobState","jobMessage","jobProgress","cancelBtn","downloadBtn","log"]) {
    els[id] = document.getElementById(id);
  }
  sessionStorage.removeItem("rollerSealResources");
  els.apiToken.value = readAccessKey();
  els.accessClose.addEventListener("click", () => els.accessDialog.close());
  els.accessForm.addEventListener("submit", event => { event.preventDefault(); connect(); });
  els.importBtn.addEventListener("click", () => els.csvFile.click());
  els.csvFile.addEventListener("change", importCsv);
  els.addBtn.addEventListener("click", addRow);
  els.validateBtn.addEventListener("click", validateRows);
  els.stepBtn.addEventListener("click", () => startJob("project"));
  els.dxfBtn.addEventListener("click", () => startJob("dxf"));
  els.pdfBtn.addEventListener("click", () => startJob("pdf"));
  els.cancelBtn.addEventListener("click", cancelJob);
  els.downloadBtn.addEventListener("click", downloadResult);
  els.grid.addEventListener("paste", pasteGrid);
  settingIds.forEach(id => els[id].addEventListener("change", saveSettings));
  connect();
});

function headers(extra) {
  const h = new Headers(extra || {});
  const token = state.accessKey || els.apiToken.value.trim();
  if (token && !h.has("X-RollerSeal-Token")) h.set("X-RollerSeal-Token", token);
  return h;
}

async function api(path, options) {
  const init = Object.assign({}, options || {});
  init.headers = headers(init.headers);
  const response = await fetch(path, init);
  const type = response.headers.get("content-type") || "";
  const body = type.includes("application/json") ? await response.json() : null;
  if (!response.ok) {
    const error = new Error(body && body.error ? body.error : "请求失败：" + response.status);
    error.status = response.status;
    if (response.status === 401 || response.status === 403) {
      forgetAccessKey();
      if(path !== "/api/bootstrap") showAccessDialog("密钥已失效，请重新输入。");
    }
    throw error;
  }
  return body;
}

async function connect() {
  const key = els.apiToken.value.trim();
  if (!key) { setConnection("未连接"); showAccessDialog(); return; }
  if (els.accessSubmit.disabled) return;
  els.accessSubmit.disabled = true;
  els.accessSubmit.textContent = "正在连接…";
  els.accessError.hidden = true;
  setConnection("正在连接…");
  try {
    const data = await api("/api/bootstrap", {headers:{"X-RollerSeal-Token":key}});
    document.getElementById("backendVersion").textContent = data.version || "未知";
    state.columns = data.columns;
    state.flags = new Set(data.flags);
    state.defaults = data.defaults;
    loadSettings();
    if (!state.rows.length) state.rows = [data.defaultRow.slice()];
    renderTable();
    state.accessKey = key;
    rememberAccessKey(key);
    setConnection("已连接");
    els.accessDialog.close();
  } catch (error) {
    document.getElementById("backendVersion").textContent = "未连接";
    setConnection(error.status === 401 || error.status === 403 ? "未连接" : "连接失败");
    showAccessDialog(error.status === 401 || error.status === 403 ? "API Key 不正确或已失效，请重新输入。" : "暂时无法连接服务，请稍后重试。");
  } finally {
    els.accessSubmit.disabled = false;
    els.accessSubmit.textContent = "连接并保存";
  }
}

function readAccessKey() {
  try { return localStorage.getItem("rollerSealAccessKey.v1") || sessionStorage.getItem("rollerSealToken") || ""; } catch (_) { return ""; }
}
function rememberAccessKey(key) {
  try { sessionStorage.setItem("rollerSealToken", key); } catch (_) {}
  try { localStorage.setItem("rollerSealAccessKey.v1", key); } catch (_) {}
}
function forgetAccessKey() {
  try { localStorage.removeItem("rollerSealAccessKey.v1"); } catch (_) {}
  try { sessionStorage.removeItem("rollerSealToken"); } catch (_) {}
}
function showAccessDialog(message = "") {
  els.accessError.textContent = message;
  els.accessError.hidden = !message;
  if (!els.accessDialog.open) els.accessDialog.showModal();
  els.apiToken.focus({preventScroll:true});
}

function setConnection(text) {
  state.connectionStatus = text;
}

function loadSettings() {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem("rollerSealWebSettings.v1") || "{}"); } catch (_) {}
  if (!localStorage.getItem("rollerSealHiddenScaleDefault.v2")) {
    if (Number(saved.hiddenLineScale) === 1) delete saved.hiddenLineScale;
    localStorage.setItem("rollerSealHiddenScaleDefault.v2", "1");
    localStorage.setItem("rollerSealWebSettings.v1", JSON.stringify(saved));
  }
  for (const id of settingIds) {
    const fallback = id === "exportStep" ? true : state.defaults[id];
    const value = Object.prototype.hasOwnProperty.call(saved, id) ? saved[id] : fallback;
    if (els[id].type === "checkbox") els[id].checked = Boolean(value);
    else if (value !== undefined && value !== null) els[id].value = String(value);
  }
}

function saveSettings() {
  const saved = {};
  for (const id of settingIds) saved[id] = els[id].type === "checkbox" ? els[id].checked : els[id].value;
  localStorage.setItem("rollerSealWebSettings.v1", JSON.stringify(saved));
}

function renderTable() {
  const thead = els.grid.tHead;
  const tbody = els.grid.tBodies[0];
  thead.replaceChildren();
  tbody.replaceChildren();

  const headerRow = document.createElement("tr");
  const actionHead = document.createElement("th");
  actionHead.textContent = "操作";
  headerRow.appendChild(actionHead);
  state.columns.slice(0,14).forEach(name => {
    const th = document.createElement("th");
    th.textContent = name;
    if (state.flags.has(name)) th.className = "flag-head";
    headerRow.appendChild(th);
  });
  thead.appendChild(headerRow);

  state.rows.forEach((row, rowIndex) => {
    const tr = document.createElement("tr");
    const action = document.createElement("td");
    const del = document.createElement("button");
    del.type = "button";
    del.className = "delete";
    del.textContent = "×";
    del.setAttribute("aria-label", "删除第 " + (rowIndex + 1) + " 行");
    del.title = "删除此行";
    del.addEventListener("click", () => {
      state.rows.splice(rowIndex, 1);
      if (!state.rows.length) state.rows.push(defaultRowFor(state.rows.length + 1));
      renderTable();
    });
    action.appendChild(del);
    tr.appendChild(action);

    state.columns.slice(0,14).forEach((name, columnIndex) => {
      const td = document.createElement("td");
      const input = document.createElement("input");
      input.dataset.row = String(rowIndex);
      input.dataset.column = String(columnIndex);
      if (state.flags.has(name)) {
        td.className = "flag";
        input.type = "checkbox";
        input.checked = row[columnIndex] === "1";
        input.addEventListener("change", () => { state.rows[rowIndex][columnIndex] = input.checked ? "1" : "0"; });
      } else {
        input.type = "text";
        input.value = row[columnIndex] || "";
        input.autocomplete = "off";
        input.spellcheck = false;
        input.addEventListener("input", () => { state.rows[rowIndex][columnIndex] = input.value; });
      }
      td.appendChild(input);
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  els.rowCount.textContent = state.rows.length + " 行";
}

function defaultRowFor(number) {
  const row = new Array(state.columns.length).fill("");
  if (state.columns.length) {
    const base = state.defaults.defaultRow || null;
    if (base) return base.slice();
    row[0] = String(number);
  }
  return row;
}

function addRow() {
  if (!state.columns.length) return;
  const prior = state.rows[state.rows.length - 1];
  const row = prior ? prior.slice() : new Array(state.columns.length).fill("");
  row[0] = String(state.rows.length + 1);
  state.rows.push(row);
  renderTable();
}

async function importCsv() {
  const file = els.csvFile.files[0];
  if (!file) return;
  try {
    const form = new FormData();
    form.append("file", file, file.name);
    const data = await api("/api/csv/parse", { method: "POST", body: form });
    state.rows = data.rows;
    renderTable();
    writeLog("已导入 " + state.rows.length + " 行 CSV。");
  } catch (error) {
    writeLog("导入失败：" + error.message);
  } finally {
    els.csvFile.value = "";
  }
}

function pasteGrid(event) {
  const target = event.target;
  if (!(target instanceof HTMLInputElement) || target.type === "checkbox") return;
  const startRow = Number(target.dataset.row);
  const startColumn = Number(target.dataset.column);
  if (!Number.isInteger(startRow) || !Number.isInteger(startColumn)) return;
  const text = event.clipboardData.getData("text/plain");
  if (!text.includes("\t") && !text.includes("\n")) return;

  event.preventDefault();
  const lines = text.replace(/\r/g, "").split("\n");
  if (lines.length && lines[lines.length - 1] === "") lines.pop();
  const matrix = lines.map(line => line.split("\t"));
  const needed = Math.min(500, startRow + matrix.length);
  while (state.rows.length < needed) addRowSilently();

  matrix.forEach((line, r) => line.forEach((value, c) => {
    const rr = startRow + r, cc = startColumn + c;
    if (rr >= state.rows.length || cc >= 14) return;
    if (state.flags.has(state.columns[cc])) state.rows[rr][cc] = /^(1|true|是|yes)$/i.test(value.trim()) ? "1" : "0";
    else state.rows[rr][cc] = value.trim();
  }));
  renderTable();
}

function addRowSilently() {
  const prior = state.rows[state.rows.length - 1];
  const row = prior ? prior.slice() : new Array(state.columns.length).fill("");
  row[0] = String(state.rows.length + 1);
  state.rows.push(row);
}

async function validateRows() {
  if (els.validateBtn.disabled) return;
  els.validateBtn.disabled = true;
  try {
    await api("/api/validate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rows: state.rows })
    });
    showValidationResult(true);
  } catch (error) {
    // Authentication errors already open the access-key dialog.
    if (error.status !== 401 && error.status !== 403) showValidationResult(false, error.message);
  } finally {
    els.validateBtn.disabled = false;
  }
}

function jobRequest(format) {
  return {
    rows: state.rows,
    combineStep: false,
    exportStep: format === "project" && els.exportStep.checked,
    exportDxf: format === "project" && els.exportDxf.checked,
    exportPdf: format === "project" && els.exportPdf.checked,
    exportCsv: format === "project" && els.exportCsv.checked,
    outputFormat: format,
    hiddenLineScale: Number(state.defaults.hiddenLineScale ?? 2),
    viewGap: Number(state.defaults.viewGap ?? 60)
  };
}

function setOutputBusy(busy) {
  [els.stepBtn, els.dxfBtn, els.pdfBtn].forEach(button => { button.disabled = busy; });
}

async function startJob(format) {
  if (state.currentJob || els.stepBtn.disabled) return;
  saveSettings();
  if (format === "project" && !["exportDxf", "exportStep", "exportPdf", "exportCsv"].some(id => els[id].checked)) {
    writeLog("请至少勾选一项项目输出。");
    return;
  }
  clearDownload();
  beginTaskTracking(state.rows, {drawing:format!=="project"||els.exportDxf.checked||els.exportPdf.checked,step:format==="project"&&els.exportStep.checked,combine:false,pdf:format==="pdf"||(format==="project"&&els.exportPdf.checked),csv:format==="project"&&els.exportCsv.checked,zip:format==="project"});
  state.progressRows=state.rows.map(r=>r[0]);
  state.progressEvents=new Set();
  setOutputBusy(true);
  setJobState("queued", "正在提交任务，请稍候…");
  try {
    const data = await api("/api/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(jobRequest(format))
    });
    state.currentJob = data.id;

    els.jobProgress.hidden = false;
    els.jobActions.hidden = false;
    els.cancelBtn.hidden = false;
    els.cancelBtn.disabled = false;
    setOutputBusy(true);
    setJobState("queued", "等待执行");
    await pollJob();
    if(state.currentJob) state.poll = setInterval(pollJob, 800);
  } catch (error) {
    els.cancelBtn.hidden = true;
    els.jobProgress.hidden = true;
    els.jobActions.hidden = true;
    setJobState("failed", error.message);
    setOutputBusy(false);
    writeLog("启动失败：" + error.message);
  }
}

async function pollJob() {
  if (!state.currentJob) return;
  try {
    const data = await api("/api/jobs/" + state.currentJob);
    setJobState(data.status, data.message);
    updateServerTaskProgress(data);
    els.log.textContent = data.logs.filter(line => !line.startsWith("PDF 已保存：") && !line.startsWith("PDF 已保存:")).join("\n");
    els.log.scrollTop = els.log.scrollHeight;

    if (["completed","failed","cancelled"].includes(data.status)) {
      clearInterval(state.poll);
      state.poll = null;
      els.cancelBtn.disabled = true;
      els.cancelBtn.hidden = true;
      setOutputBusy(false);
      if (data.downloadable) {
        els.downloadBtn.dataset.job = state.currentJob;
        els.downloadBtn.dataset.filename = data.downloadName || "结果.zip";
        els.downloadBtn.textContent = data.contentType === "application/pdf" ? "下载 PDF" : data.contentType === "application/dxf" ? "下载 DXF" : "下载结果 ZIP";
        els.downloadBtn.classList.remove("disabled");
        els.downloadBtn.setAttribute("aria-disabled", "false");
        els.downloadBtn.hidden = false;
        els.jobActions.hidden = false;
      } else {
        els.downloadBtn.hidden = true;
        els.jobActions.hidden = true;
      }
      state.currentJob = null;
    }
  } catch (error) {
    clearInterval(state.poll);
    state.poll = null;
    state.currentJob = null;
    els.cancelBtn.disabled = true;
    els.cancelBtn.hidden = true;
    els.jobActions.hidden = true;
    els.jobProgress.hidden = true;
    setOutputBusy(false);
    setJobState("failed", error.message);
  }
}

async function cancelJob() {
  if (!state.currentJob) return;
  try {
    await api("/api/jobs/" + state.currentJob + "/cancel", { method: "POST" });
    els.cancelBtn.disabled = true;
  } catch (error) {
    writeLog("取消失败：" + error.message);
  }
}

function setJobState(status, message) {
  const names = { queued:"排队中", running:"生成中", completed:"已完成", failed:"失败", cancelled:"已取消" };
  els.jobState.textContent = names[status] || status;
  els.jobMessage.textContent = message || "";
}

async function downloadResult(event) {
  event.preventDefault();
  const id = els.downloadBtn.dataset.job;
  if (!id) return;
  try {
    const response = await fetch("/api/jobs/" + id + "/download", { headers: headers() });
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        forgetAccessKey();
        showAccessDialog("密钥已失效，请重新输入。");
        return;
      }
      let message = "下载失败：" + response.status;
      try {
        const body = await response.json();
        if (body.error) message = body.error;
      } catch (_) {}
      throw new Error(message);
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = els.downloadBtn.dataset.filename || "结果.zip";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  } catch (error) {
    writeLog("下载失败：" + error.message);
  }
}

function clearDownload() {
  delete els.downloadBtn.dataset.job;
  els.downloadBtn.removeAttribute("href");
  els.downloadBtn.classList.add("disabled");
  els.downloadBtn.setAttribute("aria-disabled", "true");
  els.jobProgress.value = 0;
  els.jobProgress.hidden = true;
  els.cancelBtn.hidden = true;
  els.downloadBtn.hidden = true;
  els.jobActions.hidden = true;
  els.log.textContent = "";
}

function writeLog(text) {
  if (window.showTaskProgress) window.showTaskProgress();

  if (els.log.textContent) els.log.textContent += "\n";
  els.log.textContent += text;
  els.log.scrollTop = els.log.scrollHeight;
}




// Keep the existing task controls in a native modal, including live downloads.
document.addEventListener('DOMContentLoaded', () => {
  const panel = document.querySelector('.job');
  if (!panel) return;
  const dialog = document.createElement('dialog');
  dialog.id = 'progressDialog';
  dialog.className = 'progress-dialog';
  dialog.setAttribute('aria-label', '任务进度');
  const bar = document.createElement('div');
  bar.className = 'progress-dialog-bar';
  const title = document.createElement('strong');
  title.textContent = '任务进度';
  const close = document.createElement('button');
  close.type = 'button';
  close.textContent = '×';
  close.setAttribute('aria-label', '关闭任务进度弹窗');
  dialog.tabIndex = -1;
  close.addEventListener('click', () => dialog.close());
  bar.append(title, close);
  dialog.append(bar, panel);
  document.body.append(dialog);
  const message = document.getElementById('jobMessage');
  if (message) { message.setAttribute('role', 'status'); message.setAttribute('aria-live', 'polite'); }
  const logDetails = panel.querySelector('.log-details');
  const log = document.getElementById('log');
  logDetails.open = false;
  function syncLogVisibility() {
    logDetails.hidden = !log.textContent.trim();
    if (logDetails.hidden) logDetails.open = false;
  }
  new MutationObserver(syncLogVisibility).observe(log, {childList:true, characterData:true, subtree:true});
  syncLogVisibility();
  const reopen = document.createElement('button');
  reopen.id = 'showProgressBtn';
  reopen.type = 'button';
  reopen.textContent = '任务进度';
  reopen.hidden = false;
  reopen.className = 'progress-reopen';
  document.querySelector('.topbar').append(reopen);
  dialog.addEventListener('close', () => {
    reopen.hidden = false;
  });
  function openProgress() {
    reopen.hidden = false;

    if (!dialog.open) { dialog.showModal(); dialog.focus({preventScroll:true}); }
  }
  window.showTaskProgress = openProgress;
  reopen.addEventListener('click', openProgress);
  // Capture the click before async submission so feedback appears immediately.
  document.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (button && !button.disabled && ['stepBtn','dxfBtn','pdfBtn'].includes(button.id)) openProgress();
  }, true);
});


let taskTracker = null;
function createTaskTracker(rows, options) {
  const steps = [{id:'prepare',label:'准备任务'}];
  rows.forEach((row,i) => {
    const prefix='零件 '+(i+1)+'/'+rows.length+' · '+row[0]+' · ';
    steps.push({id:'row-'+i+'-model',label:prefix+'参数重算与实体检查'});
    if(options.drawing)steps.push({id:'row-'+i+'-drawing',label:prefix+'提取三视图'});
    steps.push({id:'row-'+i+'-export',label:prefix+'保存模型'+(options.step?'与 STEP':'')});
  });
  if(options.combine){
    rows.forEach((row,i)=>steps.push({id:'merge-'+i,label:'合并 STEP · 导入与定位 '+row[0]}));
    steps.push({id:'interference',label:'合并 STEP · 实体与相交检查'},{id:'combined',label:'合并 STEP · 导出文件'});
  }
  if(options.drawing)steps.push({id:'dxf',label:'图纸 · DXF 排版与保存'});
  if(options.pdf)steps.push({id:'pdf',label:'图纸 · PDF 渲染与保存'});
  if(options.csv)steps.push({id:'csv',label:'导出参数列表 CSV'});
  steps.push({id:'package',label:options.zip?'整理文件并打包 ZIP':'整理导出文件'});
  steps.push({id:'result',label:'准备下载结果'});
  const progress=document.getElementById('jobProgress'),caption=document.getElementById('jobStep');
  let current=0,complete=false;
  function render(){
    progress.hidden=false;progress.max=steps.length;progress.value=complete?steps.length:current;
    caption.textContent=complete?'全部 '+steps.length+' 步已完成':'步骤 '+(current+1)+' / '+steps.length;
  }
  render();
  return {steps,activate(id){const next=steps.findIndex(s=>s.id===id);if(next>current&&!complete){current=next;render();}},finish(){complete=true;render();},get current(){return current;},get complete(){return complete;}};
}
function beginTaskTracking(rows,options){taskTracker=createTaskTracker(rows,options);}

function updateServerTaskProgress(data) {
  if(!taskTracker)return;
  const activate=id=>taskTracker.activate(id);
  function after(id){const index=taskTracker.steps.findIndex(s=>s.id===id);if(index>=0&&index+1<taskTracker.steps.length)activate(taskTracker.steps[index+1].id);}
  for(const message of [...(data.logs||[]),data.message||'']){
    if(state.progressEvents.has(message))continue;
    state.progressEvents.add(message);
    let match;
    if((match=message.match(/正在生成 (\d+)\/\d+/)))activate('row-'+(Number(match[1])-1)+'-model');
    else if((match=message.match(/正在从当前模型提取三视图 (\d+)/)))activate('row-'+(Number(match[1])-1)+'-drawing');
    else if(message.startsWith('已导出 ')){
      const i=state.progressRows.findIndex(name=>message.startsWith('已导出 '+name+'：'));
      if(i>=0){activate('row-'+i+'-export');after('row-'+i+'-export');}
    }
    else if(message.startsWith('已将 ')){
      const i=state.progressRows.findIndex(name=>message.startsWith('已将 '+name+' 沿 X'));
      if(i>=0){activate('merge-'+i);after('merge-'+i);}
    }
    else if(message.includes('正在检查组合实体相交'))activate('interference');
    else if(message.startsWith('组合 STEP 已导出')){activate('combined');after('combined');}
    else if(message.includes('张加工图排版到一个 DXF'))activate('dxf');
    else if(message.includes('正在渲染')&&message.includes('PDF'))activate('pdf');
    else if(message.startsWith('已保存汇总 DXF'))after(taskTracker.steps.some(s=>s.id==='pdf')?'pdf':'dxf');
    else if(message.startsWith('当前任务 CSV 已保存')){activate('csv');after('csv');}
  }
  if(data.status==='completed'&&data.downloadable)taskTracker.finish();
}


let validationTimer = null;
function showValidationResult(ok, message = '') {
  if (validationTimer !== null) { clearTimeout(validationTimer); validationTimer = null; }
  let dialog = document.getElementById('validationDialog');
  if (!dialog) {
    dialog = document.createElement('dialog');
    dialog.id = 'validationDialog';
    dialog.className = 'validation-dialog';
    dialog.setAttribute('aria-labelledby', 'validationTitle');
    const icon = document.createElement('div');
    icon.className = 'validation-icon';
    icon.setAttribute('aria-hidden', 'true');
    const title = document.createElement('h2');
    title.id = 'validationTitle';
    const detail = document.createElement('p');
    detail.className = 'validation-message';
    const close = document.createElement('button');
    close.type = 'button';
    close.textContent = '知道了';
    close.addEventListener('click', () => dialog.close());
    dialog.append(icon, title, detail, close);
    document.body.append(dialog);
    dialog.tabIndex = -1;
    dialog.addEventListener('close', () => {
      if (validationTimer !== null) { clearTimeout(validationTimer); validationTimer = null; }
    });
  }
  dialog.dataset.result = ok ? 'success' : 'error';
  dialog.querySelector('.validation-icon').textContent = ok ? '✓' : '!';
  dialog.querySelector('h2').textContent = ok ? '没有错误' : '检查未通过';
  const detail = dialog.querySelector('.validation-message');
  detail.textContent = message;
  detail.hidden = ok || !message;
  dialog.querySelector('button').hidden = ok;
  if (!dialog.open) dialog.showModal();
  if (ok) {
    dialog.focus({preventScroll:true});
    validationTimer = setTimeout(() => {
      validationTimer = null;
      if (dialog.open && dialog.dataset.result === 'success') dialog.close();
    }, 1600);
  } else dialog.querySelector('button').focus({preventScroll:true});
}


// Fit the table to the viewport after accounting for the real header and toolbar.
document.addEventListener('DOMContentLoaded', () => {
  const panel = document.querySelector('.table-panel');
  const wrap = panel && panel.querySelector('.table-wrap');
  if (!wrap) return;
  let pending = false;
  function update() {
    pending = false;
    const viewport = window.visualViewport ? window.visualViewport.height : window.innerHeight;
    const top = panel.getBoundingClientRect().top + window.scrollY;
    const footer = panel.querySelector('.table-footer');
    const footerHeight = footer ? footer.getBoundingClientRect().height : 0;
    const mobile = window.innerWidth <= 800;
    const settings = document.querySelector('.settings');
    const workspace = document.querySelector('.workspace');
    const layout = workspace && getComputedStyle(workspace);
    const outputHeight = mobile && settings
      ? settings.getBoundingClientRect().height + (parseFloat(layout?.rowGap) || 0)
      : 0;
    const bottomSpace = mobile ? (parseFloat(layout?.paddingBottom) || 12) + 2 : 24;
    const height = tableViewportHeight(viewport, top, footerHeight, mobile, outputHeight, bottomSpace);
    wrap.style.setProperty('--table-view-height', height + 'px');
  }
  function schedule() {
    if (!pending) { pending = true; requestAnimationFrame(update); }
  }
  const observer = new ResizeObserver(schedule);
  for (const element of [document.querySelector('.topbar'),document.querySelector('.workspace-heading'),panel.querySelector('.table-footer'),document.querySelector('.settings')]) {
    if (element) observer.observe(element);
  }
  window.addEventListener('resize', schedule);
  if (window.visualViewport) window.visualViewport.addEventListener('resize', schedule);
  if (document.fonts) document.fonts.ready.then(schedule);
  schedule();
});
function tableViewportHeight(viewport, top, footer, mobile, output = 0, bottom = 24) {
  const available = Math.max(0, viewport - footer - bottom);
  const desired = Math.max(84, viewport - top - footer - output - bottom);
  return Math.floor(Math.min(available, desired));
}
