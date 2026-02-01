import ForceGraph3D from '3d-force-graph';
import * as THREE from 'three';
import { fetchGraphData, fetchNodeContent } from './data.js';

// Global state - will be populated after fetching from Notion
let graphData = { nodes: [], links: [] };
let clusters = {};
let Graph = null;

// Track current active cluster for theming
let activeCluster = 'core';
let searchQuery = '';

// DOM elements
const gradientBg = document.getElementById('gradient-bg');
const graphContainer = document.getElementById('graph-container');

// Update background colors based on active cluster
function updateBackground(clusterName) {
  const cluster = clusters[clusterName] || clusters.core || {
    name: 'Core',
    color: '#f59e0b',
    bgLight: '#fef3c7',
    bgDark: '#1c1917'
  };
  activeCluster = clusterName;
  
  gradientBg.style.background = `linear-gradient(
    to bottom,
    ${cluster.bgLight} 0%,
    ${cluster.bgDark} 100%
  )`;
  
  const indicator = document.getElementById('cluster-indicator');
  if (indicator) {
    indicator.textContent = cluster.name;
    indicator.style.color = cluster.color;
  }
}

// Search functionality
function nodeMatchesSearch(node, query) {
  const q = query.toLowerCase();
  return (
    node.name.toLowerCase().includes(q) ||
    node.id.toLowerCase().includes(q) ||
    (node.description && node.description.toLowerCase().includes(q)) ||
    (clusters[node.group]?.name.toLowerCase().includes(q))
  );
}

// === MAIN INITIALIZATION ===
async function init() {
  // Show loading state
  graphContainer.innerHTML = '<div class="loading">Loading graph from Notion...</div>';
  
  try {
    // Fetch data from Notion
    const data = await fetchGraphData();
    graphData = { nodes: data.nodes, links: data.links };
    clusters = data.clusters;
    
    // Clear loading state
    graphContainer.innerHTML = '';
    
    // Initialize background with default cluster
    updateBackground('core');
    
    // Initialize the 3D graph
    Graph = ForceGraph3D({ rendererConfig: { antialias: true, alpha: true } })
      (graphContainer)
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
        const sourceNode = typeof link.source === 'object' ? link.source : 
          graphData.nodes.find(n => n.id === link.source);
        const cluster = clusters[sourceNode?.group];
        
        if (searchQuery) {
          return 'rgba(255, 255, 255, 0.05)';
        }
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
      .onNodeHover(node => {
        document.body.style.cursor = node ? 'pointer' : 'default';
      })
      .backgroundColor('rgba(0,0,0,0)');
    
    // Setup clustering force
    Graph.d3Force('cluster', alpha => {
      const clusterCenters = {};
      
      graphData.nodes.forEach(node => {
        if (!clusterCenters[node.group]) {
          clusterCenters[node.group] = { x: 0, y: 0, z: 0, count: 0 };
        }
        clusterCenters[node.group].x += node.x || 0;
        clusterCenters[node.group].y += node.y || 0;
        clusterCenters[node.group].z += node.z || 0;
        clusterCenters[node.group].count++;
      });
      
      Object.keys(clusterCenters).forEach(group => {
        const c = clusterCenters[group];
        c.x /= c.count;
        c.y /= c.count;
        c.z /= c.count;
      });
      
      const strength = 0.3;
      graphData.nodes.forEach(node => {
        const center = clusterCenters[node.group];
        if (center && node.x !== undefined) {
          node.vx += (center.x - node.x) * alpha * strength;
          node.vy += (center.y - node.y) * alpha * strength;
          node.vz += (center.z - node.z) * alpha * strength;
        }
      });
    });
    
    Graph.d3Force('charge').strength(-120);
    Graph.d3Force('link').distance(50);
    
    // Setup background click handler
    Graph.onBackgroundClick(() => {
      window.closePanel();
    });
    
    // Initialize other components
    initSearch();
    initMinimap();
    initWindowResize();
    
  } catch (error) {
    console.error('Failed to initialize graph:', error);
    graphContainer.innerHTML = '<div class="loading error">Failed to load graph. Please refresh the page.</div>';
  }
}

