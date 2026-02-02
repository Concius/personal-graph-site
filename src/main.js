import ForceGraph3D from '3d-force-graph';
import * as THREE from 'three';
import { fetchGraphData, fetchNodeContent } from './data.js';

let graphData = { nodes: [], links: [] };
let clusters = {};
let Graph = null;
let activeCluster = 'core';
let searchQuery = '';

const gradientBg = document.getElementById('gradient-bg');
const graphContainer = document.getElementById('graph-container');

// === SETTINGS ===
const defaultSettings = {
  theme: 'default',
  showMinimap: true,
  showMusicPlayer: true,
  showInstructions: true,
  showClusterIndicator: true,
  openInTabs: true
};

const themes = {
  default: { name: 'Amber', bgLight: '#fef3c7', bgDark: '#1c1917' },
  ocean: { name: 'Ocean', bgLight: '#a5f3fc', bgDark: '#0c1929' },
  forest: { name: 'Forest', bgLight: '#bbf7d0', bgDark: '#0a1f0d' },
  sunset: { name: 'Sunset', bgLight: '#fecaca', bgDark: '#2d1b1b' },
  midnight: { name: 'Midnight', bgLight: '#c4b5fd', bgDark: '#0f0a1f' },
  mono: { name: 'Mono', bgLight: '#d4d4d4', bgDark: '#0a0a0a' }
};

let settings = { ...defaultSettings };

function loadSettings() {
  try {
    const saved = localStorage.getItem('graphSiteSettings');
    if (saved) settings = { ...defaultSettings, ...JSON.parse(saved) };
  } catch (e) {}
  applySettings();
}

function saveSettings() {
  try {
    localStorage.setItem('graphSiteSettings', JSON.stringify(settings));
  } catch (e) {}
}

function applySettings() {
  const minimap = document.getElementById('minimap-container');
  const musicPlayer = document.getElementById('music-player');
  const instructions = document.getElementById('instructions');
  const clusterIndicator = document.getElementById('cluster-indicator');
  
  if (minimap) minimap.style.display = settings.showMinimap ? 'block' : 'none';
  if (musicPlayer) musicPlayer.style.display = settings.showMusicPlayer ? 'block' : 'none';
  if (instructions) instructions.style.display = settings.showInstructions ? 'block' : 'none';
  if (clusterIndicator) clusterIndicator.style.display = settings.showClusterIndicator ? 'block' : 'none';
  
  document.querySelectorAll('.toggle-switch[data-setting]').forEach(toggle => {
    toggle.classList.toggle('active', settings[toggle.dataset.setting]);
  });
  
  document.querySelectorAll('.theme-option').forEach(opt => {
    opt.classList.toggle('active', opt.dataset.theme === settings.theme);
  });
}

function initSettings() {
  loadSettings();
  
  const settingsBtn = document.getElementById('settings-btn');
  const settingsPanel = document.getElementById('settings-panel');
  const settingsOverlay = document.getElementById('settings-overlay');
  const settingsClose = settingsPanel?.querySelector('.settings-close');
  const themeGrid = document.getElementById('theme-grid');
  
  if (themeGrid) {
    themeGrid.innerHTML = Object.entries(themes).map(([key, theme]) => `
      <div class="theme-option ${key === settings.theme ? 'active' : ''}" data-theme="${key}">
        <div class="theme-preview" style="background: linear-gradient(to bottom, ${theme.bgLight}, ${theme.bgDark})"></div>
        <div class="theme-name">${theme.name}</div>
      </div>
    `).join('');
  }
  
  const openSettings = () => {
    settingsPanel?.classList.add('visible');
    settingsOverlay?.classList.add('visible');
  };
  
  const closeSettings = () => {
    settingsPanel?.classList.remove('visible');
    settingsOverlay?.classList.remove('visible');
  };
  
  settingsBtn?.addEventListener('click', openSettings);
  settingsClose?.addEventListener('click', closeSettings);
  settingsOverlay?.addEventListener('click', closeSettings);
  
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && settingsPanel?.classList.contains('visible')) closeSettings();
  });
  
  document.querySelectorAll('.theme-option').forEach(opt => {
    opt.addEventListener('click', () => {
      settings.theme = opt.dataset.theme;
      document.querySelectorAll('.theme-option').forEach(o => o.classList.remove('active'));
      opt.classList.add('active');
      saveSettings();
      updateBackground(activeCluster);
    });
  });
  
  document.querySelectorAll('.toggle-switch[data-setting]').forEach(toggle => {
    toggle.classList.toggle('active', settings[toggle.dataset.setting]);
    toggle.addEventListener('click', () => {
      const setting = toggle.dataset.setting;
      settings[setting] = !settings[setting];
      toggle.classList.toggle('active', settings[setting]);
      saveSettings();
      applySettings();
    });
  });
}

