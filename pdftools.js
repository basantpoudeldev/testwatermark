
/* ================================================================
   PDF TOOLS: Page Manager, PDF<->JPG, Page Numbers, Sign, Compare
   ================================================================ */

const pdfTools = {
  pmPages: [],        // Page Manager: flat list of {id, sourceDocId, sourcePageIndex, rotation, thumbCanvas, selected}
  pmDocs: {},          // sourceDocId -> pristine bytes for pdf-lib re-loading at export time
  jpg2pdfImages: [],  // {id, name, img}
  pdf2jpgFiles: [],   // {id, name, bytes, numPages}
  pageNumFiles: [],   // {id, name, bytes, numPages}
  signDoc: null,      // {id, name, bytes, numPages, activePage}
  signaturePngBytes: null,
  signaturePosXFrac: 0.7, signaturePosYFrac: 0.85, signatureWidthFrac: 0.22,
  compareA: null, compareB: null, // {name, bytes, numPages}
  protectFile: null,      // {name, bytes}
  unlockFile: null,        // {name, bytes}
  compressFiles: [],      // {id, name, bytes}
  editDoc: null,           // {name, bytes, numPages, activePage}
  editAnnotations: {},    // pageNum(1-based) -> array of annotation objects
  selectedAnnotationId: null,
};

/* ---- sub-nav wiring ---- */
document.querySelectorAll('#pdftoolsSubnav button').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    document.querySelectorAll('#pdftoolsSubnav button').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    document.querySelectorAll('.subtool-view').forEach(v=>v.classList.remove('active'));
    el('subtool-' + btn.dataset.subtool).classList.add('active');
  });
});

function wireDropzone(zoneId, inputId, handler, multiple){
  const zone = el(zoneId), input = el(inputId);
  zone.addEventListener('click', ()=>input.click());
  zone.addEventListener('dragover', e=>{e.preventDefault(); zone.classList.add('drag');});
  zone.addEventListener('dragleave', ()=>zone.classList.remove('drag'));
  zone.addEventListener('drop', e=>{
    e.preventDefault(); zone.classList.remove('drag');
    handler(multiple ? e.dataTransfer.files : [e.dataTransfer.files[0]].filter(Boolean));
  });
  input.addEventListener('change', e=>handler([...e.target.files]));
}

/* ================= PAGE MANAGER ================= */
async function pmAddPdfFile(file){
  const bytes = new Uint8Array(await file.arrayBuffer());
  const docId = 'pmdoc_' + Math.random().toString(36).slice(2,9);
  pdfTools.pmDocs[docId] = { bytes, name: file.name };

  const doc = await pdfjsLib.getDocument({data: bytes.slice()}).promise;
  const pdfLibDoc = await PDFDocument.load(bytes.slice());
  const pages = pdfLibDoc.getPages();

  for(let i=0; i<doc.numPages; i++){
    const page = await doc.getPage(i+1);
    const viewport = page.getViewport({scale: 0.35});
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width; canvas.height = viewport.height;
    await page.render({canvasContext: canvas.getContext('2d'), viewport}).promise;
    const origRotation = pages[i] ? pages[i].getRotation().angle : 0;
    pdfTools.pmPages.push({
      id: 'pmpage_' + Math.random().toString(36).slice(2,9),
      sourceDocId: docId, sourceName: file.name, sourcePageIndex: i,
      rotation: origRotation, thumbCanvas: canvas, selected: false,
    });
  }
  renderPageMgrGrid();
}
wireDropzone('dropzonePageMgr', 'fileInputPageMgr', files=>{
  Promise.all([...files].filter(f=>f.type==='application/pdf').map(pmAddPdfFile)).then(renderPageMgrGrid);
}, true);

function renderPageMgrGrid(){
  const grid = el('pageMgrGrid');
  grid.innerHTML = '';
  const has = pdfTools.pmPages.length > 0;
  el('pageMgrActions').style.display = has ? 'flex' : 'none';
  el('countNotePageMgr').textContent = has ? `${pdfTools.pmPages.length} pages` : '';

  pdfTools.pmPages.forEach((p, idx)=>{
    const card = document.createElement('div');
    card.className = 'page-card';
    card.draggable = true;
    card.dataset.idx = idx;

    const canvas = document.createElement('canvas');
    canvas.width = p.thumbCanvas.width; canvas.height = p.thumbCanvas.height;
    canvas.getContext('2d').drawImage(p.thumbCanvas, 0, 0);
    canvas.style.transform = `rotate(${p.rotation}deg)`;

    const src = document.createElement('div');
    src.className = 'pc-src';
    src.textContent = `${p.sourceName} · p${p.sourcePageIndex+1}`;

    const controls = document.createElement('div');
    controls.className = 'pc-controls';
    const check = document.createElement('input');
    check.type = 'checkbox'; check.className = 'pc-check'; check.checked = p.selected;
    check.addEventListener('change', ()=>{ p.selected = check.checked; });

    const btnGroup = document.createElement('div');
    btnGroup.style.cssText = 'display:flex; gap:4px;';
    const rotateBtn = document.createElement('button');
    rotateBtn.className = 'pc-btn'; rotateBtn.textContent = '⟳'; rotateBtn.title = 'Rotate 90°';
    rotateBtn.addEventListener('click', ()=>{ p.rotation = (p.rotation + 90) % 360; renderPageMgrGrid(); });
    const dupBtn = document.createElement('button');
    dupBtn.className = 'pc-btn'; dupBtn.textContent = '⧉'; dupBtn.title = 'Duplicate';
    dupBtn.addEventListener('click', ()=>{
      pdfTools.pmPages.splice(idx+1, 0, {...p, id:'pmpage_'+Math.random().toString(36).slice(2,9)});
      renderPageMgrGrid();
    });
    const delBtn = document.createElement('button');
    delBtn.className = 'pc-btn'; delBtn.textContent = '×'; delBtn.title = 'Delete';
    delBtn.addEventListener('click', ()=>{ pdfTools.pmPages.splice(idx,1); renderPageMgrGrid(); });

    btnGroup.appendChild(rotateBtn); btnGroup.appendChild(dupBtn); btnGroup.appendChild(delBtn);
    controls.appendChild(check); controls.appendChild(btnGroup);

    card.appendChild(canvas); card.appendChild(src); card.appendChild(controls);

    card.addEventListener('dragstart', ()=>{ card.classList.add('dragging'); });
    card.addEventListener('dragend', ()=>{ card.classList.remove('dragging'); });
    card.addEventListener('dragover', e=>{ e.preventDefault(); card.classList.add('drag-over'); });
    card.addEventListener('dragleave', ()=>card.classList.remove('drag-over'));
    card.addEventListener('drop', e=>{
      e.preventDefault(); card.classList.remove('drag-over');
      const fromIdx = parseInt(grid.querySelector('.dragging')?.dataset.idx, 10);
      const toIdx = idx;
      if(isNaN(fromIdx) || fromIdx === toIdx) return;
      const [moved] = pdfTools.pmPages.splice(fromIdx, 1);
      pdfTools.pmPages.splice(toIdx, 0, moved);
      renderPageMgrGrid();
    });

    grid.appendChild(card);
  });
}
el('pageMgrClear').addEventListener('click', ()=>{ pdfTools.pmPages = []; pdfTools.pmDocs = {}; renderPageMgrGrid(); });

