// =============================================
//  CONFIG
// =============================================
const WORKER_URL = 'https://odpt-proxy-yurikamome.takahara-design.workers.dev/';

const STATIONS = [
  { id: 'Shimbashi',                        name: '新橋',                       num: 'U01', dirs: ['outbound'] },
  { id: 'Shiodome',                         name: '汐留',                       num: 'U02', dirs: ['outbound','inbound'] },
  { id: 'Takeshiba',                        name: '竹芝',                       num: 'U03', dirs: ['outbound','inbound'] },
  { id: 'Hinode',                           name: '日の出',                     num: 'U04', dirs: ['outbound','inbound'] },
  { id: 'ShibauraFuto',                     name: '芝浦ふ頭',                   num: 'U05', dirs: ['outbound','inbound'] },
  { id: 'OdaibaKaihinkoen',                 name: 'お台場海浜公園',             num: 'U06', dirs: ['outbound','inbound'] },
  { id: 'Daiba',                            name: '台場',                       num: 'U07', dirs: ['outbound','inbound'] },
  { id: 'TokyoInternationalCruiseTerminal', name: '東京国際クルーズターミナル', num: 'U08', dirs: ['outbound','inbound'] },
  { id: 'TelecomCenter',                    name: 'テレコムセンター',           num: 'U09', dirs: ['outbound','inbound'] },
  { id: 'Aomi',                             name: '青海',                       num: 'U10', dirs: ['outbound','inbound'] },
  { id: 'TokyoBigSight',                    name: '東京ビッグサイト',           num: 'U11', dirs: ['outbound','inbound'] },
  { id: 'Ariake',                           name: '有明',                       num: 'U12', dirs: ['outbound','inbound'] },
  { id: 'AriakeTennisNoMori',               name: '有明テニスの森',             num: 'U13', dirs: ['outbound','inbound'] },
  { id: 'ShijoMae',                         name: '市場前',                     num: 'U14', dirs: ['outbound','inbound'] },
  { id: 'ShinToyosu',                       name: '新豊洲',                     num: 'U15', dirs: ['outbound','inbound'] },
  { id: 'Toyosu',                           name: '豊洲',                       num: 'U16', dirs: ['inbound'] },
];

// Outbound = 豊洲方面 / Inbound = 新橋方面
const DIR_LABEL = {
  outbound: '豊洲',
  inbound:  '新橋',
};
const TAB_LABEL = {
  outbound: '豊洲行き →',
  inbound:  '← 新橋行き',
};

const CARD_LABELS = ['次便', '次々便', '次々々便'];

const WARN_MS          = 3 * 60 * 1000;
const CRITICAL_MS      = 1 * 60 * 1000;
const FIRST_PREVIEW_MS = 60 * 60 * 1000;

// =============================================
//  STATE
// =============================================
let timetableData  = {};
let currentStation = 'OdaibaKaihinkoen';
let currentDir     = 'outbound';
let activeIdx      = 0;

const DEMO_MODE = WORKER_URL.includes('YOUR-WORKER');

// =============================================
//  DEMO DATA
// =============================================
const STATION_OFFSET_OUTBOUND = {
  Shimbashi:                         0,
  Shiodome:                          1,
  Takeshiba:                         2,
  Hinode:                            4,
  ShibauraFuto:                      5,
  OdaibaKaihinkoen:                  9,
  Daiba:                            11,
  TokyoInternationalCruiseTerminal: 13,
  TelecomCenter:                    15,
  Aomi:                             16,
  TokyoBigSight:                    18,
  Ariake:                           20,
  AriakeTennisNoMori:               21,
  ShijoMae:                         23,
  ShinToyosu:                       25,
  Toyosu:                           27,
};

function buildDemoTimes(startMin, intervalMin, count) {
  const times = [];
  for (let i = 0; i < count; i++) {
    const total = startMin + intervalMin * i;
    const h = Math.floor(total / 60) % 24;
    const m = total % 60;
    times.push(`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`);
  }
  return times;
}

function getDemoTimetable() {
  const FIRST_OUT = 5 * 60 + 45; // 新橋 5:45発
  const FIRST_IN  = 5 * 60 + 43; // 豊洲 5:43発
  const INTERVAL  = 13;
  const COUNT     = 70;

  const result = {};
  STATIONS.forEach(st => {
    result[st.id] = {};
    const offOut = STATION_OFFSET_OUTBOUND[st.id] || 0;
    if (st.dirs.includes('outbound')) {
      result[st.id].outbound = buildDemoTimes(FIRST_OUT + offOut, INTERVAL, COUNT);
    }
    if (st.dirs.includes('inbound')) {
      const offIn = 27 - offOut;
      result[st.id].inbound = buildDemoTimes(FIRST_IN + offIn, INTERVAL, COUNT);
    }
  });
  return result;
}