// === BACKGROUND ===
function updateBackground(clusterName) {
  const cluster = clusters[clusterName];
  activeCluster = clusterName;
  
  let bgLight, bgDark;
  
  if (cluster) {
    bgLight = cluster.bgLight;
    bgDark = cluster.bgDark;
  } else {
    const theme = themes[settings.theme] || themes.default;
    bgLight = theme.bgLight;
    bgDark = theme.bgDark;
  }
  
  gradientBg.style.background = `linear-gradient(to bottom, ${bgLight} 0%, ${bgDark} 100%)`;
  
  const indicator = document.getElementById('cluster-indicator');
  if (indicator && cluster) {
    indicator.textContent = cluster.name;
    indicator.style.color = cluster.color;
  }
}

// === SEARCH ===
function nodeMatchesSearch(node, query) {
  const q = query.toLowerCase();
  return node.name.toLowerCase().includes(q) ||
    node.id.toLowerCase().includes(q) ||
    (node.description && node.description.toLowerCase().includes(q)) ||
    (clusters[node.group]?.name.toLowerCase().includes(q));
}

function initSearch() {
  const searchInput = document.getElementById('search-input');
  const searchResults = document.getElementById('search-results');
  if (!searchInput || !searchResults) return;
  
  searchInput.addEventListener('input', (e) => performSearch(e.target.value));
  
  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { clearSearch(); searchInput.blur(); }
    if (e.key === 'Enter') {
      const firstResult = searchResults.querySelector('.search-result-item');
      if (firstResult) firstResult.click();
    }
  });
  
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#search-container')) searchResults.classList.remove('visible');
  });
  
  document.addEventListener('keydown', (e) => {
    if (e.key === '/' && document.activeElement !== searchInput) {
      e.preventDefault();
      searchInput.focus();
    }
  });
}

function performSearch(query) {
  searchQuery = query;
  const searchResults = document.getElementById('search-results');
  
  if (Graph) {
    Graph.nodeThreeObject(Graph.nodeThreeObject());
    Graph.linkColor(Graph.linkColor());
  }
  
  if (!query.trim()) {
    searchResults.classList.remove('visible');
    return;
  }
  
  const matches = graphData.nodes.filter(node => nodeMatchesSearch(node, query));
  
  if (matches.length === 0) {
    searchResults.innerHTML = '<div class="search-no-results">No matching nodes</div>';
  } else {
    searchResults.innerHTML = matches.map(node => {
      const cluster = clusters[node.group];
      return `<div class="search-result-item" data-node-id="${node.id}">
        <div class="name" style="color: ${cluster?.color || '#fff'}">${node.name}</div>
        <div class="cluster">${cluster?.name || 'Unknown'}</div>
      </div>`;
    }).join('');
    
    searchResults.querySelectorAll('.search-result-item').forEach(item => {
      item.addEventListener('click', () => {
        const node = graphData.nodes.find(n => n.id === item.dataset.nodeId);
        if (node) {
          createWindow(node);
          updateBackground(node.group);
          focusOnNode(node);
          clearSearch();
        }
      });
    });
  }
  
  searchResults.classList.add('visible');
}

function clearSearch() {
  const searchInput = document.getElementById('search-input');
  const searchResults = document.getElementById('search-results');
  if (searchInput) searchInput.value = '';
  searchQuery = '';
  if (searchResults) searchResults.classList.remove('visible');
  if (Graph) {
    Graph.nodeThreeObject(Graph.nodeThreeObject());
    Graph.linkColor(Graph.linkColor());
  }
}