async function pmBuildPdf(pages){
  const outDoc = await PDFDocument.create();
  const loadedDocs = {};
  for(const p of pages){
    if(!loadedDocs[p.sourceDocId]){
      loadedDocs[p.sourceDocId] = await PDFDocument.load(pdfTools.pmDocs[p.sourceDocId].bytes.slice());
    }
  }
  for(const p of pages){
    const [copied] = await outDoc.copyPages(loadedDocs[p.sourceDocId], [p.sourcePageIndex]);
    copied.setRotation(degrees(p.rotation));
    outDoc.addPage(copied);
  }
  return outDoc.save();
}
function downloadBlob(bytes, filename, mime){
  const blob = new Blob([bytes], {type: mime || 'application/pdf'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

el('pageMgrExportOne').addEventListener('click', async ()=>{
  const btn = el('pageMgrExportOne'); const orig = btn.textContent;
  btn.textContent = 'Building...'; btn.disabled = true;
  const bytes = await pmBuildPdf(pdfTools.pmPages);
  downloadBlob(bytes, 'proofmark-merged.pdf');
  btn.textContent = orig; btn.disabled = false;
});

el('pageMgrExportSelected').addEventListener('click', async ()=>{
  const selected = pdfTools.pmPages.filter(p=>p.selected);
  if(selected.length === 0){ alert('Check at least one page to extract.'); return; }
  const btn = el('pageMgrExportSelected'); const orig = btn.textContent;
  btn.textContent = 'Building...'; btn.disabled = true;
  const bytes = await pmBuildPdf(selected);
  downloadBlob(bytes, 'proofmark-extracted.pdf');
  btn.textContent = orig; btn.disabled = false;
});

el('pageMgrExportSplit').addEventListener('click', async ()=>{
  const raw = el('pageMgrSplitPoints').value.trim();
  const splitAfter = raw
    ? [...new Set(raw.split(',').map(s=>parseInt(s.trim(),10)).filter(n=>!isNaN(n) && n>0))].sort((a,b)=>a-b)
    : [];
  const total = pdfTools.pmPages.length;
  if(total === 0) return;
  const boundaries = [0, ...splitAfter.filter(n=>n<total), total];
  const groups = [];
  for(let i=0; i<boundaries.length-1; i++){
    const start = boundaries[i], end = boundaries[i+1];
    if(end > start) groups.push(pdfTools.pmPages.slice(start, end));
  }
  if(groups.length <= 1){
    const bytes = await pmBuildPdf(pdfTools.pmPages);
    downloadBlob(bytes, 'proofmark-split-part1.pdf');
    return;
  }
  const btn = el('pageMgrExportSplit'); const orig = btn.textContent;
  const zip = new JSZip();
  for(let i=0; i<groups.length; i++){
    btn.textContent = `Building ${i+1}/${groups.length}...`;
    const bytes = await pmBuildPdf(groups[i]);
    zip.file(`proofmark-split-part${i+1}.pdf`, bytes);
  }
  btn.textContent = 'Zipping...';
  const content = await zip.generateAsync({type:'blob'});
  const url = URL.createObjectURL(content);
  const a = document.createElement('a'); a.href = url; a.download = 'proofmark-split.zip'; a.click();
  URL.revokeObjectURL(url);
  btn.textContent = orig;
});

/* ================= PDF -> JPG ================= */
wireDropzone('dropzonePdf2jpg', 'fileInputPdf2jpg', async files=>{
  for(const f of files){
    if(f.type !== 'application/pdf') continue;
    const bytes = new Uint8Array(await f.arrayBuffer());
    const doc = await pdfjsLib.getDocument({data: bytes.slice()}).promise;
    pdfTools.pdf2jpgFiles.push({id:'p2j_'+Math.random().toString(36).slice(2,9), name:f.name, bytes, numPages:doc.numPages});
  }
  renderPdf2jpgThumbs();
}, true);
function renderPdf2jpgThumbs(){
  const has = pdfTools.pdf2jpgFiles.length > 0;
  el('exportPdf2jpg').disabled = !has;
  el('countNotePdf2jpg').textContent = has ? `${pdfTools.pdf2jpgFiles.length} file(s)` : '';
  const wrap = el('thumbsPdf2jpg'); wrap.innerHTML = '';
  pdfTools.pdf2jpgFiles.forEach(f=>{
    const div = document.createElement('div'); div.className = 'thumb';
    const icon = document.createElement('div');
    icon.style.cssText = 'aspect-ratio:0.77; display:flex; align-items:center; justify-content:center; background:var(--panel-2); border-radius:4px; color:var(--brass); font-size:11px; font-family:ui-monospace,monospace;';
    icon.textContent = `${f.numPages}p`;
    const fname = document.createElement('div'); fname.className = 'fname'; fname.textContent = f.name;
    const rm = document.createElement('button'); rm.className = 'rm'; rm.textContent = '×';
    rm.addEventListener('click', ()=>{ pdfTools.pdf2jpgFiles = pdfTools.pdf2jpgFiles.filter(x=>x.id!==f.id); renderPdf2jpgThumbs(); });
    div.appendChild(icon); div.appendChild(fname); div.appendChild(rm);
    wrap.appendChild(div);
  });
}
el('clearPdf2jpg').addEventListener('click', ()=>{ pdfTools.pdf2jpgFiles = []; renderPdf2jpgThumbs(); });
el('pdf2jpgQuality').addEventListener('input', ()=>{ el('pdf2jpgQualityVal').textContent = el('pdf2jpgQuality').value+'%'; });
el('exportPdf2jpg').addEventListener('click', async ()=>{
  const quality = parseInt(el('pdf2jpgQuality').value,10)/100;
  const btn = el('exportPdf2jpg'); const orig = btn.textContent;
  btn.disabled = true;
  const zip = new JSZip();
  for(const f of pdfTools.pdf2jpgFiles){
    const doc = await pdfjsLib.getDocument({data: f.bytes.slice()}).promise;
    const base = f.name.replace(/\.pdf$/i,'');
    for(let i=0; i<doc.numPages; i++){
      btn.textContent = `${f.name} p${i+1}/${doc.numPages}...`;
      const page = await doc.getPage(i+1);
      const viewport = page.getViewport({scale: 2});
      const canvas = document.createElement('canvas');
      canvas.width = viewport.width; canvas.height = viewport.height;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fff'; ctx.fillRect(0,0,canvas.width,canvas.height);
      await page.render({canvasContext: ctx, viewport}).promise;
      const blob = await new Promise(res=>canvas.toBlob(res, 'image/jpeg', quality));
      zip.file(`${base}-page${i+1}.jpg`, blob);
    }
  }
  btn.textContent = 'Zipping...';
  const content = await zip.generateAsync({type:'blob'});
  const url = URL.createObjectURL(content);
  const a = document.createElement('a'); a.href = url; a.download = 'proofmark-pdf-to-jpg.zip'; a.click();
  URL.revokeObjectURL(url);
  btn.textContent = orig; btn.disabled = false;
});

/* ================= JPG -> PDF ================= */
wireDropzone('dropzoneJpg2pdf', 'fileInputJpg2pdf', async files=>{
  for(const f of files){
    if(!f.type.startsWith('image/')) continue;
    const img = await loadImageFile(f);
    pdfTools.jpg2pdfImages.push({id:'j2p_'+Math.random().toString(36).slice(2,9), name:f.name, img});
  }
  renderJpg2pdfGrid();
}, true);
function renderJpg2pdfGrid(){
  const grid = el('jpg2pdfGrid'); grid.innerHTML = '';
  const has = pdfTools.jpg2pdfImages.length > 0;
  el('exportJpg2pdf').disabled = !has;
  el('countNoteJpg2pdf').textContent = has ? `${pdfTools.jpg2pdfImages.length} image(s)` : '';
  pdfTools.jpg2pdfImages.forEach((item, idx)=>{
    const card = document.createElement('div');
    card.className = 'page-card'; card.draggable = true; card.dataset.idx = idx;
    const canvas = document.createElement('canvas');
    const scale = Math.min(1, 200/item.img.naturalWidth);
    canvas.width = item.img.naturalWidth*scale; canvas.height = item.img.naturalHeight*scale;
    canvas.getContext('2d').drawImage(item.img, 0, 0, canvas.width, canvas.height);
    const src = document.createElement('div'); src.className = 'pc-src'; src.textContent = item.name;
    const controls = document.createElement('div'); controls.className = 'pc-controls';
    const spacer = document.createElement('span');
    const delBtn = document.createElement('button');
    delBtn.className = 'pc-btn'; delBtn.textContent = '×';
    delBtn.addEventListener('click', ()=>{ pdfTools.jpg2pdfImages.splice(idx,1); renderJpg2pdfGrid(); });
    controls.appendChild(spacer); controls.appendChild(delBtn);
    card.appendChild(canvas); card.appendChild(src); card.appendChild(controls);
    card.addEventListener('dragstart', ()=>card.classList.add('dragging'));
    card.addEventListener('dragend', ()=>card.classList.remove('dragging'));
    card.addEventListener('dragover', e=>{ e.preventDefault(); card.classList.add('drag-over'); });
    card.addEventListener('dragleave', ()=>card.classList.remove('drag-over'));
    card.addEventListener('drop', e=>{
      e.preventDefault(); card.classList.remove('drag-over');
      const fromIdx = parseInt(grid.querySelector('.dragging')?.dataset.idx, 10);
      if(isNaN(fromIdx) || fromIdx === idx) return;
      const [moved] = pdfTools.jpg2pdfImages.splice(fromIdx, 1);
      pdfTools.jpg2pdfImages.splice(idx, 0, moved);
      renderJpg2pdfGrid();
    });
    grid.appendChild(card);
  });
}
el('clearJpg2pdf').addEventListener('click', ()=>{ pdfTools.jpg2pdfImages = []; renderJpg2pdfGrid(); });
wireSegmented('jpg2pdfPageSizeSeg');
el('exportJpg2pdf').addEventListener('click', async ()=>{
  const btn = el('exportJpg2pdf'); const orig = btn.textContent;
  btn.textContent = 'Building...'; btn.disabled = true;
  const pageSizeMode = document.querySelector('#jpg2pdfPageSizeSeg .active').dataset.val;
  const SIZES = { a4:[595.28,841.89], letter:[612,792] };
  const outDoc = await PDFDocument.create();
  for(const item of pdfTools.jpg2pdfImages){
    const canvas = document.createElement('canvas');
    canvas.width = item.img.naturalWidth; canvas.height = item.img.naturalHeight;
    canvas.getContext('2d').drawImage(item.img, 0, 0);
    const pngBytes = imageElementToPngBytes(item.img);
    const embedded = await outDoc.embedPng(pngBytes);
    let pw, ph, dw, dh, dx, dy;
    if(pageSizeMode === 'fit'){
      pw = embedded.width; ph = embedded.height; dw = pw; dh = ph; dx = 0; dy = 0;
    } else {
      [pw, ph] = SIZES[pageSizeMode];
      const scale = Math.min(pw/embedded.width, ph/embedded.height);
      dw = embedded.width*scale; dh = embedded.height*scale;
      dx = (pw-dw)/2; dy = (ph-dh)/2;
    }
    const page = outDoc.addPage([pw, ph]);
    page.drawImage(embedded, {x:dx, y:dy, width:dw, height:dh});
  }
  const bytes = await outDoc.save();
  downloadBlob(bytes, 'proofmark-images-to-pdf.pdf');
  btn.textContent = orig; btn.disabled = false;
});

/* ================= PAGE NUMBERS ================= */
wireDropzone('dropzonePageNum', 'fileInputPageNum', async files=>{
  for(const f of files){
    if(f.type !== 'application/pdf') continue;
    const bytes = new Uint8Array(await f.arrayBuffer());
    pdfTools.pageNumFiles.push({id:'pn_'+Math.random().toString(36).slice(2,9), name:f.name, bytes});
  }
  renderPageNumThumbs();
}, true);
function renderPageNumThumbs(){
  const has = pdfTools.pageNumFiles.length > 0;
  el('exportPageNum').disabled = !has;
  el('countNotePageNum').textContent = has ? `${pdfTools.pageNumFiles.length} file(s)` : '';
  const wrap = el('thumbsPageNum'); wrap.innerHTML = '';
  pdfTools.pageNumFiles.forEach(f=>{
    const div = document.createElement('div'); div.className = 'thumb';
    const icon = document.createElement('div');
    icon.style.cssText = 'aspect-ratio:0.77; display:flex; align-items:center; justify-content:center; background:var(--panel-2); border-radius:4px; color:var(--brass); font-size:20px;';
    icon.textContent = '#';
    const fname = document.createElement('div'); fname.className = 'fname'; fname.textContent = f.name;
    const rm = document.createElement('button'); rm.className = 'rm'; rm.textContent = '×';
    rm.addEventListener('click', ()=>{ pdfTools.pageNumFiles = pdfTools.pageNumFiles.filter(x=>x.id!==f.id); renderPageNumThumbs(); });
    div.appendChild(icon); div.appendChild(fname); div.appendChild(rm);
    wrap.appendChild(div);
  });
}
el('clearPageNum').addEventListener('click', ()=>{ pdfTools.pageNumFiles = []; renderPageNumThumbs(); });
document.querySelectorAll('#pageNumPosGrid .pos-btn').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    document.querySelectorAll('#pageNumPosGrid .pos-btn').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
  });
});
el('pageNumSize').addEventListener('input', ()=>{ el('pageNumSizeVal').textContent = el('pageNumSize').value+'px'; });

