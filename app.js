// =============================================
//  CONFIG
// =============================================
// Cloudflare WorkerのURLに書き換えてください
const WORKER_URL = 'https://odpt-proxy-yurikamome.takahara-design.workers.dev/';

const STATIONS = [
  { id: 'Shinbashi',                        name: '新橋',                       num: 'U01', dirs: ['toyosu'] },
  { id: 'Shiodome',                         name: '汐留',                       num: 'U02', dirs: ['toyosu','shinbashi'] },
  { id: 'Takeshiba',                        name: '竹芝',                       num: 'U03', dirs: ['toyosu','shinbashi'] },
  { id: 'Hinode',                           name: '日の出',                     num: 'U04', dirs: ['toyosu','shinbashi'] },
  { id: 'ShibauraFuto',                     name: '芝浦ふ頭',                   num: 'U05', dirs: ['toyosu','shinbashi'] },
  { id: 'OdaibaKaihinkoen',                 name: 'お台場海浜公園',             num: 'U06', dirs: ['toyosu','shinbashi'] },
  { id: 'Daiba',                            name: '台場',                       num: 'U07', dirs: ['toyosu','shinbashi'] },
  { id: 'TokyoInternationalCruiseTerminal', name: '東京国際クルーズターミナル', num: 'U08', dirs: ['toyosu','shinbashi'] },
  { id: 'TelecomCenter',                    name: 'テレコムセンター',           num: 'U09', dirs: ['toyosu','shinbashi'] },
  { id: 'Aomi',                             name: '青海',                       num: 'U10', dirs: ['toyosu','shinbashi'] },
  { id: 'TokyoBigSight',                    name: '東京ビッグサイト',           num: 'U11', dirs: ['toyosu','shinbashi'] },
  { id: 'Ariake',                           name: '有明',                       num: 'U12', dirs: ['toyosu','shinbashi'] },
  { id: 'AriakeTennisNoMori',               name: '有明テニスの森',             num: 'U13', dirs: ['toyosu','shinbashi'] },
  { id: 'Shijomae',                         name: '市場前',                     num: 'U14', dirs: ['toyosu','shinbashi'] },
  { id: 'ShinToyosu',                       name: '新豊洲',                     num: 'U15', dirs: ['toyosu','shinbashi'] },
  { id: 'Toyosu',                           name: '豊洲',                       num: 'U16', dirs: ['shinbashi'] },
];

const CARD_LABELS = ['次便', '次々便', '次々々便'];

const WARN_MS          = 3 * 60 * 1000;   // 3分前から黄色
const CRITICAL_MS      = 1 * 60 * 1000;   // 1分前から黒
const FIRST_PREVIEW_MS = 60 * 60 * 1000;  // 始発60分前からカウントダウン

// =============================================
//  STATE
// =============================================
let timetableData  = {};
let currentStation = 'OdaibaKaihinkoen';
let currentDir     = 'toyosu';
let activeIdx      = 0;

const DEMO_MODE = WORKER_URL.includes('YOUR-WORKER');

// =============================================
//  DEMO DATA
// =============================================
const STATION_OFFSET_TOYOSU = {
  Shinbashi:                         0,
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
  Shijomae:                         23,
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
  const FIRST_TOYOSU    = 5 * 60 + 15; // 新橋 5:15発
  const FIRST_SHINBASHI = 5 * 60 + 43; // 豊洲 5:43発
  const INTERVAL = 13;
  const COUNT    = 70;

  const result = {};
  STATIONS.forEach(st => {
    result[st.id] = {};
    const offT = STATION_OFFSET_TOYOSU[st.id] || 0;
    if (st.dirs.includes('toyosu')) {
      result[st.id].toyosu = buildDemoTimes(FIRST_TOYOSU + offT, INTERVAL, COUNT);
    }
    if (st.dirs.includes('shinbashi')) {
      const offS = 27 - offT;
      result[st.id].shinbashi = buildDemoTimes(FIRST_SHINBASHI + offS, INTERVAL, COUNT);
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
    const stId   = (entry['odpt:station'] || '').split('.').pop();
    const dirRaw = (entry['odpt:railDirection'] || '').split('.').pop().toLowerCase();
    const dir    = dirRaw === 'toyosu'    ? 'toyosu'
                 : dirRaw === 'shinbashi' ? 'shinbashi' : null;
    if (!dir) return;
    const times = (entry['odpt:stationTimetableObject'] || [])
      .map(o => o['odpt:departureTime'] || o['odpt:arrivalTime'])
      .filter(Boolean);
    if (!result[stId]) result[stId] = {};
    result[stId][dir] = times;
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
  sel.innerHTML = STATIONS.map(st =>
    `<option value="${st.id}">${st.num} ${st.name}</option>`
  ).join('');
  sel.value = currentStation;
}

function onStationChange() {
  currentStation = document.getElementById('station-select').value;
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
  const tabT = document.getElementById('tab-toyosu');
  const tabS = document.getElementById('tab-shinbashi');
  if (!tabT || !tabS) return;
  tabT.disabled = !st.dirs.includes('toyosu');
  tabS.disabled = !st.dirs.includes('shinbashi');
  tabT.classList.toggle('active', currentDir === 'toyosu');
  tabS.classList.toggle('active', currentDir === 'shinbashi');
}

// =============================================
//  RENDER
// =============================================
function render() {
  const st    = STATIONS.find(s => s.id === currentStation);
  const nexts = getNextDepartures(currentStation, currentDir, 3);
  const dest  = currentDir === 'toyosu' ? '豊洲' : '新橋';

  document.getElementById('station-name').textContent = st.name;
  document.getElementById('dir-badge').textContent    = `${dest}方面`;

  const list = document.getElementById('train-list');

  if (!nexts.length) {
    document.getElementById('countdown').style.display   = 'none';
    document.getElementById('timer-label').style.display = 'none';
    document.getElementById('eos-wrap').classList.add('visible');
    const first    = getFirstDeparture(currentStation, currentDir);
    const eosFirst = document.getElementById('eos-first');
    if (eosFirst) eosFirst.textContent = first ? `始発 ${first.str}` : '';
    list.innerHTML = '';
    return;
  }

  document.getElementById('countdown').style.display   = 'flex';
  document.getElementById('timer-label').style.display = 'block';
  document.getElementById('eos-wrap').classList.remove('visible');

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
  document.getElementById('station-select').value = currentStation;
  render();
  setInterval(tick, 16);
  setInterval(fetchTimetable, 5 * 60 * 1000);
}

init();
