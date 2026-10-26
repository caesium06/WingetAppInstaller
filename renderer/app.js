/* =============================================================
   Winget App Catalog — Renderer JavaScript  (v2)
   ============================================================= */

// ── App icons map (emoji fallback by keyword) ──────────────────────────────
const ICON_MAP = [
  { re: /chrome|chromium/i,             icon: '🌐' },
  { re: /firefox/i,                     icon: '🦊' },
  { re: /\bedge\b/i,                    icon: '🔵' },
  { re: /brave/i,                       icon: '🦁' },
  { re: /opera/i,                       icon: '🎭' },
  { re: /vlc|media.player|mpv/i,        icon: '🎬' },
  { re: /spotify/i,                     icon: '🎵' },
  { re: /discord/i,                     icon: '💬' },
  { re: /slack/i,                       icon: '💼' },
  { re: /zoom/i,                        icon: '📹' },
  { re: /teams/i,                       icon: '🤝' },
  { re: /vscode|visual.studio.code/i,   icon: '💻' },
  { re: /\bgit\b/i,                     icon: '🌿' },
  { re: /node|nodejs/i,                 icon: '🟢' },
  { re: /python/i,                      icon: '🐍' },
  { re: /rust/i,                        icon: '🦀' },
  { re: /docker/i,                      icon: '🐳' },
  { re: /steam/i,                       icon: '🎮' },
  { re: /epic|games/i,                  icon: '🕹️' },
  { re: /7-zip|7zip|winrar/i,           icon: '🗜️' },
  { re: /notepad/i,                     icon: '📝' },
  { re: /office|word|excel/i,           icon: '📄' },
  { re: /paint/i,                       icon: '🎨' },
  { re: /obs|streaming/i,               icon: '📡' },
  { re: /handbrake|ffmpeg/i,            icon: '🎞️' },
  { re: /powertoys/i,                   icon: '🔧' },
  { re: /terminal/i,                    icon: '⬛' },
  { re: /winget/i,                      icon: '📦' },
  { re: /pdf/i,                         icon: '📑' },
  { re: /antivirus|malware|defender/i,  icon: '🛡️' },
  { re: /vpn|wireguard|openvpn/i,       icon: '🔒' },
  { re: /torrent|qbittorrent/i,         icon: '⬇️' },
  { re: /bitwarden|keepass|pass/i,      icon: '🔑' },
  { re: /powershell/i,                  icon: '🔷' },
  { re: /postman|insomnia/i,            icon: '🧪' },
  { re: /figma|sketch/i,                icon: '✏️' },
  { re: /gimp|photoshop/i,              icon: '🖼️' },
  { re: /java|jdk/i,                    icon: '☕' },
  { re: /android.studio/i,              icon: '🤖' },
  { re: /xcode/i,                       icon: '🍎' },
];

const CARD_ACCENTS = [
  'rgba(79,142,247,0.1)',
  'rgba(168,85,247,0.1)',
  'rgba(16,185,129,0.08)',
  'rgba(245,158,11,0.08)',
  'rgba(239,68,68,0.08)',
];

function getIcon(name = '', id = '') {
  const text = `${name} ${id}`;
  for (const { re, icon } of ICON_MAP) {
    if (re.test(text)) return icon;
  }
  return (name[0] || id[0] || '?').toUpperCase();
}

function cardAccent(idx) {
  return CARD_ACCENTS[idx % CARD_ACCENTS.length];
}

// ── Utilities ──────────────────────────────────────────────────────────────
function $(id) { return document.getElementById(id); }