function focusOnNode(node) {
  if (!Graph) return;
  const distance = 120;
  const distRatio = 1 + distance / Math.hypot(node.x, node.y, node.z);
  Graph.cameraPosition(
    { x: node.x * distRatio, y: node.y * distRatio, z: node.z * distRatio },
    node,
    1000
  );
}

// === WINDOW MANAGEMENT ===
const windowsContainer = document.getElementById('windows-container');
const taskbar = document.getElementById('taskbar');
const taskbarItems = document.getElementById('taskbar-items');

let openWindows = {};
let windowZIndex = 200;

function getWindowSize(node) {
  if (node.id === 'home' || node.group === 'core') return { width: 650, height: 500 };
  return { width: 550, height: 450 };
}

async function createWindow(node, openAsTab = false, targetWindowId = null) {
  if (openAsTab && targetWindowId && openWindows[targetWindowId]) {
    return addTabToWindow(targetWindowId, node);
  }
  
  for (const [windowId, win] of Object.entries(openWindows)) {
    const existingTab = win.tabs.find(t => t.node.id === node.id);
    if (existingTab) {
      switchTab(windowId, existingTab.id);
      restoreWindow(windowId);
      bringToFront(windowId);
      return;
    }
  }
  
  const cluster = clusters[node.group];
  const windowId = `window-${Date.now()}`;
  const tabId = `tab-${Date.now()}`;
  const size = getWindowSize(node);
  
  const windowEl = document.createElement('div');
  windowEl.className = 'content-window';
  windowEl.id = windowId;
  windowEl.style.width = `${size.width}px`;
  windowEl.style.height = `${size.height}px`;
  windowEl.style.left = `${100 + Object.keys(openWindows).length * 30}px`;
  windowEl.style.top = `${80 + Object.keys(openWindows).length * 30}px`;
  windowEl.style.zIndex = ++windowZIndex;
  
  windowEl.innerHTML = `
    <div class="window-header">
      <div class="window-title">
        <span class="window-title-dot" style="background: ${cluster?.color || '#6366f1'}"></span>
        <span class="window-title-text">${node.name}</span>
      </div>
      <div class="window-controls">
        <button class="minimize-btn" title="Minimize">−</button>
        <button class="maximize-btn" title="Maximize">□</button>
        <button class="close-btn" title="Close">×</button>
      </div>
    </div>
    <div class="window-tabs"></div>
    <div class="window-tabs-content">
      <div class="tab-content active" data-tab-id="${tabId}">
        <div class="loading">Loading content...</div>
      </div>
    </div>
    <div class="resize-handle right"></div>
    <div class="resize-handle bottom"></div>
    <div class="resize-handle corner"></div>
  `;
  
  windowsContainer.appendChild(windowEl);
  
  openWindows[windowId] = {
    element: windowEl,
    tabs: [{ id: tabId, node: node, loaded: false }],
    activeTabId: tabId,
    minimized: false,
    maximized: false
  };
  
  setupWindowDrag(windowEl, windowId);
  setupWindowResize(windowEl);
  setupWindowControls(windowEl, windowId);
  windowEl.addEventListener('mousedown', () => bringToFront(windowId));
  bringToFront(windowId);
  
  await loadTabContent(windowId, tabId);
}

async function addTabToWindow(windowId, node) {
  const win = openWindows[windowId];
  if (!win) return;
  
  const existingTab = win.tabs.find(t => t.node.id === node.id);
  if (existingTab) { switchTab(windowId, existingTab.id); return; }
  
  const tabId = `tab-${Date.now()}`;
  win.tabs.push({ id: tabId, node: node, loaded: false });
  
  const tabsContent = win.element.querySelector('.window-tabs-content');
  const tabContentEl = document.createElement('div');
  tabContentEl.className = 'tab-content';
  tabContentEl.dataset.tabId = tabId;
  tabContentEl.innerHTML = '<div class="loading">Loading content...</div>';
  tabsContent.appendChild(tabContentEl);
  
  updateWindowTabs(windowId);
  switchTab(windowId, tabId);
  await loadTabContent(windowId, tabId);
}