// === SEARCH FUNCTIONALITY ===
function initSearch() {
  const searchInput = document.getElementById('search-input');
  const searchResults = document.getElementById('search-results');
  
  if (!searchInput || !searchResults) return;
  
  searchInput.addEventListener('input', (e) => {
    performSearch(e.target.value);
  });
  
  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      clearSearch();
      searchInput.blur();
    }
    
    if (e.key === 'Enter') {
      const firstResult = searchResults.querySelector('.search-result-item');
      if (firstResult) {
        firstResult.click();
      }
    }
  });
  
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#search-container')) {
      searchResults.classList.remove('visible');
    }
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
  
  // Refresh node appearance
  if (Graph) {
    Graph.nodeThreeObject(Graph.nodeThreeObject());
    Graph.linkColor(Graph.linkColor());
  }
  
  if (!query.trim()) {
    searchResults.classList.remove('visible');
    searchResults.innerHTML = '';
    return;
  }
  
  const matches = graphData.nodes.filter(node => nodeMatchesSearch(node, query));
  
  if (matches.length === 0) {
    searchResults.innerHTML = '<div class="search-no-results">No matching nodes</div>';
    searchResults.classList.add('visible');
    return;
  }
  
  searchResults.innerHTML = matches.map(node => {
    const cluster = clusters[node.group];
    return `
      <div class="search-result-item" data-node-id="${node.id}">
        <div class="name" style="color: ${cluster?.color || '#fff'}">${node.name}</div>
        <div class="cluster">${cluster?.name || 'Unknown'}</div>
      </div>
    `;
  }).join('');
  
  searchResults.classList.add('visible');
  
  searchResults.querySelectorAll('.search-result-item').forEach(item => {
    item.addEventListener('click', () => {
      const nodeId = item.dataset.nodeId;
      const node = graphData.nodes.find(n => n.id === nodeId);
      if (node) {
        createWindow(node);
        updateBackground(node.group);
        focusOnNode(node);
        clearSearch();
      }
    });
  });
}

function clearSearch() {
  const searchInput = document.getElementById('search-input');
  const searchResults = document.getElementById('search-results');
  
  if (searchInput) searchInput.value = '';
  searchQuery = '';
  if (searchResults) {
    searchResults.classList.remove('visible');
    searchResults.innerHTML = '';
  }
  
  // Refresh node appearance
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
    { 
      x: node.x * distRatio, 
      y: node.y * distRatio, 
      z: node.z * distRatio 
    },
    node,
    1500
  );
}

// === PANEL FUNCTIONS ===
function showPanel(node) {
  const panel = document.getElementById('info-panel');
  const title = document.getElementById('panel-title');
  const description = document.getElementById('panel-description');
  const clusterBadge = document.getElementById('panel-cluster');
  
  if (!panel) return;
  
  const cluster = clusters[node.group];
  
  title.textContent = node.name;
  title.style.color = cluster?.color || '#fff';
  description.textContent = node.description || 'No description yet.';
  clusterBadge.textContent = cluster?.name || 'Unknown';
  clusterBadge.style.borderColor = cluster?.color || '#666';
  clusterBadge.style.color = cluster?.color || '#666';
  
  panel.classList.add('visible');
}

window.closePanel = function() {
  const panel = document.getElementById('info-panel');
  if (panel) panel.classList.remove('visible');
};

// === WINDOW RESIZE ===
function initWindowResize() {
  window.addEventListener('resize', () => {
    if (Graph) {
      Graph.width(window.innerWidth);
      Graph.height(window.innerHeight);
    }
  });
}