function escHtml(s = '') {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatDate(iso) {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch { return iso; }
}

let toastTimer = null;
function showToast(message, type = 'info', duration = 3500) {
  const tc = $('toast-container');
  const t  = document.createElement('div');
  t.className = `toast ${type}`;
  t.innerHTML = `<span class="toast-dot"></span>${escHtml(message)}`;
  tc.appendChild(t);
  setTimeout(() => {
    t.style.opacity   = '0';
    t.style.transform = 'translateX(18px)';
    t.style.transition = '0.25s ease';
    setTimeout(() => t.remove(), 250);
  }, duration);
}

// ── Confirm dialog ─────────────────────────────────────────────────────────
function showConfirm(title, message, okLabel = 'Confirm') {
  return new Promise((resolve) => {
    $('confirm-title').textContent   = title;
    $('confirm-message').textContent = message;
    $('confirm-ok-btn').textContent  = okLabel;
    $('confirm-overlay').classList.remove('hidden');

    function cleanup() {
      $('confirm-overlay').classList.add('hidden');
      $('confirm-ok-btn').removeEventListener('click', onOk);
      $('confirm-cancel-btn').removeEventListener('click', onCancel);
    }
    function onOk()     { cleanup(); resolve(true); }
    function onCancel() { cleanup(); resolve(false); }

    $('confirm-ok-btn').addEventListener('click', onOk);
    $('confirm-cancel-btn').addEventListener('click', onCancel);
  });
}

// ── State ──────────────────────────────────────────────────────────────────
const state = {
  currentPage:     'home',
  installingIds:   new Set(),
  upgradingIds:    new Set(),
  uninstallingIds: new Set(),
  doneIds:         new Set(),
  installedIds:    new Set(),
  upgradableIds:   new Map(),  // id → available version
  currentApp:      null,
  bundles:         [],          // loaded from storage
  libraryApps:     [],          // last loaded list
  lastSearchQuery: '',
};

// ── Navigation ─────────────────────────────────────────────────────────────
function navigate(page) {
  if (state.currentPage === page) return;
  state.currentPage = page;
  document.querySelectorAll('.nav-item').forEach(el =>
    el.classList.toggle('active', el.dataset.page === page));
  document.querySelectorAll('.page').forEach(el =>
    el.classList.toggle('active', el.id === `page-${page}`));

  if (page === 'library')  loadLibrary();
  if (page === 'history')  loadHistory();
  if (page === 'bundles')  renderBundles();
}

document.querySelectorAll('.nav-item').forEach(el =>
  el.addEventListener('click', () => navigate(el.dataset.page)));

// ── Title bar controls ──────────────────────────────────────────────────────
$('btn-minimize').addEventListener('click', () => window.api.minimize());
$('btn-maximize').addEventListener('click', () => window.api.maximize());
$('btn-close').addEventListener('click',    () => window.api.close());

// ── Skeleton loader ────────────────────────────────────────────────────────
function buildSkeletonCards(count = 6) {
  return Array.from({ length: count }, (_, i) => `
    <div class="skeleton-card" style="animation-delay:${i * 50}ms">
      <div class="skeleton-line" style="width:46px;height:46px;border-radius:10px"></div>
      <div style="display:flex;flex-direction:column;gap:7px">
        <div class="skeleton-line" style="height:14px;width:70%"></div>
        <div class="skeleton-line" style="height:11px;width:50%"></div>
        <div class="skeleton-line" style="height:11px;width:40%"></div>
      </div>
    </div>
  `).join('');
}

// ── App card builder ────────────────────────────────────────────────────────
function buildAppCard(app, idx) {
  const id        = app.Id      || '';
  const name      = app.Name    || id;
  const ver       = app.Version || '';
  const available = app.Available || '';
  const src       = app.Source  || 'winget';
  const icon      = getIcon(name, id);
  const accent    = cardAccent(idx);
  const hasUpdate   = state.upgradableIds.has(id);
  const isInstalled = state.installedIds.has(id) || state.doneIds.has(id);

  const isInstalling   = state.installingIds.has(id);
  const isUpgrading    = state.upgradingIds.has(id);
  const isUninstalling = state.uninstallingIds.has(id);

  let chipLabel, chipClass;
  if      (isInstalling || isUpgrading || isUninstalling) {
    chipLabel = isInstalling ? '…Installing' : isUpgrading ? '⬆ Updating' : '…Removing';
    chipClass = 'installing';
  } else if (hasUpdate) {
    chipLabel = '⬆ Update';
    chipClass = 'update';
  } else if (isInstalled) {
    chipLabel = '✓ Installed';
    chipClass = 'done';
  } else {
    chipLabel = 'Install';
    chipClass = '';
  }

  const card = document.createElement('div');
  card.className = 'app-card';
  card.dataset.appId = id;
  card.style.setProperty('--card-accent', accent);
  card.style.animationDelay = `${Math.min(idx * 35, 350)}ms`;

  card.innerHTML = `
    <div class="app-card-icon">${icon}</div>
    <div class="app-card-body">
      <div class="app-card-name" title="${escHtml(name)}">${escHtml(name)}</div>
      <div class="app-card-id"   title="${escHtml(id)}">${escHtml(id)}</div>
      ${ver ? `<div class="app-card-version">v${escHtml(ver)}${available ? ` → <strong style="color:var(--amber)">${escHtml(available)}</strong>` : ''}</div>` : ''}
    </div>
    <div class="app-card-footer">
      <div style="display:flex;gap:5px;align-items:center;min-width:0">
        <span class="source-badge">${escHtml(src)}</span>
        ${hasUpdate ? `<span class="update-badge">Update</span>` : ''}
      </div>
      <button class="install-chip ${chipClass}" data-id="${escHtml(id)}">${chipLabel}</button>
    </div>
  `;

  card.addEventListener('click', (e) => {
    if (e.target.closest('.install-chip')) return;
    openModal(app);
  });

  card.querySelector('.install-chip').addEventListener('click', (e) => {
    e.stopPropagation();
    if (isInstalling || isUpgrading || isUninstalling) return;
    if (hasUpdate) triggerUpgrade(id, name);
    else triggerInstall(id, name);
  });

  return card;
}

function renderApps(container, apps) {
  container.innerHTML = '';
  apps.forEach((app, i) => container.appendChild(buildAppCard(app, i)));
}

// ── Console helpers ────────────────────────────────────────────────────────
function appendConsole(text) {
  const el = $('install-console');
  $('install-console-wrap').classList.remove('hidden');
  el.textContent += text;
  el.scrollTop = el.scrollHeight;
}

function clearConsole(label = 'Output') {
  $('install-console-label').textContent = label;
  $('install-console').textContent = '';
  $('install-console-wrap').classList.add('hidden');
}

$('console-copy-btn').addEventListener('click', () => {
  const text = $('install-console').textContent;
  if (text) navigator.clipboard.writeText(text).then(() => showToast('Output copied!', 'info'));
});
$('console-clear-btn').addEventListener('click', () => clearConsole());

// ── Install ────────────────────────────────────────────────────────────────
async function triggerInstall(id, name, version = '') {
  if (state.installingIds.has(id) || state.doneIds.has(id)) return;

  state.installingIds.add(id);
  refreshCardButtons(id);
  showToast(`Installing ${name}…`, 'info', 10000);

  if (state.currentApp?.Id === id) {
    clearConsole('Installation Output');
    setModalInstallBtn('installing');
  }

  const result = await window.api.install(id, version || undefined);

  state.installingIds.delete(id);
  if (result.ok) {
    state.doneIds.add(id);
    state.installedIds.add(id);
    refreshCardButtons(id);
    showToast(`✓ ${name} installed!`, 'success');
    if (state.currentApp?.Id === id) {
      setModalInstallBtn('done');
      updateModalButtons(id);
    }
  } else {
    refreshCardButtons(id);
    showToast(`Failed to install ${name}`, 'error');
    if (state.currentApp?.Id === id) setModalInstallBtn('error');
  }
}

// ── Upgrade individual ─────────────────────────────────────────────────────
async function triggerUpgrade(id, name) {
  if (state.upgradingIds.has(id)) return;

  state.upgradingIds.add(id);
  refreshCardButtons(id);
  showToast(`Updating ${name}…`, 'info', 15000);

  if (state.currentApp?.Id === id) {
    clearConsole('Update Output');
    const btn = $('modal-update-btn');
    btn.classList.remove('hidden');
    btn.innerHTML = `<span class="spinner-small"></span> Updating…`;
    btn.disabled = true;
  }

  const result = await window.api.upgrade(id);

  state.upgradingIds.delete(id);
  state.upgradableIds.delete(id);
  updateNavUpdateBadge();

  if (result.ok) {
    refreshCardButtons(id);
    showToast(`✓ ${name} updated!`, 'success');
    if (state.currentApp?.Id === id) {
      const btn = $('modal-update-btn');
      btn.classList.add('done');
      btn.disabled = false;
      btn.innerHTML = `✓ Updated`;
    }
    // Refresh the update row if on updates page
    refreshUpdateRow(id, true);
  } else {
    refreshCardButtons(id);
    showToast(`Failed to update ${name}`, 'error');
    if (state.currentApp?.Id === id) {
      const btn = $('modal-update-btn');
      btn.disabled = false;
      btn.innerHTML = `✗ Update failed`;
    }
    refreshUpdateRow(id, false);
  }
}

// ── Uninstall ──────────────────────────────────────────────────────────────
async function triggerUninstall(id, name) {
  if (state.uninstallingIds.has(id)) return;

  const confirmed = await showConfirm(
    `Uninstall ${name}?`,
    `This will remove ${name} from your system using winget. This cannot be undone.`,
    'Uninstall'
  );
  if (!confirmed) return;

  const uninstallBtn = $('modal-uninstall-btn');

  state.uninstallingIds.add(id);
  refreshCardButtons(id);
  showToast(`Uninstalling ${name}…`, 'info', 12000);

  uninstallBtn.innerHTML = `<span class="spinner-small"></span> Uninstalling…`;
  uninstallBtn.disabled = true;
  clearConsole('Uninstall Output');

  const result = await window.api.uninstall(id);

  state.uninstallingIds.delete(id);

  if (result.ok) {
    state.installedIds.delete(id);
    state.doneIds.delete(id);
    refreshCardButtons(id);
    showToast(`✓ ${name} uninstalled`, 'success');
    if (state.currentApp?.Id === id) {
      uninstallBtn.classList.add('hidden');
      uninstallBtn.disabled = false;
      updateModalButtons(id);
    }
  } else {
    refreshCardButtons(id);
    showToast(`Failed to uninstall ${name}`, 'error');
    uninstallBtn.disabled = false;
    uninstallBtn.innerHTML = `✗ Failed`;
  }
}

// ── Refresh card buttons ───────────────────────────────────────────────────
function refreshCardButtons(id) {
  document.querySelectorAll(`.app-card[data-app-id="${CSS.escape(id)}"]`).forEach(card => {
    const chip = card.querySelector('.install-chip');
    if (!chip) return;

    const isInstalling   = state.installingIds.has(id);
    const isUpgrading    = state.upgradingIds.has(id);
    const isUninstalling = state.uninstallingIds.has(id);
    const isInstalled    = state.installedIds.has(id) || state.doneIds.has(id);
    const hasUpdate      = state.upgradableIds.has(id);
    const busy           = isInstalling || isUpgrading || isUninstalling;

    if (busy) {
      chip.className = 'install-chip installing';
      chip.textContent = isInstalling ? '…Installing' : isUpgrading ? '⬆ Updating' : '…Removing';
    } else if (hasUpdate) {
      chip.className = 'install-chip update';
      chip.textContent = '⬆ Update';
    } else if (isInstalled) {
      chip.className = 'install-chip done';
      chip.textContent = '✓ Installed';
    } else {
      chip.className = 'install-chip';
      chip.textContent = 'Install';
    }
  });
}

// ── Modal ──────────────────────────────────────────────────────────────────
function setModalInstallBtn(status) {
  const btn = $('modal-install-btn');
  btn.className = 'install-btn';
  btn.disabled  = false;
  if (status === 'installing') {
    btn.classList.add('installing');
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner-small"></span> Installing…`;
  } else if (status === 'done') {
    btn.classList.add('done');
    btn.innerHTML = `✓ Installed`;
  } else if (status === 'error') {
    btn.classList.add('error');
    btn.innerHTML = `✗ Failed`;
  } else {
    btn.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" width="18" height="18">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
        <polyline points="7 10 12 15 17 10"/>
        <line x1="12" y1="15" x2="12" y2="3"/>
      </svg>
      Install`;
  }
}

function updateModalButtons(id) {
  const isInstalled = state.installedIds.has(id) || state.doneIds.has(id);
  const hasUpdate   = state.upgradableIds.has(id);
  const updateVer   = state.upgradableIds.get(id) || '';

  const installBtn   = $('modal-install-btn');
  const updateBtn    = $('modal-update-btn');
  const uninstallBtn = $('modal-uninstall-btn');

  if (isInstalled) {
    installBtn.classList.add('hidden');
    uninstallBtn.classList.remove('hidden');
    if (hasUpdate) {
      updateBtn.classList.remove('hidden');
      updateBtn.classList.remove('done');
      updateBtn.disabled = false;
      updateBtn.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" width="18" height="18">
          <polyline points="16 3 21 3 21 8"/>
          <line x1="4" y1="20" x2="21" y2="3"/>
          <polyline points="21 16 21 21 16 21"/>
          <line x1="15" y1="4" x2="4" y2="15"/>
        </svg>
        Update${updateVer ? ` → ${escHtml(updateVer)}` : ''}`;
    } else {
      updateBtn.classList.add('hidden');
    }
  } else {
    installBtn.classList.remove('hidden');
    updateBtn.classList.add('hidden');
    uninstallBtn.classList.add('hidden');
    setModalInstallBtn('default');
  }
}

