// TB2 Spray Layout Installation Assistant
// 10x8 Tension Board 2 (267 Holds)

let state = {
  allHolds: [],
  activeList: [],
  currentIndex: 0,
  installedUids: new Set(),
  box1Ids: new Set(), // Plastic hold_ids tagged as belonging to Box 1
  sortMode: 'guided', // 'guided', 'screws', 'set', 'row'
  filterMaterial: 'all', // 'all', 'Plastic', 'Box1', 'Box2', 'Wood'
  searchQuery: '',
  soundEnabled: true,
  audioCtx: null
};

// Compass Directions Map
const COMPASS_POINTS = [
  'N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
  'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'
];

const SLASH_DIR_MAP = {
  NNE: 'N/NE',
  ENE: 'E/NE',
  ESE: 'E/SE',
  SSE: 'S/SE',
  SSW: 'S/SW',
  WSW: 'W/SW',
  WNW: 'W/NW',
  NNW: 'N/NW'
};

function formatDirectionDisplay(dir) {
  return SLASH_DIR_MAP[dir] ? `${dir} · ${SLASH_DIR_MAP[dir]}` : dir;
}

async function init() {
  loadStoredProgress();
  await loadHoldsData();
  setupAudio();
  setupEvents();
  updateActiveList();
  renderAll();
}

function loadStoredProgress() {
  try {
    const saved = localStorage.getItem('tb2_spray_installed');
    if (saved) {
      const arr = JSON.parse(saved);
      state.installedUids = new Set(arr);
    }
    const savedBox1 = localStorage.getItem('tb2_spray_box1_ids');
    if (savedBox1) {
      state.box1Ids = new Set(JSON.parse(savedBox1));
    }
    const savedMode = localStorage.getItem('tb2_spray_sortMode');
    if (savedMode) state.sortMode = savedMode;
  } catch (e) {
    console.warn('Failed to load localStorage', e);
  }
}

function saveProgress() {
  try {
    localStorage.setItem('tb2_spray_installed', JSON.stringify(Array.from(state.installedUids)));
    localStorage.setItem('tb2_spray_box1_ids', JSON.stringify(Array.from(state.box1Ids)));
    localStorage.setItem('tb2_spray_sortMode', state.sortMode);
  } catch (e) {
    console.warn('Failed to save localStorage', e);
  }
}

async function loadHoldsData() {
  try {
    const res = await fetch('data/holds.json');
    state.allHolds = await res.json();
  } catch (e) {
    console.error('Failed to load holds.json', e);
  }
}

function setupAudio() {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (AudioContext) {
      state.audioCtx = new AudioContext();
    }
  } catch (e) {
    console.warn('Web Audio not supported', e);
  }
}