// === MINIMAP ===
function initMinimap() {
  const minimapContainer = document.getElementById('minimap-container');
  const minimapEl = document.getElementById('minimap');
  const cameraIndicator = document.getElementById('camera-indicator');
  
  if (!minimapEl || !Graph) return;
  
  // Create minimap renderer
  const minimapRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  minimapRenderer.setSize(180, 152);
  minimapEl.appendChild(minimapRenderer.domElement);
  
  // Zoom level for minimap
  let minimapZoom = 200;
  const MIN_ZOOM = 50;
  const MAX_ZOOM = 500;
  
  // Minimap camera offset (for panning)
  let minimapCameraOffset = { x: 0, z: 0 };
  
  // Orthographic camera for top-down view
  const minimapCamera = new THREE.OrthographicCamera(-minimapZoom, minimapZoom, minimapZoom, -minimapZoom, 1, 1000);
  minimapCamera.position.set(0, 300, 0);
  minimapCamera.lookAt(0, 0, 0);
  
  function updateMinimapCamera() {
    minimapCamera.left = -minimapZoom;
    minimapCamera.right = minimapZoom;
    minimapCamera.top = minimapZoom;
    minimapCamera.bottom = -minimapZoom;
    minimapCamera.updateProjectionMatrix();
  }
  
  function updateMinimapCameraPosition() {
    minimapCamera.position.set(minimapCameraOffset.x, 300, minimapCameraOffset.z);
    minimapCamera.lookAt(minimapCameraOffset.x, 0, minimapCameraOffset.z);
  }
  
  // Get the main scene from the graph
  const scene = Graph.scene();
  
  // Render minimap on each frame
  function updateMinimap() {
    minimapRenderer.render(scene, minimapCamera);
    
    // Update camera indicator position
    const mainCamera = Graph.camera();
    const pos = mainCamera.position;
    
    const mapSize = 152;
    const worldRange = minimapZoom * 2;
    
    // Account for minimap camera offset
    const x = ((pos.x - minimapCameraOffset.x + minimapZoom) / worldRange) * mapSize;
    const z = ((pos.z - minimapCameraOffset.z + minimapZoom) / worldRange) * mapSize;
    
    cameraIndicator.style.left = `${Math.max(0, Math.min(mapSize, x))}px`;
    cameraIndicator.style.top = `${28 + Math.max(0, Math.min(mapSize, z))}px`;
    
    requestAnimationFrame(updateMinimap);
  }
  
  updateMinimap();
  
  // === MINIMAP ZOOM ===
  function minimapZoomIn() {
    minimapZoom = Math.max(MIN_ZOOM, minimapZoom - 30);
    updateMinimapCamera();
  }
  
  function minimapZoomOut() {
    minimapZoom = Math.min(MAX_ZOOM, minimapZoom + 30);
    updateMinimapCamera();
  }
  
  const zoomInBtn = document.getElementById('minimap-zoom-in');
  const zoomOutBtn = document.getElementById('minimap-zoom-out');
  
  if (zoomInBtn) {
    zoomInBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      minimapZoomIn();
    });
  }
  
  if (zoomOutBtn) {
    zoomOutBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      minimapZoomOut();
    });
  }
  
  minimapEl.addEventListener('wheel', (e) => {
    e.preventDefault();
    if (e.deltaY < 0) {
      minimapZoomIn();
    } else {
      minimapZoomOut();
    }
  });
  
  // === MINIMAP CLICK & DRAG NAVIGATION ===
  let isMinimapDragging = false;
  let minimapDragStart = { x: 0, y: 0 };
  let hasDragged = false;
  
  function getWorldCoordsFromMinimap(clientX, clientY) {
    const rect = minimapEl.getBoundingClientRect();
    const clickX = clientX - rect.left;
    const clickY = clientY - rect.top;
    
    const mapWidth = rect.width;
    const mapHeight = rect.height;
    
    const worldX = ((clickX / mapWidth) - 0.5) * minimapZoom * 2 + minimapCameraOffset.x;
    const worldZ = ((clickY / mapHeight) - 0.5) * minimapZoom * 2 + minimapCameraOffset.z;
    
    return { x: worldX, z: worldZ };
  }
  
  function findClosestNode(worldX, worldZ, tolerance = 30) {
    let closestNode = null;
    let closestDist = Infinity;
    
    graphData.nodes.forEach(node => {
      const dx = (node.x || 0) - worldX;
      const dz = (node.z || 0) - worldZ;
      const dist = Math.sqrt(dx * dx + dz * dz);
      
      if (dist < closestDist && dist < tolerance) {
        closestDist = dist;
        closestNode = node;
      }
    });
    
    return closestNode;
  }
  
  minimapEl.addEventListener('mousedown', (e) => {
    isMinimapDragging = true;
    hasDragged = false;
    minimapDragStart = { x: e.clientX, y: e.clientY };
    minimapEl.style.cursor = 'grabbing';
  });
  
  document.addEventListener('mousemove', (e) => {
    if (isMinimapDragging) {
      const dx = e.clientX - minimapDragStart.x;
      const dy = e.clientY - minimapDragStart.y;
      
      if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
        hasDragged = true;
        
        const rect = minimapEl.getBoundingClientRect();
        const scaleX = (minimapZoom * 2) / rect.width;
        const scaleZ = (minimapZoom * 2) / rect.height;
        
        minimapCameraOffset.x -= dx * scaleX;
        minimapCameraOffset.z -= dy * scaleZ;
        
        updateMinimapCameraPosition();
        
        minimapDragStart = { x: e.clientX, y: e.clientY };
      }
    }
  });
  
  document.addEventListener('mouseup', (e) => {
    if (isMinimapDragging) {
      isMinimapDragging = false;
      minimapEl.style.cursor = 'default';
      
      if (!hasDragged) {
        const coords = getWorldCoordsFromMinimap(e.clientX, e.clientY);
        const closestNode = findClosestNode(coords.x, coords.z);
        
        if (closestNode) {
          createWindow(closestNode);
          updateBackground(closestNode.group);
          focusOnNode(closestNode);
        }
      }
    }
  });
  
  minimapEl.addEventListener('mousemove', (e) => {
    if (isMinimapDragging) return;
    
    const coords = getWorldCoordsFromMinimap(e.clientX, e.clientY);
    const overNode = findClosestNode(coords.x, coords.z);
    minimapEl.style.cursor = overNode ? 'pointer' : 'grab';
  });
  
  // === MINIMAP CONTAINER DRAGGING ===
  let isContainerDragging = false;
  let containerDragOffset = { x: 0, y: 0 };
  
  const minimapHeader = document.getElementById('minimap-header');
  
  if (minimapHeader) {
    minimapHeader.addEventListener('mousedown', (e) => {
      if (e.target.tagName !== 'BUTTON') {
        isContainerDragging = true;
        containerDragOffset.x = e.clientX - minimapContainer.offsetLeft;
        containerDragOffset.y = e.clientY - minimapContainer.offsetTop;
        minimapHeader.style.cursor = 'grabbing';
      }
    });
  }
  
  document.addEventListener('mousemove', (e) => {
    if (isContainerDragging) {
      minimapContainer.style.left = `${e.clientX - containerDragOffset.x}px`;
      minimapContainer.style.top = `${e.clientY - containerDragOffset.y}px`;
      minimapContainer.style.right = 'auto';
      minimapContainer.style.bottom = 'auto';
    }
  });
  
  document.addEventListener('mouseup', () => {
    if (isContainerDragging) {
      isContainerDragging = false;
      if (minimapHeader) minimapHeader.style.cursor = 'grab';
    }
  });
}


