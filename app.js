const { PDFDocument, rgb, degrees, StandardFonts } = PDFLib;
pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdfjs/pdf.worker.min.js';
const el = id => document.getElementById(id);

/* ================= STATE ================= */
const state = {
  images: [], activeImageId: null,
  pdfs: [], activePdfId: null,
  convertImages: [],
  videos: [], activeVideoId: null,
  centerLayers: [],
  selectedCenterLayerId: null,
  marks: [],
  selectedMarkId: null,
  ffmpeg: null,
  markHandleEls: {},
  centerHandleEls: {},
};

function newCenterLayer(overrides){
  const id = 'center_' + Math.random().toString(36).slice(2,9);
  return Object.assign({
    id, enabled:false, pattern:'strip', type:'text', text:'LAVIE GARDEN™ | RAMHITI', color:'#ffffff',
    imageEl:null, imagePngBytes:null,
    angle:-30, size:22, spacing:48, opacity:0.35,
    posMode:'fixed', posXFrac:0.5, posYFrac:0.5,
  }, overrides);
}
// seed with one layer matching the tool's original single center-pattern behavior
state.centerLayers.push(newCenterLayer({enabled:true}));
state.selectedCenterLayerId = state.centerLayers[0].id;

function newMark(overrides){
  const id = 'mark_' + Math.random().toString(36).slice(2,9);
  return Object.assign({
    id, enabled:false, type:'text', text:'Your Brand', color:'#ffffff',
    imageEl:null, imagePngBytes:null,
    size:16, opacity:0.85,
    posMode:'fixed', cornerPos:'tr', posXFrac:0.8, posYFrac:0.06,
  }, overrides);
}
// seed with one mark matching the tool's previous default corner-mark behavior
state.marks.push(newMark({text:'The Most Celebrated Restaurant In Town'}));
state.selectedMarkId = state.marks[0].id;

const PLATFORM_CROPS = [
  {label:'Instagram Post', dims:'1080 × 1080', w:1080, h:1080},
  {label:'Instagram/TikTok Story', dims:'1080 × 1920', w:1080, h:1920},
  {label:'Facebook Post', dims:'1200 × 630', w:1200, h:630},
  {label:'X / Twitter Post', dims:'1600 × 900', w:1600, h:900},
  {label:'LinkedIn Post', dims:'1200 × 627', w:1200, h:627},
  {label:'Pinterest Pin', dims:'1000 × 1500', w:1000, h:1500},
  {label:'YouTube Thumbnail', dims:'1280 × 720', w:1280, h:720},
];

// reads the currently-selected center layer's form fields back into that layer object
function syncSelectedCenterLayerFromForm(){
  const layer = selectedCenterLayer();
  if(!layer) return;
  layer.enabled = el('centerEnabled').checked;
  layer.pattern = document.querySelector('#patternSeg .active').dataset.val;
  layer.type = document.querySelector('#centerTypeSeg .active').dataset.val;
  layer.text = el('centerText').value;
  layer.color = el('centerColor').value;
  layer.angle = parseInt(el('centerAngle').value, 10);
  layer.size = parseInt(el('centerSize').value, 10);
  layer.spacing = parseInt(el('centerSpacing').value, 10);
  layer.opacity = parseInt(el('centerOpacity').value, 10) / 100;
  layer.posMode = document.querySelector('#centerDragSeg .active').dataset.val;
}
function selectedCenterLayer(){ return state.centerLayers.find(l=>l.id === state.selectedCenterLayerId) || null; }
function cfgBg(){
  return {
    enabled: el('bgEnabled').checked,
    style: document.querySelector('#bgStyleSeg .active').dataset.val,
    color: el('bgColor').value,
    opacity: parseInt(el('bgOpacity').value, 10) / 100,
  };
}
function selectedMark(){ return state.marks.find(m=>m.id === state.selectedMarkId) || null; }

/* ================= NAV + SIDEBAR (mobile) ================= */
document.querySelectorAll('nav.tabs button').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    document.querySelectorAll('nav.tabs button').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    document.querySelectorAll('.panel-view').forEach(p=>p.classList.remove('active'));
    el('panel-' + btn.dataset.tab).classList.add('active');
    updateStatusChip();
    if(btn.dataset.tab === 'images') syncMarkHandles();
    updateMobileThumb();
  });
});
function updateStatusChip(){
  const tab = document.querySelector('nav.tabs button.active').dataset.tab;
  if(tab === 'images') el('statusChip').textContent = `${state.images.length} image${state.images.length===1?'':'s'} loaded`;
  else if(tab === 'pdfs') el('statusChip').textContent = `${state.pdfs.length} pdf${state.pdfs.length===1?'':'s'} loaded`;
  else if(tab === 'video') el('statusChip').textContent = `${state.videos.length} video${state.videos.length===1?'':'s'} loaded`;
  else el('statusChip').textContent = `${state.convertImages.length} file${state.convertImages.length===1?'':'s'} loaded`;
}
el('sidebarToggle').addEventListener('click', ()=>{ el('controlDesk').classList.add('open'); el('sidebarBackdrop').classList.add('open'); });
el('sidebarBackdrop').addEventListener('click', ()=>{ el('controlDesk').classList.remove('open'); el('sidebarBackdrop').classList.remove('open'); });

/* ================= SIDEBAR WIRING: CENTER LAYERS ================= */
function wireSegmented(containerId, onChange){
  const c = el(containerId);
  c.querySelectorAll('button').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      c.querySelectorAll('button').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      onChange && onChange(btn.dataset.val);
      renderEverything();
    });
  });
}
wireSegmented('patternSeg', v=>{
  el('diagonalAngleField').style.display = v==='diagonal' ? 'block' : 'none';
  syncSelectedCenterLayerFromForm(); renderCenterChips();
});
wireSegmented('centerTypeSeg', v=>{
  el('centerTextFields').style.display = v==='text' ? 'block' : 'none';
  el('centerImageFields').style.display = v==='image' ? 'block' : 'none';
  syncSelectedCenterLayerFromForm(); renderCenterChips();
});
wireSegmented('bgStyleSeg');
wireSegmented('centerDragSeg', v=>{ syncSelectedCenterLayerFromForm(); syncCenterHandles(); });

const centerLabelMap = {
  centerAngle:['angleVal', v=>v+'°'], centerSize:['sizeVal', v=>v+'px'],
  centerSpacing:['spacingVal', v=>v+'px'], centerOpacity:['opacityVal', v=>v+'%'],
  bgOpacity:['bgOpacityVal', v=>v+'%'],
};
['centerEnabled','centerText','centerColor','centerAngle','centerSize','centerSpacing','centerOpacity',
 'bgEnabled','bgColor','bgOpacity'].forEach(id=>{
  el(id).addEventListener('input', ()=>{
    if(centerLabelMap[id]){ const [lblId, fmt] = centerLabelMap[id]; el(lblId).textContent = fmt(el(id).value); }
    if(id==='centerEnabled' || id==='centerText' || id==='centerColor' || id==='centerAngle' ||
       id==='centerSize' || id==='centerSpacing' || id==='centerOpacity'){
      syncSelectedCenterLayerFromForm(); renderCenterChips();
    }
    renderEverything();
  });
});