// =============================================
//  ODPT FETCH
// =============================================
async function fetchTimetable() {
  if (DEMO_MODE) { timetableData = getDemoTimetable(); return; }
  try {
    const res  = await fetch(WORKER_URL);
    const data = await res.json();
    parseTimetable(data);
  } catch (e) {
    console.error('Fetch error:', e);
    if (!Object.keys(timetableData).length) timetableData = getDemoTimetable();
  }
}

function parseTimetable(data) {
  const today  = getTodayCalendar();
  const result = {};

  data.forEach(entry => {
    const calRaw = entry['odpt:calendar'] || '';
    const cal    = calRaw.includes('Weekday') ? 'Weekday' : 'SaturdayHoliday';
    if (cal !== today) return;

    // odpt.Station:Yurikamome.Yurikamome.OdaibaKaihinkoen → OdaibaKaihinkoen
    const stId = (entry['odpt:station'] || '').split('.').pop();

    // odpt.RailDirection:Outbound → outbound
    // odpt.RailDirection:Inbound  → inbound
    const dirRaw = (entry['odpt:railDirection'] || '').split(':').pop().toLowerCase();
    if (dirRaw !== 'outbound' && dirRaw !== 'inbound') return;

    const times = (entry['odpt:stationTimetableObject'] || [])
      .map(o => o['odpt:departureTime'] || o['odpt:arrivalTime'])
      .filter(Boolean);

    if (!result[stId]) result[stId] = {};
    result[stId][dirRaw] = times;
  });

  timetableData = result;
}

function getTodayCalendar() {
  const dow = new Date().getDay();
  return (dow === 0 || dow === 6) ? 'SaturdayHoliday' : 'Weekday';
}

// =============================================
//  TIME UTILS
// =============================================
function nowMs() {
  const n = new Date();
  return (n.getHours() * 3600 + n.getMinutes() * 60 + n.getSeconds()) * 1000
       + n.getMilliseconds();
}

function timeStrToMs(str) {
  const [h, m] = str.split(':').map(Number);
  return (h * 3600 + m * 60) * 1000;
}

function getNextDepartures(stationId, dir, n) {
  const times  = (timetableData[stationId] || {})[dir] || [];
  const now    = nowMs();
  const sorted = times.map(t => ({ str: t, ms: timeStrToMs(t) })).sort((a,b) => a.ms - b.ms);
  const idx    = sorted.findIndex(t => t.ms > now);
  if (idx === -1) return [];
  return sorted.slice(idx, idx + n);
}

function getFirstDeparture(stationId, dir) {
  const times = (timetableData[stationId] || {})[dir] || [];
  if (!times.length) return null;
  return times.map(t => ({ str: t, ms: timeStrToMs(t) })).sort((a,b) => a.ms - b.ms)[0];
}

// =============================================
//  UI BUILD
// =============================================
function buildStationSelect() {
  const sel = document.getElementById('station-select');
  if (!sel) return;
  sel.innerHTML = STATIONS.map(st =>
    `<option value="${st.id}">${st.num} ${st.name}</option>`
  ).join('');
  sel.value = currentStation;
}

function onStationChange() {
  const sel = document.getElementById('station-select');
  if (!sel) return;
  currentStation = sel.value;
  const st = STATIONS.find(s => s.id === currentStation);
  if (!st.dirs.includes(currentDir)) currentDir = st.dirs[0];
  activeIdx = 0;
  updateDirTabs();
  render();
}

function switchDir(dir) {
  currentDir = dir;
  activeIdx  = 0;
  updateDirTabs();
  render();
}

function updateDirTabs() {
  const st   = STATIONS.find(s => s.id === currentStation);
  const tabO = document.getElementById('tab-outbound');
  const tabI = document.getElementById('tab-inbound');
  if (!tabO || !tabI) return;
  tabO.disabled = !st.dirs.includes('outbound');
  tabI.disabled = !st.dirs.includes('inbound');
  tabO.classList.toggle('active', currentDir === 'outbound');
  tabI.classList.toggle('active', currentDir === 'inbound');
}