function formatPageNumber(fmt, n, total){
  if(fmt === 'n') return `${n}`;
  if(fmt === 'page_n') return `Page ${n}`;
  if(fmt === 'n_of_total') return `${n} / ${total}`;
  return `Page ${n} of ${total}`;
}
el('exportPageNum').addEventListener('click', async ()=>{
  const pos = document.querySelector('#pageNumPosGrid .active').dataset.val;
  const fmt = el('pageNumFormat').value;
  const startAt = parseInt(el('pageNumStart').value, 10) || 1;
  const size = parseInt(el('pageNumSize').value, 10);
  const color = hexToRgb(el('pageNumColor').value);

  const btn = el('exportPageNum'); const orig = btn.textContent;
  btn.disabled = true;
  const zip = new JSZip();
  const single = pdfTools.pageNumFiles.length === 1;

  for(const f of pdfTools.pageNumFiles){
    btn.textContent = `Numbering ${f.name}...`;
    const pdfDoc = await PDFDocument.load(f.bytes);
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const pages = pdfDoc.getPages();
    const total = pages.length;
    pages.forEach((page, i)=>{
      const { width, height } = page.getSize();
      const n = startAt + i;
      const text = formatPageNumber(fmt, n, startAt + total - 1);
      const tw = font.widthOfTextAtSize(text, size);
      const pad = 24;
      let x, y;
      if(pos==='tl'){x=pad; y=height-pad-size;}
      if(pos==='tr'){x=width-pad-tw; y=height-pad-size;}
      if(pos==='bl'){x=pad; y=pad;}
      if(pos==='br'){x=width-pad-tw; y=pad;}
      page.drawText(text, {x, y, size, font, color});
    });
    const outBytes = await pdfDoc.save();
    if(single){ downloadBlob(outBytes, f.name.replace(/\.pdf$/i,'') + '-numbered.pdf'); }
    else { zip.file(f.name.replace(/\.pdf$/i,'') + '-numbered.pdf', outBytes); }
  }
  if(!single){
    btn.textContent = 'Zipping...';
    const content = await zip.generateAsync({type:'blob'});
    const url = URL.createObjectURL(content);
    const a = document.createElement('a'); a.href = url; a.download = 'proofmark-numbered-pdfs.zip'; a.click();
    URL.revokeObjectURL(url);
  }
  btn.textContent = orig; btn.disabled = false;
});

/* ================= SIGN PDF ================= */
wireDropzone('dropzoneSign', 'fileInputSign', async files=>{
  const f = files[0]; if(!f || f.type !== 'application/pdf') return;
  const bytes = new Uint8Array(await f.arrayBuffer());
  const doc = await pdfjsLib.getDocument({data: bytes.slice()}).promise;
  pdfTools.signDoc = {name:f.name, bytes, numPages:doc.numPages, activePage:1};
  el('signWorkspace').style.display = 'block';
  el('exportSign').disabled = false;
  await renderSignPageThumbs();
  await renderSignPreview();
}, false);