function imageElementToPngBytes(imgEl){
  const c = document.createElement('canvas');
  c.width = imgEl.naturalWidth; c.height = imgEl.naturalHeight;
  c.getContext('2d').drawImage(imgEl, 0, 0);
  const b64 = c.toDataURL('image/png').split(',')[1];
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for(let i=0;i<bin.length;i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}
el('centerImageInput').addEventListener('change', e=>{
  const f = e.target.files[0]; if(!f) return;
  const layer = selectedCenterLayer(); if(!layer) return;
  const img = new Image();
  img.onload = ()=>{ layer.imageEl = img; layer.imagePngBytes = imageElementToPngBytes(img); renderEverything(); };
  img.src = URL.createObjectURL(f);
});

function renderCenterChips(){
  const wrap = el('centerChips');
  wrap.innerHTML = '';
  state.centerLayers.forEach((l, i)=>{
    const chip = document.createElement('div');
    chip.className = 'mark-chip' + (l.id===state.selectedCenterLayerId ? ' selected':'') + (l.enabled ? ' on':'');
    const dot = document.createElement('span'); dot.className = 'dot';
    const label = document.createElement('span');
    label.textContent = l.type==='text' ? (l.text ? l.text.slice(0,14) : 'Layer '+(i+1)) : 'Logo pattern';
    const del = document.createElement('button'); del.className = 'del'; del.textContent = '×';
    del.addEventListener('click', ev=>{
      ev.stopPropagation();
      state.centerLayers = state.centerLayers.filter(x=>x.id !== l.id);
      if(state.selectedCenterLayerId === l.id) state.selectedCenterLayerId = state.centerLayers[0]?.id || null;
      renderCenterChips(); populateCenterDetail(); syncCenterHandles(); renderEverything();
    });
    chip.appendChild(dot); chip.appendChild(label); chip.appendChild(del);
    chip.addEventListener('click', ()=>{ state.selectedCenterLayerId = l.id; renderCenterChips(); populateCenterDetail(); });
    wrap.appendChild(chip);
  });
  el('centerDetail').style.display = state.centerLayers.length ? 'block' : 'none';
  el('centerEmptyNote').style.display = state.centerLayers.length ? 'none' : 'block';
}
function populateCenterDetail(){
  const l = selectedCenterLayer();
  if(!l) return;
  el('centerEnabled').checked = l.enabled;
  document.querySelectorAll('#patternSeg button').forEach(b=>b.classList.toggle('active', b.dataset.val===l.pattern));
  el('diagonalAngleField').style.display = l.pattern==='diagonal' ? 'block' : 'none';
  document.querySelectorAll('#centerTypeSeg button').forEach(b=>b.classList.toggle('active', b.dataset.val===l.type));
  el('centerTextFields').style.display = l.type==='text' ? 'block' : 'none';
  el('centerImageFields').style.display = l.type==='image' ? 'block' : 'none';
  el('centerText').value = l.text; el('centerColor').value = l.color;
  el('centerAngle').value = l.angle; el('angleVal').textContent = l.angle+'°';
  el('centerSize').value = l.size; el('sizeVal').textContent = l.size+'px';
  el('centerSpacing').value = l.spacing; el('spacingVal').textContent = l.spacing+'px';
  el('centerOpacity').value = Math.round(l.opacity*100); el('opacityVal').textContent = Math.round(l.opacity*100)+'%';
  document.querySelectorAll('#centerDragSeg button').forEach(b=>b.classList.toggle('active', b.dataset.val===l.posMode));
}
el('addCenterBtn').addEventListener('click', ()=>{
  const l = newCenterLayer({enabled:true, text:'New pattern'});
  state.centerLayers.push(l);
  state.selectedCenterLayerId = l.id;
  renderCenterChips(); populateCenterDetail(); syncCenterHandles(); renderEverything();
});

/* ================= SIDEBAR WIRING: MARKS ================= */
function renderMarkChips(){
  const wrap = el('markChips');
  wrap.innerHTML = '';
  state.marks.forEach((m, i)=>{
    const chip = document.createElement('div');
    chip.className = 'mark-chip' + (m.id===state.selectedMarkId ? ' selected':'') + (m.enabled ? ' on':'');
    const dot = document.createElement('span'); dot.className = 'dot';
    const label = document.createElement('span');
    label.textContent = m.type==='text' ? (m.text ? m.text.slice(0,14) : 'Mark '+(i+1)) : 'Logo mark';
    const del = document.createElement('button'); del.className = 'del'; del.textContent = '×';
    del.addEventListener('click', ev=>{
      ev.stopPropagation();
      state.marks = state.marks.filter(x=>x.id !== m.id);
      if(state.selectedMarkId === m.id) state.selectedMarkId = state.marks[0]?.id || null;
      renderMarkChips(); populateMarkDetail(); syncMarkHandles(); renderEverything();
    });
    chip.appendChild(dot); chip.appendChild(label); chip.appendChild(del);
    chip.addEventListener('click', ()=>{ state.selectedMarkId = m.id; renderMarkChips(); populateMarkDetail(); });
    wrap.appendChild(chip);
  });
  el('markDetail').style.display = state.marks.length ? 'block' : 'none';
  el('markEmptyNote').style.display = state.marks.length ? 'none' : 'block';
}
function populateMarkDetail(){
  const m = selectedMark();
  if(!m) return;
  el('markEnabled').checked = m.enabled;
  document.querySelectorAll('#markTypeSeg button').forEach(b=>b.classList.toggle('active', b.dataset.val===m.type));
  el('markTextFields').style.display = m.type==='text' ? 'block' : 'none';
  el('markImageFields').style.display = m.type==='image' ? 'block' : 'none';
  el('markText').value = m.text; el('markColor').value = m.color;
  el('markSize').value = m.size; el('markSizeVal').textContent = m.size+'px';
  el('markOpacity').value = Math.round(m.opacity*100); el('markOpacityVal').textContent = Math.round(m.opacity*100)+'%';
  document.querySelectorAll('#markPosModeSeg button').forEach(b=>b.classList.toggle('active', b.dataset.val===m.posMode));
  el('markPosGrid').style.display = m.posMode==='fixed' ? 'grid' : 'none';
  document.querySelectorAll('#markPosGrid .pos-btn').forEach(b=>b.classList.toggle('active', b.dataset.val===m.cornerPos));
}
el('addMarkBtn').addEventListener('click', ()=>{
  const quadrants = ['tr','bl','br','tl'];
  const q = quadrants[state.marks.length % quadrants.length];
  const defaults = {tl:{x:0.06,y:0.06}, tr:{x:0.8,y:0.06}, bl:{x:0.06,y:0.86}, br:{x:0.8,y:0.86}};
  const m = newMark({text:'New mark', cornerPos:q, posXFrac:defaults[q].x, posYFrac:defaults[q].y, enabled:true});
  state.marks.push(m);
  state.selectedMarkId = m.id;
  renderMarkChips(); populateMarkDetail(); syncMarkHandles(); renderEverything();
});
el('resetPositionsBtn').addEventListener('click', ()=>{
  state.centerLayers.forEach(l=>{ l.posXFrac = 0.5; l.posYFrac = 0.5; });
  const defaults = {tl:{x:0.06,y:0.06}, tr:{x:0.8,y:0.06}, bl:{x:0.06,y:0.86}, br:{x:0.8,y:0.86}};
  state.marks.forEach(m=>{ const d = defaults[m.cornerPos] || defaults.tr; m.posXFrac = d.x; m.posYFrac = d.y; });
  positionHandles(); renderEverything();
});

wireSegmented('markTypeSeg', v=>{
  const m = selectedMark(); if(!m) return;
  m.type = v;
  el('markTextFields').style.display = v==='text' ? 'block' : 'none';
  el('markImageFields').style.display = v==='image' ? 'block' : 'none';
  renderMarkChips();
});
['markEnabled','markText','markColor','markSize','markOpacity'].forEach(id=>{
  el(id).addEventListener('input', ()=>{
    const m = selectedMark(); if(!m) return;
    if(id==='markEnabled') m.enabled = el(id).checked;
    if(id==='markText') m.text = el(id).value;
    if(id==='markColor') m.color = el(id).value;
    if(id==='markSize'){ m.size = parseInt(el(id).value,10); el('markSizeVal').textContent = m.size+'px'; }
    if(id==='markOpacity'){ m.opacity = parseInt(el(id).value,10)/100; el('markOpacityVal').textContent = Math.round(m.opacity*100)+'%'; }
    renderMarkChips(); renderEverything();
  });
});
el('markImageInput').addEventListener('change', e=>{
  const f = e.target.files[0]; if(!f) return;
  const m = selectedMark(); if(!m) return;
  const img = new Image();
  img.onload = ()=>{ m.imageEl = img; m.imagePngBytes = imageElementToPngBytes(img); renderEverything(); };
  img.src = URL.createObjectURL(f);
});
wireSegmented('markPosModeSeg', v=>{
  const m = selectedMark(); if(!m) return;
  m.posMode = v;
  el('markPosGrid').style.display = v==='fixed' ? 'grid' : 'none';
  syncMarkHandles();
});
document.querySelectorAll('#markPosGrid .pos-btn').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    document.querySelectorAll('#markPosGrid .pos-btn').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    const m = selectedMark(); if(!m) return;
    m.cornerPos = btn.dataset.val;
    renderEverything();
  });
});