// === WINDOW MANAGEMENT ===

const windowsContainer = document.getElementById('windows-container');
const taskbar = document.getElementById('taskbar');
const taskbarItems = document.getElementById('taskbar-items');

let openWindows = {};
let windowZIndex = 200;
let activeWindowId = null;

async function createWindow(node) {
  // If window already exists, focus it
  if (openWindows[node.id]) {
    restoreWindow(node.id);
    bringToFront(node.id);
    return;
  }
  
  const cluster = clusters[node.group];
  const windowId = node.id;
  
  // Create window element with loading state
  const windowEl = document.createElement('div');
  windowEl.className = 'content-window';
  windowEl.id = `window-${windowId}`;
  windowEl.style.width = '500px';
  windowEl.style.height = '400px';
  windowEl.style.left = `${100 + Object.keys(openWindows).length * 30}px`;
  windowEl.style.top = `${80 + Object.keys(openWindows).length * 30}px`;
  windowEl.style.zIndex = ++windowZIndex;
  
  windowEl.innerHTML = `
    <div class="window-header">
      <div class="window-title">
        <span class="window-title-dot" style="background: ${cluster?.color || '#6366f1'}"></span>
        ${node.name}
      </div>
      <div class="window-controls">
        <button class="minimize-btn" title="Minimize">−</button>
        <button class="maximize-btn" title="Maximize">□</button>
        <button class="close-btn" title="Close">×</button>
      </div>
    </div>
    <div class="window-content">
      <div class="loading">Loading content...</div>
    </div>
    <div class="resize-handle right"></div>
    <div class="resize-handle bottom"></div>
    <div class="resize-handle corner"></div>
  `;
  
  windowsContainer.appendChild(windowEl);
  
  // Store window reference
  openWindows[windowId] = {
    element: windowEl,
    node: node,
    minimized: false,
    maximized: false
  };
  
  // Setup event listeners
  setupWindowDrag(windowEl, windowId);
  setupWindowResize(windowEl);
  setupWindowControls(windowEl, windowId);
  
  windowEl.addEventListener('mousedown', () => bringToFront(windowId));
  bringToFront(windowId);
  
  // Fetch content from Notion
  const contentEl = windowEl.querySelector('.window-content');
  
  if (node.pageId) {
    try {
      const html = await fetchNodeContent(node.pageId);
      contentEl.innerHTML = `<h1>${node.name}</h1>${html}`;
    } catch (error) {
      console.error('Failed to load content:', error);
      contentEl.innerHTML = `<h1>${node.name}</h1><p>${node.description || 'Failed to load content.'}</p>`;
    }
  } else {
    contentEl.innerHTML = `<h1>${node.name}</h1><p>${node.description || 'No content yet.'}</p>`;
  }
  
  // Setup node links after content loads
  setupNodeLinks(windowEl);
}