function playSuccessChime() {
  if (!state.soundEnabled || !state.audioCtx) return;
  try {
    if (state.audioCtx.state === 'suspended') {
      state.audioCtx.resume();
    }
    const now = state.audioCtx.currentTime;
    
    // First high note (C6 ~ 1046Hz)
    const osc1 = state.audioCtx.createOscillator();
    const gain1 = state.audioCtx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(1046.5, now);
    gain1.gain.setValueAtTime(0.12, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
    osc1.connect(gain1);
    gain1.connect(state.audioCtx.destination);
    osc1.start(now);
    osc1.stop(now + 0.15);

    // Second bell note (E6 ~ 1318Hz)
    const osc2 = state.audioCtx.createOscillator();
    const gain2 = state.audioCtx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(1318.5, now + 0.08);
    gain2.gain.setValueAtTime(0.15, now + 0.08);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
    osc2.connect(gain2);
    gain2.connect(state.audioCtx.destination);
    osc2.start(now + 0.08);
    osc2.stop(now + 0.35);
  } catch (e) {
    console.warn('Audio play error', e);
  }
}

function updateActiveList() {
  let list = [...state.allHolds];

  // Material / Box Filter
  if (state.filterMaterial === 'Box1') {
    list = list.filter(h => h.material === 'Plastic' && state.box1Ids.has(h.hold_id));
  } else if (state.filterMaterial === 'Box2') {
    list = list.filter(h => h.material === 'Plastic' && !state.box1Ids.has(h.hold_id));
  } else if (state.filterMaterial !== 'all') {
    list = list.filter(h => h.material === state.filterMaterial);
  }

  // Search Filter
  if (state.searchQuery.trim()) {
    const q = state.searchQuery.trim().toLowerCase();
    const qClean = q.replace(/[\s,]+/g, '');
    const qAlphaNum = q.replace(/[\s\-_,/]+/g, '');
    const qNormTension = q.replace(/col(umn)?|row/g, '').trim().replace(/[\s,]+/g, ',');
    list = list.filter(h => {
      const moonClean = (h.moon_coord || '').toLowerCase().replace(/[\s\-_,]+/g, '');
      const slashDir = (SLASH_DIR_MAP[h.direction] || '').toLowerCase();
      const tensionPair = `${h.col_str},${h.row_str}`;
      return (
        h.hold_id.toLowerCase().includes(q) ||
        h.direction.toLowerCase() === q ||
        slashDir === q ||
        h.col_str === q ||
        h.row_str === q ||
        tensionPair === qClean ||
        tensionPair === qNormTension ||
        `${h.col_str} ${h.row_str}` === q ||
        `col ${h.col_str}` === q ||
        `row ${h.row_str}` === q ||
        moonClean === qAlphaNum ||
        (h.moon_coord && h.moon_coord.toLowerCase().includes(q))
      );
    });
  }

  // Sorting
  if (state.sortMode === 'guided') {
    // Plastic bottom-up -> Wood bottom-up
    list.sort((a, b) => a.order_guided - b.order_guided);
  } else if (state.sortMode === 'screws') {
    // 1 5/8" -> 2 1/2" -> 4"
    list.sort((a, b) => a.order_screws - b.order_screws);
  } else if (state.sortMode === 'set') {
    // Alphabetical hold_id
    list.sort((a, b) => a.order_set - b.order_set);
  } else if (state.sortMode === 'row') {
    // Simple bottom to top regardless of material
    list.sort((a, b) => {
      if (a.row !== b.row) return a.row - b.row;
      return a.col - b.col;
    });
  }

  state.activeList = list;

  // Ensure currentIndex is in bounds
  if (state.currentIndex >= list.length) {
    state.currentIndex = Math.max(0, list.length - 1);
  }
}

function getCurrentHold() {
  if (state.activeList.length === 0) return null;
  return state.activeList[state.currentIndex];
}

function renderAll() {
  renderHoldCard();
  renderBoardMap();
  renderStats();
}

function renderHoldCard() {
  const hold = getCurrentHold();
  const card = document.getElementById('hold-card');
  if (!card) return;

  if (!hold) {
    card.innerHTML = `
      <div style="text-align: center; padding: 40px;">
        <h2 style="font-size: 24px; color: var(--text-muted);">No holds match current filter</h2>
        <p style="color: var(--text-dim); margin-top: 8px;">Try clearing the search or changing the filter.</p>
        <button class="btn-secondary" style="margin-top: 16px;" onclick="resetFilters()">Reset Filters</button>
      </div>
    `;
    return;
  }

  const isInstalled = state.installedUids.has(hold.uid);
  const materialClass = hold.material.toLowerCase();

  // Screw color class
  let screwClass = 'screw-mid';
  if (hold.screw_length.includes('1 5/8')) screwClass = 'screw-short';
  if (hold.screw_length === '4') screwClass = 'screw-long';

  // Card classes
  card.className = `hold-card material-${materialClass} ${isInstalled ? 'installed' : ''}`;

  const sameIdHolds = state.allHolds.filter(h => h.hold_id === hold.hold_id);
  const sameIdRemaining = sameIdHolds.filter(h => !state.installedUids.has(h.uid)).length;
  const copyBadgeHtml = sameIdHolds.length > 1
    ? `<span style="font-size: 11px; color: var(--text-muted); background: var(--bg-elevated); border: 1px solid var(--border); padding: 3px 8px; border-radius: 12px; font-weight: 600;" title="There are ${sameIdHolds.length} holds with ID ${hold.hold_id} on the 10x8 wall">${sameIdHolds.length}x on 10x8 (${sameIdRemaining} left)</span>`
    : `<span style="font-size: 11px; color: var(--text-dim); background: var(--bg-elevated); border: 1px solid var(--border); padding: 3px 8px; border-radius: 12px; font-weight: 600;">Unique (1x)</span>`;

  const boxTagHtml = (hold.material === 'Plastic' && state.box1Ids.size > 0)
    ? `<span style="font-size: 11px; color: ${state.box1Ids.has(hold.hold_id) ? '#38bdf8' : '#a78bfa'}; background: var(--bg-elevated); border: 1px solid ${state.box1Ids.has(hold.hold_id) ? '#38bdf8' : '#7c3aed'}; padding: 3px 8px; border-radius: 12px; font-weight: 700;">📦 ${state.box1Ids.has(hold.hold_id) ? 'Box 1' : 'Box 2'}</span>`
    : '';

  card.innerHTML = `
    <!-- Top Row: Hold ID, Material, Dual Position Coordinates -->
    <div class="card-top">
      <div class="hold-id-block" style="flex-wrap: wrap;">
        <span class="hold-id">${hold.hold_id}</span>
        <span class="material-tag ${materialClass}">
          ${hold.material === 'Plastic' ? 'Polyurethane Plastic' : 'Hardwood'}
        </span>
        ${boxTagHtml}
        ${copyBadgeHtml}
        ${isInstalled ? '<span style="color: var(--color-installed); font-weight: 700; font-size: 14px;">✓ Installed</span>' : ''}
      </div>
      <div class="coord-badge-large">
        <div class="coord-col-group">
          <div class="coord-label">MoonBoard Grid</div>
          <div class="coord-values">${hold.moon_coord}</div>
        </div>
        <div class="coord-divider"></div>
        <div class="coord-col-group">
          <div class="coord-label" style="color: #7dd3fc;">Tension Table</div>
          <div class="coord-tension-values">Col ${hold.col_str}, Row ${hold.row_str}</div>
        </div>
      </div>
    </div>

    <!-- Specs Top Row: Screws, Full-Size 16-Point Compass, and Orientation -->
    <div class="specs-compass-grid">
      <!-- 1. Screws -->
      <div class="spec-item ${screwClass}">
        <div class="spec-title">Screws Needed</div>
        <div class="screw-badge">
          <span class="screw-length">${hold.screw_length}"</span>
          <span class="screw-qty">${hold.screw_qty}x Screws</span>
        </div>
        <div style="font-size: 12px; color: var(--text-muted); margin-top: 8px; line-height: 1.38;">
          T-25 flat-head countersunk.<br/>Drive flush with impact driver; avoid overtightening.
        </div>
      </div>

      <!-- 2. Full-Size 16-Point Compass Rose (replaces Center Light Cap) -->
      <div class="full-compass-box" onclick="openOverviewModal('compass')" title="Click to open Tension's official compass guide diagram">
        <div class="full-compass-svg-wrap">
          ${generateCompassSvg(hold.degrees, hold.direction)}
        </div>
      </div>

      <!-- 3. Hold Orientation Details -->
      <div class="orientation-box">
        <div class="spec-title">Hold Orientation</div>
        <div class="direction-details">
          <div style="display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap;">
            <span class="dir-heading">${formatDirectionDisplay(hold.direction)}</span>
            <span class="dir-deg">${hold.degrees}°</span>
          </div>
          <div class="dir-clock">Clock: ${hold.clock}</div>
          <div class="dir-tip">${hold.direction_tip}</div>
          ${hold.material === 'Wood' ? `
            <div style="font-size: 11.5px; color: #fbbf24; margin-top: 6px; font-weight: 600; line-height: 1.35;">
              ★ Orient stamped arrow / SKU (perpendicular to screws) toward ${SLASH_DIR_MAP[hold.direction] || hold.direction} — NOT grip edge.
            </div>
          ` : `
            <div style="font-size: 11.5px; color: var(--text-muted); margin-top: 6px; line-height: 1.35;">
              Align molded reference line/tick from center hole toward <strong style="color: #7dd3fc;">${SLASH_DIR_MAP[hold.direction] || hold.direction}</strong>.
            </div>
          `}
        </div>
      </div>
    </div>

    <!-- Triple Visual Reference Section -->
    <div class="reference-section">
      <div class="reference-header">
        <span>Triple Visual Reference (Compare Gaps, Angles, & Real Hardware)</span>
        <span style="font-size: 11px; font-weight: normal; color: var(--text-dim);">Click any photo to enlarge</span>
      </div>
      <div class="reference-grid">
        <!-- 1. CAD Schematic with Blue Arrow -->
        <div class="ref-card">
          <div class="ref-badge cad">📐 CAD Schematic</div>
          <div class="ref-img-container" onclick="openImageModal('${hold.crop_cad}', 'CAD Schematic: Hold ${hold.hold_id} at ${hold.moon_coord} (Col ${hold.col_str}, Row ${hold.row_str}) - Arrow points ${hold.direction} (${hold.degrees}°)')">
            <img class="ref-img" src="${hold.crop_cad}" alt="CAD ${hold.hold_id}" onerror="this.src='crops/hold_-5.0_1.0.png'" />
          </div>
          <div class="ref-desc">Blue arrow indicates CAD orientation & grid lines.</div>
        </div>

        <!-- 2. Official 5000px 3D Render -->
        <div class="ref-card">
          <div class="ref-badge render">🎨 Official 3D Render</div>
          <div class="ref-img-container" onclick="openImageModal('${hold.crop_render}', '3D Render: Hold ${hold.hold_id} at ${hold.moon_coord} (Col ${hold.col_str}, Row ${hold.row_str}) - True clearance & gaps')">
            <img class="ref-img" src="${hold.crop_render}" alt="3D Render ${hold.hold_id}" onerror="this.src='crops/hold_-5.0_1.0.png'" />
          </div>
          <div class="ref-desc">True 3D clearance & physical spacing between holds.</div>
        </div>

        <!-- 3. Real Installed Board Photo -->
        <div class="ref-card">
          <div class="ref-badge real">📸 Real Installed Board</div>
          <div class="ref-img-container" onclick="openImageModal('${hold.crop_real}?v=subpixel', 'Real Board: Hold ${hold.hold_id} at ${hold.moon_coord} (Col ${hold.col_str}, Row ${hold.row_str}) - Real gym board in use')">
            <img class="ref-img" src="${hold.crop_real}?v=subpixel" alt="Real Board ${hold.hold_id}" onerror="this.src='crops/hold_-5.0_1.0.png'" />
          </div>
          <div class="ref-desc">Real physical wood/plastic, screws, and chalk in place.</div>
        </div>
      </div>
    </div>

    <!-- Action Buttons Bar -->
    <div class="action-bar">
      <button class="btn-secondary" onclick="prevHold()">
        <span>← Prev</span>
        <span class="hotkey-badge">Left</span>
      </button>

      <button class="btn-primary ${isInstalled ? 'unmark' : ''}" onclick="toggleInstalledCurrent()">
        <span>${isInstalled ? '✕ Mark Uninstalled' : '✓ Drill In & Mark Installed'}</span>
        <span class="hotkey-badge">Space / Enter</span>
      </button>

      <button class="btn-secondary" onclick="nextHold()">
        <span>Skip →</span>
        <span class="hotkey-badge">S / Right</span>
      </button>
    </div>
  `;
}

function generateCompassSvg(deg, dirLabel) {
  // Full-Size 16-Point Tension Compass Rose SVG (matching Tension's dual-ring diagram)
  const size = 256;
  const c = size / 2; // 128
  const rOuter = 93;
  const rInner = 53;
  const rHalfLabel = 73; // Annulus midpoint for N/NE, E/NE, ...

  // Active ±11.25° sector wedge highlight
  const a1 = (deg - 11.25) * (Math.PI / 180);
  const a2 = (deg + 11.25) * (Math.PI / 180);
  const wx1 = c + rOuter * Math.sin(a1);
  const wy1 = c - rOuter * Math.cos(a1);
  const wx2 = c + rOuter * Math.sin(a2);
  const wy2 = c - rOuter * Math.cos(a2);
  const sectorPath = `M ${c} ${c} L ${wx1.toFixed(1)} ${wy1.toFixed(1)} A ${rOuter} ${rOuter} 0 0 1 ${wx2.toFixed(1)} ${wy2.toFixed(1)} Z`;

  let spokes = '';
  let labels = '';

  for (let i = 0; i < 16; i++) {
    const code = COMPASS_POINTS[i];
    const display = SLASH_DIR_MAP[code] || code;
    const isActive = (code === dirLabel);
    const angleDeg = i * 22.5;
    const rad = angleDeg * (Math.PI / 180);
    const sinA = Math.sin(rad);
    const cosA = Math.cos(rad);

    const isCardinal = (i % 4 === 0);
    const isOrdinal = (i % 2 === 0 && !isCardinal);
    const isHalf = (i % 2 === 1);

    // Draw spoke line
    const rStart = 12;
    const rEnd = isCardinal ? rOuter + 6 : rOuter;
    const sx1 = c + rStart * sinA;
    const sy1 = c - rStart * cosA;
    const sx2 = c + rEnd * sinA;
    const sy2 = c - rEnd * cosA;

    let spokeColor = isCardinal ? '#e2e8f0' : (isOrdinal ? '#94a3b8' : '#0284c7');
    let spokeWidth = isCardinal ? 1.8 : (isOrdinal ? 1.2 : 1.1);
    if (isActive) {
      spokeColor = '#fbbf24';
      spokeWidth = 2.4;
    }
    spokes += `<line x1="${sx1.toFixed(1)}" y1="${sy1.toFixed(1)}" x2="${sx2.toFixed(1)}" y2="${sy2.toFixed(1)}" stroke="${spokeColor}" stroke-width="${spokeWidth}" stroke-opacity="${isActive ? '1' : '0.85'}" />`;

    // Position label: cardinals/ordinals outside outer ring, half-winds inside annulus
    const rText = isCardinal ? 113 : (isOrdinal ? 109 : rHalfLabel);
    const tx = c + rText * sinA;
    const ty = c - rText * cosA;

    if (isActive) {
      const pillW = display.length >= 4 ? 36 : (display.length >= 2 ? 26 : 22);
      const pillH = 17;
      labels += `
        <g>
          <rect x="${(tx - pillW / 2).toFixed(1)}" y="${(ty - pillH / 2).toFixed(1)}" width="${pillW}" height="${pillH}" rx="4" fill="#fbbf24" stroke="#ffffff" stroke-width="1.2" />
          <text x="${tx.toFixed(1)}" y="${ty.toFixed(1)}" dominant-baseline="central" text-anchor="middle" font-size="${isHalf ? '9.5' : '11.5'}" font-weight="900" fill="#090d14" font-family="ui-monospace, SFMono-Regular, monospace">${display}</text>
        </g>
      `;
    } else if (isHalf) {
      // Mask behind half-wind label so cyan spoke doesn't strike through letters
      labels += `
        <g>
          <rect x="${(tx - 15.5).toFixed(1)}" y="${(ty - 6.5).toFixed(1)}" width="31" height="13" rx="3" fill="#0b0f18" fill-opacity="0.92" />
          <text x="${tx.toFixed(1)}" y="${ty.toFixed(1)}" dominant-baseline="central" text-anchor="middle" font-size="8.8" font-weight="700" fill="#cbd5e1" font-family="ui-monospace, SFMono-Regular, monospace">${display}</text>
        </g>
      `;
    } else {
      const fSize = isCardinal ? '13.5' : '11';
      const fColor = isCardinal ? '#f8fafc' : '#cbd5e1';
      labels += `<text x="${tx.toFixed(1)}" y="${ty.toFixed(1)}" dominant-baseline="central" text-anchor="middle" font-size="${fSize}" font-weight="800" fill="${fColor}" font-family="ui-monospace, SFMono-Regular, monospace">${display}</text>`;
    }
  }

  // Bold target arrow extending to inner ring (rInner = 53) so it points directly at
  // the active heading without ever covering any half-wind or outer ring label
  const arrowTipY = c - (rInner + 2);
  const arrowBaseY = arrowTipY + 13;

  return `
    <svg viewBox="0 0 ${size} ${size}" width="100%" height="100%">
      <!-- Active Wedge Glow -->
      <path d="${sectorPath}" fill="rgba(251, 191, 36, 0.14)" />

      <!-- 16 Spokes -->
      ${spokes}

      <!-- Dual Concentric Tension Cyan Rings -->
      <circle cx="${c}" cy="${c}" r="${rOuter}" fill="none" stroke="#0ea5e9" stroke-width="2" />
      <circle cx="${c}" cy="${c}" r="${rInner}" fill="none" stroke="#0ea5e9" stroke-width="1.6" />

      <!-- Rotating Target Arrow from Center Hole -->
      <g transform="rotate(${deg}, ${c}, ${c})">
        <line x1="${c}" y1="${c}" x2="${c}" y2="${arrowBaseY - 2}" stroke="#ef4444" stroke-width="4.5" stroke-linecap="round" />
        <polygon points="${c},${arrowTipY} ${c - 7.5},${arrowBaseY} ${c + 7.5},${arrowBaseY}" fill="#ef4444" stroke="#fecaca" stroke-width="0.8" />
      </g>

      <!-- Hold Center Hole Bore -->
      <circle cx="${c}" cy="${c}" r="8" fill="#1e293b" stroke="#94a3b8" stroke-width="2" />
      <circle cx="${c}" cy="${c}" r="3.5" fill="#090d14" />

      <!-- All 16 Direction Labels -->
      ${labels}
    </svg>
  `;
}

function renderBoardMap() {
  const svg = document.getElementById('board-svg');
  if (!svg || state.allHolds.length === 0) return;

  const currentHold = getCurrentHold();
  const width = 840;
  const height = 1090;
  const paddingX = 88;
  const paddingY = 104;
  const boardW = width - 2 * paddingX;
  const boardH = height - 2 * paddingY;
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);

  // Map coordinates:
  // Col -5.0 to +5.0 (span 10.0)
  // Row 1.0 to 15.0 (span 14.0)
  function toSvgX(col) {
    return paddingX + ((col + 5.0) / 10.0) * boardW;
  }
  function toSvgY(row) {
    return paddingY + (1.0 - (row - 1.0) / 14.0) * boardH;
  }

  let html = '';

  // Background Board Panel
  html += `
    <rect x="${paddingX - 18}" y="${paddingY - 18}" width="${boardW + 36}" height="${boardH + 36}" 
          fill="#111722" stroke="#2d3b4e" stroke-width="2" rx="10" />
  `;

  // Active Crosshair Guide Lines
  if (currentHold) {
    const ax = toSvgX(currentHold.col);
    const ay = toSvgY(currentHold.row);
    html += `
      <line x1="${paddingX - 18}" y1="${ay}" x2="${paddingX + boardW + 18}" y2="${ay}" stroke="#eab308" stroke-width="1.6" stroke-opacity="0.45" stroke-dasharray="5 4" />
      <line x1="${ax}" y1="${paddingY - 18}" x2="${ax}" y2="${paddingY + boardH + 18}" stroke="#eab308" stroke-width="1.6" stroke-opacity="0.45" stroke-dasharray="5 4" />
    `;
  }

  // Horizontal Grid Lines & Large Row Numbers (1..15)
  for (let r = 1; r <= 15; r += 1) {
    const y = toSvgY(r);
    const isExactRow = currentHold && currentHold.row === r;
    const isFlankingHalfRow = currentHold && Math.abs(currentHold.row - r) === 0.5;

    html += `<line x1="${paddingX}" y1="${y}" x2="${paddingX + boardW}" y2="${y}" stroke="#1f2937" stroke-width="1.2" stroke-dasharray="2 3" />`;

    const leftX = paddingX - 50;
    const rightX = paddingX + boardW + 50;
    if (isExactRow) {
      html += `
        <rect x="${leftX - 22}" y="${y - 16}" width="44" height="32" rx="6" fill="#fbbf24" />
        <text x="${leftX}" y="${y}" dominant-baseline="central" fill="#090d14" font-size="25" font-weight="900" font-family="ui-monospace, SFMono-Regular, monospace" text-anchor="middle">${r}</text>
        <rect x="${rightX - 22}" y="${y - 16}" width="44" height="32" rx="6" fill="#fbbf24" />
        <text x="${rightX}" y="${y}" dominant-baseline="central" fill="#090d14" font-size="25" font-weight="900" font-family="ui-monospace, SFMono-Regular, monospace" text-anchor="middle">${r}</text>
      `;
    } else {
      const rowColor = isFlankingHalfRow ? '#fde047' : '#e2e8f0';
      const rowWeight = isFlankingHalfRow ? '900' : '800';
      html += `
        <text x="${leftX}" y="${y}" dominant-baseline="central" fill="${rowColor}" font-size="25" font-weight="${rowWeight}" font-family="ui-monospace, SFMono-Regular, monospace" text-anchor="middle">${r}</text>
        <text x="${rightX}" y="${y}" dominant-baseline="central" fill="${rowColor}" font-size="25" font-weight="${rowWeight}" font-family="ui-monospace, SFMono-Regular, monospace" text-anchor="middle">${r}</text>
      `;
    }
  }

  // Vertical Grid Lines & Large Column Labels (A..K and -5..5)
  const colLetters = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K'];
  for (let c = -5; c <= 5; c += 1) {
    const x = toSvgX(c);
    const letter = colLetters[c + 5];
    const isExactCol = currentHold && currentHold.col === c;
    const isFlankingHalfCol = currentHold && Math.abs(currentHold.col - c) === 0.5;

    html += `<line x1="${x}" y1="${paddingY}" x2="${x}" y2="${paddingY + boardH}" stroke="${c === 0 ? '#3b4c63' : '#1f2937'}" stroke-width="${c === 0 ? '1.6' : '1.2'}" stroke-dasharray="${c === 0 ? '4 3' : '2 3'}" />`;

    const topLetterY = paddingY - 66;
    const topNumY = paddingY - 36;
    const botLetterY = paddingY + boardH + 38;
    const botNumY = paddingY + boardH + 68;

    if (isExactCol) {
      html += `
        <rect x="${x - 23}" y="${topLetterY - 17}" width="46" height="62" rx="7" fill="#fbbf24" />
        <text x="${x}" y="${topLetterY}" dominant-baseline="central" fill="#090d14" font-size="25" font-weight="900" font-family="ui-monospace, SFMono-Regular, monospace" text-anchor="middle">${letter}</text>
        <text x="${x}" y="${topNumY}" dominant-baseline="central" fill="#1e293b" font-size="20" font-weight="900" font-family="ui-monospace, SFMono-Regular, monospace" text-anchor="middle">${c}</text>
        <rect x="${x - 23}" y="${botLetterY - 17}" width="46" height="62" rx="7" fill="#fbbf24" />
        <text x="${x}" y="${botLetterY}" dominant-baseline="central" fill="#090d14" font-size="25" font-weight="900" font-family="ui-monospace, SFMono-Regular, monospace" text-anchor="middle">${letter}</text>
        <text x="${x}" y="${botNumY}" dominant-baseline="central" fill="#1e293b" font-size="20" font-weight="900" font-family="ui-monospace, SFMono-Regular, monospace" text-anchor="middle">${c}</text>
      `;
    } else {
      const letColor = isFlankingHalfCol ? '#fde047' : '#f8fafc';
      const numColor = isFlankingHalfCol ? '#fbbf24' : '#38bdf8';
      html += `
        <text x="${x}" y="${topLetterY}" dominant-baseline="central" fill="${letColor}" font-size="25" font-weight="900" font-family="ui-monospace, SFMono-Regular, monospace" text-anchor="middle">${letter}</text>
        <text x="${x}" y="${topNumY}" dominant-baseline="central" fill="${numColor}" font-size="20" font-weight="800" font-family="ui-monospace, SFMono-Regular, monospace" text-anchor="middle">${c}</text>
        <text x="${x}" y="${botLetterY}" dominant-baseline="central" fill="${letColor}" font-size="25" font-weight="900" font-family="ui-monospace, SFMono-Regular, monospace" text-anchor="middle">${letter}</text>
        <text x="${x}" y="${botNumY}" dominant-baseline="central" fill="${numColor}" font-size="20" font-weight="800" font-family="ui-monospace, SFMono-Regular, monospace" text-anchor="middle">${c}</text>
      `;
    }
  }

  // Draw Holes
  state.allHolds.forEach(h => {
    const cx = toSvgX(h.col);
    const cy = toSvgY(h.row);
    const isInstalled = state.installedUids.has(h.uid);
    const isCurrent = currentHold && currentHold.uid === h.uid;
    const isWood = h.material === 'Wood';

    let r = 5.5;
    let fill = isWood ? '#3b2d18' : '#222f3e';
    let stroke = isWood ? '#fbbf24' : '#38bdf8';
    let sw = 1;
    let cls = isWood ? 'pending-wood' : 'pending-plastic';

    if (isInstalled) {
      fill = '#22c55e';
      stroke = '#16a34a';
      sw = 1;
      cls = 'installed';
    }

    if (isCurrent) {
      r = 9;
      fill = '#eab308';
      stroke = '#ffffff';
      sw = 2.5;
      cls += ' active';
    }

    html += `
      <g class="hole-group" onclick="selectHoldByUid('${h.uid}')" onmouseenter="showTooltip(evt, '${h.uid}')" onmouseleave="hideTooltip()">
        <circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" class="board-hole ${cls}" />
        ${isCurrent ? `
          <circle cx="${cx}" cy="${cy}" r="14" fill="none" stroke="#eab308" stroke-width="1.5" stroke-dasharray="3 3">
            <animateTransform attributeName="transform" type="rotate" from="0 ${cx} ${cy}" to="360 ${cx} ${cy}" dur="8s" repeatCount="indefinite" />
          </circle>
        ` : ''}
        ${isInstalled ? `
          <text x="${cx}" y="${cy + 2.5}" fill="#052e16" font-size="7" font-weight="900" text-anchor="middle" pointer-events="none">✓</text>
        ` : ''}
      </g>
    `;
  });

  svg.innerHTML = html;
}