/* ================= helpers: base64 <-> Uint8Array (for persisting logo images in presets) ================= */
function bytesToBase64(bytes){
  let bin = '';
  for(let i=0;i<bytes.length;i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}
function base64ToBytes(b64){
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for(let i=0;i<bin.length;i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}
function pngBytesToImage(bytes){
  return new Promise(resolve=>{
    const img = new Image();
    img.onload = ()=>resolve(img);
    img.src = 'data:image/png;base64,' + bytesToBase64(bytes);
  });
}

/* ================= PRESETS (localStorage) ================= */
const PRESET_KEY = 'proofmark_presets_v3';
function loadPresets(){ try{ return JSON.parse(localStorage.getItem(PRESET_KEY) || '{}'); }catch(e){ return {}; } }
function savePresets(p){ localStorage.setItem(PRESET_KEY, JSON.stringify(p)); }
function refreshPresetSelect(){
  const presets = loadPresets();
  const sel = el('presetSelect');
  sel.innerHTML = '<option value="">Load a saved preset…</option>';
  Object.keys(presets).forEach(name=>{
    const opt = document.createElement('option'); opt.value = name; opt.textContent = name; sel.appendChild(opt);
  });
}
el('presetSaveBtn').addEventListener('click', ()=>{
  const name = el('presetName').value.trim();
  if(!name) return;
  syncSelectedCenterLayerFromForm();
  const presets = loadPresets();
  presets[name] = {
    centerLayers: state.centerLayers.map(l=>({
      ...l, imageEl:null,
      imagePngBytesB64: l.imagePngBytes ? bytesToBase64(l.imagePngBytes) : null,
      imagePngBytes: undefined,
    })),
    bg: cfgBg(),
    marks: state.marks.map(m=>({
      ...m, imageEl:null,
      imagePngBytesB64: m.imagePngBytes ? bytesToBase64(m.imagePngBytes) : null,
      imagePngBytes: undefined,
    })),
  };
  savePresets(presets);
  refreshPresetSelect();
  el('presetName').value = '';
});
el('presetLoadBtn').addEventListener('click', async ()=>{
  const name = el('presetSelect').value; if(!name) return;
  const presets = loadPresets(); const p = presets[name]; if(!p) return;

  const layers = [];
  for(const raw of p.centerLayers){
    const layer = newCenterLayer(raw);
    if(raw.imagePngBytesB64){
      layer.imagePngBytes = base64ToBytes(raw.imagePngBytesB64);
      layer.imageEl = await pngBytesToImage(layer.imagePngBytes);
    }
    layers.push(layer);
  }
  state.centerLayers = layers;
  state.selectedCenterLayerId = state.centerLayers[0]?.id || null;

  const marks = [];
  for(const raw of p.marks){
    const m = newMark(raw);
    if(raw.imagePngBytesB64){
      m.imagePngBytes = base64ToBytes(raw.imagePngBytesB64);
      m.imageEl = await pngBytesToImage(m.imagePngBytes);
    }
    marks.push(m);
  }
  state.marks = marks;
  state.selectedMarkId = state.marks[0]?.id || null;

  el('bgEnabled').checked = p.bg.enabled;
  document.querySelector(`#bgStyleSeg [data-val="${p.bg.style}"]`)?.click();
  el('bgColor').value = p.bg.color;
  el('bgOpacity').value = Math.round(p.bg.opacity*100); el('bgOpacityVal').textContent = Math.round(p.bg.opacity*100)+'%';

  renderCenterChips(); populateCenterDetail();
  renderMarkChips(); populateMarkDetail();
  syncCenterHandles(); syncMarkHandles();
  renderEverything();
});
el('presetDeleteBtn').addEventListener('click', ()=>{
  const name = el('presetSelect').value; if(!name) return;
  const presets = loadPresets(); delete presets[name]; savePresets(presets); refreshPresetSelect();
});
refreshPresetSelect();

/* ================= DRAG HANDLES (Images preview) ================= */
function updateHandleVisibility(){ syncCenterHandles(); syncMarkHandles(); }
function positionHandles(){
  Object.entries(state.centerHandleEls).forEach(([id, handle])=>{
    const l = state.centerLayers.find(x=>x.id===id);
    if(!l) return;
    handle.style.left = (l.posXFrac*100) + '%';
    handle.style.top = (l.posYFrac*100) + '%';
  });
  Object.entries(state.markHandleEls).forEach(([id, handle])=>{
    const m = state.marks.find(x=>x.id===id);
    if(!m) return;
    handle.style.left = (m.posXFrac*100) + '%';
    handle.style.top = (m.posYFrac*100) + '%';
  });
}
function makeDraggable(handle, onDrag){
  let dragging = false;
  const move = (clientX, clientY) => {
    const canvas = el('previewCanvasImg');
    const rect = canvas.getBoundingClientRect();
    if(rect.width === 0 || rect.height === 0) return;
    let fx = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    let fy = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
    onDrag(fx, fy);
  };
  handle.addEventListener('pointerdown', e=>{ dragging = true; handle.setPointerCapture(e.pointerId); e.preventDefault(); });
  handle.addEventListener('pointermove', e=>{ if(!dragging) return; move(e.clientX, e.clientY); positionHandles(); renderEverything(); });
  handle.addEventListener('pointerup', ()=>{ dragging = false; });
  handle.addEventListener('pointercancel', ()=>{ dragging = false; });
}
function syncCenterHandles(){
  const frame = el('proofFrameImg');
  Object.keys(state.centerHandleEls).forEach(id=>{
    const l = state.centerLayers.find(x=>x.id===id);
    if(!l || l.posMode !== 'drag'){ state.centerHandleEls[id].remove(); delete state.centerHandleEls[id]; }
  });
  state.centerLayers.forEach(l=>{
    if(l.enabled && l.posMode === 'drag' && !state.centerHandleEls[l.id]){
      const h = document.createElement('div');
      h.className = 'drag-handle show';
      h.title = 'Drag to reposition this center pattern';
      frame.appendChild(h);
      makeDraggable(h, (fx,fy)=>{ l.posXFrac = fx; l.posYFrac = fy; });
      state.centerHandleEls[l.id] = h;
    }
  });
  positionHandles();
}

function syncMarkHandles(){
  const frame = el('proofFrameImg');
  // remove handles for marks that no longer exist or aren't draggable
  Object.keys(state.markHandleEls).forEach(id=>{
    const m = state.marks.find(x=>x.id===id);
    if(!m || m.posMode !== 'drag'){ state.markHandleEls[id].remove(); delete state.markHandleEls[id]; }

  });
  // add handles for draggable marks that don't have one yet
  state.marks.forEach(m=>{
    if(m.posMode === 'drag' && !state.markHandleEls[m.id]){
      const h = document.createElement('div');
      h.className = 'drag-handle show';
      h.title = 'Drag to reposition this mark';
      frame.appendChild(h);
      makeDraggable(h, (fx,fy)=>{ m.posXFrac = fx; m.posYFrac = fy; });
      state.markHandleEls[m.id] = h;
    }
  });
  positionHandles();
}

/* ================= EXPORT FORMAT / COMPRESSION UI ================= */
el('exportFormat').addEventListener('change', ()=>{ el('exportQuality').disabled = el('exportFormat').value === 'png'; });
el('convertFormat').addEventListener('change', ()=>{ el('convertQuality').disabled = el('convertFormat').value === 'png'; });
el('exportQuality').addEventListener('input', ()=>{ el('exportQualityVal').textContent = el('exportQuality').value + '%'; });
el('convertQuality').addEventListener('input', ()=>{ el('convertQualityVal').textContent = el('convertQuality').value + '%'; });

function wireCompressModeSeg(segId, qualityFieldId, sizeFieldId){
  document.querySelectorAll('#'+segId+' button').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      document.querySelectorAll('#'+segId+' button').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      el(qualityFieldId).style.display = btn.dataset.val === 'quality' ? 'block' : 'none';
      el(sizeFieldId).style.display = btn.dataset.val === 'size' ? 'block' : 'none';
    });
  });
}
wireCompressModeSeg('compressModeSeg', 'qualityModeField', 'sizeModeField');
wireCompressModeSeg('convertCompressModeSeg', 'convertQualityField', 'convertSizeField');

function wireTargetSizePresets(segId, sliderId, valId){
  document.querySelectorAll('#'+segId+' button').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      document.querySelectorAll('#'+segId+' button').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      if(btn.dataset.val !== 'custom'){ el(sliderId).value = btn.dataset.val; el(valId).textContent = btn.dataset.val + ' KB'; }
    });
  });
  el(sliderId).addEventListener('input', ()=>{
    el(valId).textContent = el(sliderId).value + ' KB';
    document.querySelectorAll('#'+segId+' button').forEach(b=>b.classList.remove('active'));
    document.querySelector('#'+segId+' [data-val="custom"]').classList.add('active');
  });
}
wireTargetSizePresets('targetSizePresetSeg', 'targetSizeKB', 'targetSizeVal');
wireTargetSizePresets('convertTargetSizePresetSeg', 'convertTargetSizeKB', 'convertTargetSizeVal');

