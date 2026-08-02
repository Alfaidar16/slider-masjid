const state = {
  settings: null,
  prayerTimes: null,
  announcements: [],
  slideList: ['prayer'],
  slideIndex: 0,
  slideTimer: null
};

const PRAYER_SLIDE_DURATION = 10000;
const FARD_ORDER = ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'];
const GRID_ORDER = ['Imsak', 'Fajr', 'Sunrise', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'];
const LABELS = {
  Imsak: 'Imsak', Fajr: 'Subuh', Sunrise: 'Syuruq', Dhuhr: 'Dzuhur',
  Asr: 'Ashar', Maghrib: 'Maghrib', Isha: 'Isya'
};

async function loadSettings() {
  const res = await fetch('/api/settings');
  state.settings = await res.json();
  document.getElementById('mosqueName').textContent = state.settings.mosque.name;
  state.announcements = state.settings.announcements;
  buildSlides();
  buildTicker();
}

async function loadPrayerTimes() {
  try {
    const res = await fetch('/api/prayertimes');
    if (!res.ok) throw new Error('bad status');
    state.prayerTimes = await res.json();
    document.getElementById('dateHijri').textContent = state.prayerTimes.hijri;
    renderPrayerGrid();
    hideStatus();
  } catch (e) {
    showStatus('Gagal memuat jadwal sholat, memakai data terakhir.');
  }
}

function parseTimeToday(hhmm) {
  const clean = hhmm.split(' ')[0];
  const [h, m] = clean.split(':').map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d;
}

function getNextFard() {
  const now = new Date();
  for (const key of FARD_ORDER) {
    const t = parseTimeToday(state.prayerTimes.timings[key]);
    if (t > now) return { key, time: t };
  }
  const t = parseTimeToday(state.prayerTimes.timings.Fajr);
  t.setDate(t.getDate() + 1);
  return { key: 'Fajr', time: t };
}

function renderPrayerGrid() {
  const grid = document.getElementById('prayerGrid');
  grid.innerHTML = '';
  if (!state.prayerTimes) return;
  const next = getNextFard();

  GRID_ORDER.forEach(key => {
    const box = document.createElement('div');
    box.className = 'prayer-box' + (key === next.key ? ' active' : '');
    box.innerHTML = `<div class="label">${LABELS[key]}</div><div class="time">${state.prayerTimes.timings[key].split(' ')[0]}</div>`;
    grid.appendChild(box);
  });
}

function updateActiveBox(activeKey) {
  const grid = document.getElementById('prayerGrid');
  [...grid.children].forEach((box, i) => {
    box.classList.toggle('active', GRID_ORDER[i] === activeKey);
  });
}

function formatDuration(ms) {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const pad = n => String(n).padStart(2, '0');
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

const PRE_ADZAN_WINDOW_MS = 60 * 1000;

function updatePreAdzan(now) {
  const overlay = document.getElementById('preAdzanOverlay');
  for (const key of FARD_ORDER) {
    const prayerTime = parseTimeToday(state.prayerTimes.timings[key]);
    const diff = prayerTime - now;
    if (diff > 0 && diff <= PRE_ADZAN_WINDOW_MS) {
      overlay.classList.add('show');
      document.getElementById('preAdzanPrayerName').textContent = LABELS[key];
      document.getElementById('preAdzanCountdown').textContent = formatDuration(diff);
      return;
    }
  }
  overlay.classList.remove('show');
}

function updateIqamah(now) {
  const overlay = document.getElementById('iqamahOverlay');
  const offsets = state.settings.iqamahOffsets;
  for (const key of FARD_ORDER) {
    const offsetMin = offsets[key] || 0;
    if (!offsetMin) continue;
    const prayerTime = parseTimeToday(state.prayerTimes.timings[key]);
    const iqamahTime = new Date(prayerTime.getTime() + offsetMin * 60000);
    if (now >= prayerTime && now < iqamahTime) {
      overlay.classList.add('show');
      document.getElementById('iqamahPrayerName').textContent = LABELS[key];
      document.getElementById('iqamahCountdown').textContent = formatDuration(iqamahTime - now);
      return;
    }
  }
  overlay.classList.remove('show');
}

function tick() {
  const now = new Date();
  document.getElementById('clock').textContent = now.toLocaleTimeString('id-ID', { hour12: false });
  document.getElementById('dateMasehi').textContent = now.toLocaleDateString('id-ID', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  });

  if (state.prayerTimes && state.settings) {
    const next = getNextFard();
    const countdown = formatDuration(next.time - now);
    document.getElementById('heroNextLabel').textContent = `Menuju ${LABELS[next.key]}`;
    document.getElementById('heroCountdown').textContent = countdown;
    document.getElementById('featPrayerSub').textContent = `Menuju ${LABELS[next.key]} — ${countdown}`;
    updateActiveBox(next.key);
    updatePreAdzan(now);
    updateIqamah(now);
  }
}

// ---- Hero slideshow: jadwal sholat & tiap pengumuman gantian ----
function buildSlides() {
  state.slideList = ['prayer', ...state.announcements.map(a => a.id)];
  goToSlide(0);
}

function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str == null ? '' : str;
  return d.innerHTML;
}