async function renderSignPageThumbs(){
  const wrap = el('thumbsSignPages'); wrap.innerHTML = '';
  const doc = await pdfjsLib.getDocument({data: pdfTools.signDoc.bytes.slice()}).promise;
  for(let i=0; i<doc.numPages; i++){
    const page = await doc.getPage(i+1);
    const viewport = page.getViewport({scale:0.3});
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width; canvas.height = viewport.height;
    await page.render({canvasContext: canvas.getContext('2d'), viewport}).promise;
    const div = document.createElement('div');
    div.className = 'thumb' + (i+1===pdfTools.signDoc.activePage ? ' active' : '');
    div.appendChild(canvas);
    div.addEventListener('click', ()=>{ pdfTools.signDoc.activePage = i+1; renderSignPageThumbs(); renderSignPreview(); });
    wrap.appendChild(div);
  }
}
async function renderSignPreview(){
  const doc = await pdfjsLib.getDocument({data: pdfTools.signDoc.bytes.slice()}).promise;
  const page = await doc.getPage(pdfTools.signDoc.activePage);
  const viewport = page.getViewport({scale:1.3});
  const canvas = el('previewCanvasSign');
  canvas.width = viewport.width; canvas.height = viewport.height;
  const ctx = canvas.getContext('2d');
  await page.render({canvasContext: ctx, viewport}).promise;
  if(pdfTools.signaturePngBytes){
    const img = await pngBytesToImage(pdfTools.signaturePngBytes);
    const w = canvas.width * pdfTools.signatureWidthFrac;
    const h = w * (img.height/img.width);
    const x = pdfTools.signaturePosXFrac*canvas.width - w/2;
    const y = pdfTools.signaturePosYFrac*canvas.height - h/2;
    ctx.drawImage(img, x, y, w, h);
  }
  positionSignHandle();
}
function positionSignHandle(){
  el('signatureHandle').style.left = (pdfTools.signaturePosXFrac*100) + '%';
  el('signatureHandle').style.top = (pdfTools.signaturePosYFrac*100) + '%';
}
// custom drag handling for this canvas (previewCanvasSign), separate from the Images-tab handle system
(function setupSignatureHandleDrag(){
  const handle = el('signatureHandle');
  let dragging = false;
  handle.addEventListener('pointerdown', e=>{ dragging = true; handle.setPointerCapture(e.pointerId); e.preventDefault(); });
  handle.addEventListener('pointermove', e=>{
    if(!dragging) return;
    const canvas = el('previewCanvasSign');
    const rect = canvas.getBoundingClientRect();
    if(rect.width===0) return;
    pdfTools.signaturePosXFrac = Math.max(0, Math.min(1, (e.clientX-rect.left)/rect.width));
    pdfTools.signaturePosYFrac = Math.max(0, Math.min(1, (e.clientY-rect.top)/rect.height));
    positionSignHandle();
    renderSignPreview();
  });
  handle.addEventListener('pointerup', ()=>{ dragging = false; });
  handle.addEventListener('pointercancel', ()=>{ dragging = false; });
})();

/* signature pad drawing */
(function setupSignaturePad(){
  const pad = el('signaturePad');
  const ctx = pad.getContext('2d');
  ctx.strokeStyle = '#161616'; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  let drawing = false, lastX=0, lastY=0;
  function posFromEvent(e){
    const rect = pad.getBoundingClientRect();
    const pt = e.touches ? e.touches[0] : e;
    return { x: (pt.clientX-rect.left) * (pad.width/rect.width), y: (pt.clientY-rect.top) * (pad.height/rect.height) };
  }
  function start(e){ drawing = true; const p = posFromEvent(e); lastX=p.x; lastY=p.y; e.preventDefault(); }
  function move(e){
    if(!drawing) return;
    const p = posFromEvent(e);
    ctx.beginPath(); ctx.moveTo(lastX,lastY); ctx.lineTo(p.x,p.y); ctx.stroke();
    lastX=p.x; lastY=p.y; e.preventDefault();
  }
  function end(){
    if(!drawing) return;
    drawing = false;
    const dataUrl = pad.toDataURL('image/png');
    const b64 = dataUrl.split(',')[1];
    pdfTools.signaturePngBytes = base64ToBytes(b64);
    if(pdfTools.signDoc) renderSignPreview();
  }
  pad.addEventListener('mousedown', start); pad.addEventListener('mousemove', move); window.addEventListener('mouseup', end);
  pad.addEventListener('touchstart', start, {passive:false}); pad.addEventListener('touchmove', move, {passive:false}); pad.addEventListener('touchend', end);
})();
el('clearSignaturePad').addEventListener('click', ()=>{
  const pad = el('signaturePad');
  pad.getContext('2d').clearRect(0,0,pad.width,pad.height);
  pdfTools.signaturePngBytes = null;
  if(pdfTools.signDoc) renderSignPreview();
});
el('signatureSize').addEventListener('input', ()=>{
  pdfTools.signatureWidthFrac = parseInt(el('signatureSize').value,10) / 800;
  if(pdfTools.signDoc) renderSignPreview();
});
el('clearSign').addEventListener('click', ()=>{
  pdfTools.signDoc = null; pdfTools.signaturePngBytes = null;
  el('signWorkspace').style.display = 'none';
  el('exportSign').disabled = true;
  el('signaturePad').getContext('2d').clearRect(0,0,500,160);
});
el('exportSign').addEventListener('click', async ()=>{
  if(!pdfTools.signDoc || !pdfTools.signaturePngBytes){ alert('Draw a signature first.'); return; }
  const btn = el('exportSign'); const orig = btn.textContent;
  btn.textContent = 'Applying...'; btn.disabled = true;
  const pdfDoc = await PDFDocument.load(pdfTools.signDoc.bytes);
  const embedded = await pdfDoc.embedPng(pdfTools.signaturePngBytes);
  const page = pdfDoc.getPages()[pdfTools.signDoc.activePage - 1];
  const { width, height } = page.getSize();
  const w = width * pdfTools.signatureWidthFrac;
  const h = w * (embedded.height/embedded.width);
  const x = pdfTools.signaturePosXFrac*width - w/2;
  const y = height - pdfTools.signaturePosYFrac*height - h/2;
  page.drawImage(embedded, {x, y, width:w, height:h});
  const bytes = await pdfDoc.save();
  downloadBlob(bytes, pdfTools.signDoc.name.replace(/\.pdf$/i,'') + '-signed.pdf');
  btn.textContent = orig; btn.disabled = false;
});

/* ================= COMPARE PDFS ================= */
wireDropzone('dropzoneCompareA', 'fileInputCompareA', async files=>{
  const f = files[0]; if(!f) return;
  const bytes = new Uint8Array(await f.arrayBuffer());
  const doc = await pdfjsLib.getDocument({data: bytes.slice()}).promise;
  pdfTools.compareA = {name:f.name, bytes, numPages:doc.numPages};
  el('dropzoneCompareA').querySelector('strong').textContent = 'PDF A — ' + f.name;
  updateCompareButtonState();
}, false);
wireDropzone('dropzoneCompareB', 'fileInputCompareB', async files=>{
  const f = files[0]; if(!f) return;
  const bytes = new Uint8Array(await f.arrayBuffer());
  const doc = await pdfjsLib.getDocument({data: bytes.slice()}).promise;
  pdfTools.compareB = {name:f.name, bytes, numPages:doc.numPages};
  el('dropzoneCompareB').querySelector('strong').textContent = 'PDF B — ' + f.name;
  updateCompareButtonState();
}, false);
function updateCompareButtonState(){
  el('runCompare').disabled = !(pdfTools.compareA && pdfTools.compareB);
}
el('clearCompare').addEventListener('click', ()=>{
  pdfTools.compareA = null; pdfTools.compareB = null;
  el('dropzoneCompareA').querySelector('strong').textContent = 'PDF A';
  el('dropzoneCompareB').querySelector('strong').textContent = 'PDF B';
  el('compareResults').innerHTML = '';
  updateCompareButtonState();
});