// =============================================
//  RENDER
// =============================================
function render() {
  const st    = STATIONS.find(s => s.id === currentStation);
  const nexts = getNextDepartures(currentStation, currentDir, 3);
  const dest  = DIR_LABEL[currentDir];

  const elName = document.getElementById('station-name');
  const elBadge = document.getElementById('dir-badge');
  if (elName)  elName.textContent  = st.name;
  if (elBadge) elBadge.textContent = `${dest}方面`;

  const list = document.getElementById('train-list');
  if (!list) return;

  if (!nexts.length) {
    const elCD  = document.getElementById('countdown');
    const elLbl = document.getElementById('timer-label');
    const elEOS = document.getElementById('eos-wrap');
    if (elCD)  elCD.style.display  = 'none';
    if (elLbl) elLbl.style.display = 'none';
    if (elEOS) elEOS.classList.add('visible');
    const first    = getFirstDeparture(currentStation, currentDir);
    const eosFirst = document.getElementById('eos-first');
    if (eosFirst) eosFirst.textContent = first ? `始発 ${first.str}` : '';
    list.innerHTML = '';
    return;
  }

  const elCD  = document.getElementById('countdown');
  const elLbl = document.getElementById('timer-label');
  const elEOS = document.getElementById('eos-wrap');
  if (elCD)  elCD.style.display  = 'flex';
  if (elLbl) elLbl.style.display = 'block';
  if (elEOS) elEOS.classList.remove('visible');

  if (activeIdx >= nexts.length) activeIdx = 0;

  list.innerHTML = nexts.map((dep, i) => `
    <div class="train-card ${i === activeIdx ? 'active' : ''}" onclick="selectCard(${i})">
      <span class="card-label">${CARD_LABELS[i]}</span>
      <span class="card-dest">${dest}行き</span>
      <span class="card-time">${dep.str} 発</span>
    </div>
  `).join('');
}

function selectCard(idx) {
  activeIdx = idx;
  render();
}

// =============================================
//  TICK
// =============================================
function tick() {
  const nexts = getNextDepartures(currentStation, currentDir, 3);

  if (!nexts.length) {
    updateAlertState(-1);
    tickEOS();
    return;
  }

  if (activeIdx >= nexts.length) { activeIdx = 0; render(); }

  const now  = nowMs();
  const diff = Math.max(0, nexts[activeIdx].ms - now);

  const m  = Math.floor(diff / 60000);
  const s  = Math.floor((diff % 60000) / 1000);
  const ms = Math.floor((diff % 1000) / 10);

  const elMin = document.getElementById('cd-min');
  const elSec = document.getElementById('cd-sec');
  const elMs  = document.getElementById('cd-ms');
  if (elMin) elMin.textContent = String(m).padStart(2,'0');
  if (elSec) elSec.textContent = String(s).padStart(2,'0');
  if (elMs)  elMs.textContent  = String(ms).padStart(2,'0');

  updateAlertState(diff);

  if (diff === 0) { activeIdx = 0; render(); }
}

function tickEOS() {
  const eosCD = document.getElementById('eos-countdown');
  if (!eosCD) return;
  const first = getFirstDeparture(currentStation, currentDir);
  if (!first) return;
  let firstMs = first.ms;
  const now   = nowMs();
  if (firstMs <= now) firstMs += 86400000;
  const diff  = firstMs - now;
  if (diff <= FIRST_PREVIEW_MS) {
    const m = Math.floor(diff / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    eosCD.textContent = `始発まで あと ${String(m).padStart(2,'0')}分 ${String(s).padStart(2,'0')}秒`;
  } else {
    eosCD.textContent = '';
  }
}

// =============================================
//  ALERT STATE
// =============================================
function updateAlertState(diffMs) {
  const body = document.body;
  const zt   = document.getElementById('zebra-top');
  const zb   = document.getElementById('zebra-bottom');
  if (!zt || !zb) return;

  body.classList.remove('warning', 'critical');
  zt.classList.remove('visible');
  zb.classList.remove('visible');

  if (diffMs < 0) return;

  if (diffMs < CRITICAL_MS) {
    body.classList.add('critical');
    zt.classList.add('visible');
    zb.classList.add('visible');
  } else if (diffMs < WARN_MS) {
    body.classList.add('warning');
    zt.classList.add('visible');
    zb.classList.add('visible');
  }
}

// =============================================
//  INIT
// =============================================
async function init() {
  buildStationSelect();
  updateDirTabs();
  await fetchTimetable();
  const sel = document.getElementById('station-select');
  if (sel) sel.value = currentStation;
  render();
  setInterval(tick, 16);
  setInterval(fetchTimetable, 5 * 60 * 1000);
}

init();