async function loadTabContent(windowId, tabId) {
  const win = openWindows[windowId];
  if (!win) return;
  
  const tab = win.tabs.find(t => t.id === tabId);
  if (!tab || tab.loaded) return;
  
  const contentEl = win.element.querySelector(`.tab-content[data-tab-id="${tabId}"]`);
  if (!contentEl) return;
  
  const node = tab.node;
  
  if (node.pageId) {
    try {
      const html = await fetchNodeContent(node.pageId);
      contentEl.innerHTML = `<h1>${node.name}</h1>${html}`;
    } catch (error) {
      contentEl.innerHTML = `<h1>${node.name}</h1><p>${node.description || 'Failed to load content.'}</p>`;
    }
  } else {
    contentEl.innerHTML = `<h1>${node.name}</h1><p>${node.description || 'No content yet.'}</p>`;
  }
  
  tab.loaded = true;
  setupNodeLinks(win.element, windowId);
}

function updateWindowTabs(windowId) {
  const win = openWindows[windowId];
  if (!win) return;
  
  const tabsContainer = win.element.querySelector('.window-tabs');
  
  if (win.tabs.length > 1) {
    tabsContainer.classList.add('visible');
    tabsContainer.innerHTML = win.tabs.map(tab => {
      const cluster = clusters[tab.node.group];
      const isActive = tab.id === win.activeTabId;
      return `<div class="window-tab ${isActive ? 'active' : ''}" data-tab-id="${tab.id}">
        <span class="tab-dot" style="background: ${cluster?.color || '#6366f1'}"></span>
        <span class="tab-title">${tab.node.name}</span>
        <button class="tab-close" title="Close tab">×</button>
      </div>`;
    }).join('');
    
    tabsContainer.querySelectorAll('.window-tab').forEach(tabEl => {
      tabEl.addEventListener('click', (e) => {
        if (e.target.classList.contains('tab-close')) closeTab(windowId, tabEl.dataset.tabId);
        else switchTab(windowId, tabEl.dataset.tabId);
      });
    });
  } else {
    tabsContainer.classList.remove('visible');
  }
  
  const activeTab = win.tabs.find(t => t.id === win.activeTabId);
  if (activeTab) {
    const titleText = win.element.querySelector('.window-title-text');
    const titleDot = win.element.querySelector('.window-title-dot');
    const cluster = clusters[activeTab.node.group];
    if (titleText) titleText.textContent = activeTab.node.name;
    if (titleDot) titleDot.style.background = cluster?.color || '#6366f1';
  }
}

function switchTab(windowId, tabId) {
  const win = openWindows[windowId];
  if (!win) return;
  
  win.activeTabId = tabId;
  win.element.querySelectorAll('.tab-content').forEach(content => {
    content.classList.toggle('active', content.dataset.tabId === tabId);
  });
  updateWindowTabs(windowId);
  
  const activeTab = win.tabs.find(t => t.id === tabId);
  if (activeTab) updateBackground(activeTab.node.group);
}

function closeTab(windowId, tabId) {
  const win = openWindows[windowId];
  if (!win) return;
  
  if (win.tabs.length === 1) { closeWindow(windowId); return; }
  
  const tabIndex = win.tabs.findIndex(t => t.id === tabId);
  if (tabIndex === -1) return;
  
  win.tabs.splice(tabIndex, 1);
  win.element.querySelector(`.tab-content[data-tab-id="${tabId}"]`)?.remove();
  
  if (win.activeTabId === tabId) {
    const newActiveTab = win.tabs[Math.max(0, tabIndex - 1)];
    switchTab(windowId, newActiveTab.id);
  } else {
    updateWindowTabs(windowId);
  }
}