// simple line-based LCS diff -> list of {type: 'same'|'added'|'removed', text}
function diffLines(linesA, linesB){
  const n = linesA.length, m = linesB.length;
  const dp = Array.from({length:n+1}, ()=>new Array(m+1).fill(0));
  for(let i=n-1;i>=0;i--){
    for(let j=m-1;j>=0;j--){
      dp[i][j] = linesA[i]===linesB[j] ? dp[i+1][j+1]+1 : Math.max(dp[i+1][j], dp[i][j+1]);
    }
  }
  const result = [];
  let i=0, j=0;
  while(i<n && j<m){
    if(linesA[i]===linesB[j]){ result.push({type:'same', text:linesA[i]}); i++; j++; }
    else if(dp[i+1][j] >= dp[i][j+1]){ result.push({type:'removed', text:linesA[i]}); i++; }
    else { result.push({type:'added', text:linesB[j]}); j++; }
  }
  while(i<n){ result.push({type:'removed', text:linesA[i]}); i++; }
  while(j<m){ result.push({type:'added', text:linesB[j]}); j++; }
  return result;
}

el('runCompare').addEventListener('click', async ()=>{
  const btn = el('runCompare'); const orig = btn.textContent;
  btn.disabled = true;
  const results = el('compareResults');
  results.innerHTML = '';

  const docA = await pdfjsLib.getDocument({data: pdfTools.compareA.bytes.slice()}).promise;
  const docB = await pdfjsLib.getDocument({data: pdfTools.compareB.bytes.slice()}).promise;
  const maxPages = Math.max(docA.numPages, docB.numPages);

  for(let i=0; i<maxPages; i++){
    btn.textContent = `Comparing page ${i+1}/${maxPages}...`;
    const pair = document.createElement('div');
    pair.className = 'compare-page-pair';

    for(const doc of [docA, docB]){
      const canvas = document.createElement('canvas');
      if(i < doc.numPages){
        const page = await doc.getPage(i+1);
        const viewport = page.getViewport({scale: 0.8});
        canvas.width = viewport.width; canvas.height = viewport.height;
        await page.render({canvasContext: canvas.getContext('2d'), viewport}).promise;
      } else {
        canvas.width = 200; canvas.height = 260;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#222'; ctx.fillRect(0,0,canvas.width,canvas.height);
        ctx.fillStyle = '#999'; ctx.font = '12px sans-serif'; ctx.fillText('No page', 10, 20);
      }
      pair.appendChild(canvas);
    }

    let textA = '', textB = '';
    if(i < docA.numPages){ const tc = await (await docA.getPage(i+1)).getTextContent(); textA = tc.items.map(it=>it.str).join(' '); }
    if(i < docB.numPages){ const tc = await (await docB.getPage(i+1)).getTextContent(); textB = tc.items.map(it=>it.str).join(' '); }
    const linesA = textA.split(/(?<=[.!?])\s+/).filter(Boolean);
    const linesB = textB.split(/(?<=[.!?])\s+/).filter(Boolean);
    const diff = diffLines(linesA, linesB);

    const diffBox = document.createElement('div');
    diffBox.className = 'compare-diff';
    if(diff.every(d=>d.type==='same')){
      diffBox.innerHTML = '<span class="diff-same">No text differences detected on this page.</span>';
    } else {
      diff.forEach(d=>{
        const line = document.createElement('span');
        line.className = d.type==='added' ? 'diff-added' : d.type==='removed' ? 'diff-removed' : 'diff-same';
        line.textContent = (d.type==='added' ? '+ ' : d.type==='removed' ? '− ' : '  ') + d.text;
        diffBox.appendChild(line);
      });
    }
    pair.appendChild(diffBox);
    results.appendChild(pair);
  }
  btn.textContent = orig; btn.disabled = false;
});

/* ================= PROTECT PDF (password) ================= */
wireDropzone('dropzoneProtect', 'fileInputProtect', async files=>{
  const f = files[0]; if(!f || f.type !== 'application/pdf') return;
  const bytes = new Uint8Array(await f.arrayBuffer());
  pdfTools.protectFile = {name: f.name, bytes};
  renderProtectThumb();
}, false);
function renderProtectThumb(){
  const has = !!pdfTools.protectFile;
  el('exportProtect').disabled = !has;
  el('countNoteProtect').textContent = has ? pdfTools.protectFile.name : '';
  const wrap = el('thumbsProtect'); wrap.innerHTML = '';
  if(!has) return;
  const div = document.createElement('div'); div.className = 'thumb';
  const icon = document.createElement('div');
  icon.style.cssText = 'aspect-ratio:0.77; display:flex; align-items:center; justify-content:center; background:var(--panel-2); border-radius:4px; color:var(--brass); font-size:22px;';
  icon.textContent = '🔒';
  const fname = document.createElement('div'); fname.className = 'fname'; fname.textContent = pdfTools.protectFile.name;
  const rm = document.createElement('button'); rm.className = 'rm'; rm.textContent = '×';
  rm.addEventListener('click', ()=>{ pdfTools.protectFile = null; renderProtectThumb(); });
  div.appendChild(icon); div.appendChild(fname); div.appendChild(rm);
  wrap.appendChild(div);
}
el('clearProtect').addEventListener('click', ()=>{
  pdfTools.protectFile = null; el('protectPassword').value = ''; renderProtectThumb();
});
el('exportProtect').addEventListener('click', async ()=>{
  const password = el('protectPassword').value;
  if(!password){ alert('Enter a password first.'); return; }
  if(!pdfTools.protectFile) return;
  const btn = el('exportProtect'); const orig = btn.textContent;
  btn.textContent = 'Encrypting...'; btn.disabled = true;
  try {
    const outBytes = await PDFEncryptLite.encryptPDF(pdfTools.protectFile.bytes, password);
    downloadBlob(outBytes, pdfTools.protectFile.name.replace(/\.pdf$/i,'') + '-protected.pdf');
  } catch(err){
    if(err && err.code === 'ALREADY_ENCRYPTED'){
      alert("This PDF already has a password. Use the Unlock PDF tool to remove it first, then protect it again with a new password.");
    } else {
      alert('Could not protect this PDF: ' + (err && err.message ? err.message : 'unknown error'));
    }
  }
  btn.textContent = orig; btn.disabled = false;
});