function setupWindowDrag(windowEl, windowId) {
  const header = windowEl.querySelector('.window-header');
  let isDragging = false;
  let startX, startY, startLeft, startTop;
  
  header.addEventListener('mousedown', (e) => {
    if (e.target.tagName === 'BUTTON') return;
    if (openWindows[windowId].maximized) return;
    
    isDragging = true;
    startX = e.clientX;
    startY = e.clientY;
    startLeft = windowEl.offsetLeft;
    startTop = windowEl.offsetTop;
    
    header.style.cursor = 'grabbing';
  });
  
  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    
    windowEl.style.left = `${startLeft + dx}px`;
    windowEl.style.top = `${startTop + dy}px`;
  });
  
  document.addEventListener('mouseup', () => {
    if (isDragging) {
      isDragging = false;
      header.style.cursor = 'grab';
    }
  });
}

function setupWindowResize(windowEl) {
  const handles = windowEl.querySelectorAll('.resize-handle');
  
  handles.forEach(handle => {
    let isResizing = false;
    let startX, startY, startWidth, startHeight;
    
    handle.addEventListener('mousedown', (e) => {
      isResizing = true;
      startX = e.clientX;
      startY = e.clientY;
      startWidth = windowEl.offsetWidth;
      startHeight = windowEl.offsetHeight;
      
      e.preventDefault();
      e.stopPropagation();
      
      const onMouseMove = (e) => {
        if (!isResizing) return;
        
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        
        if (handle.classList.contains('right') || handle.classList.contains('corner')) {
          windowEl.style.width = `${Math.max(300, startWidth + dx)}px`;
        }
        
        if (handle.classList.contains('bottom') || handle.classList.contains('corner')) {
          windowEl.style.height = `${Math.max(200, startHeight + dy)}px`;
        }
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
  const minimizeBtn = windowEl.querySelector('.minimize-btn');
  const maximizeBtn = windowEl.querySelector('.maximize-btn');
  const closeBtn = windowEl.querySelector('.close-btn');
  
  minimizeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    minimizeWindow(windowId);
  });
  
  maximizeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleMaximize(windowId);
  });
  
  closeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    closeWindow(windowId);
  });
}