function setupWindowDrag(windowEl, windowId) {
  const header = windowEl.querySelector('.window-header');
  let isDragging = false;
  let startX, startY, startLeft, startTop;
  
  header.addEventListener('mousedown', (e) => {
    if (e.target.tagName === 'BUTTON') return;
    if (openWindows[windowId]?.maximized) return;
    isDragging = true;
    startX = e.clientX;
    startY = e.clientY;
    startLeft = windowEl.offsetLeft;
    startTop = windowEl.offsetTop;
    header.style.cursor = 'grabbing';
  });
  
  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    windowEl.style.left = `${startLeft + e.clientX - startX}px`;
    windowEl.style.top = `${startTop + e.clientY - startY}px`;
  });
  
  document.addEventListener('mouseup', () => {
    if (isDragging) { isDragging = false; header.style.cursor = 'grab'; }
  });
}

function setupWindowResize(windowEl) {
  windowEl.querySelectorAll('.resize-handle').forEach(handle => {
    let isResizing = false;
    let startX, startY, startWidth, startHeight;
    
    handle.addEventListener('mousedown', (e) => {
      isResizing = true;
      startX = e.clientX;
      startY = e.clientY;
      startWidth = windowEl.offsetWidth;
      startHeight = windowEl.offsetHeight;
      e.preventDefault();
      
      const onMouseMove = (e) => {
        if (!isResizing) return;
        if (handle.classList.contains('right') || handle.classList.contains('corner'))
          windowEl.style.width = `${Math.max(300, startWidth + e.clientX - startX)}px`;
        if (handle.classList.contains('bottom') || handle.classList.contains('corner'))
          windowEl.style.height = `${Math.max(200, startHeight + e.clientY - startY)}px`;
      };
      
      const onMouseUp = () => {
        isResizing = false;
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
      };
      
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    });
  });
}

function setupWindowControls(windowEl, windowId) {
  windowEl.querySelector('.minimize-btn').addEventListener('click', (e) => { e.stopPropagation(); minimizeWindow(windowId); });
  windowEl.querySelector('.maximize-btn').addEventListener('click', (e) => { e.stopPropagation(); toggleMaximize(windowId); });
  windowEl.querySelector('.close-btn').addEventListener('click', (e) => { e.stopPropagation(); closeWindow(windowId); });
}

function setupNodeLinks(windowEl, windowId) {
  windowEl.querySelectorAll('.node-link').forEach(link => {
    const newLink = link.cloneNode(true);
    link.parentNode.replaceChild(newLink, link);
    
    newLink.addEventListener('click', (e) => {
      e.preventDefault();
      const targetNode = graphData.nodes.find(n => n.id === newLink.dataset.node);
      if (targetNode) {
        if (settings.openInTabs && windowId) addTabToWindow(windowId, targetNode);
        else createWindow(targetNode);
        updateBackground(targetNode.group);
        focusOnNode(targetNode);
      }
    });
    
    newLink.addEventListener('auxclick', (e) => {
      if (e.button === 1) {
        e.preventDefault();
        const targetNode = graphData.nodes.find(n => n.id === newLink.dataset.node);
        if (targetNode && windowId) addTabToWindow(windowId, targetNode);
      }
    });
  });
}

function bringToFront(windowId) {
  if (openWindows[windowId]) openWindows[windowId].element.style.zIndex = ++windowZIndex;
}

function minimizeWindow(windowId) {
  const win = openWindows[windowId];
  if (!win) return;
  win.minimized = true;
  win.element.classList.add('minimized');
  updateTaskbar();
}

function restoreWindow(windowId) {
  const win = openWindows[windowId];
  if (!win) return;
  win.minimized = false;
  win.element.classList.remove('minimized');
  updateTaskbar();
  bringToFront(windowId);
}

function toggleMaximize(windowId) {
  const win = openWindows[windowId];
  if (!win) return;
  win.maximized = !win.maximized;
  win.element.classList.toggle('maximized');
  win.element.querySelector('.maximize-btn').textContent = win.maximized ? '❐' : '□';
}

function closeWindow(windowId) {
  const win = openWindows[windowId];
  if (!win) return;
  win.element.remove();
  delete openWindows[windowId];
  updateTaskbar();
}