/* ================= WATERMARK ENGINE (shared: images, pdf preview, video overlay) ================= */
function drawWatermarks(ctx, w, h, centerLayers, marks, bg){
  centerLayers.forEach(center=>{
    if(!center.enabled) return;
    if(bg.enabled) drawCenterBackground(ctx, w, h, center, bg);
    ctx.save(); ctx.globalAlpha = center.opacity;
    if(center.pattern === 'strip') drawStrip(ctx, w, h, center);
    else drawDiagonalTile(ctx, w, h, center);
    ctx.restore();
  });
  marks.forEach(mark=>{
    if(!mark.enabled) return;
    if(bg.enabled) drawMarkBackground(ctx, w, h, mark, bg);
    ctx.save(); ctx.globalAlpha = mark.opacity;
    drawMark(ctx, w, h, mark);
    ctx.restore();
  });
}
function itemMetrics(ctx, center){
  if(center.type === 'text'){
    ctx.font = `600 ${center.size}px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif`;
    const width = ctx.measureText(center.text || ' ').width || center.size;
    return {width, height: center.size};
  } else {
    const img = center.imageEl;
    if(!img) return {width: center.size, height: center.size};
    const height = center.size * 2;
    return {width: height * (img.width / img.height), height};
  }
}
function drawCenterItem(ctx, center, x, y){
  if(center.type === 'text'){
    ctx.fillStyle = center.color;
    ctx.font = `600 ${center.size}px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif`;
    ctx.textBaseline = 'middle';
    ctx.fillText(center.text || '', x, y);
  } else if(center.imageEl){
    const height = center.size * 2;
    const width = height * (center.imageEl.width / center.imageEl.height);
    ctx.drawImage(center.imageEl, x, y - height/2, width, height);
  }
}
function centerOffsets(w, h, center){
  return center.posMode==='drag' ? { ox: center.posXFrac*w - w/2, oy: center.posYFrac*h - h/2 } : { ox: 0, oy: 0 };
}
function drawStrip(ctx, w, h, center){
  const m = itemMetrics(ctx, center);
  const step = m.width + center.spacing;
  if(step <= 0) return;
  const { ox, oy } = centerOffsets(w, h, center);
  const y = h/2 + oy;
  let x = -step + (ox % step);
  while(x < w + step){ drawCenterItem(ctx, center, x, y); x += step; }
}
function drawDiagonalTile(ctx, w, h, center){
  const m = itemMetrics(ctx, center);
  const stepX = m.width + center.spacing, stepY = m.height + center.spacing;
  if(stepX <= 0 || stepY <= 0) return;
  const { ox, oy } = centerOffsets(w, h, center);
  const cx = w/2 + ox, cy = h/2 + oy;
  const diag = Math.sqrt(w*w + h*h);
  ctx.save();
  ctx.translate(cx, cy); ctx.rotate(center.angle * Math.PI / 180); ctx.translate(-cx, -cy);
  for(let y = cy - diag; y < cy + diag; y += stepY){
    for(let x = cx - diag; x < cx + diag; x += stepX){ drawCenterItem(ctx, center, x, y); }
  }
  ctx.restore();
}
function drawCenterBackground(ctx, w, h, center, bg){
  ctx.save(); ctx.globalAlpha = bg.opacity; ctx.fillStyle = bg.color;
  const measureCtx = ctx;
  if(bg.style === 'strip'){
    if(center.pattern === 'strip'){
      const m = itemMetrics(measureCtx, center);
      const { oy } = centerOffsets(w, h, center);
      const y = h/2 + oy;
      const padY = m.height * 0.4;
      ctx.fillRect(0, y - m.height/2 - padY, w, m.height + padY*2);
    } else {
      ctx.fillRect(0, 0, w, h);
    }
  } else {
    const m = itemMetrics(measureCtx, center);
    const padX = m.width * 0.18, padY = m.height * 0.35;
    const boxW = m.width + padX*2, boxH = m.height + padY*2;
    if(center.pattern === 'strip'){
      const step = m.width + center.spacing;
      if(step > 0){
        const { ox, oy } = centerOffsets(w, h, center);
        const y = h/2 + oy;
        let x = -step + (ox % step);
        while(x < w + step){ ctx.fillRect(x - padX, y - boxH/2, boxW, boxH); x += step; }
      }
    } else {
      const stepX = m.width + center.spacing, stepY = m.height + center.spacing;
      if(stepX > 0 && stepY > 0){
        const { ox, oy } = centerOffsets(w, h, center);
        const cx = w/2+ox, cy = h/2+oy;
        const diag = Math.sqrt(w*w+h*h);
        ctx.save();
        ctx.translate(cx, cy); ctx.rotate(center.angle * Math.PI/180); ctx.translate(-cx, -cy);
        for(let y=cy-diag; y<cy+diag; y+=stepY){
          for(let x=cx-diag; x<cx+diag; x+=stepX){ ctx.fillRect(x - padX, y - boxH/2, boxW, boxH); }
        }
        ctx.restore();
      }
    }
  }
  ctx.restore();
}
function markXY(w, h, mark, contentW, contentH, textMode){
  if(mark.posMode === 'drag'){
    return {x: mark.posXFrac*w, y: mark.posYFrac*h};
  }
  const pad = mark.size * 0.9;
  let x, y;
  if(textMode){
    if(mark.cornerPos==='tl'){x=pad; y=pad+mark.size;}
    if(mark.cornerPos==='tr'){x=w-pad; y=pad+mark.size;}
    if(mark.cornerPos==='bl'){x=pad; y=h-pad;}
    if(mark.cornerPos==='br'){x=w-pad; y=h-pad;}
  } else {
    if(mark.cornerPos==='tl'){x=pad; y=pad;}
    if(mark.cornerPos==='tr'){x=w-pad-contentW; y=pad;}
    if(mark.cornerPos==='bl'){x=pad; y=h-pad-contentH;}
    if(mark.cornerPos==='br'){x=w-pad-contentW; y=h-pad-contentH;}
  }
  return {x, y};
}
function drawMark(ctx, w, h, mark){
  if(mark.type === 'text'){
    ctx.font = `600 ${mark.size}px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif`;
    ctx.fillStyle = mark.color;
    ctx.textBaseline = mark.posMode==='drag' ? 'top' : 'alphabetic';
    ctx.textAlign = mark.posMode==='drag' ? 'left' : ((mark.cornerPos==='tr'||mark.cornerPos==='br') ? 'right' : 'left');
    const {x,y} = markXY(w, h, mark, 0, 0, true);
    ctx.fillText(mark.text || '', x, y);
    ctx.textAlign = 'left';
  } else if(mark.imageEl){
    const height = mark.size * 3;
    const width = height * (mark.imageEl.width / mark.imageEl.height);
    const {x,y} = markXY(w, h, mark, width, height, false);
    ctx.drawImage(mark.imageEl, x, y, width, height);
  }
}
function drawMarkBackground(ctx, w, h, mark, bg){
  ctx.save(); ctx.globalAlpha = bg.opacity; ctx.fillStyle = bg.color;
  const padX = mark.size*0.5, padY = mark.size*0.4;
  if(mark.type === 'text'){
    const measureCtx = document.createElement('canvas').getContext('2d');
    measureCtx.font = `600 ${mark.size}px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif`;
    const tw = measureCtx.measureText(mark.text || '').width;
    const th = mark.size;
    let {x,y} = markXY(w, h, mark, tw, th, true);
    let boxX, boxY;
    if(mark.posMode==='drag'){ boxX = x - padX; boxY = y - padY; }
    else {
      const rightAlign = (mark.cornerPos==='tr'||mark.cornerPos==='br');
      boxX = (rightAlign ? x - tw : x) - padX;
      boxY = y - th - padY*0.3;
    }
    ctx.fillRect(boxX, boxY, tw + padX*2, th + padY*1.6);
  } else if(mark.imageEl){
    const height = mark.size * 3;
    const width = height * (mark.imageEl.width / mark.imageEl.height);
    const {x,y} = markXY(w, h, mark, width, height, false);
    ctx.fillRect(x - padX, y - padY, width + padX*2, height + padY*2);
  }
  ctx.restore();
}

function renderEverything(){
  renderAllImages();
  renderPdfPreview();
  renderVideoPreview();
  updateMobileThumb();
}

/* ---- mobile live-preview thumbnail (shown inside the settings drawer) ---- */
function updateMobileThumb(){
  if(window.innerWidth > 880) return;
  const tab = document.querySelector('nav.tabs button.active')?.dataset.tab;
  let source = null;
  if(tab === 'images' && state.images.length) source = el('previewCanvasImg');
  else if(tab === 'pdfs' && state.pdfs.length) source = el('previewCanvasPdf');
  else if(tab === 'video' && state.videos.length) source = el('previewCanvasVideo');
  const wrap = el('mobilePreviewThumb');
  if(!source || !source.width){ wrap.style.display = 'none'; return; }
  wrap.style.display = 'block';
  const thumb = el('mobileThumbCanvas');
  const maxW = 280;
  const scale = Math.min(1, maxW / source.width);
  thumb.width = Math.round(source.width * scale);
  thumb.height = Math.round(source.height * scale);
  thumb.getContext('2d').drawImage(source, 0, 0, thumb.width, thumb.height);
}

/* ---- keep --header-h in sync so the desktop two-pane layout fits exactly ---- */
function syncHeaderHeight(){
  const h = document.querySelector('header')?.offsetHeight || 74;
  document.documentElement.style.setProperty('--header-h', h + 'px');
}
window.addEventListener('resize', ()=>{ syncHeaderHeight(); updateMobileThumb(); });
syncHeaderHeight();

/* ================= IMAGES TAB ================= */
function renderImageToCanvas(canvas, imgObj){
  canvas.width = imgObj.img.naturalWidth;
  canvas.height = imgObj.img.naturalHeight;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0,0,canvas.width, canvas.height);
  ctx.drawImage(imgObj.img, 0, 0);
  drawWatermarks(ctx, canvas.width, canvas.height, state.centerLayers, state.marks, cfgBg());
}
function renderAllImages(){
  const has = state.images.length > 0;
  el('countNoteImg').textContent = has ? `${state.images.length} in batch` : '';
  el('downloadAllBtnImg').disabled = !has;
  el('emptyNoteImg').style.display = has ? 'none' : 'block';
  el('proofFrameImg').style.display = has ? 'block' : 'none';

  if(has){
    const active = state.images.find(i=>i.id === state.activeImageId) || state.images[0];
    state.activeImageId = active.id;
    renderImageToCanvas(el('previewCanvasImg'), active);
    positionHandles();
  }
  updateHandleVisibility();

  const thumbs = el('thumbsImg');
  thumbs.innerHTML = '';
  state.images.forEach(imgObj=>{
    const wrap = document.createElement('div');
    wrap.className = 'thumb' + (imgObj.id === state.activeImageId ? ' active' : '');
    const canvas = document.createElement('canvas');
    renderImageToCanvas(canvas, imgObj);
    const fname = document.createElement('div'); fname.className = 'fname'; fname.textContent = imgObj.name;
    const rm = document.createElement('button'); rm.className = 'rm'; rm.textContent = '×';
    rm.addEventListener('click', ev=>{
      ev.stopPropagation();
      state.images = state.images.filter(i=>i.id !== imgObj.id);
      if(state.activeImageId === imgObj.id) state.activeImageId = state.images[0]?.id || null;
      renderAllImages();
    });
    const adj = document.createElement('button'); adj.className = 'adj'; adj.textContent = 'CROP';
    adj.addEventListener('click', ev=>{ ev.stopPropagation(); openPerImageCrop(imgObj); });
    wrap.addEventListener('click', ()=>{ state.activeImageId = imgObj.id; renderAllImages(); });
    wrap.appendChild(canvas); wrap.appendChild(fname); wrap.appendChild(rm); wrap.appendChild(adj);
    thumbs.appendChild(wrap);
  });
  updateStatusChip();
  updateMobileThumb();
}

const dropzoneImg = el('dropzoneImg'), fileInputImg = el('fileInputImg');
dropzoneImg.addEventListener('click', ()=>fileInputImg.click());
dropzoneImg.addEventListener('dragover', e=>{e.preventDefault(); dropzoneImg.classList.add('drag');});
dropzoneImg.addEventListener('dragleave', ()=>dropzoneImg.classList.remove('drag'));
dropzoneImg.addEventListener('drop', e=>{ e.preventDefault(); dropzoneImg.classList.remove('drag'); handleImageFiles(e.dataTransfer.files); });
fileInputImg.addEventListener('change', e=>handleImageFiles(e.target.files));

