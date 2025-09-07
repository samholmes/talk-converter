// Main UI logic (ES module)

const liveList = document.getElementById('liveList');
const talkList = document.getElementById('talkList');
const procList = document.getElementById('procList');
const player = document.getElementById('player');
const statusEl = document.getElementById('status');
const logsEl = document.getElementById('logs');
const currentLabel = document.getElementById('currentLabel');
const videoUI = document.getElementById('videoUI');
const logsUI = document.getElementById('logsUI');
const emptyUI = document.getElementById('emptyUI');

const btnPlay = document.getElementById('btnPlay');
const scrubber = document.getElementById('scrubber');
const hoverTip = document.getElementById('hoverTip');
const timeLabel = document.getElementById('timeLabel');
const segHighlight = document.getElementById('segHighlight');
const btnSegment = document.getElementById('btnSegment');
const titlePopover = document.getElementById('titlePopover');
const titleInputPrompt = document.getElementById('titleInputPrompt');
const confirmTitle = document.getElementById('confirmTitle');
const cancelTitle = document.getElementById('cancelTitle');

let mode = 'none';
let current = { type: null, filename: null, url: null };
let eventSrc = null;

// Segment state
let segmentActive = false;
let segmentTitle = '';
let segmentStart = 0;
let lastScrubTime = 0;

function setMode(m) {
  mode = m;
  videoUI.classList.toggle('hidden', m !== 'video');
  logsUI.classList.toggle('hidden', m !== 'process');
  emptyUI.classList.toggle('hidden', m !== 'none');
}

function fmtTime(s) {
  s = Math.max(0, Math.floor(s || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(sec).padStart(2, '0');
  return h ? `${h}:${mm}:${ss}` : `${m}:${ss}`;
}

async function refreshLists() {
  const res = await fetch('/api/list');
  const data = await res.json();
  liveList.innerHTML = '';
  talkList.innerHTML = '';
  for (const name of data.liveStreams.map((x) => x.name)) {
    const li = document.createElement('li');
    li.textContent = name;
    li.onclick = () => select('youtube', name);
    liveList.appendChild(li);
  }
  for (const name of data.talks.map((x) => x.name)) {
    const li = document.createElement('li');
    li.textContent = name;
    li.onclick = () => select('talks', name);
    talkList.appendChild(li);
  }
  if (mode === 'none') setMode('none');
}

function select(type, filename) {
  if (eventSrc) { eventSrc.close(); eventSrc = null; }
  [...liveList.children, ...talkList.children].forEach((li) => li.classList.remove('selected'));
  const list = type === 'youtube' ? liveList : talkList;
  [...list.children].forEach((li) => { if (li.textContent === filename) li.classList.add('selected'); });
  current = { type, filename, url: `/media/${type}/${encodeURIComponent(filename)}` };
  player.src = current.url;
  currentLabel.textContent = `${type === 'youtube' ? 'Live Stream' : 'Talk'}: ${filename}`;
  statusEl.textContent = '';
  logsEl.textContent = '';
  resetSegment();
  setMode('video');
}

function resetSegment() {
  segmentActive = false;
  segmentTitle = '';
  segmentStart = 0;
  lastScrubTime = 0;
  segHighlight.style.width = '0%';
  segHighlight.style.left = '0%';
  btnSegment.dataset.tooltip = 'Mark segment start';
  btnSegment.innerHTML = `<svg viewBox="0 0 21 18" width="20" height="20" fill="currentColor"><path d="M12 2a1 1 0 0 1 1 1v5.586l1.293-1.293a1 1 0 0 1 1.414 1.414l-3.707 3.707a1 1 0 0 1-1.414 0L6.879 8.707A1 1 0 1 1 8.293 7.293L9.586 8.586V3a1 1 0 0 1 1-1h1.414Z"/></svg>`;
}

// Playback controls
btnPlay.addEventListener('click', () => {
  if (player.paused) player.play(); else player.pause();
});
player.addEventListener('play', () => {
  btnPlay.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>';
});
player.addEventListener('pause', () => {
  btnPlay.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
});

// Time / progress updates
player.addEventListener('timeupdate', updateProgress);
player.addEventListener('progress', updateBuffered);
player.addEventListener('loadedmetadata', () => {
  updateProgress();
  updateBuffered();
});

function updateProgress() {
  const duration = player.duration || 0;
  const currentTime = player.currentTime || 0;
  const pct = duration ? (currentTime / duration) * 100 : 0;
  const progress = scrubber.querySelector('.progress');
  const handle = scrubber.querySelector('.handle');
  progress.style.width = pct + '%';
  handle.style.left = `calc(${pct}% - 6px)`;
  timeLabel.textContent = `${fmtTime(currentTime)} / ${fmtTime(duration)}`;
  if (segmentActive) {
    const startPct = (segmentStart / duration) * 100;
    const endPct = Math.max(pct, startPct);
    segHighlight.style.left = startPct + '%';
    segHighlight.style.width = (endPct - startPct) + '%';
  }
  lastScrubTime = Math.max(lastScrubTime, currentTime);
}

function updateBuffered() {
  const duration = player.duration || 0;
  const bufferBar = scrubber.querySelector('.buffer');
  if (!duration || player.buffered.length === 0) {
    bufferBar.style.width = '0%';
    return;
  }
  const end = player.buffered.end(player.buffered.length - 1);
  bufferBar.style.width = Math.min(100, (end / duration) * 100) + '%';
}

// Scrubber interactions
let scrubbing = false;

function posToTime(clientX) {
  const rect = scrubber.getBoundingClientRect();
  let x = Math.min(Math.max(clientX - rect.left, 0), rect.width);
  let t = (x / rect.width) * (player.duration || 0);
  if (segmentActive) {
    // Restrict backward while segment active
    t = Math.max(t, lastScrubTime, segmentStart + 0.01);
  }
  return t;
}

scrubber.addEventListener('pointerdown', (e) => {
  scrubbing = true;
  const t = posToTime(e.clientX);
  player.currentTime = t;
  updateProgress();
});
window.addEventListener('pointermove', (e) => {
  if (!scrubbing) return;
  const t = posToTime(e.clientX);
  player.currentTime = t;
});
window.addEventListener('pointerup', () => {
  scrubbing = false;
});

scrubber.addEventListener('pointermove', (e) => {
  const rect = scrubber.getBoundingClientRect();
  let x = Math.min(Math.max(e.clientX - rect.left, 0), rect.width);
  const t = (x / rect.width) * (player.duration || 0);
  hoverTip.textContent = fmtTime(t);
  hoverTip.style.left = x + 'px';
  hoverTip.style.opacity = '1';
});

scrubber.addEventListener('pointerleave', () => {
  hoverTip.style.opacity = '0';
});

// Segment controls
btnSegment.addEventListener('click', () => {
  if (!current.type || !current.filename) return;
  if (!segmentActive) {
    // Ask for title via glass popover
    openTitlePopover();
  } else {
    // End segment
    const end = Math.floor(player.currentTime);
    if (end <= Math.floor(segmentStart)) return;
    submitSegment({ start: Math.floor(segmentStart), end, title: segmentTitle });
    resetSegment();
  }
});

function openTitlePopover() {
  titlePopover.classList.remove('hidden');
  titleInputPrompt.value = '';
  titleInputPrompt.focus();
}

cancelTitle.addEventListener('click', () => {
  titlePopover.classList.add('hidden');
});

confirmTitle.addEventListener('click', () => {
  const title = titleInputPrompt.value.trim() || 'Segment';
  titlePopover.classList.add('hidden');
  segmentTitle = title;
  segmentStart = player.currentTime;
  lastScrubTime = segmentStart;
  segmentActive = true;
  btnSegment.dataset.tooltip = 'End segment';
  // change icon to flag
  btnSegment.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M4 3h2v18H4V3zm3 0h9l-1.5 3L18 9h-9l1.5-3L7 3z"/></svg>';
  updateProgress();
});

async function submitSegment(segment) {
  statusEl.textContent = 'Submitting segment...';
  const res = await fetch('/api/process', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sourceType: current.type, filename: current.filename, segments: [segment] })
  });
  if (!res.ok) {
    statusEl.textContent = 'Failed to submit segment';
    return;
  }
  const { id } = await res.json();
  addProcessingItem(id, current.filename);
  selectProcess(id);
  statusEl.textContent = `Processing started (#${id.slice(0, 8)})`;
}