async function openModal(app) {
  state.currentApp = app;

  const id   = app.Id   || '';
  const name = app.Name || id;
  const ver  = app.Version || '';
  const src  = app.Source  || 'winget';

  $('modal-app-icon').textContent    = getIcon(name, id);
  $('modal-app-name').textContent    = name;
  $('modal-app-id').textContent      = id;
  $('modal-app-version').textContent = ver ? `v${ver}` : '';
  $('modal-app-source').textContent  = src;
  $('modal-app-publisher').classList.add('hidden');
  $('modal-description').classList.add('hidden');
  $('modal-description').textContent = '';

  // Reset uninstall button
  const uninstallBtn = $('modal-uninstall-btn');
  uninstallBtn.classList.remove('confirming', 'hidden');
  uninstallBtn.disabled = false;
  uninstallBtn.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16">
      <polyline points="3 6 5 6 21 6"/>
      <path d="M19 6l-1 14H6L5 6"/>
      <path d="M10 11v6"/><path d="M14 11v6"/>
      <path d="M9 6V4h6v2"/>
    </svg>
    Uninstall`;

  updateModalButtons(id);
  clearConsole();

  // Populate bundle selector
  populateBundleSelect();

  // Reset version selector
  const vSelect  = $('version-select');
  const vLoading = $('versions-loading');
  vSelect.innerHTML = '<option value="">⬇ Latest (default)</option>';
  vLoading.classList.remove('hidden');

  $('modal-overlay').classList.remove('hidden');

  // Fetch versions and show metadata — in parallel
  const [vRes, showRes] = await Promise.all([
    window.api.versions(id),
    window.api.show(id),
  ]);
  vLoading.classList.add('hidden');

  if (vRes.ok && vRes.data.length) {
    vRes.data.forEach((v, i) => {
      const opt = document.createElement('option');
      opt.value = v;
      opt.textContent = `v${v}` + (i === 0 ? ' (latest)' : '');
      vSelect.appendChild(opt);
    });
  }

  if (showRes.ok && showRes.data) {
    const m = showRes.data;
    const publisher = m.publisher || m.publisher_url || '';
    if (publisher) {
      $('modal-app-publisher').textContent = publisher.length > 35 ? publisher.slice(0, 35) + '…' : publisher;
      $('modal-app-publisher').classList.remove('hidden');
    }
    const desc = m.description || m.short_description || '';
    if (desc) {
      $('modal-description').textContent = desc;
      $('modal-description').classList.remove('hidden');
    }
  }
}

function closeModal() {
  $('modal-overlay').classList.add('hidden');
  state.currentApp = null;
}

$('modal-close-btn').addEventListener('click', closeModal);
$('modal-overlay').addEventListener('click', (e) => {
  if (e.target === $('modal-overlay')) closeModal();
});

$('modal-install-btn').addEventListener('click', () => {
  if (!state.currentApp) return;
  const { Id: id, Name: name } = state.currentApp;
  const version = $('version-select').value;
  triggerInstall(id, name || id, version);
});

$('modal-update-btn').addEventListener('click', () => {
  if (!state.currentApp) return;
  const { Id: id, Name: name } = state.currentApp;
  triggerUpgrade(id, name || id);
});

$('modal-uninstall-btn').addEventListener('click', () => {
  if (!state.currentApp) return;
  const { Id: id, Name: name } = state.currentApp;
  triggerUninstall(id, name || id);
});

$('modal-copy-btn').addEventListener('click', () => {
  if (!state.currentApp) return;
  const ver = $('version-select').value;
  const cmd = `winget install --id ${state.currentApp.Id} --accept-package-agreements${ver ? ` --version ${ver}` : ''}`;
  navigator.clipboard.writeText(cmd).then(() => showToast('Command copied!', 'info'));
});

$('modal-add-to-bundle-btn').addEventListener('click', () => {
  const sel    = $('modal-bundle-select');
  const bundleId = sel.value;
  if (!bundleId || !state.currentApp) return;
  const bundle = state.bundles.find(b => b.id === bundleId);
  if (!bundle) return;
  const app = state.currentApp;
  if (!bundle.apps.find(a => a.id === app.Id)) {
    bundle.apps.push({ id: app.Id, name: app.Name || app.Id });
    saveBundles();
    showToast(`Added to "${bundle.name}"`, 'success');
  } else {
    showToast(`Already in "${bundle.name}"`, 'info');
  }
  sel.value = '';
});

// ── Streaming events ───────────────────────────────────────────────────────
window.api.onProgress(({ id, text }) => {
  if (state.currentApp?.Id === id) appendConsole(text);
});
window.api.onUpgradeProgress(({ id, text }) => {
  if (state.currentApp?.Id === id) appendConsole(text);
  // Also stream to update row console if open
  appendUpdateRowConsole(id, text);
});
window.api.onUninstallProgress(({ id, text }) => {
  if (state.currentApp?.Id === id) appendConsole(text);
});

// ── Search ─────────────────────────────────────────────────────────────────
let searchDebounceTimer = null;
let lastSearchQuery     = '';

async function doSearch(query) {
  query = query.trim();
  if (!query) return;
  if (query === lastSearchQuery) return;
  lastSearchQuery = query;

  navigate('search');
  $('search-input').value = query;
  $('search-clear-btn').classList.toggle('hidden', !query);

  const status  = $('search-status');
  const results = $('search-results');
  const empty   = $('search-empty');
  const idle    = $('search-idle');

  idle.classList.add('hidden');
  results.innerHTML = `<div class="loading-wrap"><div class="spinner"></div>Searching for "${escHtml(query)}"…</div>`;
  empty.classList.add('hidden');
  status.textContent = '';

  const res = await window.api.search(query);

  if (!res.ok) {
    results.innerHTML = '';
    status.innerHTML = `<span style="color:var(--red)">⚠ winget error: ${escHtml(res.error)}</span>`;
    return;
  }

  const apps = res.data;
  if (!apps.length) {
    results.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }

  empty.classList.add('hidden');
  status.innerHTML = `<span>Found <strong>${apps.length}</strong> result${apps.length !== 1 ? 's' : ''} for "<em>${escHtml(query)}</em>"</span>`;
  renderApps(results, apps);
}

$('search-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') doSearch($('search-input').value); });
$('search-input').addEventListener('input', () => {
  $('search-clear-btn').classList.toggle('hidden', !$('search-input').value);
  lastSearchQuery = ''; // allow re-search when text changes
});
$('search-clear-btn').addEventListener('click', () => {
  $('search-input').value = '';
  $('search-clear-btn').classList.add('hidden');
  $('search-results').innerHTML = '';
  $('search-status').textContent = '';
  $('search-empty').classList.add('hidden');
  $('search-idle').classList.remove('hidden');
  lastSearchQuery = '';
  $('search-input').focus();
});

$('home-search-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') doSearch($('home-search-input').value);
});

document.querySelectorAll('.category-chip').forEach(chip => {
  chip.addEventListener('click', () => {
    document.querySelectorAll('.category-chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    lastSearchQuery = '';
    doSearch(chip.dataset.query);
  });
});

// ── Library ────────────────────────────────────────────────────────────────
async function loadLibrary() {
  const grid   = $('library-grid');
  const status = $('library-status');
  const empty  = $('library-empty');

  grid.innerHTML = `<div class="loading-wrap"><div class="spinner"></div>Loading installed apps…</div>`;
  empty.classList.add('hidden');
  status.textContent = '';

  const res = await window.api.list();

  if (!res.ok) {
    grid.innerHTML = '';
    status.innerHTML = `<span style="color:var(--red)">⚠ ${escHtml(res.error)}</span>`;
    return;
  }

  const apps = res.data.filter(a => a.Id);
  state.installedIds.clear();
  apps.forEach(a => state.installedIds.add(a.Id));
  state.libraryApps = apps;

  renderLibraryFiltered();
}

function renderLibraryFiltered() {
  const grid  = $('library-grid');
  const empty = $('library-empty');
  const status = $('library-status');
  const query  = $('library-filter-input').value.trim().toLowerCase();
  const apps   = query
    ? state.libraryApps.filter(a =>
        (a.Name || '').toLowerCase().includes(query) ||
        (a.Id   || '').toLowerCase().includes(query))
    : state.libraryApps;

  if (!apps.length && !query) {
    grid.innerHTML = '';
    empty.classList.remove('hidden');
    status.textContent = '';
    return;
  }

  empty.classList.add('hidden');
  if (!query) {
    status.innerHTML = `<span><strong>${apps.length}</strong> installed app${apps.length !== 1 ? 's' : ''}</span>`;
  } else {
    status.innerHTML = `<span><strong>${apps.length}</strong> of ${state.libraryApps.length} matching "${escHtml(query)}"</span>`;
  }
  renderApps(grid, apps);
}

$('library-filter-input').addEventListener('input', renderLibraryFiltered);
$('refresh-library-btn').addEventListener('click', loadLibrary);

// ── Updates page ───────────────────────────────────────────────────────────
function updateNavUpdateBadge() {
  const badge = $('updates-nav-badge');
  const count = state.upgradableIds.size;
  if (count > 0) {
    badge.textContent = count;
    badge.classList.remove('hidden');
  } else {
    badge.classList.add('hidden');
  }
}

function refreshUpdateRow(id, success) {
  const row = document.querySelector(`.update-row[data-id="${CSS.escape(id)}"]`);
  if (!row) return;
  const actions = row.querySelector('.update-row-actions');
  if (!actions) return;
  if (success) {
    row.style.opacity = '0.45';
    actions.innerHTML = `<span style="color:var(--green);font-size:13px;font-weight:600">✓ Updated</span>`;
  } else {
    const btn = actions.querySelector('button');
    if (btn) { btn.disabled = false; btn.textContent = 'Retry'; }
  }
}

// Inline console per update row (for update all streaming)
const updateRowLogs = {}; // id → accumulated text
function appendUpdateRowConsole(id, text) {
  if (updateRowLogs[id] !== undefined) {
    updateRowLogs[id] += text;
  }
}

async function checkForUpdatesPage() {
  const btn    = $('check-updates-page-btn');
  const status = $('updates-status');
  const list   = $('updates-list');
  const empty  = $('updates-empty');
  const idle   = $('updates-idle');
  const allBtn = $('update-all-btn');

  btn.disabled = true;
  btn.innerHTML = `<span class="spinner-small"></span> Checking…`;
  idle.classList.add('hidden');
  empty.classList.add('hidden');
  status.textContent = '';
  list.innerHTML = `<div class="loading-wrap"><div class="spinner"></div>Checking for updates…</div>`;
  allBtn.classList.add('hidden');

  const res = await window.api.upgradable();

  btn.disabled = false;
  btn.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16">
      <polyline points="1 4 1 10 7 10"/>
      <path d="M3.51 15a9 9 0 1 0 .49-4.5"/>
    </svg>
    Check for Updates`;

  if (!res.ok) {
    list.innerHTML = '';
    status.innerHTML = `<span style="color:var(--red)">⚠ ${escHtml(res.error)}</span>`;
    return;
  }

  state.upgradableIds.clear();
  res.data.forEach(a => { if (a.Id) state.upgradableIds.set(a.Id, a.Available || ''); });
  updateNavUpdateBadge();

  if (!res.data.length) {
    list.innerHTML = '';
    empty.classList.remove('hidden');
    status.innerHTML = `<span style="color:var(--green)">✓ All apps are up to date</span>`;
    showToast('All apps are up to date!', 'success');
    return;
  }

  const count = res.data.length;
  status.innerHTML = `<span style="color:var(--amber)">⬆ <strong>${count}</strong> update${count !== 1 ? 's' : ''} available</span>`;
  showToast(`${count} update${count !== 1 ? 's' : ''} available`, 'info');

  // Render update rows
  list.innerHTML = '';
  res.data.forEach((app, idx) => {
    if (!app.Id) return;
    const name = app.Name || app.Id;
    const icon = getIcon(name, app.Id);
    const row = document.createElement('div');
    row.className = 'update-row';
    row.dataset.id = app.Id;
    row.style.animationDelay = `${idx * 40}ms`;

    row.innerHTML = `
      <div class="update-row-icon">${icon}</div>
      <div class="update-row-info">
        <div class="update-row-name" title="${escHtml(name)}">${escHtml(name)}</div>
        <div class="update-row-versions">
          <span class="ver-from">${escHtml(app.Version || '?')}</span>
          <span class="ver-arrow">→</span>
          <span class="ver-to">${escHtml(app.Available || 'latest')}</span>
          <span class="mono" style="color:var(--text-muted);font-size:10.5px">${escHtml(app.Id)}</span>
        </div>
      </div>
      <div class="update-row-actions">
        <button class="secondary-btn" data-action="info" title="View details">Details</button>
        <button class="update-btn" data-action="update">⬆ Update</button>
      </div>
    `;

    row.querySelector('[data-action="info"]').addEventListener('click', () => openModal(app));
    row.querySelector('[data-action="update"]').addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      btn.disabled = true;
      btn.innerHTML = `<span class="spinner-small"></span> Updating…`;
      updateRowLogs[app.Id] = '';
      await triggerUpgrade(app.Id, name);
    });

    list.appendChild(row);
  });

  // Show Update All if more than 1
  if (count > 1) {
    allBtn.classList.remove('hidden');
    $('update-all-count').textContent = count;
  }
}