async function loadImageFile(f){
  return new Promise(resolve=>{ const img = new Image(); img.onload = ()=>resolve(img); img.src = URL.createObjectURL(f); });
}
async function handleImageFiles(fileList){
  const files = [...fileList].filter(f=>f.type.startsWith('image/'));
  if(files.length === 0) return;
  const loaded = [];
  for(const f of files){
    const img = await loadImageFile(f);
    loaded.push({id:'img_'+Math.random().toString(36).slice(2,9), name:f.name, img});
  }
  openBatchCropModal(loaded);
}
el('clearBtnImg').addEventListener('click', ()=>{ state.images = []; state.activeImageId = null; renderAllImages(); });

/* ---- compression helpers (shared: Images tab, Convert tab) ---- */
function scaleCenterLayersForRender(centerLayers, scale){
  return centerLayers.map(c=>({...c, size: c.size*scale, spacing: c.spacing*scale}));
}
function scaleMarksForRender(marks, scale){
  return marks.map(m=>({...m, size: m.size*scale}));
}
function renderScaledCanvas(imgEl, scale, centerLayers, marks, bg, applyWatermark){
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(imgEl.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(imgEl.naturalHeight * scale));
  const ctx = canvas.getContext('2d');
  ctx.drawImage(imgEl, 0, 0, canvas.width, canvas.height);
  if(applyWatermark) drawWatermarks(ctx, canvas.width, canvas.height, scaleCenterLayersForRender(centerLayers, scale), scaleMarksForRender(marks, scale), bg);
  return canvas;
}
async function compressToTarget(imgEl, centerLayers, marks, bg, mime, targetBytes, applyWatermark){
  const scales = [1, 0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 0.25, 0.2, 0.15];
  const qualities = mime === 'image/png' ? [1] : [0.9, 0.75, 0.6, 0.45, 0.3, 0.15];
  let smallest = null;
  for(const scale of scales){
    const canvas = renderScaledCanvas(imgEl, scale, centerLayers, marks, bg, applyWatermark);
    for(const q of qualities){
      const blob = await new Promise(res=>canvas.toBlob(res, mime, mime==='image/png'?undefined:q));
      if(!blob) continue;
      if(!smallest || blob.size < smallest.size) smallest = blob;
      if(blob.size <= targetBytes) return blob;
    }
  }
  return smallest;
}
async function exportImageBlob(imgEl, centerLayers, marks, bg, format, mode, qualityPct, targetKB, applyWatermark){
  const mime = format === 'jpeg' ? 'image/jpeg' : format === 'webp' ? 'image/webp' : 'image/png';
  if(mode === 'size') return compressToTarget(imgEl, centerLayers, marks, bg, mime, targetKB*1024, applyWatermark);
  const canvas = renderScaledCanvas(imgEl, 1, centerLayers, marks, bg, applyWatermark);
  return new Promise(res=>canvas.toBlob(res, mime, format==='png' ? undefined : qualityPct/100));
}

el('downloadAllBtnImg').addEventListener('click', async ()=>{
  syncSelectedCenterLayerFromForm();
  const centerLayers = state.centerLayers, marks = state.marks, bg = cfgBg();
  const format = el('exportFormat').value;
  const mode = document.querySelector('#compressModeSeg .active').dataset.val;
  const qualityPct = parseInt(el('exportQuality').value, 10);
  const targetKB = parseInt(el('targetSizeKB').value, 10);
  const ext = format === 'jpeg' ? 'jpg' : format;

  const zip = new JSZip();
  const btn = el('downloadAllBtnImg');
  const originalLabel = btn.textContent;
  btn.disabled = true;

  for(let i=0; i<state.images.length; i++){
    btn.textContent = `Processing ${i+1}/${state.images.length}...`;
    const imgObj = state.images[i];
    const blob = await exportImageBlob(imgObj.img, centerLayers, marks, bg, format, mode, qualityPct, targetKB, true);
    const base = imgObj.name.replace(/\.[^.]+$/, '');
    zip.file(`${base}-watermarked.${ext}`, blob);
  }
  btn.textContent = 'Zipping...';
  const content = await zip.generateAsync({type:'blob'});
  const url = URL.createObjectURL(content);
  const a = document.createElement('a'); a.href = url; a.download = 'proofmark-watermarked-images.zip'; a.click();
  URL.revokeObjectURL(url);
  btn.textContent = originalLabel; btn.disabled = false;
});

/* ================= PDFs TAB ================= */
const dropzonePdf = el('dropzonePdf'), fileInputPdf = el('fileInputPdf');
dropzonePdf.addEventListener('click', ()=>fileInputPdf.click());
dropzonePdf.addEventListener('dragover', e=>{e.preventDefault(); dropzonePdf.classList.add('drag');});
dropzonePdf.addEventListener('dragleave', ()=>dropzonePdf.classList.remove('drag'));
dropzonePdf.addEventListener('drop', e=>{ e.preventDefault(); dropzonePdf.classList.remove('drag'); handlePdfFiles(e.dataTransfer.files); });
fileInputPdf.addEventListener('change', e=>handlePdfFiles(e.target.files));

async function handlePdfFiles(fileList){
  for(const f of [...fileList]){
    if(f.type !== 'application/pdf') continue;
    const bytes = new Uint8Array(await f.arrayBuffer());
    const id = 'pdf_' + Math.random().toString(36).slice(2,9);
    const doc = await pdfjsLib.getDocument({data: bytes.slice()}).promise;
    state.pdfs.push({id, name:f.name, bytes, numPages: doc.numPages, activePage: 1});
    if(!state.activePdfId) state.activePdfId = id;
    renderPdfThumbs(); renderPdfPreview();
  }
}
async function renderPageToCanvas(canvas, pdfItem, pageNum, withWatermark){
  const doc = await pdfjsLib.getDocument({data: pdfItem.bytes.slice()}).promise;
  const page = await doc.getPage(pageNum);
  const viewport = page.getViewport({scale: 1.5});
  canvas.width = viewport.width; canvas.height = viewport.height;
  const ctx = canvas.getContext('2d');
  await page.render({canvasContext: ctx, viewport}).promise;
  if(withWatermark) drawWatermarks(ctx, canvas.width, canvas.height, state.centerLayers, state.marks, cfgBg());
}
async function renderPdfPreview(){
  const has = state.pdfs.length > 0;
  el('emptyNotePdf').style.display = has ? 'none' : 'block';
  el('proofFramePdf').style.display = has ? 'block' : 'none';
  el('pageNavPdf').style.display = has ? 'flex' : 'none';
  el('downloadAllBtnPdf').disabled = !has;
  el('countNotePdf').textContent = has ? `${state.pdfs.length} in batch` : '';
  if(!has){ updateMobileThumb(); return; }
  const active = state.pdfs.find(p=>p.id === state.activePdfId) || state.pdfs[0];
  state.activePdfId = active.id;
  await renderPageToCanvas(el('previewCanvasPdf'), active, active.activePage, true);
  el('pdfPageLabel').textContent = `${active.activePage} / ${active.numPages}`;
  updateStatusChip();
  updateMobileThumb();
}
el('pdfPrevPage').addEventListener('click', ()=>{
  const active = state.pdfs.find(p=>p.id === state.activePdfId); if(!active) return;
  active.activePage = Math.max(1, active.activePage - 1); renderPdfPreview();
});
el('pdfNextPage').addEventListener('click', ()=>{
  const active = state.pdfs.find(p=>p.id === state.activePdfId); if(!active) return;
  active.activePage = Math.min(active.numPages, active.activePage + 1); renderPdfPreview();
});
async function renderPdfThumbs(){
  const thumbs = el('thumbsPdf'); thumbs.innerHTML = '';
  for(const pdfItem of state.pdfs){
    const wrap = document.createElement('div');
    wrap.className = 'thumb' + (pdfItem.id === state.activePdfId ? ' active' : '');
    const canvas = document.createElement('canvas');
    await renderPageToCanvas(canvas, pdfItem, 1, true);
    const fname = document.createElement('div'); fname.className = 'fname'; fname.textContent = `${pdfItem.name} · ${pdfItem.numPages}p`;
    const rm = document.createElement('button'); rm.className = 'rm'; rm.textContent = '×';
    rm.addEventListener('click', ev=>{
      ev.stopPropagation();
      state.pdfs = state.pdfs.filter(p=>p.id !== pdfItem.id);
      if(state.activePdfId === pdfItem.id) state.activePdfId = state.pdfs[0]?.id || null;
      renderPdfThumbs(); renderPdfPreview();
    });
    wrap.addEventListener('click', ()=>{ state.activePdfId = pdfItem.id; renderPdfThumbs(); renderPdfPreview(); });
    wrap.appendChild(canvas); wrap.appendChild(fname); wrap.appendChild(rm);
    thumbs.appendChild(wrap);
  }
  updateStatusChip();
}
el('clearBtnPdf').addEventListener('click', ()=>{ state.pdfs = []; state.activePdfId = null; renderPdfThumbs(); renderPdfPreview(); });