/* ================= UNLOCK PDF (remove known password) ================= */
wireDropzone('dropzoneUnlock', 'fileInputUnlock', async files=>{
  const f = files[0]; if(!f || f.type !== 'application/pdf') return;
  const bytes = new Uint8Array(await f.arrayBuffer());
  pdfTools.unlockFile = {name: f.name, bytes};
  renderUnlockThumb();
}, false);
function renderUnlockThumb(){
  const has = !!pdfTools.unlockFile;
  el('exportUnlock').disabled = !has;
  el('countNoteUnlock').textContent = has ? pdfTools.unlockFile.name : '';
  const wrap = el('thumbsUnlock'); wrap.innerHTML = '';
  if(!has) return;
  const div = document.createElement('div'); div.className = 'thumb';
  const icon = document.createElement('div');
  icon.style.cssText = 'aspect-ratio:0.77; display:flex; align-items:center; justify-content:center; background:var(--panel-2); border-radius:4px; color:var(--brass); font-size:22px;';
  icon.textContent = '🔓';
  const fname = document.createElement('div'); fname.className = 'fname'; fname.textContent = pdfTools.unlockFile.name;
  const rm = document.createElement('button'); rm.className = 'rm'; rm.textContent = '×';
  rm.addEventListener('click', ()=>{ pdfTools.unlockFile = null; renderUnlockThumb(); });
  div.appendChild(icon); div.appendChild(fname); div.appendChild(rm);
  wrap.appendChild(div);
}
el('clearUnlock').addEventListener('click', ()=>{
  pdfTools.unlockFile = null; el('unlockPassword').value = ''; renderUnlockThumb();
});
el('exportUnlock').addEventListener('click', async ()=>{
  const password = el('unlockPassword').value;
  if(!pdfTools.unlockFile) return;
  const btn = el('exportUnlock'); const orig = btn.textContent;
  btn.textContent = 'Unlocking...'; btn.disabled = true;
  try {
    if(!window.PDFDecryptLite){
      throw new Error('The unlock engine is still loading — wait a moment and try again.');
    }
    const status = await PDFDecryptLite.isEncrypted(pdfTools.unlockFile.bytes);
    if(!status.encrypted){
      throw new Error("This PDF doesn't appear to be password-protected.");
    }
    const outBytes = await PDFDecryptLite.decryptPDF(pdfTools.unlockFile.bytes, password || '');
    downloadBlob(outBytes, pdfTools.unlockFile.name.replace(/\.pdf$/i,'') + '-unlocked.pdf');
  } catch(err){
    alert('Could not unlock this PDF: ' + (err && err.message ? err.message : 'wrong password or unsupported encryption.'));
  }
  btn.textContent = orig; btn.disabled = false;
});

/* ================= COMPRESS PDF ================= */
wireDropzone('dropzoneCompress', 'fileInputCompress', async files=>{
  for(const f of files){
    if(f.type !== 'application/pdf') continue;
    const bytes = new Uint8Array(await f.arrayBuffer());
    pdfTools.compressFiles.push({id:'cmp_'+Math.random().toString(36).slice(2,9), name:f.name, bytes});
  }
  renderCompressThumbs();
}, true);
function renderCompressThumbs(){
  const has = pdfTools.compressFiles.length > 0;
  el('exportCompress').disabled = !has;
  el('countNoteCompress').textContent = has ? `${pdfTools.compressFiles.length} file(s)` : '';
  const wrap = el('thumbsCompress'); wrap.innerHTML = '';
  pdfTools.compressFiles.forEach(f=>{
    const div = document.createElement('div'); div.className = 'thumb';
    const icon = document.createElement('div');
    icon.style.cssText = 'aspect-ratio:0.77; display:flex; align-items:center; justify-content:center; background:var(--panel-2); border-radius:4px; color:var(--brass); font-size:11px; font-family:ui-monospace,monospace;';
    icon.textContent = (f.bytes.length/1024).toFixed(0) + ' KB';
    const fname = document.createElement('div'); fname.className = 'fname'; fname.textContent = f.name;
    const rm = document.createElement('button'); rm.className = 'rm'; rm.textContent = '×';
    rm.addEventListener('click', ()=>{ pdfTools.compressFiles = pdfTools.compressFiles.filter(x=>x.id!==f.id); renderCompressThumbs(); });
    div.appendChild(icon); div.appendChild(fname); div.appendChild(rm);
    wrap.appendChild(div);
  });
}
el('clearCompress').addEventListener('click', ()=>{
  pdfTools.compressFiles = []; el('compressResults').innerHTML = ''; renderCompressThumbs();
});
el('compressQuality').addEventListener('input', ()=>{ el('compressQualityVal').textContent = el('compressQuality').value+'%'; });

// Recompresses JPEG (DCTDecode) images embedded in a PDF at a lower quality.
// Every risky step is wrapped so a single bad image, or an unexpected pdf-lib
// internal shape, degrades to "skip this image" rather than corrupting the
// whole file — and the result is re-parsed before being trusted, so a failed
// mutation surfaces as a clear error instead of a silently broken download.
async function compressPdfBytes(bytes, quality){
  const { PDFName, PDFNumber } = PDFLib;
  const pdfDoc = await PDFDocument.load(bytes);
  if(pdfDoc.isEncrypted){
    throw new Error('This PDF is password-protected — compression is skipped to avoid corrupting it.');
  }

  const indirectObjects = pdfDoc.context.enumerateIndirectObjects();
  let processed = 0, skipped = 0;

  for(const [, obj] of indirectObjects){
    try {
      if(!obj || !obj.dict || typeof obj.contents === 'undefined') continue;
      const dict = obj.dict;
      const subtype = dict.get(PDFName.of('Subtype'));
      if(!subtype || subtype.toString() !== '/Image'){ continue; }

      const filter = dict.get(PDFName.of('Filter'));
      if(!filter || !(filter instanceof PDFName) || filter.toString() !== '/DCTDecode'){ skipped++; continue; }

      const rawBytes = obj.contents;
      if(!(rawBytes instanceof Uint8Array) || rawBytes.length < 2000){ skipped++; continue; }

      const blobUrl = URL.createObjectURL(new Blob([rawBytes], {type:'image/jpeg'}));
      const img = await new Promise((resolve, reject)=>{
        const im = new Image();
        im.onload = ()=>resolve(im);
        im.onerror = reject;
        im.src = blobUrl;
      }).finally(()=>URL.revokeObjectURL(blobUrl));

      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
      canvas.getContext('2d').drawImage(img, 0, 0);
      const newBlob = await new Promise(res=>canvas.toBlob(res, 'image/jpeg', quality));
      const newBytes = new Uint8Array(await newBlob.arrayBuffer());

      if(newBytes.length < rawBytes.length){
        obj.contents = newBytes;
        dict.set(PDFName.of('Length'), PDFNumber.of(newBytes.length));
        processed++;
      } else {
        skipped++;
      }
    } catch(imgErr){
      skipped++;
      continue;
    }
  }

  const outBytes = await pdfDoc.save({ useObjectStreams: true });

  try {
    await PDFDocument.load(outBytes);
  } catch(verifyErr){
    throw new Error('Compression produced an unreadable file, so nothing was changed. Try a different file.');
  }

  return { outBytes, processed, skipped };
}

el('exportCompress').addEventListener('click', async ()=>{
  const quality = parseInt(el('compressQuality').value, 10) / 100;
  const btn = el('exportCompress'); const orig = btn.textContent;
  btn.disabled = true;
  const results = el('compressResults');
  results.innerHTML = '';
  const zip = new JSZip();
  let anySuccess = false;

  for(let i=0; i<pdfTools.compressFiles.length; i++){
    const f = pdfTools.compressFiles[i];
    btn.textContent = `Compressing ${i+1}/${pdfTools.compressFiles.length}...`;
    const row = document.createElement('div');
    row.className = 'hint';
    try {
      const { outBytes, processed } = await compressPdfBytes(f.bytes, quality);
      const beforeKB = (f.bytes.length/1024).toFixed(0);
      const afterKB = (outBytes.length/1024).toFixed(0);
      const pct = f.bytes.length > 0 ? Math.round((1 - outBytes.length/f.bytes.length) * 100) : 0;
      row.textContent = `${f.name}: ${beforeKB}KB → ${afterKB}KB (${Math.max(0,pct)}% smaller, ${processed} image(s) recompressed)`;
      if(pdfTools.compressFiles.length === 1){
        downloadBlob(outBytes, f.name.replace(/\.pdf$/i,'') + '-compressed.pdf');
      } else {
        zip.file(f.name.replace(/\.pdf$/i,'') + '-compressed.pdf', outBytes);
      }
      anySuccess = true;
    } catch(err){
      row.textContent = `${f.name}: could not compress — ${err.message}`;
      row.style.color = 'var(--danger)';
    }
    results.appendChild(row);
  }

  if(pdfTools.compressFiles.length > 1 && anySuccess){
    btn.textContent = 'Zipping...';
    const content = await zip.generateAsync({type:'blob'});
    const url = URL.createObjectURL(content);
    const a = document.createElement('a'); a.href = url; a.download = 'proofmark-compressed-pdfs.zip'; a.click();
    URL.revokeObjectURL(url);
  }
  btn.textContent = orig; btn.disabled = false;
});