$('check-updates-page-btn').addEventListener('click', checkForUpdatesPage);

$('update-all-btn').addEventListener('click', async () => {
  const ids = [...state.upgradableIds.keys()];
  if (!ids.length) return;
  const confirmed = await showConfirm(
    `Update ${ids.length} apps?`,
    `This will update all ${ids.length} apps with available updates. Each app will be updated sequentially.`,
    `Update All`
  );
  if (!confirmed) return;

  $('update-all-btn').disabled = true;

  for (const id of ids) {
    // Find app name
    const row = document.querySelector(`.update-row[data-id="${CSS.escape(id)}"]`);
    const nameEl = row?.querySelector('.update-row-name');
    const name = nameEl?.textContent || id;
    await triggerUpgrade(id, name);
  }

  $('update-all-btn').disabled = false;
  $('update-all-btn').innerHTML = `✓ All updates done`;
  showToast('All updates completed!', 'success');
});

// ── Featured apps ──────────────────────────────────────────────────────────
async function loadFeatured(query) {
  const grid    = $('featured-grid');
  const spinner = $('featured-loading');

  spinner.classList.remove('hidden');
  grid.innerHTML = buildSkeletonCards(6);

  const res = await window.api.featured(query || undefined);
  spinner.classList.add('hidden');

  if (!res.ok || !res.data.length) {
    grid.innerHTML = '<p style="color:var(--text-muted);font-size:13px;">Could not load featured apps. Make sure winget is available.</p>';
    return;
  }

  renderApps(grid, res.data.slice(0, 9));
}