function updateTaskbar() {
  const minimizedWindows = Object.entries(openWindows).filter(([id, win]) => win.minimized);
  
  if (minimizedWindows.length > 0) {
    taskbar.classList.add('visible');
    taskbarItems.innerHTML = minimizedWindows.map(([id, win]) => {
      const activeTab = win.tabs.find(t => t.id === win.activeTabId);
      const node = activeTab?.node || win.tabs[0]?.node;
      const cluster = clusters[node?.group];
      const tabCount = win.tabs.length > 1 ? ` (${win.tabs.length})` : '';
      return `<div class="taskbar-item" data-window-id="${id}">
        <span class="dot" style="background: ${cluster?.color || '#6366f1'}"></span>
        ${node?.name || 'Window'}${tabCount}
      </div>`;
    }).join('');
    
    taskbarItems.querySelectorAll('.taskbar-item').forEach(item => {
      item.addEventListener('click', () => restoreWindow(item.dataset.windowId));
    });
  } else {
    taskbar.classList.remove('visible');
  }
}

// === MINIMAP ===
function initMinimap() {
  const minimapEl = document.getElementById('minimap');
  const minimapContainer = document.getElementById('minimap-container');
  const cameraIndicator = document.getElementById('camera-indicator');
  const minimapHeader = document.getElementById('minimap-header');
  
  if (!minimapEl || !Graph) return;
  
  let minimapScale = 0.15;
  let minimapOffset = { x: 0, y: 0 };
  
  const canvas = document.createElement('canvas');
  canvas.width = 180;
  canvas.height = 152;
  minimapEl.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  
  function updateMinimap() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    
    graphData.links.forEach(link => {
      const source = typeof link.source === 'object' ? link.source : graphData.nodes.find(n => n.id === link.source);
      const target = typeof link.target === 'object' ? link.target : graphData.nodes.find(n => n.id === link.target);
      if (source?.x && target?.x) {
        ctx.beginPath();
        ctx.moveTo(centerX + (source.x + minimapOffset.x) * minimapScale, centerY + (source.y + minimapOffset.y) * minimapScale);
        ctx.lineTo(centerX + (target.x + minimapOffset.x) * minimapScale, centerY + (target.y + minimapOffset.y) * minimapScale);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.stroke();
      }
    });
    
    graphData.nodes.forEach(node => {
      if (node.x === undefined) return;
      const x = centerX + (node.x + minimapOffset.x) * minimapScale;
      const y = centerY + (node.y + minimapOffset.y) * minimapScale;
      const cluster = clusters[node.group];
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fillStyle = cluster?.color || '#6366f1';
      ctx.fill();
    });
    
    const camera = Graph.camera();
    const camX = centerX + (camera.position.x * 0.1 + minimapOffset.x) * minimapScale;
    const camY = centerY + (camera.position.y * 0.1 + minimapOffset.y) * minimapScale;
    cameraIndicator.style.left = `${camX + 10}px`;
    cameraIndicator.style.top = `${camY + 28}px`;
    
    requestAnimationFrame(updateMinimap);
  }
  
  updateMinimap();
  
  document.getElementById('minimap-zoom-in')?.addEventListener('click', () => { minimapScale = Math.min(0.5, minimapScale * 1.2); });
  document.getElementById('minimap-zoom-out')?.addEventListener('click', () => { minimapScale = Math.max(0.05, minimapScale / 1.2); });
  
  canvas.addEventListener('click', (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) - canvas.width / 2) / minimapScale - minimapOffset.x;
    const y = ((e.clientY - rect.top) - canvas.height / 2) / minimapScale - minimapOffset.y;
    
    let closestNode = null;
    let closestDist = Infinity;
    graphData.nodes.forEach(node => {
      if (node.x === undefined) return;
      const dist = Math.hypot(node.x - x, node.y - y);
      if (dist < closestDist) { closestDist = dist; closestNode = node; }
    });
    
    if (closestNode && closestDist < 50) {
      focusOnNode(closestNode);
      updateBackground(closestNode.group);
    }
  });
  
  let isDragging = false;
  let dragOffset = { x: 0, y: 0 };
  
  minimapHeader?.addEventListener('mousedown', (e) => {
    if (e.target.tagName === 'BUTTON') return;
    isDragging = true;
    dragOffset.x = e.clientX - minimapContainer.offsetLeft;
    dragOffset.y = e.clientY - minimapContainer.offsetTop;
    minimapHeader.style.cursor = 'grabbing';
  });
  
  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    minimapContainer.style.left = `${e.clientX - dragOffset.x}px`;
    minimapContainer.style.top = `${e.clientY - dragOffset.y}px`;
    minimapContainer.style.right = 'auto';
    minimapContainer.style.bottom = 'auto';
  });
  
  document.addEventListener('mouseup', () => {
    if (isDragging) { isDragging = false; minimapHeader.style.cursor = 'grab'; }
  });
}

