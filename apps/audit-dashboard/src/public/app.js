// State management
let state = {
  overview: null,
  epochs: [],
  selectedEpochNumber: null,
  currentTreeData: null,
  selectedLeafData: null,
  highlightedNodes: new Set(),
  isDefenseLocked: false,
};

// ================= DOM READY INITIALIZATION =================
document.addEventListener('DOMContentLoaded', () => {
  initClock();
  initSse();
  loadOverview();
  loadEpochs();

  // Polling fallback every 3s
  setInterval(() => {
    loadOverview();
    checkSecurityStatus();
  }, 3000);
});

function initClock() {
  const clockEl = document.getElementById('live-clock');
  const update = () => {
    const now = new Date();
    clockEl.innerText = now.toLocaleTimeString('vi-VN') + ' (UTC+7)';
  };
  update();
  setInterval(update, 1000);
}

// ================= SSE STREAM LISTENER =================
function initSse() {
  try {
    const sse = new EventSource('/api/stream');

    sse.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        handleRealtimeEvent(payload);
      } catch (e) {
        console.error('Lỗi parse SSE:', e);
      }
    };

    sse.onerror = () => {
      // SSE reconnects automatically
    };
  } catch (err) {
    console.warn('Không thể khởi tạo SSE, chuyển sang chế độ Polling:', err);
  }
}

function handleRealtimeEvent(evt) {
  if (evt.type === 'epoch:new') {
    addSocLog('Khối Epoch mới đã chốt sổ thành công!', 'EPOCH ENGINE', 'cyan');
    loadEpochs();
    loadOverview();
  } else if (evt.type === 'security:breach') {
    addSocLog(`CẢNH BÁO XÂM PHẠM: ${evt.data?.message || 'Phát hiện can thiệp DB'}`, 'ACTIVE DEFENSE', 'red');
    updateDefenseStatus(true);
  } else if (evt.type === 'security:reset') {
    addSocLog('Đã dỡ bỏ cờ đỏ Active Defense. Hệ thống bình thường.', 'ADMIN', 'emerald');
    updateDefenseStatus(false);
  }
}

// ================= API FETCHERS =================
async function loadOverview() {
  try {
    const res = await fetch('/api/overview');
    if (!res.ok) return;
    const data = await res.json();
    state.overview = data;

    document.getElementById('stat-epochs').innerText = data.totalEpochs || 0;
    document.getElementById('stat-logs').innerText = data.totalLogs || 0;
    document.getElementById('stat-anchors').innerText = data.anchoredEpochs || 0;

    updateDefenseStatus(data.isDefenseLocked);
  } catch (err) {
    console.error('Lỗi load overview:', err);
  }
}

async function checkSecurityStatus() {
  try {
    const res = await fetch('/api/security/status');
    if (!res.ok) return;
    const data = await res.json();
    updateDefenseStatus(data.isDefenseLocked);
  } catch (err) {}
}

async function loadEpochs() {
  try {
    const res = await fetch('/api/epochs');
    if (!res.ok) return;
    const epochs = await res.json();
    state.epochs = epochs;

    renderEpochSelector(epochs);
    renderTimeline(epochs);

    if (epochs.length > 0 && !state.selectedEpochNumber) {
      state.selectedEpochNumber = epochs[0].epochNumber;
      loadTree(state.selectedEpochNumber);
    }
  } catch (err) {
    console.error('Lỗi load epochs:', err);
  }
}

async function loadTree(epochNum) {
  try {
    const res = await fetch(`/api/epochs/${epochNum}/tree`);
    if (!res.ok) return;
    const treeData = await res.json();
    state.currentTreeData = treeData;
    state.highlightedNodes.clear();

    renderMerkleTree(treeData);
  } catch (err) {
    console.error('Lỗi tải cây:', err);
  }
}

// ================= RENDERERS =================
function renderEpochSelector(epochs) {
  const select = document.getElementById('epoch-select');
  select.innerHTML = '';

  if (epochs.length === 0) {
    select.innerHTML = '<option value="">Chưa có Epoch nào</option>';
    return;
  }

  epochs.forEach((ep) => {
    const opt = document.createElement('option');
    opt.value = ep.epochNumber;
    opt.innerText = `Khối #${ep.epochNumber} (${ep.totalLogs} logs)`;
    if (ep.epochNumber === state.selectedEpochNumber) {
      opt.selected = true;
    }
    select.appendChild(opt);
  });
}