// ---- Template per jenis konten (umum, kajian, infaq, hadist) ----
function renderAnnounceSlide(item, isFirst) {
  const type = item.type || 'umum';
  const textEl = document.getElementById('heroSlideText');
  const inner = document.getElementById('heroSlideInner');
  textEl.className = 'hero-slide hero-slide-text variant-' + type;

  if (type === 'kajian') {
    inner.innerHTML = `
      <div class="type-badge kajian">📖 Kajian Rutin</div>
      <h1 class="hero-title">${escapeHtml(item.title)}</h1>
      ${item.speaker ? `<div class="kajian-speaker">${escapeHtml(item.speaker)}</div>` : ''}
      <p class="hero-desc">${escapeHtml(item.body)}</p>
    `;
  } else if (type === 'infaq') {
    inner.innerHTML = `
      <div class="type-badge infaq">💚 ${escapeHtml(item.title)}</div>
      ${item.amount ? `<div class="infaq-amount">${escapeHtml(item.amount)}</div>` : ''}
      <p class="hero-desc">${escapeHtml(item.body)}</p>
    `;
  } else if (type === 'hadist') {
    inner.innerHTML = `
      <div class="hadist-mark">&ldquo;</div>
      <p class="hadist-text">${escapeHtml(item.body)}</p>
      ${item.narrator ? `<div class="hadist-narrator">${escapeHtml(item.narrator)}</div>` : ''}
    `;
  } else if (type === 'nasehat') {
    inner.innerHTML = `<div class="nasehat-text">${escapeHtml(item.body)}</div>`;
  } else if (type === 'laporan') {
    const rows = [
      ['Saldo Awal', item.saldoAwal],
      ['Pemasukan', item.pemasukan],
      ['Pengeluaran', item.pengeluaran]
    ].filter(([, val]) => val);
    inner.innerHTML = `
      <div class="type-badge infaq">📊 ${escapeHtml(item.title)}</div>
      ${item.period ? `<div class="laporan-period">${escapeHtml(item.period)}</div>` : ''}
      <div class="laporan-rows">
        ${rows.map(([label, val]) => `
          <div class="laporan-row">
            <span class="laporan-label">${escapeHtml(label)}</span>
            <span class="laporan-value">${escapeHtml(val)}</span>
          </div>
        `).join('')}
        ${item.saldoAkhir ? `
          <div class="laporan-row laporan-final">
            <span class="laporan-label">Saldo Akhir</span>
            <span class="laporan-value">${escapeHtml(item.saldoAkhir)}</span>
          </div>
        ` : ''}
      </div>
    `;
  } else {
    const eyebrow = isFirst ? 'Selamat Datang di' : 'Pengumuman';
    const title = isFirst
      ? ((state.settings && state.settings.mosque.name) || item.title)
      : item.title;
    inner.innerHTML = `
      <div class="hero-eyebrow">${escapeHtml(eyebrow)}</div>
      <h1 class="hero-title">${escapeHtml(title)}</h1>
      <p class="hero-desc">${escapeHtml(item.body)}</p>
    `;
  }
}