// === MAIN INIT ===
async function init() {
  graphContainer.innerHTML = '<div class="loading">Loading graph from Notion...</div>';
  
  try {
    const data = await fetchGraphData();
    graphData = { nodes: data.nodes, links: data.links };
    clusters = data.clusters;
    
    graphContainer.innerHTML = '';
    updateBackground('core');
    
    Graph = ForceGraph3D({ rendererConfig: { antialias: true, alpha: true } })(graphContainer)
      .graphData(graphData)
      .nodeLabel('name')
      .nodeThreeObject(node => {
        const baseColor = clusters[node.group]?.color || '#6366f1';
        const isMatch = !searchQuery || nodeMatchesSearch(node, searchQuery);
        const geometry = new THREE.SphereGeometry(Math.cbrt(node.weight || 1) * 4, 16, 16);
        const material = new THREE.MeshLambertMaterial({
          color: isMatch ? baseColor : '#222222',
          transparent: true,
          opacity: isMatch ? 0.9 : 0.15
        });
        return new THREE.Mesh(geometry, material);
      })
      .nodeThreeObjectExtend(false)
      .linkColor(link => {
        const sourceNode = typeof link.source === 'object' ? link.source : graphData.nodes.find(n => n.id === link.source);
        const cluster = clusters[sourceNode?.group];
        if (searchQuery) return 'rgba(255, 255, 255, 0.05)';
        return cluster ? cluster.color + '40' : 'rgba(255, 255, 255, 0.2)';
      })
      .linkWidth(1.5)
      .linkOpacity(0.8)
      .onNodeClick(node => {
        createWindow(node);
        updateBackground(node.group);
        focusOnNode(node);
        clearSearch();
      })
      .onNodeHover(node => { document.body.style.cursor = node ? 'pointer' : 'default'; })
      .backgroundColor('rgba(0,0,0,0)');
    
    Graph.d3Force('cluster', alpha => {
      const clusterCenters = {};
      graphData.nodes.forEach(node => {
        if (!clusterCenters[node.group]) clusterCenters[node.group] = { x: 0, y: 0, z: 0, count: 0 };
        clusterCenters[node.group].x += node.x || 0;
        clusterCenters[node.group].y += node.y || 0;
        clusterCenters[node.group].z += node.z || 0;
        clusterCenters[node.group].count++;
      });
      
      Object.keys(clusterCenters).forEach(group => {
        const c = clusterCenters[group];
        c.x /= c.count; c.y /= c.count; c.z /= c.count;
      });
      
      graphData.nodes.forEach(node => {
        const center = clusterCenters[node.group];
        if (center && node.x !== undefined) {
          node.vx += (center.x - node.x) * alpha * 0.3;
          node.vy += (center.y - node.y) * alpha * 0.3;
          node.vz += (center.z - node.z) * alpha * 0.3;
        }
      });
    });
    
    Graph.d3Force('charge').strength(-120);
    Graph.d3Force('link').distance(50);
    
    initSearch();
    initMinimap();
    initSettings();
    initMusicPlayer();
    
  } catch (error) {
    console.error('Failed to initialize graph:', error);
    graphContainer.innerHTML = '<div class="loading error">Failed to load graph. Please refresh.</div>';
  }
}