function renderTimeline(epochs) {
  const container = document.getElementById('timeline-container');
  container.innerHTML = '';

  if (epochs.length === 0) {
    container.innerHTML = '<div class="text-xs text-slate-500 italic">Chưa có khối Epoch nào trong chuỗi.</div>';
    return;
  }

  epochs.forEach((ep) => {
    const card = document.createElement('div');
    card.className = `flex-shrink-0 w-64 p-3 rounded-xl border transition cursor-pointer ${
      ep.epochNumber === state.selectedEpochNumber
        ? 'bg-purple-950/40 border-purple-500/60 shadow-lg shadow-purple-950/50'
        : 'bg-slate-900/60 border-white/5 hover:border-white/20'
    }`;
    card.onclick = () => {
      state.selectedEpochNumber = ep.epochNumber;
      document.getElementById('epoch-select').value = ep.epochNumber;
      loadTree(ep.epochNumber);
      renderTimeline(state.epochs);
    };

    card.innerHTML = `
      <div class="flex items-center justify-between mb-1.5">
        <span class="font-extrabold text-sm text-cyan-300">Khối #${ep.epochNumber}</span>
        ${
          ep.anchored
            ? '<span class="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold">ANCHORED</span>'
            : '<span class="text-[9px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">UNANCHORED</span>'
        }
      </div>
      <div class="text-[11px] text-slate-400 font-mono truncate">Root: ${ep.merkleRoot}</div>
      <div class="text-[10px] text-slate-500 font-mono truncate mt-0.5">Prev: ${ep.previousEpochRoot}</div>
      <div class="flex justify-between items-center text-[10px] text-slate-400 mt-2 pt-1.5 border-t border-white/5">
        <span>Logs: ${ep.totalLogs}</span>
        <span class="truncate max-w-[120px] text-[9px] text-purple-300">Sig: ${ep.signature.slice(0, 10)}...</span>
      </div>
    `;
    container.appendChild(card);
  });
}

function onEpochChange() {
  const val = document.getElementById('epoch-select').value;
  if (val) {
    state.selectedEpochNumber = parseInt(val, 10);
    loadTree(state.selectedEpochNumber);
    renderTimeline(state.epochs);
  }
}

function refreshTree() {
  if (state.selectedEpochNumber) {
    loadTree(state.selectedEpochNumber);
    loadOverview();
  }
}

