/* =============================================================
   Winget App Catalog — Renderer JavaScript
   ============================================================= */

// ── App icons map (emoji fallback by keyword) ─────────────────────────────
const ICON_MAP = [
  { re: /chrome|chromium/i,            icon: '🌐' },
  { re: /firefox/i,                    icon: '🦊' },
  { re: /edge/i,                       icon: '🔵' },
  { re: /brave/i,                      icon: '🦁' },
  { re: /opera/i,                      icon: '🎭' },
  { re: /vlc|media.player|mpv/i,       icon: '🎬' },
  { re: /spotify/i,                    icon: '🎵' },
  { re: /discord/i,                    icon: '💬' },
  { re: /slack/i,                      icon: '💼' },
  { re: /zoom/i,                       icon: '📹' },
  { re: /teams/i,                      icon: '🤝' },
  { re: /vscode|visual.studio.code/i,  icon: '💻' },
  { re: /git/i,                        icon: '🌿' },
  { re: /node|nodejs/i,                icon: '🟢' },
  { re: /python/i,                     icon: '🐍' },
  { re: /rust/i,                       icon: '🦀' },
  { re: /docker/i,                     icon: '🐳' },
  { re: /steam/i,                      icon: '🎮' },
  { re: /epic|games/i,                 icon: '🕹️' },
  { re: /7-zip|7zip|winrar/i,          icon: '🗜️' },
  { re: /notepad/i,                    icon: '📝' },
  { re: /office|word|excel/i,          icon: '📄' },
  { re: /paint/i,                      icon: '🎨' },
  { re: /obs|streaming/i,              icon: '📡' },
  { re: /handbrake|ffmpeg/i,           icon: '🎞️' },
  { re: /powertoys/i,                  icon: '🔧' },
  { re: /terminal/i,                   icon: '⬛' },
  { re: /winget/i,                     icon: '📦' },
  { re: /pdf/i,                        icon: '📑' },
  { re: /antivirus|malware|defender/i, icon: '🛡️' },
  { re: /vpn|wireguard|openvpn/i,      icon: '🔒' },
  { re: /torrent|qbittorrent/i,        icon: '⬇️' },
  { re: /bitwarden|keepass|pass/i,     icon: '🔑' },
];