function showTooltip(evt, uid) {
  const tooltip = document.getElementById('board-tooltip');
  const hold = state.allHolds.find(h => h.uid === uid);
  if (!tooltip || !hold) return;

  const isInstalled = state.installedUids.has(hold.uid);
  tooltip.innerHTML = `
    <strong>${hold.hold_id}</strong> (${hold.material})<br/>
    <strong style="color: #38bdf8">${hold.moon_coord}</strong> <span style="color:#94a3b8; font-size:11px;">(Col ${hold.col_str}, Row ${hold.row_str})</span><br/>
    Dir: ${hold.direction} (${hold.degrees}°)<br/>
    Screws: ${hold.screw_qty}x ${hold.screw_length}"<br/>
    Status: ${isInstalled ? '<span style="color:#22c55e">Installed</span>' : '<span style="color:#f59e0b">Pending</span>'}
  `;
  tooltip.style.left = `${evt.clientX + 14}px`;
  tooltip.style.top = `${evt.clientY + 14}px`;
  tooltip.style.display = 'block';
}

function hideTooltip() {
  const tooltip = document.getElementById('board-tooltip');
  if (tooltip) tooltip.style.display = 'none';
}

function renderStats() {
  const total = state.allHolds.length; // 267
  const installedCount = state.installedUids.size;
  const pct = Math.round((installedCount / total) * 100);

  // Overall progress
  const progressBar = document.getElementById('progress-bar-fill');
  const progressText = document.getElementById('progress-count');
  const progressPct = document.getElementById('progress-pct');
  if (progressBar) progressBar.style.width = `${pct}%`;
  if (progressText) progressText.innerText = `${installedCount} / ${total} holds installed`;
  if (progressPct) progressPct.innerText = `${pct}%`;

  // Material splits
  const plasticTotal = state.allHolds.filter(h => h.material === 'Plastic').length;
  const plasticInstalled = state.allHolds.filter(h => h.material === 'Plastic' && state.installedUids.has(h.uid)).length;
  const woodTotal = state.allHolds.filter(h => h.material === 'Wood').length;
  const woodInstalled = state.allHolds.filter(h => h.material === 'Wood' && state.installedUids.has(h.uid)).length;

  document.getElementById('stat-plastic')?.replaceChildren(`${plasticInstalled} / ${plasticTotal}`);
  document.getElementById('stat-wood')?.replaceChildren(`${woodInstalled} / ${woodTotal}`);
  document.getElementById('stat-current')?.replaceChildren(state.activeList.length > 0 ? `${state.currentIndex + 1} / ${state.activeList.length}` : '0 / 0');
  document.getElementById('stat-pct')?.replaceChildren(`${pct}%`);

  // Update Box 1 / Box 2 filter tab counts
  const box1Total = state.allHolds.filter(h => h.material === 'Plastic' && state.box1Ids.has(h.hold_id)).length;
  const box2Total = plasticTotal - box1Total;
  const tabBox1 = document.getElementById('tab-box1');
  const tabBox2 = document.getElementById('tab-box2');
  if (tabBox1) tabBox1.innerText = `📦 Box 1 (${box1Total})`;
  if (tabBox2) tabBox2.innerText = `📦 Box 2 (${box2Total})`;

  // Fastener Remaining Inventory
  let remainingScrewsShort = 0; // 1 5/8"
  let remainingScrewsMid = 0;   // 2 1/2"
  let remainingScrewsLong = 0;  // 4"

  state.allHolds.forEach(h => {
    if (!state.installedUids.has(h.uid)) {
      if (h.screw_length.includes('1 5/8')) remainingScrewsShort += h.screw_qty;
      else if (h.screw_length === '4') remainingScrewsLong += h.screw_qty;
      else remainingScrewsMid += h.screw_qty;
    }
  });

  const remainingTotal = remainingScrewsShort + remainingScrewsMid + remainingScrewsLong;
  const invShort = document.getElementById('inv-short');
  const invMid = document.getElementById('inv-mid');
  const invLong = document.getElementById('inv-long');
  const invTotal = document.getElementById('inv-total');

  if (invShort) invShort.innerText = `${remainingScrewsShort} screws`;
  if (invMid) invMid.innerText = `${remainingScrewsMid} screws`;
  if (invLong) invLong.innerText = `${remainingScrewsLong} screws`;
  if (invTotal) invTotal.innerText = `${remainingTotal} screws`;
}