$('featured-refresh-btn').addEventListener('click', () => {
  loadFeatured();
});

// ── Operation History ──────────────────────────────────────────────────────
async function loadHistory() {
  const list  = $('history-list');
  const empty = $('history-empty');
  const hist  = await window.api.getHistory();

  if (!hist.length) {
    list.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');
  list.innerHTML = '';

  hist.forEach((entry, idx) => {
    const row = document.createElement('div');
    row.className = 'history-row';
    row.style.animationDelay = `${Math.min(idx * 25, 250)}ms`;

    const opLabels = { install: 'Installed', upgrade: 'Updated', uninstall: 'Uninstalled' };
    const opLabel  = opLabels[entry.op] || entry.op;
    const dotClass = entry.op;

    row.innerHTML = `
      <div class="history-row-op-dot ${dotClass}"></div>
      <div class="history-row-info">
        <div class="history-row-name">${escHtml(entry.id)}</div>
        <div class="history-row-meta">
          <span>${escHtml(opLabel)}</span>
          ${entry.version && entry.op === 'install' ? `<span>v${escHtml(entry.version)}</span>` : ''}
          <span>${formatDate(entry.timestamp)}</span>
        </div>
      </div>
      <span class="history-row-status ${entry.ok ? 'ok' : 'err'}">${entry.ok ? '✓' : '✗ Failed'}</span>
    `;
    list.appendChild(row);
  });
}

$('clear-history-btn').addEventListener('click', async () => {
  const confirmed = await showConfirm('Clear History?', 'This will permanently delete all operation history.', 'Clear');
  if (!confirmed) return;
  await window.api.clearHistory();
  loadHistory();
  showToast('History cleared', 'info');
});

// ── Bundles ────────────────────────────────────────────────────────────────
async function initBundles() {
  state.bundles = await window.api.getBundles();
}

function saveBundles() {
  window.api.saveBundles(state.bundles);
}

function genBundleId() {
  return `bundle_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function renderBundles() {
  const list  = $('bundles-list');
  const empty = $('bundles-empty');

  if (!state.bundles.length) {
    list.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');
  list.innerHTML = '';

  state.bundles.forEach((bundle, bidx) => {
    const card = document.createElement('div');
    card.className = 'bundle-card';
    card.style.animationDelay = `${bidx * 50}ms`;

    const pills = bundle.apps.slice(0, 8).map(a =>
      `<span class="bundle-app-pill"><span class="bundle-app-pill-icon">${getIcon(a.name, a.id)}</span>${escHtml(a.name)}</span>`
    ).join('');
    const extra = bundle.apps.length > 8 ? `<span class="bundle-app-pill">+${bundle.apps.length - 8} more</span>` : '';

    card.innerHTML = `
      <div class="bundle-card-header">
        <div class="bundle-card-icon">📦</div>
        <div class="bundle-card-title-block">
          <div class="bundle-card-name">${escHtml(bundle.name)}</div>
          <div class="bundle-card-count">${bundle.apps.length} app${bundle.apps.length !== 1 ? 's' : ''}</div>
        </div>
        <div class="bundle-card-actions">
          <button class="secondary-btn-sm" data-action="edit">Edit</button>
          <button class="secondary-btn-sm" data-action="export">Export</button>
          <button class="danger-btn-sm"    data-action="delete">Delete</button>
        </div>
      </div>
      <div class="bundle-app-pills">${pills}${extra}</div>
    `;

    card.querySelector('[data-action="edit"]').addEventListener('click', () => openBundleEditor(bundle.id));
    card.querySelector('[data-action="export"]').addEventListener('click', () => exportBundle(bundle));
    card.querySelector('[data-action="delete"]').addEventListener('click', async () => {
      const ok = await showConfirm(`Delete "${bundle.name}"?`, 'This bundle will be permanently removed.', 'Delete');
      if (!ok) return;
      state.bundles = state.bundles.filter(b => b.id !== bundle.id);
      saveBundles();
      renderBundles();
      showToast(`Bundle "${bundle.name}" deleted`, 'info');
    });

    list.appendChild(card);
  });
}

let currentEditBundleId = null;
let bundleEditorApps    = [];

function openBundleEditor(bundleId) {
  currentEditBundleId = bundleId;

  const bundle = bundleId ? state.bundles.find(b => b.id === bundleId) : null;
  bundleEditorApps = bundle ? [...bundle.apps] : [];

  $('bundle-modal-title').textContent    = bundle ? 'Edit Bundle' : 'New Bundle';
  $('bundle-name-input').value           = bundle ? bundle.name : '';
  $('bundle-app-search-input').value     = '';
  $('bundle-search-results').innerHTML   = '';
  $('bundle-search-results').classList.add('hidden');

  renderBundleEditorApps();
  $('bundle-modal-overlay').classList.remove('hidden');
}

function renderBundleEditorApps() {
  const list = $('bundle-apps-list');
  if (!bundleEditorApps.length) {
    list.innerHTML = '<div class="bundle-apps-empty">No apps added yet</div>';
    return;
  }
  list.innerHTML = bundleEditorApps.map((a, i) => `
    <div class="bundle-app-entry">
      <span class="bundle-app-entry-icon">${getIcon(a.name, a.id)}</span>
      <div style="flex:1;min-width:0">
        <div class="bundle-app-entry-name">${escHtml(a.name)}</div>
        <div class="bundle-app-entry-id">${escHtml(a.id)}</div>
      </div>
      <button class="bundle-app-remove-btn" data-idx="${i}" title="Remove">✕</button>
    </div>
  `).join('');

  list.querySelectorAll('.bundle-app-remove-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      bundleEditorApps.splice(Number(btn.dataset.idx), 1);
      renderBundleEditorApps();
    });
  });
}

function closeBundleEditor() {
  $('bundle-modal-overlay').classList.add('hidden');
  currentEditBundleId = null;
  bundleEditorApps    = [];
}

$('bundle-modal-close-btn').addEventListener('click', closeBundleEditor);
$('bundle-modal-overlay').addEventListener('click', (e) => {
  if (e.target === $('bundle-modal-overlay')) closeBundleEditor();
});

$('bundle-app-search-btn').addEventListener('click', async () => {
  const q = $('bundle-app-search-input').value.trim();
  if (!q) return;
  const res = $('bundle-search-results');
  res.innerHTML = '<div style="padding:10px;color:var(--text-muted);font-size:13px">Searching…</div>';
  res.classList.remove('hidden');

  const r = await window.api.search(q);
  if (!r.ok || !r.data.length) {
    res.innerHTML = '<div style="padding:10px;color:var(--text-muted);font-size:13px">No results found</div>';
    return;
  }

  res.innerHTML = r.data.slice(0, 10).map(app => {
    const inBundle = bundleEditorApps.find(a => a.id === app.Id);
    return `
      <div class="bundle-search-row">
        <span style="font-size:16px">${getIcon(app.Name, app.Id)}</span>
        <div class="bundle-search-row-info">
          <div class="bundle-search-row-name">${escHtml(app.Name || app.Id)}</div>
          <div class="bundle-search-row-id">${escHtml(app.Id)}</div>
        </div>
        <button class="bundle-search-add-btn${inBundle ? ' added' : ''}" data-id="${escHtml(app.Id)}" data-name="${escHtml(app.Name || app.Id)}">
          ${inBundle ? '✓ Added' : '+ Add'}
        </button>
      </div>
    `;
  }).join('');

  res.querySelectorAll('.bundle-search-add-btn').forEach(btn => {
    if (btn.classList.contains('added')) return;
    btn.addEventListener('click', () => {
      const id   = btn.dataset.id;
      const name = btn.dataset.name;
      if (!bundleEditorApps.find(a => a.id === id)) {
        bundleEditorApps.push({ id, name });
        renderBundleEditorApps();
      }
      btn.classList.add('added');
      btn.textContent = '✓ Added';
    });
  });
});

$('bundle-app-search-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') $('bundle-app-search-btn').click();
});

$('bundle-save-btn').addEventListener('click', () => {
  const name = $('bundle-name-input').value.trim();
  if (!name) { showToast('Please enter a bundle name', 'error'); return; }

  if (currentEditBundleId) {
    const bundle = state.bundles.find(b => b.id === currentEditBundleId);
    if (bundle) { bundle.name = name; bundle.apps = bundleEditorApps; }
  } else {
    state.bundles.push({ id: genBundleId(), name, apps: bundleEditorApps });
  }

  saveBundles();
  renderBundles();
  closeBundleEditor();
  showToast(`Bundle "${name}" saved`, 'success');
});

$('bundle-export-btn').addEventListener('click', () => {
  const name = $('bundle-name-input').value.trim() || 'bundle';
  const data = { name, apps: bundleEditorApps };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url;
  a.download = `${name.replace(/\s+/g, '_')}.json`;
  a.click();
  URL.revokeObjectURL(url);
});

$('bundle-install-all-btn').addEventListener('click', async () => {
  if (!bundleEditorApps.length) { showToast('No apps in bundle', 'error'); return; }
  const ok = await showConfirm(
    `Install ${bundleEditorApps.length} apps?`,
    `This will install all apps in the bundle sequentially.`,
    `Install All`
  );
  if (!ok) return;
  closeBundleEditor();
  for (const app of bundleEditorApps) {
    showToast(`Installing ${app.name}…`, 'info', 3000);
    await triggerInstall(app.id, app.name);
  }
  showToast('Bundle installation complete!', 'success');
});

// Import bundle from JSON
$('create-bundle-btn').addEventListener('click', () => openBundleEditor(null));
$('import-bundle-btn').addEventListener('click', () => {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  input.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      // Validate
      if (!data.name || !Array.isArray(data.apps)) {
        showToast('Invalid bundle JSON format', 'error');
        return;
      }
      const validApps = data.apps.filter(a => a.id && typeof a.id === 'string');
      state.bundles.push({
        id:   genBundleId(),
        name: String(data.name).slice(0, 60),
        apps: validApps.map(a => ({ id: String(a.id), name: String(a.name || a.id) })),
      });
      saveBundles();
      renderBundles();
      navigate('bundles');
      showToast(`Imported "${data.name}"`, 'success');
    } catch {
      showToast('Failed to parse bundle JSON', 'error');
    }
  };
  input.click();
});

// ── Populate bundle select in modal ────────────────────────────────────────
function populateBundleSelect() {
  const sel = $('modal-bundle-select');
  sel.innerHTML = '<option value="">Add to bundle…</option>';
  state.bundles.forEach(b => {
    const opt = document.createElement('option');
    opt.value = b.id;
    opt.textContent = b.name;
    sel.appendChild(opt);
  });
}

// ── Keyboard shortcuts ─────────────────────────────────────────────────────
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (!$('confirm-overlay').classList.contains('hidden'))    { /* handled by dialog itself */ return; }
    if (!$('bundle-modal-overlay').classList.contains('hidden')) { closeBundleEditor(); return; }
    if (!$('modal-overlay').classList.contains('hidden'))      { closeModal(); return; }
  }
  if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
    e.preventDefault();
    navigate('search');
    $('search-input').focus();
  }
  if ((e.ctrlKey || e.metaKey) && e.key === 'r') {
    if (state.currentPage === 'library') { e.preventDefault(); loadLibrary(); }
    if (state.currentPage === 'updates') { e.preventDefault(); checkForUpdatesPage(); }
  }
});

// ── Boot ───────────────────────────────────────────────────────────────────
(async function boot() {
  await initBundles();
  loadFeatured('browser');
  // Silently pre-load installed IDs for card status
  window.api.list().then(res => {
    if (res.ok) {
      state.installedIds.clear();
      res.data.filter(a => a.Id).forEach(a => state.installedIds.add(a.Id));
      state.libraryApps = res.data.filter(a => a.Id);
    }
  });
})();