// ================= SVG MERKLE TREE VISUALIZER =================
function renderMerkleTree(treeData) {
  const svg = document.getElementById('tree-svg');
  const emptyEl = document.getElementById('tree-empty');
  svg.innerHTML = '';

  if (!treeData || !treeData.nodes || treeData.nodes.length === 0) {
    emptyEl.style.display = 'block';
    return;
  }
  emptyEl.style.display = 'none';

  const width = svg.clientWidth || 700;
  const height = svg.clientHeight || 400;
  const layersCount = treeData.layersCount;
  const layerHeight = (height - 80) / Math.max(layersCount - 1, 1);

  // Nhóm nodes theo layer
  const nodesByLayer = {};
  treeData.nodes.forEach((n) => {
    if (!nodesByLayer[n.layer]) nodesByLayer[n.layer] = [];
    nodesByLayer[n.layer].push(n);
  });

  // Tính tọa độ (x, y) cho từng node
  const nodePositions = {};
  for (let l = 0; l < layersCount; l++) {
    const nodesInLayer = nodesByLayer[l] || [];
    // Layer 0 ở dưới cùng (lá), Layer (layersCount - 1) ở trên cùng (root)
    const y = height - 50 - l * layerHeight;
    const count = nodesInLayer.length;
    const spacing = width / (count + 1);

    nodesInLayer.forEach((node, idx) => {
      const x = spacing * (idx + 1);
      nodePositions[node.id] = { x, y, node };
    });
  }

  // 1. Vẽ các đường nối (Edges)
  treeData.nodes.forEach((node) => {
    if (!node.isLeaf && nodePositions[node.id]) {
      const parentPos = nodePositions[node.id];

      [node.leftChildId, node.rightChildId].forEach((childId) => {
        if (childId && nodePositions[childId]) {
          const childPos = nodePositions[childId];
          const isEdgeHighlighted =
            state.highlightedNodes.has(node.id) && state.highlightedNodes.has(childId);

          const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
          // Đường cong Cubic Bezier mượt mà
          const midY = (parentPos.y + childPos.y) / 2;
          const d = `M ${parentPos.x} ${parentPos.y} C ${parentPos.x} ${midY}, ${childPos.x} ${midY}, ${childPos.x} ${childPos.y}`;
          path.setAttribute('d', d);
          path.setAttribute('class', `tree-edge ${isEdgeHighlighted ? 'highlighted' : ''}`);
          svg.appendChild(path);
        }
      });
    }
  });

  // 2. Vẽ các nút (Nodes)
  Object.values(nodePositions).forEach(({ x, y, node }) => {
    const isRoot = node.layer === layersCount - 1;
    const isLeaf = node.isLeaf;
    const isHighlighted = state.highlightedNodes.has(node.id);

    let color = isRoot ? '#a855f7' : isLeaf ? '#06b6d4' : '#6366f1';
    if (isHighlighted) color = '#f59e0b'; // Amber

    const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    group.setAttribute('class', `tree-node ${isHighlighted ? 'highlighted' : ''}`);
    group.onclick = () => onNodeClick(node);

    // Hình tròn Node
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', x);
    circle.setAttribute('cy', y);
    circle.setAttribute('r', isRoot ? 16 : isLeaf ? 14 : 12);
    circle.setAttribute('fill', color);
    circle.setAttribute('stroke', '#ffffff');
    circle.setAttribute('stroke-width', '2');
    group.appendChild(circle);

    // Nhãn chữ nhỏ gọn
    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('x', x);
    text.setAttribute('y', y + 3.5);
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('font-size', '9px');
    text.setAttribute('font-weight', 'bold');
    text.setAttribute('fill', '#0f172a');
    text.textContent = isRoot ? 'ROOT' : isLeaf ? `#${node.data?.sequence || node.index}` : `L${node.layer}`;
    group.appendChild(text);

    svg.appendChild(group);
  });
}

// ================= INSPECTOR & PROOF HIGHLIGHT =================
function onNodeClick(node) {
  const content = document.getElementById('inspector-content');
  const badge = document.getElementById('inspect-seq-badge');
  const proofBtn = document.getElementById('btn-highlight-proof');

  if (node.isLeaf && node.data) {
    state.selectedLeafData = node.data;
    badge.innerText = `Sequence #${node.data.sequence}`;
    proofBtn.classList.remove('hidden');

    content.innerHTML = `
      <div class="space-y-2">
        <div class="flex justify-between items-center py-1 border-b border-white/5">
          <span class="text-slate-400">Hành động:</span>
          <span class="font-bold text-cyan-300">${node.data.action}</span>
        </div>
        <div class="flex justify-between items-center py-1 border-b border-white/5">
          <span class="text-slate-400">Thời gian:</span>
          <span class="font-mono text-slate-300 text-[10px]">${new Date(node.data.timestamp).toLocaleString('vi-VN')}</span>
        </div>
        <div class="py-1 border-b border-white/5">
          <div class="text-slate-400 mb-0.5">Người thực hiện (Actor):</div>
          <div class="text-[11px] font-mono text-slate-300 bg-slate-900 p-1.5 rounded">
            User: ${node.data.actor?.userId || 'N/A'}<br/>
            IP: ${node.data.actor?.ipAddress || '127.0.0.1'}<br/>
            Agent: ${node.data.actor?.userAgent || 'AegisWalletClient'}
          </div>
        </div>
        <div class="py-1 border-b border-white/5">
          <div class="text-slate-400 mb-0.5">Dữ liệu giao dịch (Payload):</div>
          <pre class="text-[10px] font-mono text-slate-300 bg-slate-900 p-1.5 rounded overflow-x-auto">${JSON.stringify(node.data.payload, null, 2)}</pre>
        </div>
        <div class="py-1">
          <div class="text-slate-400 mb-0.5">Mã băm lá (Leaf Hash):</div>
          <div class="text-[9px] font-mono text-purple-300 break-all bg-purple-950/30 p-1 rounded border border-purple-500/20">${node.data.leafHash}</div>
        </div>
      </div>
    `;
  } else {
    badge.innerText = `Nút Tầng ${node.layer}`;
    proofBtn.classList.add('hidden');
    content.innerHTML = `
      <div class="space-y-2">
        <div class="py-1 border-b border-white/5">
          <span class="text-slate-400">Loại nút:</span>
          <span class="font-bold text-purple-300">${node.layer === state.currentTreeData.layersCount - 1 ? 'MERKLE ROOT' : 'INTERMEDIATE HASH'}</span>
        </div>
        <div class="py-1">
          <span class="text-slate-400">Hash giá trị:</span>
          <div class="text-[10px] font-mono text-slate-200 break-all bg-slate-900 p-2 rounded mt-1">${node.hash}</div>
        </div>
      </div>
    `;
  }
}