// Navigation & Actions
function selectHoldByUid(uid) {
  const idx = state.activeList.findIndex(h => h.uid === uid);
  if (idx !== -1) {
    state.currentIndex = idx;
    renderAll();
  } else {
    // If not in current filtered list, reset search/material and find in all
    state.searchQuery = '';
    state.filterMaterial = 'all';
    document.querySelectorAll('.filter-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.material === 'all');
    });
    const searchInput = document.getElementById('search-input');
    if (searchInput) searchInput.value = '';
    updateActiveList();
    const newIdx = state.activeList.findIndex(h => h.uid === uid);
    if (newIdx !== -1) state.currentIndex = newIdx;
    renderAll();
  }
}

function toggleInstalledCurrent() {
  const hold = getCurrentHold();
  if (!hold) return;

  if (state.installedUids.has(hold.uid)) {
    state.installedUids.delete(hold.uid);
    saveProgress();
    renderAll();
  } else {
    state.installedUids.add(hold.uid);
    saveProgress();
    playSuccessChime();

    // Advance to next uninstalled hold in list
    advanceToNextUninstalled();
    renderAll();
  }
}

function advanceToNextUninstalled() {
  if (state.activeList.length === 0) return;
  
  // Find next uninstalled hold starting from current index + 1
  for (let i = state.currentIndex + 1; i < state.activeList.length; i++) {
    if (!state.installedUids.has(state.activeList[i].uid)) {
      state.currentIndex = i;
      return;
    }
  }
  // Wrap around to start if needed
  for (let i = 0; i < state.currentIndex; i++) {
    if (!state.installedUids.has(state.activeList[i].uid)) {
      state.currentIndex = i;
      return;
    }
  }
  // If all are installed, just stay at current or next
  if (state.currentIndex < state.activeList.length - 1) {
    state.currentIndex++;
  }
}