// Processing list + SSE
function addProcessingItem(id, sourceName) {
  const li = document.createElement('li');
  li.id = `proc-${id}`;
  li.classList.add('processing');
  li.textContent = `Processing ${sourceName} — ${id.slice(0, 8)}`;
  li.onclick = () => selectProcess(id);
  procList.prepend(li);
}

function selectProcess(id) {
  setMode('process');
  openStream(id);
}

function openStream(id) {
  if (eventSrc) eventSrc.close();
  logsEl.textContent = '';
  eventSrc = new EventSource(`/api/process/${id}/stream`);
  eventSrc.onmessage = (ev) => {
    try {
      const msg = JSON.parse(ev.data);
      if (msg.event === 'log') {
        logsEl.textContent += msg.data.line + '\n';
        logsEl.scrollTop = logsEl.scrollHeight;
      } else if (msg.event === 'progress') {
        const { currentIndex, total } = msg.data;
        statusEl.textContent = `Progress: ${currentIndex + 1}/${total}`;
      } else if (msg.event === 'status') {
        const { status } = msg.data;
        if (status === 'completed') {
          statusEl.textContent = 'Completed';
          const li = document.getElementById(`proc-${id}`);
          if (li) {
            li.classList.remove('processing');
            li.classList.add('done');
            li.textContent = li.textContent.replace('Processing', 'Done');
          }
          refreshLists();
        } else if (status === 'failed') {
          statusEl.textContent = 'Failed';
        }
      }
    } catch { }
  };
}

// Style helpers for tooltips
for (const el of document.querySelectorAll('[data-tooltip]')) {
  el.addEventListener('mouseenter', () => el.classList.add('tt'));
  el.addEventListener('mouseleave', () => el.classList.remove('tt'));
}

// Init
refreshLists();
setMode('none');