// === MUSIC PLAYER ===
function initMusicPlayer() {
  const audio = new Audio();
  const playlist = [
    { title: 'Ambient Track 1', src: '/music/track1.mp3' },
    { title: 'Ambient Track 2', src: '/music/track2.mp3' }
  ];
  let currentIndex = 0;
  let isPlaying = false;
  
  const playBtn = document.getElementById('play-btn');
  const prevBtn = document.getElementById('prev-btn');
  const nextBtn = document.getElementById('next-btn');
  const trackName = document.getElementById('track-name');
  const volumeSlider = document.getElementById('volume-slider');
  const volumeIcon = document.getElementById('volume-icon');
  const progressBar = document.getElementById('progress-bar');
  const progressContainer = document.getElementById('progress-container');
  const playerHeader = document.getElementById('player-header');
  const playerBody = document.getElementById('player-body');
  const toggleBtn = document.getElementById('player-toggle-btn');
  const playerEl = document.getElementById('music-player');
  
  audio.volume = 0.5;
  
  function updateTrackInfo() {
    if (playlist.length === 0) { trackName.textContent = 'No tracks found'; return; }
    trackName.textContent = playlist[currentIndex].title;
  }
  
  function loadTrack(index) {
    if (index < 0 || index >= playlist.length) return;
    currentIndex = index;
    audio.src = playlist[index].src;
    updateTrackInfo();
  }
  
  updateTrackInfo();
  
  playBtn?.addEventListener('click', () => {
    if (isPlaying) {
      audio.pause();
      isPlaying = false;
      playBtn.textContent = '▶';
    } else {
      if (!audio.src) loadTrack(0);
      audio.play().catch(() => { trackName.textContent = 'Add music to /public/music/'; });
      isPlaying = true;
      playBtn.textContent = '⏸';
    }
  });
  
  prevBtn?.addEventListener('click', () => {
    loadTrack(currentIndex > 0 ? currentIndex - 1 : playlist.length - 1);
    if (isPlaying) audio.play();
  });
  
  nextBtn?.addEventListener('click', () => {
    loadTrack(currentIndex < playlist.length - 1 ? currentIndex + 1 : 0);
    if (isPlaying) audio.play();
  });
  
  volumeSlider?.addEventListener('input', (e) => {
    audio.volume = e.target.value / 100;
    volumeIcon.textContent = audio.volume === 0 ? '🔇' : audio.volume < 0.5 ? '🔉' : '🔊';
  });
  
  let lastVolume = 0.5;
  volumeIcon?.addEventListener('click', () => {
    if (audio.volume > 0) { lastVolume = audio.volume; audio.volume = 0; volumeSlider.value = 0; }
    else { audio.volume = lastVolume; volumeSlider.value = audio.volume * 100; }
    volumeIcon.textContent = audio.volume === 0 ? '🔇' : audio.volume < 0.5 ? '🔉' : '🔊';
  });
  
  audio.addEventListener('timeupdate', () => {
    if (audio.duration) progressBar.style.width = `${(audio.currentTime / audio.duration) * 100}%`;
  });
  
  audio.addEventListener('ended', () => {
    loadTrack(currentIndex < playlist.length - 1 ? currentIndex + 1 : 0);
    audio.play();
  });
  
  progressContainer?.addEventListener('click', (e) => {
    if (!audio.duration) return;
    const rect = progressContainer.getBoundingClientRect();
    audio.currentTime = ((e.clientX - rect.left) / rect.width) * audio.duration;
  });
  
  toggleBtn?.addEventListener('click', () => {
    playerBody.classList.toggle('collapsed');
    toggleBtn.textContent = playerBody.classList.contains('collapsed') ? '+' : '−';
  });
  
  let isDragging = false;
  let offset = { x: 0, y: 0 };
  
  playerHeader?.addEventListener('mousedown', (e) => {
    if (e.target.tagName === 'BUTTON') return;
    isDragging = true;
    offset.x = e.clientX - playerEl.offsetLeft;
    offset.y = e.clientY - playerEl.offsetTop;
    playerHeader.style.cursor = 'grabbing';
  });
  
  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    playerEl.style.left = `${e.clientX - offset.x}px`;
    playerEl.style.top = `${e.clientY - offset.y}px`;
    playerEl.style.right = 'auto';
  });
  
  document.addEventListener('mouseup', () => {
    if (isDragging) { isDragging = false; playerHeader.style.cursor = 'grab'; }
  });
}

init();