function nextHold() {
  if (state.currentIndex < state.activeList.length - 1) {
    state.currentIndex++;
    renderAll();
  }
}

function prevHold() {
  if (state.currentIndex > 0) {
    state.currentIndex--;
    renderAll();
  }
}

function resetFilters() {
  state.searchQuery = '';
  state.filterMaterial = 'all';
  document.querySelectorAll('.filter-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.material === 'all');
  });
  const searchInput = document.getElementById('search-input');
  if (searchInput) searchInput.value = '';
  updateActiveList();
  renderAll();
}

function resetProgress() {
  if (confirm('Are you sure you want to reset all installation progress? This will clear all checked holds.')) {
    state.installedUids.clear();
    saveProgress();
    state.currentIndex = 0;
    renderAll();
  }
}

function setupEvents() {
  // Mode Select
  const modeSelect = document.getElementById('mode-select');
  if (modeSelect) {
    modeSelect.value = state.sortMode;
    modeSelect.addEventListener('change', (e) => {
      state.sortMode = e.target.value;
      updateActiveList();
      renderAll();
    });
  }

  // Material & Box Filters
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const mat = e.currentTarget.dataset.material;
      if (mat === 'Box1' && state.box1Ids.size === 0) {
        openBoxModal();
        return;
      }
      setMaterialFilter(mat);
    });
  });

  // Quick-type input inside Box 1 modal
  const boxQuickInput = document.getElementById('box-quick-input');
  if (boxQuickInput) {
    boxQuickInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleBoxQuickAdd(boxQuickInput.value);
        boxQuickInput.value = '';
      }
    });
  }

  // Search Input
  const searchInput = document.getElementById('search-input');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      state.searchQuery = e.target.value;
      state.currentIndex = 0;
      updateActiveList();
      renderAll();
    });
  }

  // Keyboard Shortcuts
  window.addEventListener('keydown', (e) => {
    // If typing in search input, ignore hotkeys
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') {
      if (e.key === 'Escape') {
        e.target.blur();
      }
      return;
    }

    if (e.code === 'Space' || e.key === 'Enter') {
      e.preventDefault();
      toggleInstalledCurrent();
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      nextHold();
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      prevHold();
    } else if (e.key === 's' || e.key === 'S') {
      e.preventDefault();
      nextHold();
    } else if (e.key === 'u' || e.key === 'U') {
      e.preventDefault();
      toggleInstalledCurrent();
    } else if (e.key === '/' || e.key === 'f') {
      e.preventDefault();
      const input = document.getElementById('search-input');
      if (input) {
        input.focus();
        input.select();
      }
    } else if (e.key === 'Escape') {
      closeModals();
    }
  });

  // Audio Toggle
  const audioBtn = document.getElementById('btn-sound-toggle');
  if (audioBtn) {
    audioBtn.addEventListener('click', () => {
      state.soundEnabled = !state.soundEnabled;
      audioBtn.innerText = state.soundEnabled ? '🔊 Sound On' : '🔇 Muted';
    });
  }
}