const CARD_ACCENTS = [
  'rgba(79,142,247,0.12)',
  'rgba(168,85,247,0.12)',
  'rgba(16,185,129,0.1)',
  'rgba(245,158,11,0.1)',
  'rgba(239,68,68,0.1)',
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

function showToast(message, type = 'info', duration = 3500) {
  const tc = $('toast-container');
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.innerHTML = `<span class="toast-dot"></span>${message}`;
  tc.appendChild(t);
  setTimeout(() => {
    t.style.opacity = '0';
    t.style.transform = 'translateX(20px)';
    t.style.transition = '0.3s ease';
    setTimeout(() => t.remove(), 300);
  }, duration);
}

// ── State ──────────────────────────────────────────────────────────────────
const state = {
  currentPage:   'home',
  installingIds: new Set(),   // currently being installed
  upgradingIds:  new Set(),   // currently being upgraded
  uninstallingIds: new Set(), // currently being uninstalled
  doneIds:       new Set(),   // installed this session
  installedIds:  new Set(),   // known-installed (from winget list)
  upgradableIds: new Map(),   // id → available version
  currentApp:    null,
  uninstallConfirm: false,    // awaiting second click?
};

// ── Navigation ─────────────────────────────────────────────────────────────
function navigate(page) {
  if (state.currentPage === page) return;
  state.currentPage = page;
  document.querySelectorAll('.nav-item').forEach(el =>
    el.classList.toggle('active', el.dataset.page === page));
  document.querySelectorAll('.page').forEach(el =>
    el.classList.toggle('active', el.id === `page-${page}`));
  if (page === 'library') loadLibrary();
}

document.querySelectorAll('.nav-item').forEach(el =>
  el.addEventListener('click', () => navigate(el.dataset.page)));

// ── Title bar controls ─────────────────────────────────────────────────────
$('btn-minimize').addEventListener('click', () => window.api.minimize());
$('btn-maximize').addEventListener('click', () => window.api.maximize());
$('btn-close').addEventListener('click',    () => window.api.close());

// ── App card builder ───────────────────────────────────────────────────────
function buildAppCard(app, idx) {
  const id        = app.Id      || '';
  const name      = app.Name    || id;
  const ver       = app.Version || '';
  const available = app.Available || ''; // from winget upgrade output
  const src       = app.Source  || 'winget';
  const icon      = getIcon(name, id);
  const accent    = cardAccent(idx);
  const hasUpdate = state.upgradableIds.has(id);
  const isInstalled = state.installedIds.has(id) || state.doneIds.has(id);

  const card = document.createElement('div');
  card.className = 'app-card';
  card.dataset.appId = id;
  card.style.setProperty('--card-accent', accent);
  card.style.animationDelay = `${Math.min(idx * 40, 400)}ms`;

  const isInstalling   = state.installingIds.has(id);
  const isUpgrading    = state.upgradingIds.has(id);
  const isUninstalling = state.uninstallingIds.has(id);

  const chipLabel = isInstalling   ? '…Installing'
                  : isUpgrading    ? '⬆ Updating'
                  : isUninstalling ? '…Removing'
                  : isInstalled    ? '✓ Installed'
                  : 'Install';

  const chipClass = isInstalling || isUpgrading || isUninstalling ? 'installing'
                  : isInstalled  ? 'done'
                  : '';

  card.innerHTML = `
    <div class="app-card-icon">${icon}</div>
    <div class="app-card-body">
      <div class="app-card-name" title="${escHtml(name)}">${escHtml(name)}</div>
      <div class="app-card-id"   title="${escHtml(id)}">${escHtml(id)}</div>
      ${ver ? `<div class="app-card-version">v${escHtml(ver)}${available ? ` → <strong style="color:var(--amber)">${escHtml(available)}</strong>` : ''}</div>` : ''}
    </div>
    <div class="app-card-footer">
      <div style="display:flex;gap:6px;align-items:center;">
        <span class="source-badge">${escHtml(src)}</span>
        ${hasUpdate ? `<span class="update-badge">Update</span>` : ''}
      </div>
      <button class="install-chip ${chipClass}" data-id="${escHtml(id)}">
        ${chipLabel}
      </button>
    </div>
  `;

  card.addEventListener('click', (e) => {
    if (e.target.closest('.install-chip')) return;
    openModal(app);
  });

  card.querySelector('.install-chip').addEventListener('click', (e) => {
    e.stopPropagation();
    if (hasUpdate) {
      triggerUpgrade(id, name);
    } else {
      triggerInstall(id, name);
    }
  });

  return card;
}

function renderApps(container, apps) {
  container.innerHTML = '';
  apps.forEach((app, i) => container.appendChild(buildAppCard(app, i)));
}

// ── Console helper ─────────────────────────────────────────────────────────
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

// ── Install ────────────────────────────────────────────────────────────────
async function triggerInstall(id, name, version = '') {
  if (state.installingIds.has(id) || state.doneIds.has(id)) return;

  state.installingIds.add(id);
  refreshCardButtons(id);
  showToast(`Installing ${name}…`, 'info', 8000);

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
    showToast(`✓ ${name} installed successfully!`, 'success');
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

// ── Upgrade ────────────────────────────────────────────────────────────────
async function triggerUpgrade(id, name) {
  if (state.upgradingIds.has(id)) return;

  state.upgradingIds.add(id);
  refreshCardButtons(id);
  showToast(`Updating ${name}…`, 'info', 12000);

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

  if (result.ok) {
    refreshCardButtons(id);
    showToast(`✓ ${name} updated successfully!`, 'success');
    if (state.currentApp?.Id === id) {
      const btn = $('modal-update-btn');
      btn.classList.add('done');
      btn.disabled = false;
      btn.innerHTML = `✓ Updated`;
    }
  } else {
    refreshCardButtons(id);
    showToast(`Failed to update ${name}`, 'error');
    if (state.currentApp?.Id === id) {
      const btn = $('modal-update-btn');
      btn.classList.remove('hidden');
      btn.disabled = false;
      btn.innerHTML = `✗ Update failed`;
    }
  }
}

// ── Uninstall ──────────────────────────────────────────────────────────────
async function triggerUninstall(id, name) {
  if (state.uninstallingIds.has(id)) return;

  const uninstallBtn = $('modal-uninstall-btn');

  // Two-click confirmation
  if (!state.uninstallConfirm) {
    state.uninstallConfirm = true;
    uninstallBtn.classList.add('confirming');
    uninstallBtn.textContent = '⚠ Click again to confirm';
    setTimeout(() => {
      if (state.uninstallConfirm) {
        state.uninstallConfirm = false;
        uninstallBtn.classList.remove('confirming');
        uninstallBtn.innerHTML = `
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6l-1 14H6L5 6"/>
            <path d="M10 11v6"/><path d="M14 11v6"/>
            <path d="M9 6V4h6v2"/>
          </svg>
          Uninstall`;
      }
    }, 3000);
    return;
  }

  // Confirmed
  state.uninstallConfirm = false;
  state.uninstallingIds.add(id);
  refreshCardButtons(id);
  showToast(`Uninstalling ${name}…`, 'info', 10000);

  uninstallBtn.classList.remove('confirming');
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

// ── Update card chip labels for a given app id ─────────────────────────────
function refreshCardButtons(id) {
  document.querySelectorAll(`.app-card[data-app-id="${CSS.escape(id)}"]`).forEach(card => {
    const chip = card.querySelector('.install-chip');
    if (!chip) return;

    const isInstalling   = state.installingIds.has(id);
    const isUpgrading    = state.upgradingIds.has(id);
    const isUninstalling = state.uninstallingIds.has(id);
    const isInstalled    = state.installedIds.has(id) || state.doneIds.has(id);
    const hasUpdate      = state.upgradableIds.has(id);

    chip.className = `install-chip ${(isInstalling || isUpgrading || isUninstalling) ? 'installing' : isInstalled ? 'done' : ''}`;
    chip.textContent = isInstalling   ? '…Installing'
                     : isUpgrading    ? '⬆ Updating'
                     : isUninstalling ? '…Removing'
                     : isInstalled    ? (hasUpdate ? '⬆ Update' : '✓ Installed')
                     : 'Install';
  });
}

// ── Modal ──────────────────────────────────────────────────────────────────
function setModalInstallBtn(status) {
  const btn = $('modal-install-btn');
  btn.className = 'install-btn';
  if (status === 'installing') {
    btn.classList.add('installing');
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

/**
 * Show/hide Install, Update, Uninstall buttons based on current state.
 */
function updateModalButtons(id) {
  const isInstalled = state.installedIds.has(id) || state.doneIds.has(id);
  const hasUpdate   = state.upgradableIds.has(id);
  const updateVer   = state.upgradableIds.get(id) || '';

  const installBtn   = $('modal-install-btn');
  const updateBtn    = $('modal-update-btn');
  const uninstallBtn = $('modal-uninstall-btn');

  if (isInstalled) {
    // Installed — hide install, show uninstall
    installBtn.classList.add('hidden');
    uninstallBtn.classList.remove('hidden');

    if (hasUpdate) {
      updateBtn.classList.remove('hidden');
      updateBtn.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" width="18" height="18">
          <polyline points="16 3 21 3 21 8"/>
          <line x1="4" y1="20" x2="21" y2="3"/>
          <polyline points="21 16 21 21 16 21"/>
          <line x1="15" y1="4" x2="4" y2="15"/>
        </svg>
        Update${updateVer ? ` → ${updateVer}` : ''}`;
    } else {
      updateBtn.classList.add('hidden');
    }
  } else {
    // Not installed
    installBtn.classList.remove('hidden');
    updateBtn.classList.add('hidden');
    uninstallBtn.classList.add('hidden');
    setModalInstallBtn('default');
  }
}

async function openModal(app) {
  state.currentApp = app;
  state.uninstallConfirm = false;

  const id   = app.Id   || '';
  const name = app.Name || id;
  const ver  = app.Version || '';
  const src  = app.Source  || 'winget';

  $('modal-app-icon').textContent        = getIcon(name, id);
  $('modal-app-name').textContent        = name;
  $('modal-app-id').textContent          = id;
  $('modal-app-version').textContent     = ver ? `v${ver}` : '';
  $('modal-app-source').textContent      = src;

  // Reset buttons
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

  // Reset version selector
  const vSelect  = $('version-select');
  const vLoading = $('versions-loading');
  vSelect.innerHTML = '<option value="">⬇ Latest (default)</option>';
  vLoading.classList.remove('hidden');

  $('modal-overlay').classList.remove('hidden');

  // Async: fetch available versions
  const vRes = await window.api.versions(id);
  vLoading.classList.add('hidden');

  if (vRes.ok && vRes.data.length) {
    vRes.data.forEach((v, i) => {
      const opt = document.createElement('option');
      opt.value = v;
      opt.textContent = `v${v}` + (i === 0 ? ' (latest)' : '');
      vSelect.appendChild(opt);
    });
  }
}

function closeModal() {
  $('modal-overlay').classList.add('hidden');
  state.currentApp = null;
  state.uninstallConfirm = false;
}

$('modal-close-btn').addEventListener('click', closeModal);
$('modal-overlay').addEventListener('click', (e) => {
  if (e.target === $('modal-overlay')) closeModal();
});

// Install button
$('modal-install-btn').addEventListener('click', () => {
  if (!state.currentApp) return;
  const { Id: id, Name: name } = state.currentApp;
  const version = $('version-select').value; // '' = latest
  triggerInstall(id, name || id, version);
});

// Update button
$('modal-update-btn').addEventListener('click', () => {
  if (!state.currentApp) return;
  const { Id: id, Name: name } = state.currentApp;
  triggerUpgrade(id, name || id);
});

// Uninstall button
$('modal-uninstall-btn').addEventListener('click', () => {
  if (!state.currentApp) return;
  const { Id: id, Name: name } = state.currentApp;
  triggerUninstall(id, name || id);
});

// Copy command
$('modal-copy-btn').addEventListener('click', () => {
  if (!state.currentApp) return;
  const ver = $('version-select').value;
  const cmd = `winget install --id ${state.currentApp.Id} --accept-package-agreements${ver ? ` --version ${ver}` : ''}`;
  navigator.clipboard.writeText(cmd).then(() => showToast('Command copied!', 'info'));
});

// ── Streaming events ───────────────────────────────────────────────────────
window.api.onProgress(({ id, text }) => {
  if (state.currentApp?.Id === id) appendConsole(text);
});
window.api.onUpgradeProgress(({ id, text }) => {
  if (state.currentApp?.Id === id) appendConsole(text);
});
window.api.onUninstallProgress(({ id, text }) => {
  if (state.currentApp?.Id === id) appendConsole(text);
});

// ── Search ─────────────────────────────────────────────────────────────────
async function doSearch(query) {
  query = query.trim();
  if (!query) return;

  navigate('search');
  $('search-input').value = query;

  const status  = $('search-status');
  const results = $('search-results');
  const empty   = $('search-empty');

  results.innerHTML = `<div class="loading-wrap"><div class="spinner"></div>Searching for "${escHtml(query)}"…</div>`;
  empty.classList.add('hidden');
  status.textContent = '';

  const res = await window.api.search(query);

  if (!res.ok) {
    results.innerHTML = '';
    status.textContent = '⚠ winget error: ' + res.error;
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

$('search-input').addEventListener('keydown',    (e) => { if (e.key === 'Enter') doSearch($('search-input').value); });
$('home-search-input').addEventListener('keydown',(e) => { if (e.key === 'Enter') doSearch($('home-search-input').value); });

document.querySelectorAll('.category-chip').forEach(chip => {
  chip.addEventListener('click', () => {
    document.querySelectorAll('.category-chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
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
    status.textContent = '⚠ ' + res.error;
    return;
  }

  const apps = res.data.filter(a => a.Id);
  // Update the installed-ids set
  state.installedIds.clear();
  apps.forEach(a => state.installedIds.add(a.Id));

  if (!apps.length) {
    grid.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }

  status.innerHTML = `<span><strong>${apps.length}</strong> installed app${apps.length !== 1 ? 's' : ''}</span>`;
  renderApps(grid, apps);
}

$('refresh-library-btn').addEventListener('click', loadLibrary);

// ── Check for Updates ──────────────────────────────────────────────────────
$('check-updates-btn').addEventListener('click', checkForUpdates);

async function checkForUpdates() {
  const btn    = $('check-updates-btn');
  const badge  = $('update-count-badge');
  const status = $('library-status');

  btn.disabled = true;
  btn.innerHTML = `<span class="spinner-small"></span> Checking…`;
  badge.classList.add('hidden');

  const res = await window.api.upgradable();

  btn.disabled = false;
  btn.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16">
      <polyline points="16 3 21 3 21 8"/>
      <line x1="4" y1="20" x2="21" y2="3"/>
      <polyline points="21 16 21 21 16 21"/>
      <line x1="15" y1="4" x2="4" y2="15"/>
    </svg>
    Check for Updates
    <span id="update-count-badge" class="${res.ok && res.data.length ? '' : 'hidden'}">${res.ok ? res.data.length : ''}</span>`;

  if (!res.ok) {
    showToast('Could not check for updates: ' + res.error, 'error');
    return;
  }

  state.upgradableIds.clear();
  res.data.forEach(a => {
    if (a.Id) state.upgradableIds.set(a.Id, a.Available || '');
  });

  if (!res.data.length) {
    showToast('✓ All apps are up to date!', 'success');
    status.textContent = '✓ All apps are up to date';
    return;
  }

  const count = state.upgradableIds.size;
  showToast(`${count} update${count !== 1 ? 's' : ''} available`, 'info');
  status.innerHTML = `<span style="color:var(--amber)">⬆ <strong>${count}</strong> update${count !== 1 ? 's' : ''} available</span>`;

  // Re-render library to show update badges
  await loadLibrary();
}

// ── Featured apps ──────────────────────────────────────────────────────────
async function loadFeatured() {
  const grid    = $('featured-grid');
  const spinner = $('featured-loading');

  spinner.classList.remove('hidden');
  grid.innerHTML = '';

  const res = await window.api.featured();
  spinner.classList.add('hidden');

  if (!res.ok || !res.data.length) {
    grid.innerHTML = '<p style="color:var(--text-muted);font-size:13px;">Could not load featured apps. Make sure winget is available.</p>';
    return;
  }

  renderApps(grid, res.data.slice(0, 6));
}

// ── Keyboard shortcuts ─────────────────────────────────────────────────────
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (!$('modal-overlay').classList.contains('hidden')) closeModal();
  }
  if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
    e.preventDefault();
    navigate('search');
    $('search-input').focus();
  }
});

// ── Boot ───────────────────────────────────────────────────────────────────
loadFeatured();