/* ================= EDIT PDF (overlay annotations) ================= */
const editScale = 1.3;
let editDrag = null;
let editPendingImagePoint = null;

wireDropzone('dropzoneEdit', 'fileInputEdit', async files=>{
  const f = files[0]; if(!f || f.type !== 'application/pdf') return;
  const bytes = new Uint8Array(await f.arrayBuffer());
  const doc = await pdfjsLib.getDocument({data: bytes.slice()}).promise;
  pdfTools.editDoc = {name: f.name, bytes, numPages: doc.numPages, activePage: 1};
  pdfTools.editAnnotations = {};
  pdfTools.selectedAnnotationId = null;
  el('editWorkspace').style.display = 'block';
  el('exportEdit').disabled = false;
  await renderEditPageThumbs();
  await renderEditCanvas();
}, false);

function newAnnId(){ return 'ann_' + Math.random().toString(36).slice(2,9); }
function currentPageAnnotations(){
  const p = pdfTools.editDoc.activePage;
  if(!pdfTools.editAnnotations[p]) pdfTools.editAnnotations[p] = [];
  return pdfTools.editAnnotations[p];
}
function annotationBBox(a){
  if(a.type === 'text'){
    const mctx = document.createElement('canvas').getContext('2d');
    mctx.font = `${a.size}px sans-serif`;
    const w = mctx.measureText(a.text).width;
    return {x:a.x, y:a.y, w, h:a.size};
  }
  if(a.type === 'rect' || a.type === 'ellipse' || a.type === 'image') return {x:a.x, y:a.y, w:a.w, h:a.h};
  if(a.type === 'line') return {x:Math.min(a.x1,a.x2), y:Math.min(a.y1,a.y2), w:Math.abs(a.x2-a.x1), h:Math.abs(a.y2-a.y1)};
  if(a.type === 'freehand'){
    const xs = a.points.map(p=>p.x), ys = a.points.map(p=>p.y);
    return {x:Math.min(...xs), y:Math.min(...ys), w:Math.max(...xs)-Math.min(...xs), h:Math.max(...ys)-Math.min(...ys)};
  }
  return {x:0, y:0, w:0, h:0};
}
function drawEditAnnotations(ctx){
  const anns = currentPageAnnotations();
  anns.forEach(a=>{
    ctx.save();
    ctx.strokeStyle = a.color; ctx.fillStyle = a.color; ctx.lineWidth = a.size || 2;
    if(a.type === 'text'){
      ctx.font = `${a.size}px sans-serif`; ctx.textBaseline = 'top';
      ctx.fillText(a.text, a.x, a.y);
    } else if(a.type === 'rect'){
      ctx.strokeRect(a.x, a.y, a.w, a.h);
    } else if(a.type === 'ellipse'){
      ctx.beginPath();
      ctx.ellipse(a.x+a.w/2, a.y+a.h/2, Math.abs(a.w/2), Math.abs(a.h/2), 0, 0, Math.PI*2);
      ctx.stroke();
    } else if(a.type === 'line'){
      ctx.beginPath(); ctx.moveTo(a.x1,a.y1); ctx.lineTo(a.x2,a.y2); ctx.stroke();
    } else if(a.type === 'freehand'){
      if(a.points.length > 1){
        ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.beginPath(); ctx.moveTo(a.points[0].x, a.points[0].y);
        for(let i=1;i<a.points.length;i++) ctx.lineTo(a.points[i].x, a.points[i].y);
        ctx.stroke();
      }
    } else if(a.type === 'image' && a.imageEl){
      ctx.drawImage(a.imageEl, a.x, a.y, a.w, a.h);
    }
    if(a.id === pdfTools.selectedAnnotationId){
      const bbox = annotationBBox(a);
      ctx.strokeStyle = '#c9a15a'; ctx.lineWidth = 1; ctx.setLineDash([4,3]);
      ctx.strokeRect(bbox.x-4, bbox.y-4, bbox.w+8, bbox.h+8);
      ctx.setLineDash([]);
    }
    ctx.restore();
  });
}
async function renderEditCanvas(){
  const doc = await pdfjsLib.getDocument({data: pdfTools.editDoc.bytes.slice()}).promise;
  const page = await doc.getPage(pdfTools.editDoc.activePage);
  const viewport = page.getViewport({scale: editScale});
  const canvas = el('previewCanvasEdit');
  canvas.width = viewport.width; canvas.height = viewport.height;
  const ctx = canvas.getContext('2d');
  await page.render({canvasContext: ctx, viewport}).promise;
  drawEditAnnotations(ctx);
}
async function renderEditPageThumbs(){
  const wrap = el('thumbsEditPages'); wrap.innerHTML = '';
  const doc = await pdfjsLib.getDocument({data: pdfTools.editDoc.bytes.slice()}).promise;
  for(let i=0; i<doc.numPages; i++){
    const page = await doc.getPage(i+1);
    const viewport = page.getViewport({scale: 0.3});
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width; canvas.height = viewport.height;
    await page.render({canvasContext: canvas.getContext('2d'), viewport}).promise;
    const div = document.createElement('div');
    div.className = 'thumb' + (i+1 === pdfTools.editDoc.activePage ? ' active' : '');
    div.appendChild(canvas);
    div.addEventListener('click', async ()=>{
      pdfTools.editDoc.activePage = i+1;
      pdfTools.selectedAnnotationId = null;
      await renderEditPageThumbs();
      await renderEditCanvas();
    });
    wrap.appendChild(div);
  }
}

wireSegmented('editModeSeg');

function editCanvasPoint(e){
  const canvas = el('previewCanvasEdit');
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width/rect.width, scaleY = canvas.height/rect.height;
  const pt = e.touches ? e.touches[0] : e;
  return { x: (pt.clientX-rect.left)*scaleX, y: (pt.clientY-rect.top)*scaleY };
}
function hitTestAnnotation(pt){
  const anns = currentPageAnnotations();
  for(let i=anns.length-1; i>=0; i--){
    const b = annotationBBox(anns[i]);
    if(pt.x >= b.x-4 && pt.x <= b.x+b.w+4 && pt.y >= b.y-4 && pt.y <= b.y+b.h+4) return anns[i];
  }
  return null;
}