function setupNodeLinks(windowEl) {
  const nodeLinks = windowEl.querySelectorAll('.node-link');
  
  nodeLinks.forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const targetNodeId = link.dataset.node;
      const targetNode = graphData.nodes.find(n => n.id === targetNodeId);
      
      if (targetNode) {
        createWindow(targetNode);
        updateBackground(targetNode.group);
        focusOnNode(targetNode);
      }
    });
  });
}

function bringToFront(windowId) {
  if (openWindows[windowId]) {
    openWindows[windowId].element.style.zIndex = ++windowZIndex;
    activeWindowId = windowId;
  }
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
  
  const btn = win.element.querySelector('.maximize-btn');
  btn.textContent = win.maximized ? '❐' : '□';
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
      const cluster = clusters[win.node.group];
      return `
        <div class="taskbar-item" data-window-id="${id}">
          <span class="dot" style="background: ${cluster?.color || '#6366f1'}"></span>
          ${win.node.name}
        </div>
      `;
    }).join('');
    
    taskbarItems.querySelectorAll('.taskbar-item').forEach(item => {
      item.addEventListener('click', () => {
        restoreWindow(item.dataset.windowId);
      });
    });
  } else {
    taskbar.classList.remove('visible');
  }
}

// Start the app
init();


// === MUSIC PLAYER ===