function goToSlide(index) {
  clearTimeout(state.slideTimer);
  if (!state.slideList.length) return;
  state.slideIndex = ((index % state.slideList.length) + state.slideList.length) % state.slideList.length;
  const slideKey = state.slideList[state.slideIndex];

  const prayerEl = document.getElementById('heroSlidePrayer');
  const textEl = document.getElementById('heroSlideText');
  const heroEl = document.getElementById('hero');

  let duration = PRAYER_SLIDE_DURATION;
  heroEl.classList.remove('prayer-active', 'nasehat-active');

  if (slideKey === 'prayer') {
    prayerEl.classList.add('show');
    textEl.classList.remove('show');
    heroEl.classList.add('prayer-active');
  } else {
    const item = state.announcements.find(a => a.id === slideKey);
    if (!item) {
      return goToSlide(state.slideIndex + 1);
    }
    const isFirst = state.announcements[0] && state.announcements[0].id === item.id;
    renderAnnounceSlide(item, isFirst);
    textEl.classList.add('show');
    prayerEl.classList.remove('show');
    if ((item.type || 'umum') === 'nasehat') {
      heroEl.classList.add('nasehat-active');
    }
    duration = item.duration || 8000;
  }

  state.slideTimer = setTimeout(() => goToSlide(state.slideIndex + 1), duration);
}

// ---- Ticker berjalan di bawah ----
function tickerTextFor(item) {
  const type = item.type || 'umum';
  if (type === 'nasehat') return item.body;
  if (type === 'laporan') return `${item.title}${item.period ? ' ' + item.period : ''}: Saldo Akhir ${item.saldoAkhir || '-'}`;
  return item.body ? `${item.title}: ${item.body}` : item.title;
}

function buildTicker() {
  const el = document.getElementById('tickerContent');
  el.innerHTML = '';

  state.announcements.forEach((item, i) => {
    if (i > 0) {
      const sep = document.createElement('span');
      sep.className = 'ticker-sep';
      sep.textContent = '|';
      el.appendChild(sep);
    }
    const span = document.createElement('span');
    span.textContent = tickerTextFor(item);
    el.appendChild(span);
  });

  const totalLen = state.announcements.reduce((sum, a) => sum + tickerTextFor(a).length, 0);
  el.style.animationDuration = `${Math.max(18, totalLen * 0.12)}s`;
}

function showStatus(msg) {
  const el = document.getElementById('statusBanner');
  el.textContent = msg;
  el.classList.add('show');
}
function hideStatus() {
  document.getElementById('statusBanner').classList.remove('show');
}

// ---- Socket.io live updates ----
const socket = io();
socket.on('connect', hideStatus);
socket.on('disconnect', () => showStatus('Koneksi ke server terputus, mencoba menyambung ulang...'));
socket.on('settings-updated', (settings) => {
  state.settings = settings;
  document.getElementById('mosqueName').textContent = settings.mosque.name;
  state.announcements = settings.announcements;
  buildTicker();
  loadPrayerTimes();
});
socket.on('announcements-updated', (announcements) => {
  state.announcements = announcements;
  buildSlides();
  buildTicker();
});

// ---- Init ----
(async function init() {
  await loadSettings();
  await loadPrayerTimes();
  tick();
  setInterval(tick, 1000);
  setInterval(loadPrayerTimes, 60 * 60 * 1000);
})();