async function stampPdf(pdfItem, centerLayers, marks){
  const pdfDoc = await PDFDocument.load(pdfItem.bytes);
  const font = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const centerImgEmbeds = {};
  for(const c of centerLayers){
    if(c.enabled && c.type === 'image' && c.imagePngBytes) centerImgEmbeds[c.id] = await pdfDoc.embedPng(c.imagePngBytes);
  }
  const markEmbeds = {};
  for(const m of marks){
    if(m.enabled && m.type === 'image' && m.imagePngBytes) markEmbeds[m.id] = await pdfDoc.embedPng(m.imagePngBytes);
  }
  for(const page of pdfDoc.getPages()){
    const { width, height } = page.getSize();
    centerLayers.forEach(center=>{
      if(!center.enabled) return;
      const colorRgb = hexToRgb(center.color);
      if(center.pattern === 'strip') stampStrip(page, width, height, center, font, colorRgb, centerImgEmbeds[center.id]);
      else stampDiagonal(page, width, height, center, font, colorRgb, centerImgEmbeds[center.id]);
    });
    marks.forEach(m=>{ if(m.enabled) stampMark(page, width, height, m, font, markEmbeds[m.id]); });
  }
  return pdfDoc.save();
}
function hexToRgb(hex){ const n = parseInt(hex.replace('#',''), 16); return rgb(((n>>16)&255)/255, ((n>>8)&255)/255, (n&255)/255); }
function pdfItemMetrics(font, center){
  if(center.type === 'text'){
    const width = font.widthOfTextAtSize(center.text || ' ', center.size) || center.size;
    return {width, height: center.size};
  } else {
    const img = center.imageEl;
    if(!img) return {width: center.size, height: center.size};
    const height = center.size * 2;
    return {width: height * (img.width / img.height), height};
  }
}
function stampPdfItem(page, center, font, colorRgb, imgEmbed, x, y, rotateDeg){
  if(center.type === 'text'){
    page.drawText(center.text || '', {x, y, size: center.size, font, color: colorRgb, opacity: center.opacity, rotate: degrees(rotateDeg || 0)});
  } else if(imgEmbed){
    const height = center.size * 2;
    const width = height * (imgEmbed.width / imgEmbed.height);
    page.drawImage(imgEmbed, {x, y: y - height/2, width, height, opacity: center.opacity, rotate: degrees(rotateDeg || 0)});
  }
}
function pdfCenterOffsets(w, h, center){
  return center.posMode==='drag' ? {ox: center.posXFrac*w - w/2, oy: h - center.posYFrac*h - h/2} : {ox:0, oy:0};
}
function stampStrip(page, w, h, center, font, colorRgb, imgEmbed){
  const m = pdfItemMetrics(font, center);
  const step = m.width + center.spacing;
  if(step <= 0) return;
  const { ox, oy } = pdfCenterOffsets(w, h, center);
  const y = h/2 + oy - (center.type==='text' ? center.size*0.35 : 0);
  let x = -step + (ox % step);
  while(x < w + step){ stampPdfItem(page, center, font, colorRgb, imgEmbed, x, y, 0); x += step; }
}
function stampDiagonal(page, w, h, center, font, colorRgb, imgEmbed){
  const m = pdfItemMetrics(font, center);
  const stepX = m.width + center.spacing, stepY = m.height + center.spacing;
  if(stepX <= 0 || stepY <= 0) return;
  const { ox, oy } = pdfCenterOffsets(w, h, center);
  const cx = w/2+ox, cy = h/2+oy;
  const diag = Math.sqrt(w*w + h*h);
  const theta = center.angle * Math.PI / 180;
  for(let ly = cy - diag; ly < cy + diag; ly += stepY){
    for(let lx = cx - diag; lx < cx + diag; lx += stepX){
      const dx = lx - cx, dy = ly - cy;
      const rx = dx*Math.cos(theta) - dy*Math.sin(theta);
      const ry = dx*Math.sin(theta) + dy*Math.cos(theta);
      stampPdfItem(page, center, font, colorRgb, imgEmbed, cx+rx, cy+ry, center.angle);
    }
  }
}
function pdfMarkXY(w, h, mark, contentW, contentH, textMode){
  if(mark.posMode === 'drag'){
    return {x: mark.posXFrac*w, y: h - mark.posYFrac*h - (textMode?mark.size:contentH)};
  }
  const pad = mark.size * 0.9;
  let x, y;
  if(mark.cornerPos==='tl'){x=pad; y=h-pad-contentH;}
  if(mark.cornerPos==='tr'){x=w-pad-contentW; y=h-pad-contentH;}
  if(mark.cornerPos==='bl'){x=pad; y=pad;}
  if(mark.cornerPos==='br'){x=w-pad-contentW; y=pad;}
  return {x, y};
}
function stampMark(page, w, h, mark, font, imgEmbed){
  if(mark.type === 'text'){
    const textWidth = font.widthOfTextAtSize(mark.text || '', mark.size);
    const {x,y} = pdfMarkXY(w, h, mark, textWidth, mark.size, true);
    page.drawText(mark.text || '', {x, y, size:mark.size, font, color: hexToRgb(mark.color), opacity: mark.opacity});
  } else if(imgEmbed){
    const height = mark.size * 3;
    const width = height * (imgEmbed.width / imgEmbed.height);
    const {x,y} = pdfMarkXY(w, h, mark, width, height, false);
    page.drawImage(imgEmbed, {x, y, width, height, opacity: mark.opacity});
  }
}