const musicPlayer = {
  audio: new Audio(),
  playlist: [],
  currentIndex: 0,
  isPlaying: false,
  
  // DOM elements
  playBtn: document.getElementById('play-btn'),
  prevBtn: document.getElementById('prev-btn'),
  nextBtn: document.getElementById('next-btn'),
  trackName: document.getElementById('track-name'),
  volumeSlider: document.getElementById('volume-slider'),
  volumeIcon: document.getElementById('volume-icon'),
  progressBar: document.getElementById('progress-bar'),
  progressContainer: document.getElementById('progress-container'),
  playerHeader: document.getElementById('player-header'),
  playerBody: document.getElementById('player-body'),
  toggleBtn: document.getElementById('player-toggle-btn'),
  playerEl: document.getElementById('music-player'),
  
  init() {
    // Default playlist - can be configured
    this.playlist = [
      { title: 'Ambient Track 1', src: 'public/music/01-02. Your Own Personal Universe.mp3' },
      { title: 'Ambient Track 2', src: 'public/music/01-04. Sporepedia Galactica.mp3' },
      { title: 'Ambient Track 3', src: 'public/music/08. Heal.mp3' }
    ];
    
    // Set initial volume
    this.audio.volume = 0.5;
    
    // Event listeners
    this.playBtn?.addEventListener('click', () => this.togglePlay());
    this.prevBtn?.addEventListener('click', () => this.prevTrack());
    this.nextBtn?.addEventListener('click', () => this.nextTrack());
    this.volumeSlider?.addEventListener('input', (e) => this.setVolume(e.target.value));
    this.volumeIcon?.addEventListener('click', () => this.toggleMute());
    this.progressContainer?.addEventListener('click', (e) => this.seek(e));
    this.toggleBtn?.addEventListener('click', () => this.toggleCollapse());
    
    // Audio events
    this.audio.addEventListener('timeupdate', () => this.updateProgress());
    this.audio.addEventListener('ended', () => this.nextTrack());
    this.audio.addEventListener('error', () => this.handleError());
    
    // Draggable player
    this.initDrag();
    
    // Load first track info (don't autoplay)
    this.updateTrackInfo();
  },
  
  togglePlay() {
    if (this.playlist.length === 0) return;
    
    if (this.isPlaying) {
      this.audio.pause();
      this.isPlaying = false;
      this.playBtn.textContent = '▶';
    } else {
      // Load track if not loaded
      if (!this.audio.src || this.audio.src === '') {
        this.loadTrack(this.currentIndex);
      }
      this.audio.play().catch(err => {
        console.log('Playback failed:', err);
        this.trackName.textContent = 'Add music files to /public/music/';
      });
      this.isPlaying = true;
      this.playBtn.textContent = '⏸';
    }
  },
  
  loadTrack(index) {
    if (index < 0 || index >= this.playlist.length) return;
    
    this.currentIndex = index;
    const track = this.playlist[index];
    this.audio.src = track.src;
    this.updateTrackInfo();
  },
  
  updateTrackInfo() {
    if (this.playlist.length === 0) {
      this.trackName.textContent = 'No tracks found';
      return;
    }
    const track = this.playlist[this.currentIndex];
    this.trackName.textContent = track.title;
  },
  
  prevTrack() {
    const newIndex = this.currentIndex > 0 
      ? this.currentIndex - 1 
      : this.playlist.length - 1;
    this.loadTrack(newIndex);
    if (this.isPlaying) {
      this.audio.play();
    }
  },
  
  nextTrack() {
    const newIndex = this.currentIndex < this.playlist.length - 1 
      ? this.currentIndex + 1 
      : 0;
    this.loadTrack(newIndex);
    if (this.isPlaying) {
      this.audio.play();
    }
  },
  
  setVolume(value) {
    const volume = value / 100;
    this.audio.volume = volume;
    this.updateVolumeIcon(volume);
  },
  
  updateVolumeIcon(volume) {
    if (volume === 0) {
      this.volumeIcon.textContent = '🔇';
    } else if (volume < 0.5) {
      this.volumeIcon.textContent = '🔉';
    } else {
      this.volumeIcon.textContent = '🔊';
    }
  },
  
  toggleMute() {
    if (this.audio.volume > 0) {
      this.lastVolume = this.audio.volume;
      this.audio.volume = 0;
      this.volumeSlider.value = 0;
    } else {
      this.audio.volume = this.lastVolume || 0.5;
      this.volumeSlider.value = this.audio.volume * 100;
    }
    this.updateVolumeIcon(this.audio.volume);
  },
  
  updateProgress() {
    if (this.audio.duration) {
      const percent = (this.audio.currentTime / this.audio.duration) * 100;
      this.progressBar.style.width = `${percent}%`;
    }
  },
  
  seek(e) {
    if (!this.audio.duration) return;
    const rect = this.progressContainer.getBoundingClientRect();
    const percent = (e.clientX - rect.left) / rect.width;
    this.audio.currentTime = percent * this.audio.duration;
  },
  
  toggleCollapse() {
    this.playerBody.classList.toggle('collapsed');
    this.toggleBtn.textContent = this.playerBody.classList.contains('collapsed') ? '+' : '−';
  },
  
  handleError() {
    console.log('Audio error - track may not exist');
    this.trackName.textContent = 'Track not found';
  },
  
  initDrag() {
    let isDragging = false;
    let offset = { x: 0, y: 0 };
    
    this.playerHeader?.addEventListener('mousedown', (e) => {
      if (e.target.tagName === 'BUTTON') return;
      isDragging = true;
      offset.x = e.clientX - this.playerEl.offsetLeft;
      offset.y = e.clientY - this.playerEl.offsetTop;
      this.playerHeader.style.cursor = 'grabbing';
    });
    
    document.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      this.playerEl.style.left = `${e.clientX - offset.x}px`;
      this.playerEl.style.top = `${e.clientY - offset.y}px`;
      this.playerEl.style.right = 'auto';
    });
    
    document.addEventListener('mouseup', () => {
      if (isDragging) {
        isDragging = false;
        this.playerHeader.style.cursor = 'grab';
      }
    });
  },
  
  // Method to set playlist dynamically
  setPlaylist(tracks) {
    this.playlist = tracks;
    this.currentIndex = 0;
    this.updateTrackInfo();
  }
};

// Initialize music player
musicPlayer.init();