async function onHighlightProofClick() {
  if (!state.selectedLeafData) return;

  try {
    const res = await fetch(`/api/proof/${state.selectedLeafData.sequence}`);
    if (!res.ok) return;
    const proofDto = await res.json();

    state.highlightedNodes.clear();

    // Tìm và highlight lá được chọn
    const leafNode = state.currentTreeData.nodes.find(
      (n) => n.isLeaf && n.data?.sequence === state.selectedLeafData.sequence
    );
    if (leafNode) state.highlightedNodes.add(leafNode.id);

    // Highlight các node sibling trong proof
    proofDto.proof.forEach((step) => {
      const match = state.currentTreeData.nodes.find((n) => n.hash === step.hash);
      if (match) state.highlightedNodes.add(match.id);
    });

    // Highlight root node
    const rootNode = state.currentTreeData.nodes.find(
      (n) => n.layer === state.currentTreeData.layersCount - 1
    );
    if (rootNode) state.highlightedNodes.add(rootNode.id);

    renderMerkleTree(state.currentTreeData);

    addSocLog(
      `Xác thực Merkle Proof O(log N) cho Seq #${state.selectedLeafData.sequence}: ✅ HỢP LỆ TOÁN HỌC!`,
      'ZERO-TRUST PROVER',
      'amber'
    );
  } catch (err) {
    console.error('Lỗi highlight proof:', err);
  }
}

// ================= DEFENSE & SIREN CONTROL =================
function updateDefenseStatus(isLocked) {
  state.isDefenseLocked = isLocked;
  const badge = document.getElementById('defense-badge');
  const badgeText = document.getElementById('defense-text');
  const resetBtn = document.getElementById('btn-reset-lock');

  if (isLocked) {
    document.body.classList.add('siren-active');
    badge.className = 'px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 bg-red-950/90 text-red-400 border border-red-500/60 shadow-lg shadow-red-950 siren-badge';
    badgeText.innerText = '🚨 EMERGENCY LOCKDOWN • WITHDRAWALS FROZEN (423)';
    resetBtn.classList.remove('hidden');
  } else {
    document.body.classList.remove('siren-active');
    badge.className = 'px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 bg-emerald-950/80 text-emerald-400 border border-emerald-500/30 shadow-lg shadow-emerald-950/50';
    badgeText.innerText = 'SYSTEM SECURE • GATES OPEN';
    resetBtn.classList.add('hidden');
  }
}

async function resetDefenseLock() {
  try {
    const res = await fetch('/api/security/reset', { method: 'POST' });
    if (res.ok) {
      updateDefenseStatus(false);
      loadOverview();
    }
  } catch (err) {
    console.error('Lỗi reset defense lock:', err);
  }
}

function addSocLog(message, source, color = 'slate') {
  const feed = document.getElementById('soc-feed');
  const item = document.createElement('div');
  item.className = `p-2.5 rounded-lg bg-slate-900/80 border border-white/5 text-slate-300 animate-fade-in`;
  item.innerHTML = `
    <div class="flex justify-between text-[10px] text-${color}-400 font-bold mb-0.5">
      <span>[${source}]</span>
      <span class="text-slate-500 font-normal">${new Date().toLocaleTimeString('vi-VN')}</span>
    </div>
    <div class="text-xs">${message}</div>
  `;
  feed.insertBefore(item, feed.firstChild);
}