const editCanvasEl = el('previewCanvasEdit');
editCanvasEl.addEventListener('pointerdown', e=>{
  if(!pdfTools.editDoc) return;
  const pt = editCanvasPoint(e);
  const mode = document.querySelector('#editModeSeg .active').dataset.val;

  if(mode === 'select'){
    const hit = hitTestAnnotation(pt);
    pdfTools.selectedAnnotationId = hit ? hit.id : null;
    if(hit){
      editDrag = {
        ann: hit, startX: pt.x, startY: pt.y,
        origX: hit.x, origY: hit.y, origX2: hit.x2, origY2: hit.y2,
        origPoints: hit.type === 'freehand' ? hit.points.map(p=>({...p})) : null,
      };
    }
    renderEditCanvas();
    return;
  }
  if(mode === 'text'){
    const text = prompt('Enter text:');
    if(text){
      currentPageAnnotations().push({id:newAnnId(), type:'text', x:pt.x, y:pt.y, text, color:el('editColor').value, size:parseInt(el('editSize').value,10)});
      renderEditCanvas();
    }
    return;
  }
  if(mode === 'image'){
    editPendingImagePoint = pt;
    el('editImageInput').click();
    return;
  }
  if(mode === 'rect' || mode === 'ellipse' || mode === 'line'){
    editDrag = {creating: mode, startX: pt.x, startY: pt.y};
    return;
  }
  if(mode === 'freehand'){
    editDrag = {creating: 'freehand', points: [pt]};
    return;
  }
});
editCanvasEl.addEventListener('pointermove', e=>{
  if(!editDrag) return;
  const pt = editCanvasPoint(e);
  const color = el('editColor').value, size = parseInt(el('editSize').value,10);

  if(editDrag.creating === 'rect' || editDrag.creating === 'ellipse'){
    renderEditCanvas().then(()=>{
      const ctx = editCanvasEl.getContext('2d');
      ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = size;
      const x = Math.min(editDrag.startX,pt.x), y = Math.min(editDrag.startY,pt.y);
      const w = Math.abs(pt.x-editDrag.startX), h = Math.abs(pt.y-editDrag.startY);
      if(editDrag.creating === 'rect') ctx.strokeRect(x,y,w,h);
      else { ctx.beginPath(); ctx.ellipse(x+w/2,y+h/2,w/2,h/2,0,0,Math.PI*2); ctx.stroke(); }
      ctx.restore();
    });
  } else if(editDrag.creating === 'line'){
    renderEditCanvas().then(()=>{
      const ctx = editCanvasEl.getContext('2d');
      ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = size;
      ctx.beginPath(); ctx.moveTo(editDrag.startX,editDrag.startY); ctx.lineTo(pt.x,pt.y); ctx.stroke();
      ctx.restore();
    });
  } else if(editDrag.creating === 'freehand'){
    editDrag.points.push(pt);
    renderEditCanvas().then(()=>{
      const ctx = editCanvasEl.getContext('2d');
      ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = size; ctx.lineCap='round'; ctx.lineJoin='round';
      ctx.beginPath(); ctx.moveTo(editDrag.points[0].x, editDrag.points[0].y);
      editDrag.points.forEach(p=>ctx.lineTo(p.x,p.y));
      ctx.stroke(); ctx.restore();
    });
  } else if(editDrag.ann){
    const dx = pt.x-editDrag.startX, dy = pt.y-editDrag.startY;
    const a = editDrag.ann;
    if(a.type === 'line'){ a.x1=editDrag.origX+dx; a.y1=editDrag.origY+dy; a.x2=editDrag.origX2+dx; a.y2=editDrag.origY2+dy; }
    else if(a.type === 'freehand'){ a.points = editDrag.origPoints.map(p=>({x:p.x+dx, y:p.y+dy})); }
    else { a.x = editDrag.origX+dx; a.y = editDrag.origY+dy; }
    renderEditCanvas();
  }
});
editCanvasEl.addEventListener('pointerup', e=>{
  if(!editDrag) return;
  const pt = editCanvasPoint(e);
  const color = el('editColor').value, size = parseInt(el('editSize').value,10);

  if(editDrag.creating === 'rect' || editDrag.creating === 'ellipse'){
    const x = Math.min(editDrag.startX,pt.x), y = Math.min(editDrag.startY,pt.y);
    const w = Math.abs(pt.x-editDrag.startX), h = Math.abs(pt.y-editDrag.startY);
    if(w > 3 && h > 3) currentPageAnnotations().push({id:newAnnId(), type:editDrag.creating, x, y, w, h, color, size});
  } else if(editDrag.creating === 'line'){
    currentPageAnnotations().push({id:newAnnId(), type:'line', x1:editDrag.startX, y1:editDrag.startY, x2:pt.x, y2:pt.y, color, size});
  } else if(editDrag.creating === 'freehand'){
    if(editDrag.points.length > 1) currentPageAnnotations().push({id:newAnnId(), type:'freehand', points:editDrag.points, color, size});
  }
  editDrag = null;
  renderEditCanvas();
});

el('editImageInput').addEventListener('change', async e=>{
  const f = e.target.files[0]; if(!f) return;
  const img = await loadImageFile(f);
  const pngBytes = imageElementToPngBytes(img);
  const w = Math.min(220, img.naturalWidth);
  const h = w * (img.naturalHeight/img.naturalWidth);
  const pt = editPendingImagePoint || {x:60, y:60};
  currentPageAnnotations().push({id:newAnnId(), type:'image', x:pt.x, y:pt.y, w, h, imageEl:img, pngBytes});
  renderEditCanvas();
  e.target.value = '';
});
el('editDeleteSelected').addEventListener('click', ()=>{
  if(!pdfTools.selectedAnnotationId) return;
  const anns = currentPageAnnotations();
  pdfTools.editAnnotations[pdfTools.editDoc.activePage] = anns.filter(a=>a.id !== pdfTools.selectedAnnotationId);
  pdfTools.selectedAnnotationId = null;
  renderEditCanvas();
});
el('editClearPage').addEventListener('click', ()=>{
  if(!pdfTools.editDoc) return;
  pdfTools.editAnnotations[pdfTools.editDoc.activePage] = [];
  pdfTools.selectedAnnotationId = null;
  renderEditCanvas();
});
el('clearEdit').addEventListener('click', ()=>{
  pdfTools.editDoc = null; pdfTools.editAnnotations = {}; pdfTools.selectedAnnotationId = null;
  el('editWorkspace').style.display = 'none';
  el('exportEdit').disabled = true;
});

el('exportEdit').addEventListener('click', async ()=>{
  if(!pdfTools.editDoc) return;
  const btn = el('exportEdit'); const orig = btn.textContent;
  btn.textContent = 'Applying...'; btn.disabled = true;
  try {
    const pdfDoc = await PDFDocument.load(pdfTools.editDoc.bytes);
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const pages = pdfDoc.getPages();

    for(const [pageNumStr, anns] of Object.entries(pdfTools.editAnnotations)){
      const pageIdx = parseInt(pageNumStr, 10) - 1;
      const page = pages[pageIdx];
      if(!page || !anns || anns.length === 0) continue;
      const { height } = page.getSize();

      for(const a of anns){
        try {
          if(a.type === 'text'){
            page.drawText(a.text, {
              x: a.x/editScale, y: height - (a.y/editScale) - a.size*0.8,
              size: a.size, font, color: hexToRgb(a.color),
            });
          } else if(a.type === 'rect'){
            page.drawRectangle({
              x: a.x/editScale, y: height - (a.y/editScale) - (a.h/editScale),
              width: a.w/editScale, height: a.h/editScale,
              borderColor: hexToRgb(a.color), borderWidth: Math.max(1, a.size/editScale),
            });
          } else if(a.type === 'ellipse'){
            page.drawEllipse({
              x: a.x/editScale + (a.w/editScale)/2, y: height - (a.y/editScale) - (a.h/editScale)/2,
              xScale: Math.abs(a.w/editScale)/2, yScale: Math.abs(a.h/editScale)/2,
              borderColor: hexToRgb(a.color), borderWidth: Math.max(1, a.size/editScale),
            });
          } else if(a.type === 'line'){
            page.drawLine({
              start: {x:a.x1/editScale, y:height-(a.y1/editScale)}, end: {x:a.x2/editScale, y:height-(a.y2/editScale)},
              thickness: Math.max(1, a.size/editScale), color: hexToRgb(a.color),
            });
          } else if(a.type === 'freehand'){
            for(let i=0; i<a.points.length-1; i++){
              page.drawLine({
                start: {x:a.points[i].x/editScale, y:height-(a.points[i].y/editScale)},
                end: {x:a.points[i+1].x/editScale, y:height-(a.points[i+1].y/editScale)},
                thickness: Math.max(1, a.size/editScale), color: hexToRgb(a.color),
              });
            }
          } else if(a.type === 'image' && a.pngBytes){
            const embedded = await pdfDoc.embedPng(a.pngBytes);
            page.drawImage(embedded, {
              x: a.x/editScale, y: height - (a.y/editScale) - (a.h/editScale),
              width: a.w/editScale, height: a.h/editScale,
            });
          }
        } catch(annErr){
          continue;
        }
      }
    }

    const outBytes = await pdfDoc.save();
    downloadBlob(outBytes, pdfTools.editDoc.name.replace(/\.pdf$/i,'') + '-edited.pdf');
  } catch(err){
    alert('Something went wrong applying the edits. Try again, or with fewer annotations.');
  }
  btn.textContent = orig; btn.disabled = false;
});