// Image Zoom Modal
function openImageModal(imgSrc, title) {
  const modal = document.getElementById('image-modal');
  const img = document.getElementById('image-modal-img');
  const caption = document.getElementById('image-modal-caption');
  if (!modal || !img) return;

  img.src = imgSrc;
  if (caption) caption.innerText = title;
  modal.style.display = 'flex';
}

function openOverviewModal(type = 'cad') {
  if (type === 'cad') {
    openImageModal('board_10x8_overview.png', '10x8 Spray Layout - CAD Schematic Reference (Blue Arrows & Grid)');
  } else if (type === 'render') {
    openImageModal('board_render_overview.png', '10x8 Spray Layout - Official 5000px 3D Shop Render (Physical Clearances)');
  } else if (type === 'real') {
    openImageModal('board_real_overview.jpg?v=subpixel', '10x8 Spray Layout - Real Physical Gym Board (Chalk, Wood Grain & Screws)');
  } else if (type === 'compass') {
    openImageModal('compass_reference.png', 'Official Tension Board 2 Compass Directionality Guide (16-Point Nautical Rose)');
  }
}

function openTipsModal() {
  const modal = document.getElementById('tips-modal');
  if (modal) modal.style.display = 'flex';
}

function setMaterialFilter(mat) {
  state.filterMaterial = mat;
  state.currentIndex = 0;
  document.querySelectorAll('.filter-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.material === mat);
  });
  updateActiveList();
  renderAll();
}