el('downloadAllBtnPdf').addEventListener('click', async ()=>{
  syncSelectedCenterLayerFromForm();
  const centerLayers = state.centerLayers, marks = state.marks;
  const btn = el('downloadAllBtnPdf');
  const originalLabel = btn.textContent;
  btn.disabled = true;
  if(state.pdfs.length === 1){
    btn.textContent = 'Stamping...';
    const pdfItem = state.pdfs[0];
    const outBytes = await stampPdf(pdfItem, centerLayers, marks);
    const blob = new Blob([outBytes], {type:'application/pdf'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = pdfItem.name.replace(/\.pdf$/i,'') + '-watermarked.pdf'; a.click();
    URL.revokeObjectURL(url);
  } else {
    const zip = new JSZip();
    for(let i=0; i<state.pdfs.length; i++){
      btn.textContent = `Stamping ${i+1}/${state.pdfs.length}...`;
      const pdfItem = state.pdfs[i];
      const outBytes = await stampPdf(pdfItem, centerLayers, marks);
      zip.file(pdfItem.name.replace(/\.pdf$/i,'') + '-watermarked.pdf', outBytes);
    }
    btn.textContent = 'Zipping...';
    const content = await zip.generateAsync({type:'blob'});
    const url = URL.createObjectURL(content);
    const a = document.createElement('a'); a.href = url; a.download = 'proofmark-watermarked-pdfs.zip'; a.click();
    URL.revokeObjectURL(url);
  }
  btn.textContent = originalLabel; btn.disabled = false;
});

/* ================= CONVERT TAB (no watermark) ================= */
const dropzoneConvert = el('dropzoneConvert'), fileInputConvert = el('fileInputConvert');
dropzoneConvert.addEventListener('click', ()=>fileInputConvert.click());
dropzoneConvert.addEventListener('dragover', e=>{e.preventDefault(); dropzoneConvert.classList.add('drag');});
dropzoneConvert.addEventListener('dragleave', ()=>dropzoneConvert.classList.remove('drag'));
dropzoneConvert.addEventListener('drop', e=>{ e.preventDefault(); dropzoneConvert.classList.remove('drag'); handleConvertFiles(e.dataTransfer.files); });
fileInputConvert.addEventListener('change', e=>handleConvertFiles(e.target.files));

async function handleConvertFiles(fileList){
  for(const f of [...fileList]){
    if(!f.type.startsWith('image/')) continue;
    const img = await loadImageFile(f);
    const id = 'cv_' + Math.random().toString(36).slice(2,9);
    state.convertImages.push({id, name:f.name, img});
  }
  renderConvertThumbs();
}
function renderConvertThumbs(){
  const has = state.convertImages.length > 0;
  el('countNoteConvert').textContent = has ? `${state.convertImages.length} file${has?'s':''}` : '';
  el('downloadAllBtnConvert').disabled = !has;
  const thumbs = el('thumbsConvert'); thumbs.innerHTML = '';
  state.convertImages.forEach(imgObj=>{
    const wrap = document.createElement('div'); wrap.className = 'thumb';
    const canvas = document.createElement('canvas');
    canvas.width = imgObj.img.naturalWidth; canvas.height = imgObj.img.naturalHeight;
    canvas.getContext('2d').drawImage(imgObj.img, 0, 0);
    const fname = document.createElement('div'); fname.className = 'fname'; fname.textContent = imgObj.name;
    const rm = document.createElement('button'); rm.className = 'rm'; rm.textContent = '×';
    rm.addEventListener('click', ()=>{ state.convertImages = state.convertImages.filter(i=>i.id!==imgObj.id); renderConvertThumbs(); });
    wrap.appendChild(canvas); wrap.appendChild(fname); wrap.appendChild(rm);
    thumbs.appendChild(wrap);
  });
  updateStatusChip();
}
el('clearBtnConvert').addEventListener('click', ()=>{ state.convertImages = []; renderConvertThumbs(); });

el('downloadAllBtnConvert').addEventListener('click', async ()=>{
  const format = el('convertFormat').value;
  const mode = document.querySelector('#convertCompressModeSeg .active').dataset.val;
  const qualityPct = parseInt(el('convertQuality').value, 10);
  const targetKB = parseInt(el('convertTargetSizeKB').value, 10);
  const ext = format === 'jpeg' ? 'jpg' : format;
  const noCenterLayers = [];
  const noMarks = [];
  const bg = cfgBg();

  const btn = el('downloadAllBtnConvert');
  const originalLabel = btn.textContent;
  btn.disabled = true;

  if(state.convertImages.length === 1){
    const imgObj = state.convertImages[0];
    btn.textContent = 'Processing...';
    const blob = await exportImageBlob(imgObj.img, noCenterLayers, noMarks, bg, format, mode, qualityPct, targetKB, false);
    const base = imgObj.name.replace(/\.[^.]+$/, '');
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `${base}.${ext}`; a.click();
    URL.revokeObjectURL(url);
  } else {
    const zip = new JSZip();
    for(let i=0; i<state.convertImages.length; i++){
      btn.textContent = `Processing ${i+1}/${state.convertImages.length}...`;
      const imgObj = state.convertImages[i];
      const blob = await exportImageBlob(imgObj.img, noCenterLayers, noMarks, bg, format, mode, qualityPct, targetKB, false);
      const base = imgObj.name.replace(/\.[^.]+$/, '');
      zip.file(`${base}.${ext}`, blob);
    }
    btn.textContent = 'Zipping...';
    const content = await zip.generateAsync({type:'blob'});
    const url = URL.createObjectURL(content);
    const a = document.createElement('a'); a.href = url; a.download = 'proofmark-converted.zip'; a.click();
    URL.revokeObjectURL(url);
  }
  btn.textContent = originalLabel; btn.disabled = false;
});

/* ================= VIDEO TAB (ffmpeg.wasm) ================= */
const dropzoneVideo = el('dropzoneVideo'), fileInputVideo = el('fileInputVideo');
dropzoneVideo.addEventListener('click', ()=>fileInputVideo.click());
dropzoneVideo.addEventListener('dragover', e=>{e.preventDefault(); dropzoneVideo.classList.add('drag');});
dropzoneVideo.addEventListener('dragleave', ()=>dropzoneVideo.classList.remove('drag'));
dropzoneVideo.addEventListener('drop', e=>{ e.preventDefault(); dropzoneVideo.classList.remove('drag'); handleVideoFiles(e.dataTransfer.files); });
fileInputVideo.addEventListener('change', e=>handleVideoFiles(e.target.files));

function loadVideoMeta(file){
  return new Promise((resolve, reject)=>{
    const v = document.createElement('video');
    v.preload = 'metadata'; v.muted = true; v.playsInline = true;
    v.src = URL.createObjectURL(file);
    v.onloadedmetadata = ()=>{
      v.currentTime = Math.min(0.1, (v.duration||1)/2);
    };
    v.onseeked = ()=>{
      const canvas = document.createElement('canvas');
      canvas.width = v.videoWidth; canvas.height = v.videoHeight;
      canvas.getContext('2d').drawImage(v, 0, 0);
      resolve({width: v.videoWidth, height: v.videoHeight, duration: v.duration, thumbCanvas: canvas, videoEl: v});
    };
    v.onerror = reject;
  });
}
async function handleVideoFiles(fileList){
  for(const f of [...fileList]){
    if(!f.type.startsWith('video/')) continue;
    try{
      const meta = await loadVideoMeta(f);
      const id = 'vid_' + Math.random().toString(36).slice(2,9);
      state.videos.push({id, name:f.name, file:f, width:meta.width, height:meta.height, duration:meta.duration, thumbCanvas:meta.thumbCanvas});
      if(!state.activeVideoId) state.activeVideoId = id;
    }catch(e){ /* skip unreadable file */ }
  }
  renderVideoThumbs(); renderVideoPreview();
}
function fmtDuration(sec){
  if(!sec || isNaN(sec)) return '';
  const m = Math.floor(sec/60), s = Math.floor(sec%60);
  return `${m}:${String(s).padStart(2,'0')}`;
}
function renderVideoPreview(){
  const has = state.videos.length > 0;
  el('emptyNoteVideo').style.display = has ? 'none' : 'block';
  el('proofFrameVideo').style.display = has ? 'block' : 'none';
  el('processBtnVideo').disabled = !has;
  el('countNoteVideo').textContent = has ? `${state.videos.length} queued` : '';
  if(!has){ updateMobileThumb(); return; }
  const active = state.videos.find(v=>v.id===state.activeVideoId) || state.videos[0];
  state.activeVideoId = active.id;
  const canvas = el('previewCanvasVideo');
  canvas.width = active.width; canvas.height = active.height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(active.thumbCanvas, 0, 0);
  drawWatermarks(ctx, canvas.width, canvas.height, state.centerLayers, state.marks, cfgBg());
  updateStatusChip();
  updateMobileThumb();
}
function renderVideoThumbs(){
  const thumbs = el('thumbsVideo'); thumbs.innerHTML = '';
  state.videos.forEach(v=>{
    const wrap = document.createElement('div'); wrap.className = 'thumb video-thumb-wrap' + (v.id===state.activeVideoId?' active':'');
    const canvas = document.createElement('canvas');
    canvas.width = v.width; canvas.height = v.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(v.thumbCanvas, 0, 0);
    drawWatermarks(ctx, canvas.width, canvas.height, state.centerLayers, state.marks, cfgBg());
    const dur = document.createElement('div'); dur.className = 'dur'; dur.textContent = fmtDuration(v.duration);
    const fname = document.createElement('div'); fname.className = 'fname'; fname.textContent = v.name;
    const rm = document.createElement('button'); rm.className = 'rm'; rm.textContent = '×';
    rm.addEventListener('click', ev=>{
      ev.stopPropagation();
      state.videos = state.videos.filter(x=>x.id!==v.id);
      if(state.activeVideoId===v.id) state.activeVideoId = state.videos[0]?.id || null;
      renderVideoThumbs(); renderVideoPreview();
    });
    wrap.addEventListener('click', ()=>{ state.activeVideoId = v.id; renderVideoThumbs(); renderVideoPreview(); });
    wrap.appendChild(canvas); wrap.appendChild(dur); wrap.appendChild(fname); wrap.appendChild(rm);
    thumbs.appendChild(wrap);
  });
  updateStatusChip();
}
el('clearBtnVideo').addEventListener('click', ()=>{ state.videos = []; state.activeVideoId = null; renderVideoThumbs(); renderVideoPreview(); });

function setVideoStatus(text){ el('videoStatus').textContent = text; }
function setVideoProgress(ratio){ el('videoProgressFill').style.width = Math.round(Math.max(0,Math.min(1,ratio))*100) + '%'; }

async function getFfmpeg(){
  if(!state.ffmpeg){
    const { createFFmpeg } = FFmpeg;
    state.ffmpeg = createFFmpeg({
      log: false,
      corePath: 'vendor/ffmpeg-core/ffmpeg-core.js',
      progress: p => { if(p.ratio >= 0) setVideoProgress(p.ratio); },
    });
  }
  if(!state.ffmpeg.isLoaded()){
    setVideoStatus('Loading video engine (~25MB, first time only)…');
    setVideoProgress(0);
    await state.ffmpeg.load();
  }
  return state.ffmpeg;
}
async function burnWatermarkOnVideo(videoItem){
  const ffmpeg = await getFfmpeg();
  const { fetchFile } = FFmpeg;
  setVideoStatus('Preparing watermark overlay…');
  setVideoProgress(0);
  const overlayCanvas = document.createElement('canvas');
  overlayCanvas.width = videoItem.width; overlayCanvas.height = videoItem.height;
  const octx = overlayCanvas.getContext('2d');
  octx.clearRect(0,0,overlayCanvas.width, overlayCanvas.height);
  drawWatermarks(octx, overlayCanvas.width, overlayCanvas.height, state.centerLayers, state.marks, cfgBg());
  const overlayBlob = await new Promise(res=>overlayCanvas.toBlob(res, 'image/png'));
  const overlayBytes = new Uint8Array(await overlayBlob.arrayBuffer());

  setVideoStatus('Loading video into the engine…');
  ffmpeg.FS('writeFile', 'watermark.png', overlayBytes);
  ffmpeg.FS('writeFile', 'input.mp4', await fetchFile(videoItem.file));

  setVideoStatus('Burning watermark — this can take a while for longer clips…');
  await ffmpeg.run('-i', 'input.mp4', '-i', 'watermark.png', '-filter_complex', 'overlay=0:0', '-codec:a', 'copy', 'output.mp4');

  const data = ffmpeg.FS('readFile', 'output.mp4');
  const blob = new Blob([data.buffer], {type:'video/mp4'});
  try{ ffmpeg.FS('unlink', 'input.mp4'); ffmpeg.FS('unlink', 'watermark.png'); ffmpeg.FS('unlink', 'output.mp4'); }catch(e){}
  return blob;
}

el('processBtnVideo').addEventListener('click', async ()=>{
  const btn = el('processBtnVideo');
  const originalLabel = btn.textContent;
  btn.disabled = true;
  el('videoProgressWrap').style.display = 'block';
  for(let i=0; i<state.videos.length; i++){
    const v = state.videos[i];
    btn.textContent = `Processing ${i+1}/${state.videos.length}...`;
    try{
      const blob = await burnWatermarkOnVideo(v);
      setVideoStatus(`Done: ${v.name}`);
      setVideoProgress(1);
      const base = v.name.replace(/\.[^.]+$/, '');
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = `${base}-watermarked.mp4`; a.click();
      URL.revokeObjectURL(url);
    }catch(e){
      setVideoStatus(`Failed on ${v.name} — try a shorter clip or smaller file.`);
    }
  }
  btn.textContent = originalLabel; btn.disabled = false;
});

/* ================= CROP-ON-UPLOAD FLOW ================= */
function buildCropPresetGrid(onSelect){
  const grid = el('cropPresetGrid');
  grid.innerHTML = '';
  PLATFORM_CROPS.forEach(p=>{
    const b = document.createElement('button');
    b.className = 'crop-preset-btn';
    b.innerHTML = `<div class="cpn">${p.label}</div><div class="cpd">${p.dims}</div>`;
    b.addEventListener('click', ()=>{
      grid.querySelectorAll('.crop-preset-btn').forEach(x=>x.classList.remove('active'));
      b.classList.add('active');
      el('cropCustomW').value = p.w; el('cropCustomH').value = p.h;
      onSelect(p);
    });
    grid.appendChild(b);
  });
}
function cropToDimensions(imgEl, targetW, targetH){
  const canvas = document.createElement('canvas');
  canvas.width = targetW; canvas.height = targetH;
  const ctx = canvas.getContext('2d');
  const srcRatio = imgEl.naturalWidth / imgEl.naturalHeight;
  const targetRatio = targetW / targetH;
  let sx, sy, sw, sh;
  if(srcRatio > targetRatio){ sh = imgEl.naturalHeight; sw = sh * targetRatio; sy = 0; sx = (imgEl.naturalWidth - sw)/2; }
  else { sw = imgEl.naturalWidth; sh = sw / targetRatio; sx = 0; sy = (imgEl.naturalHeight - sh)/2; }
  ctx.drawImage(imgEl, sx, sy, sw, sh, 0, 0, targetW, targetH);
  return canvas;
}
function canvasToImagePromise(canvas){
  return new Promise(resolve=>{ const img = new Image(); img.onload = ()=>resolve(img); img.src = canvas.toDataURL('image/png'); });
}
function openBatchCropModal(loadedImages){
  el('cropSkipBtn').textContent = 'Skip — keep original size';
  el('cropModalTitle').textContent = 'Crop this batch before watermarking?';
  el('cropModalSub').textContent = `Applies the same crop to all ${loadedImages.length} photo${loadedImages.length===1?'':'s'} in this upload. You can still adjust individual photos afterward.`;
  el('cropStage').style.display = 'none';
  el('cropCustomW').value = ''; el('cropCustomH').value = '';
  buildCropPresetGrid(()=>{});
  el('cropModalBackdrop').classList.add('open');

  const skipHandler = ()=>{
    cleanup();
    loadedImages.forEach(o=>{ state.images.push(o); if(!state.activeImageId) state.activeImageId = o.id; });
    renderAllImages();
  };
  const applyHandler = async ()=>{
    const w = parseInt(el('cropCustomW').value, 10);
    const h = parseInt(el('cropCustomH').value, 10);
    cleanup();
    if(w > 0 && h > 0){
      for(const o of loadedImages){ const canvas = cropToDimensions(o.img, w, h); o.img = await canvasToImagePromise(canvas); }
    }
    loadedImages.forEach(o=>{ state.images.push(o); if(!state.activeImageId) state.activeImageId = o.id; });
    renderAllImages();
  };
  function cleanup(){
    el('cropModalBackdrop').classList.remove('open');
    el('cropSkipBtn').removeEventListener('click', skipHandler);
    el('cropApplyBtn').removeEventListener('click', applyHandler);
  }
  el('cropSkipBtn').addEventListener('click', skipHandler);
  el('cropApplyBtn').addEventListener('click', applyHandler);
}
function openPerImageCrop(imgObj){
  el('cropModalTitle').textContent = `Adjust crop — ${imgObj.name}`;
  el('cropModalSub').textContent = 'Pick a size, then drag the box to reposition within the photo.';
  el('cropCustomW').value = ''; el('cropCustomH').value = '';
  buildCropPresetGrid(()=>{ updateCropBoxFromInputs(); });
  el('cropStage').style.display = 'flex';
  el('cropStageImg').src = imgObj.img.src;
  el('cropModalBackdrop').classList.add('open');

  function updateCropBoxFromInputs(){
    const w = parseInt(el('cropCustomW').value, 10) || imgObj.img.naturalWidth;
    const h = parseInt(el('cropCustomH').value, 10) || imgObj.img.naturalHeight;
    const ratio = w/h;
    const stage = el('cropStage'); const imgTag = el('cropStageImg');
    requestAnimationFrame(()=>{
      const stageRect = stage.getBoundingClientRect();
      const imgRect = imgTag.getBoundingClientRect();
      let boxH = imgRect.height * 0.7;
      let boxW = boxH * ratio;
      if(boxW > imgRect.width){ boxW = imgRect.width * 0.9; boxH = boxW / ratio; }
      const box = el('cropBox');
      box.style.width = boxW + 'px'; box.style.height = boxH + 'px';
      box.style.left = ((imgRect.left - stageRect.left) + (imgRect.width-boxW)/2) + 'px';
      box.style.top = ((imgRect.top - stageRect.top) + (imgRect.height-boxH)/2) + 'px';
    });
  }
  el('cropStageImg').onload = updateCropBoxFromInputs;
  if(el('cropStageImg').complete) updateCropBoxFromInputs();
  el('cropCustomW').oninput = updateCropBoxFromInputs;
  el('cropCustomH').oninput = updateCropBoxFromInputs;

  const box = el('cropBox');
  let dragging = false, startX, startY, startLeft, startTop;
  const onDown = e=>{
    dragging = true;
    const pt = e.touches ? e.touches[0] : e;
    startX = pt.clientX; startY = pt.clientY;
    startLeft = parseFloat(box.style.left); startTop = parseFloat(box.style.top);
    e.preventDefault();
  };
  const onMoveFn = e=>{
    if(!dragging) return;
    const pt = e.touches ? e.touches[0] : e;
    const dx = pt.clientX - startX, dy = pt.clientY - startY;
    const stage = el('cropStage'); const imgTag = el('cropStageImg');
    const stageRect = stage.getBoundingClientRect(); const imgRect = imgTag.getBoundingClientRect();
    const boxW = box.offsetWidth, boxH = box.offsetHeight;
    const minLeft = imgRect.left - stageRect.left, minTop = imgRect.top - stageRect.top;
    const maxLeft = minLeft + imgRect.width - boxW, maxTop = minTop + imgRect.height - boxH;
    box.style.left = Math.max(minLeft, Math.min(maxLeft, startLeft+dx)) + 'px';
    box.style.top = Math.max(minTop, Math.min(maxTop, startTop+dy)) + 'px';
  };
  const onUp = ()=>{ dragging = false; };
  box.addEventListener('mousedown', onDown); box.addEventListener('touchstart', onDown, {passive:false});
  window.addEventListener('mousemove', onMoveFn); window.addEventListener('touchmove', onMoveFn, {passive:false});
  window.addEventListener('mouseup', onUp); window.addEventListener('touchend', onUp);

  const applyHandler = async ()=>{
    const w = parseInt(el('cropCustomW').value, 10) || imgObj.img.naturalWidth;
    const h = parseInt(el('cropCustomH').value, 10) || imgObj.img.naturalHeight;
    const imgTag = el('cropStageImg');
    const imgRect = imgTag.getBoundingClientRect();
    const boxRect = box.getBoundingClientRect();
    const scaleX = imgObj.img.naturalWidth / imgRect.width;
    const scaleY = imgObj.img.naturalHeight / imgRect.height;
    const sx = (boxRect.left - imgRect.left) * scaleX;
    const sy = (boxRect.top - imgRect.top) * scaleY;
    const sw = boxRect.width * scaleX, sh = boxRect.height * scaleY;
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    canvas.getContext('2d').drawImage(imgObj.img, sx, sy, sw, sh, 0, 0, w, h);
    imgObj.img = await canvasToImagePromise(canvas);
    cleanup();
    renderAllImages();
  };
  const cancelHandler = ()=>cleanup();
  function cleanup(){
    el('cropModalBackdrop').classList.remove('open');
    box.removeEventListener('mousedown', onDown); box.removeEventListener('touchstart', onDown);
    window.removeEventListener('mousemove', onMoveFn); window.removeEventListener('touchmove', onMoveFn);
    window.removeEventListener('mouseup', onUp); window.removeEventListener('touchend', onUp);
    el('cropApplyBtn').removeEventListener('click', applyHandler);
    el('cropSkipBtn').removeEventListener('click', cancelHandler);
  }
  el('cropApplyBtn').addEventListener('click', applyHandler);
  el('cropSkipBtn').addEventListener('click', cancelHandler);
  el('cropSkipBtn').textContent = 'Cancel';
}

/* ================= INIT ================= */
if('serviceWorker' in navigator){
  window.addEventListener('load', ()=>{ navigator.serviceWorker.register('sw.js').catch(()=>{}); });
}

// deep-link support: landing pages link to /#convert, /#pdfs, /#video,
// or /#pdftools:subtoolname to land directly on a specific PDF Tools sub-tool
(function(){
  const hash = (location.hash || '').replace('#','');
  const validTabs = ['images','pdfs','pdftools','video','convert'];
  if(hash.includes(':')){
    const [tabName, subtoolName] = hash.split(':');
    if(tabName === 'pdftools'){
      const tabBtn = document.querySelector(`nav.tabs button[data-tab="pdftools"]`);
      if(tabBtn) tabBtn.click();
      const subBtn = document.querySelector(`#pdftoolsSubnav button[data-subtool="${subtoolName}"]`);
      if(subBtn) subBtn.click();
    }
  } else if(validTabs.includes(hash)){
    const btn = document.querySelector(`nav.tabs button[data-tab="${hash}"]`);
    if(btn) btn.click();
  }
})();

renderCenterChips();
populateCenterDetail();
renderMarkChips();
populateMarkDetail();
syncCenterHandles();
syncMarkHandles();
renderAllImages();
renderPdfPreview();
renderConvertThumbs();
renderVideoThumbs();
renderVideoPreview();