function getPlasticBagGroups() {
  // Group L+R mirrored pairs into single bag chips (matching how Tension bags L/R pairs together)
  const counts = {};
  state.allHolds.forEach(h => {
    if (h.material === 'Plastic') {
      counts[h.hold_id] = (counts[h.hold_id] || 0) + 1;
    }
  });
  const ids = Object.keys(counts);
  const visited = new Set();
  const groups = [];
  ids.sort((a, b) => {
    const na = parseInt(a, 10) || 999;
    const nb = parseInt(b, 10) || 999;
    return na !== nb ? na - nb : a.localeCompare(b);
  });
  ids.forEach(id => {
    if (visited.has(id)) return;
    const m = id.match(/^(\d+)([LR])$/);
    if (m) {
      const base = m[1];
      const leftId = `${base}L`;
      const rightId = `${base}R`;
      if (counts[leftId] && counts[rightId]) {
        visited.add(leftId);
        visited.add(rightId);
        groups.push({
          label: `${base}L/R`,
          ids: [leftId, rightId],
          totalCount: counts[leftId] + counts[rightId]
        });
        return;
      }
    }
    visited.add(id);
    groups.push({ label: id, ids: [id], totalCount: counts[id] });
  });
  return groups;
}

function renderBoxModalChips() {
  const grid = document.getElementById('box-chips-grid');
  const summary = document.getElementById('box-split-summary');
  if (!grid) return;

  const groups = getPlasticBagGroups();
  grid.innerHTML = groups.map(g => {
    const inBox1 = g.ids.every(id => state.box1Ids.has(id));
    const arg = g.ids.join(',');
    return `
      <div class="box-chip ${inBox1 ? 'in-box1' : ''}" onclick="toggleBox1Group('${arg}')">
        <span>${inBox1 ? '✓ ' : ''}${g.label}</span>
        <span class="chip-cnt">${g.totalCount}x</span>
      </div>
    `;
  }).join('');

  const plasticTotal = state.allHolds.filter(h => h.material === 'Plastic').length;
  const box1Total = state.allHolds.filter(h => h.material === 'Plastic' && state.box1Ids.has(h.hold_id)).length;
  if (summary) {
    summary.innerText = `Box 1: ${box1Total} holds • Box 2: ${plasticTotal - box1Total} holds`;
  }
}

function toggleBox1Group(csvIds) {
  const ids = csvIds.split(',');
  const allIn = ids.every(id => state.box1Ids.has(id));
  ids.forEach(id => {
    if (allIn) state.box1Ids.delete(id);
    else state.box1Ids.add(id);
  });
  saveProgress();
  renderBoxModalChips();
  renderStats();
  if (state.filterMaterial === 'Box1' || state.filterMaterial === 'Box2') {
    updateActiveList();
    renderHoldCard();
  }
}

function handleBoxQuickAdd(raw) {
  const tokens = raw.toUpperCase().split(/[\s,;]+/).filter(Boolean);
  if (!tokens.length) return;
  const plasticIds = new Set(state.allHolds.filter(h => h.material === 'Plastic').map(h => h.hold_id));
  tokens.forEach(tok => {
    const cleanTok = tok.replace(/L\/R$/, '');
    if (plasticIds.has(tok)) {
      state.box1Ids.add(tok);
    } else if (/^\d+$/.test(cleanTok)) {
      ['S', 'L', 'R'].forEach(suf => {
        if (plasticIds.has(cleanTok + suf)) state.box1Ids.add(cleanTok + suf);
      });
    }
  });
  saveProgress();
  renderBoxModalChips();
  renderStats();
  if (state.filterMaterial === 'Box1' || state.filterMaterial === 'Box2') {
    updateActiveList();
    renderHoldCard();
  }
}

function clearBox1Selection() {
  state.box1Ids.clear();
  saveProgress();
  renderBoxModalChips();
  renderStats();
  if (state.filterMaterial === 'Box1') {
    setMaterialFilter('Plastic');
  } else {
    updateActiveList();
    renderAll();
  }
}

function openBoxModal() {
  renderBoxModalChips();
  const modal = document.getElementById('box-modal');
  if (modal) modal.style.display = 'flex';
  setTimeout(() => document.getElementById('box-quick-input')?.focus(), 50);
}

function applyBox1FilterAndClose() {
  closeModals();
  if (state.box1Ids.size > 0) {
    setMaterialFilter('Box1');
  }
}

function closeModals() {
  document.querySelectorAll('.modal-overlay').forEach(m => m.style.display = 'none');
}

// Run on page load
window.addEventListener('DOMContentLoaded', init);
