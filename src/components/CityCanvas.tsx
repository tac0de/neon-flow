import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  CityNetworkData,
  EdgeData,
  NodeData,
  SimulationSnapshot,
  VehicleState,
} from '../types/simulation';
import {
  getIncomingApproachDirection,
  validateRoadAddition,
} from '../engine/router';
import { ZoomIn, ZoomOut, Maximize2, Layers, Columns, Navigation } from 'lucide-react';

export type EditorToolMode = 'SELECT' | 'ADD_ROAD' | 'ADD_NODE';

interface CameraTransform {
  x: number;
  y: number;
  scale: number;
}

interface CityCanvasProps {
  network: CityNetworkData;
  snapshot: SimulationSnapshot;
  comparisonSnapshot?: SimulationSnapshot | null;
  comparisonNetwork?: CityNetworkData | null;
  isSplitComparison: boolean;
  onToggleSplitComparison: () => void;
  showHeatmap: boolean;
  onToggleHeatmap: () => void;
  toolMode: EditorToolMode;
  selectedNodeId: string | null;
  selectedEdgeId: string | null;
  onSelectNode: (nodeId: string | null) => void;
  onSelectEdge: (edgeId: string | null) => void;
  onAddRoad: (fromId: string, toId: string) => void;
  onAddNode: (x: number, y: number) => void;
  onRenderTimeMs: (ms: number) => void;
  onValidationBanner: (msg: string | null) => void;
}

/**
 * Computes lateral offset geometry for a directed edge `from -> to`
 * so bidirectional roads sit cleanly on opposite sides of the centerline (right-hand traffic).
 */
function getEdgeGeometry(from: NodeData, to: NodeData, lanes: number) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.max(1, Math.hypot(dx, dy));
  const ux = dx / len;
  const uy = dy / len;
  // Right-hand normal vector in screen coordinates (+X right, +Y down): (-uy, ux)
  const nx = -uy;
  const ny = ux;

  const roadWidth = Math.max(8, lanes * 5.5);
  const lateralOffset = roadWidth * 0.55 + 2.5;

  // Trim start/end by node intersection radius (20m)
  const trim = Math.min(20, len * 0.22);
  const sx = from.x + ux * trim + nx * lateralOffset;
  const sy = from.y + uy * trim + ny * lateralOffset;
  const ex = to.x - ux * trim + nx * lateralOffset;
  const ey = to.y - uy * trim + ny * lateralOffset;

  return {
    sx,
    sy,
    ex,
    ey,
    ux,
    uy,
    nx,
    ny,
    roadWidth,
    visualLen: Math.max(1, Math.hypot(ex - sx, ey - sy)),
  };
}

function getCongestionColor(score: number): string {
  if (score >= 0.72) return '#f43f5e'; // Neon Crimson (Critical)
  if (score >= 0.45) return '#f59e0b'; // Neon Amber (Moderate-High)
  if (score >= 0.2) return '#38bdf8'; // Neon Sky (Active)
  return '#0ea5e9'; // Calm Cyan-Blue
}

export const CityCanvas: React.FC<CityCanvasProps> = ({
  network,
  snapshot,
  comparisonSnapshot,
  comparisonNetwork,
  isSplitComparison,
  onToggleSplitComparison,
  showHeatmap,
  onToggleHeatmap,
  toolMode,
  selectedNodeId,
  selectedEdgeId,
  onSelectNode,
  onSelectEdge,
  onAddRoad,
  onAddNode,
  onRenderTimeMs,
  onValidationBanner,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [camera, setCamera] = useState<CameraTransform>({ x: 60, y: 40, scale: 0.85 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{ x: number; y: number; camX: number; camY: number }>({
    x: 0,
    y: 0,
    camX: 0,
    camY: 0,
  });
  const didMoveRef = useRef(false);

  const [roadDraftFromId, setRoadDraftFromId] = useState<string | null>(null);
  const [hoverWorldPos, setHoverWorldPos] = useState<{ x: number; y: number } | null>(null);
  const [hoverNodeId, setHoverNodeId] = useState<string | null>(null);
  const [hoverEdgeId, setHoverEdgeId] = useState<string | null>(null);

  // Reset road draft when tool changes
  useEffect(() => {
    setRoadDraftFromId(null);
  }, [toolMode]);

  const fitCameraToNetwork = useCallback(() => {
    const container = containerRef.current;
    if (!container || network.nodes.length === 0) return;

    const rect = container.getBoundingClientRect();
    const viewW = isSplitComparison ? rect.width / 2 : rect.width;
    const viewH = rect.height;

    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;

    for (const n of network.nodes) {
      if (n.x < minX) minX = n.x;
      if (n.x > maxX) maxX = n.x;
      if (n.y < minY) minY = n.y;
      if (n.y > maxY) maxY = n.y;
    }

    const netW = Math.max(250, maxX - minX + 180);
    const netH = Math.max(250, maxY - minY + 180);
    const scale = Math.max(0.35, Math.min(1.35, Math.min(viewW / netW, viewH / netH)));

    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    setCamera({
      x: viewW / 2 - centerX * scale,
      y: viewH / 2 - centerY * scale,
      scale,
    });
  }, [network.id, network.nodes.length, isSplitComparison]);

  useEffect(() => {
    fitCameraToNetwork();
  }, [fitCameraToNetwork]);

  // Convert screen coordinates relative to canvas into world coordinates
  const screenToWorld = useCallback(
    (clientX: number, clientY: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return { x: 0, y: 0 };
      const rect = canvas.getBoundingClientRect();
      let localX = clientX - rect.left;
      const localY = clientY - rect.top;
      if (isSplitComparison && localX > rect.width / 2) {
        localX -= rect.width / 2;
      }
      return {
        x: (localX - camera.x) / camera.scale,
        y: (localY - camera.y) / camera.scale,
      };
    },
    [camera, isSplitComparison]
  );

  // Hit-test nodes and edges at world coordinate (wx, wy)
  const hitTest = useCallback(
    (wx: number, wy: number): { nodeId: string | null; edgeId: string | null } => {
      for (const n of network.nodes) {
        if (Math.hypot(wx - n.x, wy - n.y) <= 24) {
          return { nodeId: n.id, edgeId: null };
        }
      }

      const nodeMap = new Map(network.nodes.map((n) => [n.id, n]));
      let bestEdgeId: string | null = null;
      let bestDist = 14;

      for (const e of network.edges) {
        const from = nodeMap.get(e.from);
        const to = nodeMap.get(e.to);
        if (!from || !to) continue;
        const g = getEdgeGeometry(from, to, e.lanes);
        const vx = g.ex - g.sx;
        const vy = g.ey - g.sy;
        const l2 = vx * vx + vy * vy;
        if (l2 === 0) continue;
        const t = Math.max(0, Math.min(1, ((wx - g.sx) * vx + (wy - g.sy) * vy) / l2));
        const px = g.sx + t * vx;
        const py = g.sy + t * vy;
        const d = Math.hypot(wx - px, wy - py);
        if (d < bestDist) {
          bestDist = d;
          bestEdgeId = e.id;
        }
      }

      return { nodeId: null, edgeId: bestEdgeId };
    },
    [network.nodes, network.edges]
  );

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return;
    setIsDragging(true);
    didMoveRef.current = false;
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      camX: camera.x,
      camY: camera.y,
    };
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const world = screenToWorld(e.clientX, e.clientY);
    setHoverWorldPos(world);

    if (isDragging) {
      const dx = e.clientX - dragStartRef.current.x;
      const dy = e.clientY - dragStartRef.current.y;
      if (Math.hypot(dx, dy) > 4) {
        didMoveRef.current = true;
      }
      setCamera((prev) => ({
        ...prev,
        x: dragStartRef.current.camX + dx,
        y: dragStartRef.current.camY + dy,
      }));
      return;
    }

    const hit = hitTest(world.x, world.y);
    setHoverNodeId(hit.nodeId);
    setHoverEdgeId(hit.edgeId);
  };

  const handleMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
    setIsDragging(false);
    if (didMoveRef.current) return;

    const world = screenToWorld(e.clientX, e.clientY);
    const hit = hitTest(world.x, world.y);

    if (toolMode === 'SELECT') {
      if (hit.nodeId) {
        onSelectNode(hit.nodeId);
        onSelectEdge(null);
      } else if (hit.edgeId) {
        onSelectEdge(hit.edgeId);
        onSelectNode(null);
      } else {
        onSelectNode(null);
        onSelectEdge(null);
      }
    } else if (toolMode === 'ADD_ROAD') {
      if (!hit.nodeId) {
        setRoadDraftFromId(null);
        return;
      }
      if (!roadDraftFromId) {
        setRoadDraftFromId(hit.nodeId);
        onValidationBanner(null);
      } else if (roadDraftFromId === hit.nodeId) {
        setRoadDraftFromId(null);
      } else {
        const check = validateRoadAddition(
          network.nodes,
          network.edges,
          roadDraftFromId,
          hit.nodeId
        );
        if (!check.valid) {
          onValidationBanner(check.reason || '도로를 추가할 수 없습니다.');
          setRoadDraftFromId(null);
        } else {
          onValidationBanner(null);
          onAddRoad(roadDraftFromId, hit.nodeId);
          setRoadDraftFromId(null);
        }
      }
    } else if (toolMode === 'ADD_NODE') {
      if (hit.nodeId) {
        onValidationBanner('기존 교차로와 너무 가깝습니다. 빈 공간에 클릭하세요.');
        return;
      }
      onValidationBanner(null);
      onAddNode(Math.round(world.x / 20) * 20, Math.round(world.y / 20) * 20);
    }
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    let mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    if (isSplitComparison && mouseX > rect.width / 2) {
      mouseX -= rect.width / 2;
    }

    const zoomFactor = e.deltaY < 0 ? 1.12 : 0.89;
    const newScale = Math.max(0.28, Math.min(2.6, camera.scale * zoomFactor));

    const worldX = (mouseX - camera.x) / camera.scale;
    const worldY = (mouseY - camera.y) / camera.scale;

    setCamera({
      scale: newScale,
      x: mouseX - worldX * newScale,
      y: mouseY - worldY * newScale,
    });
  };

  // Core Canvas Rendering Pipeline
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const t0 = performance.now();
    const rect = container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;

    if (canvas.width !== Math.floor(rect.width * dpr) || canvas.height !== Math.floor(rect.height * dpr)) {
      canvas.width = Math.floor(rect.width * dpr);
      canvas.height = Math.floor(rect.height * dpr);
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.save();
    ctx.scale(dpr, dpr);

    const fullW = rect.width;
    const fullH = rect.height;

    // Deep midnight navy city backdrop
    const bgGrad = ctx.createRadialGradient(
      fullW * 0.5,
      fullH * 0.45,
      40,
      fullW * 0.5,
      fullH * 0.5,
      Math.max(fullW, fullH) * 0.75
    );
    bgGrad.addColorStop(0, '#091326');
    bgGrad.addColorStop(1, '#040812');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, fullW, fullH);

    const renderSceneViewport = (
      sceneNet: CityNetworkData,
      sceneSnap: SimulationSnapshot,
      offsetX: number,
      viewportW: number,
      viewportH: number,
      badgeTitle?: string,
      badgeColor?: string
    ) => {
      ctx.save();
      ctx.beginPath();
      ctx.rect(offsetX, 0, viewportW, viewportH);
      ctx.clip();

      ctx.translate(offsetX + camera.x, camera.y);
      ctx.scale(camera.scale, camera.scale);

      // 1. Subtle coordinate grid (100m intervals)
      const gridStep = 100;
      const startX = Math.floor((-camera.x / camera.scale - 200) / gridStep) * gridStep;
      const endX = Math.ceil(((viewportW - camera.x) / camera.scale + 200) / gridStep) * gridStep;
      const startY = Math.floor((-camera.y / camera.scale - 200) / gridStep) * gridStep;
      const endY = Math.ceil(((viewportH - camera.y) / camera.scale + 200) / gridStep) * gridStep;

      ctx.strokeStyle = 'rgba(30, 58, 138, 0.16)';
      ctx.lineWidth = 1 / camera.scale;
      ctx.beginPath();
      for (let gx = startX; gx <= endX; gx += gridStep) {
        ctx.moveTo(gx, startY);
        ctx.lineTo(gx, endY);
      }
      for (let gy = startY; gy <= endY; gy += gridStep) {
        ctx.moveTo(startX, gy);
        ctx.lineTo(endX, gy);
      }
      ctx.stroke();

      const nodeMap = new Map<string, NodeData>();
      for (const n of sceneNet.nodes) nodeMap.set(n.id, n);

      const edgeGeomMap = new Map<
        string,
        ReturnType<typeof getEdgeGeometry> & { edge: EdgeData }
      >();

      // 2. Render Directed Roads (Edges)
      for (const edge of sceneNet.edges) {
        const from = nodeMap.get(edge.from);
        const to = nodeMap.get(edge.to);
        if (!from || !to) continue;

        const g = getEdgeGeometry(from, to, edge.lanes);
        edgeGeomMap.set(edge.id, { ...g, edge });

        const st = sceneSnap.edgeStats[edge.id];
        const congestionScore = st?.congestionScore ?? 0;
        const isSelected = edge.id === selectedEdgeId;
        const isHovered = edge.id === hoverEdgeId;

        // Heatmap outer glow when showHeatmap is enabled or road is heavily congested
        if (showHeatmap || congestionScore >= 0.45 || isSelected) {
          ctx.save();
          ctx.beginPath();
          ctx.moveTo(g.sx, g.sy);
          ctx.lineTo(g.ex, g.ey);
          ctx.strokeStyle = isSelected
            ? 'rgba(56, 189, 248, 0.55)'
            : showHeatmap
            ? `${getCongestionColor(congestionScore)}44`
            : 'rgba(244, 63, 94, 0.28)';
          ctx.lineWidth = g.roadWidth + (isSelected ? 8 : 6);
          ctx.lineCap = 'butt';
          ctx.stroke();
          ctx.restore();
        }

        // Road surface base
        ctx.beginPath();
        ctx.moveTo(g.sx, g.sy);
        ctx.lineTo(g.ex, g.ey);
        ctx.strokeStyle = isSelected
          ? '#1e3a5f'
          : isHovered
          ? '#172e4d'
          : '#0f1e36';
        ctx.lineWidth = g.roadWidth;
        ctx.lineCap = 'butt';
        ctx.stroke();

        // Outer neon border rail
        const borderColor = isSelected
          ? '#38bdf8'
          : showHeatmap
          ? getCongestionColor(congestionScore)
          : congestionScore >= 0.65
          ? '#f43f5e'
          : congestionScore >= 0.4
          ? '#f59e0b'
          : 'rgba(56, 189, 248, 0.42)';

        const halfW = g.roadWidth / 2;
        ctx.beginPath();
        ctx.moveTo(g.sx + g.nx * halfW, g.sy + g.ny * halfW);
        ctx.lineTo(g.ex + g.nx * halfW, g.ey + g.ny * halfW);
        ctx.moveTo(g.sx - g.nx * halfW, g.sy - g.ny * halfW);
        ctx.lineTo(g.ex - g.nx * halfW, g.ey - g.ny * halfW);
        ctx.strokeStyle = borderColor;
        ctx.lineWidth = isSelected ? 1.8 : 1.1;
        ctx.stroke();

        // Internal dashed lane dividers
        if (edge.lanes > 1) {
          ctx.save();
          ctx.strokeStyle = 'rgba(148, 163, 184, 0.26)';
          ctx.lineWidth = 0.8;
          ctx.setLineDash([5, 6]);
          for (let l = 1; l < edge.lanes; l++) {
            const frac = l / edge.lanes - 0.5;
            const lx = g.nx * (frac * g.roadWidth);
            const ly = g.ny * (frac * g.roadWidth);
            ctx.beginPath();
            ctx.moveTo(g.sx + lx, g.sy + ly);
            ctx.lineTo(g.ex + lx, g.ey + ly);
            ctx.stroke();
          }
          ctx.restore();
        }

        // Subtle direction chevron in middle of road
        const mx = (g.sx + g.ex) * 0.5;
        const my = (g.sy + g.ey) * 0.5;
        ctx.beginPath();
        ctx.moveTo(mx + g.ux * 5, my + g.uy * 5);
        ctx.lineTo(mx - g.ux * 3 + g.nx * 3, my - g.uy * 3 + g.ny * 3);
        ctx.lineTo(mx - g.ux * 3 - g.nx * 3, my - g.uy * 3 - g.ny * 3);
        ctx.closePath();
        ctx.fillStyle = 'rgba(125, 211, 252, 0.35)';
        ctx.fill();
      }

      // 3. Render Road Addition Draft Line
      if (toolMode === 'ADD_ROAD' && roadDraftFromId && hoverWorldPos) {
        const fromNode = nodeMap.get(roadDraftFromId);
        if (fromNode) {
          ctx.save();
          ctx.beginPath();
          ctx.moveTo(fromNode.x, fromNode.y);
          ctx.lineTo(hoverWorldPos.x, hoverWorldPos.y);
          ctx.strokeStyle = '#22d3ee';
          ctx.lineWidth = 2.5;
          ctx.setLineDash([6, 4]);
          ctx.stroke();
          ctx.restore();
        }
      }

      // 4. Render Intersections (Nodes) and Signal Light Bars
      for (const node of sceneNet.nodes) {
        const nStat = sceneSnap.nodeStats[node.id];
        const isSelected = node.id === selectedNodeId;
        const isHovered = node.id === hoverNodeId || node.id === roadDraftFromId;
        const radius = 18;

        // Selection ring
        if (isSelected || isHovered) {
          ctx.beginPath();
          ctx.arc(node.x, node.y, radius + 6, 0, Math.PI * 2);
          ctx.strokeStyle = isSelected ? '#22d3ee' : 'rgba(56, 189, 248, 0.5)';
          ctx.lineWidth = isSelected ? 2.5 : 1.5;
          ctx.stroke();
        }

        // Intersection hub body
        ctx.beginPath();
        ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);
        ctx.fillStyle = '#0b172a';
        ctx.fill();
        ctx.strokeStyle = isSelected ? '#38bdf8' : '#334155';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Draw NS and EW signal bars on the node perimeter
        if (node.signal.enabled && nStat) {
          const nsColor =
            nStat.nsLight === 'GREEN'
              ? '#10b981'
              : nStat.nsLight === 'YELLOW'
              ? '#f59e0b'
              : '#f43f5e';
          const ewColor =
            nStat.ewLight === 'GREEN'
              ? '#10b981'
              : nStat.ewLight === 'YELLOW'
              ? '#f59e0b'
              : '#f43f5e';

          // North & South stop bars
          ctx.fillStyle = nsColor;
          ctx.fillRect(node.x - 9, node.y - radius - 2.5, 18, 3.2);
          ctx.fillRect(node.x - 9, node.y + radius - 0.7, 18, 3.2);

          // East & West stop bars
          ctx.fillStyle = ewColor;
          ctx.fillRect(node.x - radius - 2.5, node.y - 9, 3.2, 18);
          ctx.fillRect(node.x + radius - 0.7, node.y - 9, 3.2, 18);
        }

        // Waiting count indicator inside node if > 0, else short ID
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        if (nStat && nStat.waitingVehicles > 0) {
          ctx.font = '700 10px "JetBrains Mono", monospace';
          ctx.fillStyle = nStat.waitingVehicles >= 8 ? '#fb7185' : '#fde047';
          ctx.fillText(`${nStat.waitingVehicles}`, node.x, node.y);
        } else {
          ctx.font = '600 9px "JetBrains Mono", monospace';
          ctx.fillStyle = '#94a3b8';
          ctx.fillText(node.id.slice(0, 4), node.x, node.y);
        }

        // Node Name Label below intersection
        ctx.font = '600 11px "Pretendard", sans-serif';
        const labelY = node.y + radius + 13;
        const textW = ctx.measureText(node.name).width;
        ctx.fillStyle = 'rgba(5, 10, 22, 0.82)';
        ctx.fillRect(node.x - textW / 2 - 4, labelY - 7, textW + 8, 14);
        ctx.fillStyle = isSelected ? '#38bdf8' : '#e2e8f0';
        ctx.fillText(node.name, node.x, labelY);
      }

      // 5. Render Vehicles (Luminous directional light particles)
      // Performance adaptive rendering: simplify trail glow when > 600 vehicles
      const highDensityPerfMode = sceneSnap.vehicles.length > 600;

      for (const v of sceneSnap.vehicles) {
        const g = edgeGeomMap.get(v.currentEdgeId);
        if (!g) continue;

        const progress = Math.max(
          0,
          Math.min(1, v.distanceMeters / Math.max(1, g.edge.lengthMeters))
        );
        const laneFrac =
          g.edge.lanes > 1 ? (v.lane + 0.5) / g.edge.lanes - 0.5 : 0;
        const laneOffset = laneFrac * (g.roadWidth - 3.5);

        const vx = g.sx + g.ux * (progress * g.visualLen) + g.nx * laneOffset;
        const vy = g.sy + g.uy * (progress * g.visualLen) + g.ny * laneOffset;

        const color = v.blockedBySpillback
          ? '#f43f5e'
          : v.isWaiting
          ? '#fb7185'
          : v.speedMps < 5.5
          ? '#fbbf24'
          : '#22d3ee';

        if (highDensityPerfMode) {
          // Fast crisp directional bar for 1,000+ vehicle stress mode
          ctx.strokeStyle = color;
          ctx.lineWidth = 2.4;
          ctx.beginPath();
          ctx.moveTo(vx - g.ux * 2.5, vy - g.uy * 2.5);
          ctx.lineTo(vx + g.ux * 2.5, vy + g.uy * 2.5);
          ctx.stroke();
        } else {
          // Directional luminous light particle with motion tail
          const tailLen = Math.max(3.5, Math.min(9.5, v.speedMps * 0.55));
          ctx.strokeStyle = color;
          ctx.lineWidth = 2.8;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(vx - g.ux * tailLen, vy - g.uy * tailLen);
          ctx.lineTo(vx + g.ux * 2.2, vy + g.uy * 2.2);
          ctx.stroke();

          // Bright front headlight core
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.arc(vx + g.ux * 1.8, vy + g.uy * 1.8, 1.1, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      ctx.restore();

      // Viewport Badge for Split Comparison (placed at y=46 below top-left legend bar)
      if (badgeTitle) {
        const badgeY = 46;
        ctx.save();
        ctx.fillStyle = 'rgba(9, 18, 36, 0.92)';
        ctx.strokeStyle = badgeColor || '#38bdf8';
        ctx.lineWidth = 1.2;
        ctx.fillRect(offsetX + 12, badgeY, 296, 48);
        ctx.strokeRect(offsetX + 12, badgeY, 296, 48);

        ctx.fillStyle = badgeColor || '#38bdf8';
        ctx.font = '700 11.5px "Pretendard", sans-serif';
        ctx.fillText(badgeTitle, offsetX + 22, badgeY + 18);

        ctx.fillStyle = '#cbd5e1';
        ctx.font = '500 11px "JetBrains Mono", monospace';
        ctx.fillText(
          `완료: ${sceneSnap.completedVehiclesCount}대 | 평균통행: ${sceneSnap.avgTravelTimeSeconds.toFixed(
            1
          )}s | 대기: ${sceneSnap.waitingVehiclesCount + sceneSnap.externalQueueCount}대`,
          offsetX + 22,
          badgeY + 37
        );
        ctx.restore();
      }
    };

    if (isSplitComparison && comparisonSnapshot) {
      const halfW = fullW / 2;
      // Left: Baseline Snapshot
      renderSceneViewport(
        comparisonNetwork || network,
        comparisonSnapshot,
        0,
        halfW,
        fullH,
        '개선 전 (Baseline — 동일 초기상태·시드)',
        '#f59e0b'
      );
      // Right: Current / Optimized Snapshot
      renderSceneViewport(
        network,
        snapshot,
        halfW,
        halfW,
        fullH,
        '개선 후 (Optimized / 현재 시뮬레이션)',
        '#22d3ee'
      );

      // Center divider line
      ctx.beginPath();
      ctx.moveTo(halfW, 0);
      ctx.lineTo(halfW, fullH);
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 2;
      ctx.stroke();
    } else {
      renderSceneViewport(network, snapshot, 0, fullW, fullH);
    }

    // 6. Selected Intersection Zoom Inset (확대 인셋 — Top-Right of Canvas)
    if (selectedNodeId && !isSplitComparison) {
      const selNode = network.nodes.find((n) => n.id === selectedNodeId);
      const selStat = snapshot.nodeStats[selectedNodeId];
      if (selNode && selStat) {
        const insetSize = 186;
        const insetX = fullW - insetSize - 14;
        const insetY = 14;

        ctx.save();
        // Inset Frame
        ctx.fillStyle = 'rgba(6, 12, 26, 0.94)';
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 1.5;
        ctx.fillRect(insetX, insetY, insetSize, insetSize + 36);
        ctx.strokeRect(insetX, insetY, insetSize, insetSize + 36);

        ctx.beginPath();
        ctx.rect(insetX + 2, insetY + 24, insetSize - 4, insetSize - 4);
        ctx.clip();

        const zoomScale = 1.85;
        ctx.translate(
          insetX + insetSize / 2 - selNode.x * zoomScale,
          insetY + 24 + (insetSize - 4) / 2 - selNode.y * zoomScale
        );
        ctx.scale(zoomScale, zoomScale);

        const nm = new Map(network.nodes.map((n) => [n.id, n]));
        const connectedEdges = network.edges.filter(
          (e) => e.from === selNode.id || e.to === selNode.id
        );

        for (const e of connectedEdges) {
          const from = nm.get(e.from);
          const to = nm.get(e.to);
          if (!from || !to) continue;
          const g = getEdgeGeometry(from, to, e.lanes);
          ctx.beginPath();
          ctx.moveTo(g.sx, g.sy);
          ctx.lineTo(g.ex, g.ey);
          ctx.strokeStyle = '#162a4a';
          ctx.lineWidth = g.roadWidth;
          ctx.stroke();

          // Render vehicles on connected approaches inside inset
          for (const v of snapshot.vehicles) {
            if (v.currentEdgeId !== e.id) continue;
            const prog = Math.max(0, Math.min(1, v.distanceMeters / Math.max(1, e.lengthMeters)));
            const lFrac = e.lanes > 1 ? (v.lane + 0.5) / e.lanes - 0.5 : 0;
            const lOff = lFrac * (g.roadWidth - 3.5);
            const vx = g.sx + g.ux * (prog * g.visualLen) + g.nx * lOff;
            const vy = g.sy + g.uy * (prog * g.visualLen) + g.ny * lOff;
            ctx.fillStyle = v.isWaiting ? '#fb7185' : '#22d3ee';
            ctx.beginPath();
            ctx.arc(vx, vy, 2.4, 0, Math.PI * 2);
            ctx.fill();
          }
        }

        // Intersection hub in inset
        ctx.beginPath();
        ctx.arc(selNode.x, selNode.y, 18, 0, Math.PI * 2);
        ctx.fillStyle = '#0f172a';
        ctx.fill();
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 2;
        ctx.stroke();

        const nsC =
          selStat.nsLight === 'GREEN'
            ? '#10b981'
            : selStat.nsLight === 'YELLOW'
            ? '#f59e0b'
            : '#f43f5e';
        const ewC =
          selStat.ewLight === 'GREEN'
            ? '#10b981'
            : selStat.ewLight === 'YELLOW'
            ? '#f59e0b'
            : '#f43f5e';
        ctx.fillStyle = nsC;
        ctx.fillRect(selNode.x - 10, selNode.y - 21, 20, 3.5);
        ctx.fillRect(selNode.x - 10, selNode.y + 17.5, 20, 3.5);
        ctx.fillStyle = ewC;
        ctx.fillRect(selNode.x - 21, selNode.y - 10, 3.5, 20);
        ctx.fillRect(selNode.x + 17.5, selNode.y - 10, 3.5, 20);

        ctx.restore();

        // Inset Header & Footer Telemetry
        ctx.save();
        ctx.fillStyle = '#38bdf8';
        ctx.font = '700 11px "Pretendard", sans-serif';
        ctx.fillText(`🔍 ${selNode.name} (확대 인셋)`, insetX + 8, insetY + 16);

        ctx.fillStyle = '#cbd5e1';
        ctx.font = '500 10px "JetBrains Mono", monospace';
        ctx.fillText(
          `NS:${selStat.nsLight[0]} (${selStat.nsWaitingVehicles}대) | EW:${selStat.ewLight[0]} (${selStat.ewWaitingVehicles}대)`,
          insetX + 8,
          insetY + insetSize + 14
        );
        ctx.fillStyle = '#94a3b8';
        ctx.fillText(
          `주기 ${selStat.cycleSeconds}s | 통과 ${selStat.throughputVehicles}대`,
          insetX + 8,
          insetY + insetSize + 28
        );
        ctx.restore();
      }
    }

    ctx.restore();

    const elapsed = Number((performance.now() - t0).toFixed(2));
    onRenderTimeMs(elapsed);
  }, [
    network,
    snapshot,
    comparisonSnapshot,
    comparisonNetwork,
    isSplitComparison,
    showHeatmap,
    camera,
    selectedNodeId,
    selectedEdgeId,
    hoverNodeId,
    hoverEdgeId,
    toolMode,
    roadDraftFromId,
    hoverWorldPos,
    onRenderTimeMs,
  ]);

  return (
    <div ref={containerRef} className="canvas-wrapper">
      <canvas
        ref={canvasRef}
        className={`city-canvas tool-${toolMode.toLowerCase()}`}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onWheel={handleWheel}
      />

      {/* Floating Map Overlay Controls (Bottom-Left of Canvas) */}
      <div className="canvas-overlay-controls">
        <button
          type="button"
          className="overlay-btn"
          onClick={() =>
            setCamera((p) => ({ ...p, scale: Math.min(2.5, p.scale * 1.2) }))
          }
          title="확대 (Zoom In)"
        >
          <ZoomIn size={15} />
        </button>
        <button
          type="button"
          className="overlay-btn"
          onClick={() =>
            setCamera((p) => ({ ...p, scale: Math.max(0.3, p.scale * 0.82) }))
          }
          title="축소 (Zoom Out)"
        >
          <ZoomOut size={15} />
        </button>
        <button
          type="button"
          className="overlay-btn"
          onClick={fitCameraToNetwork}
          title="전체 도시 맞춤 (Fit View)"
        >
          <Maximize2 size={15} />
        </button>
        <button
          type="button"
          className={`overlay-btn ${showHeatmap ? 'active' : ''}`}
          onClick={onToggleHeatmap}
          title="정체 히트맵 표시 전환"
        >
          <Layers size={15} />
          <span>히트맵</span>
        </button>
        {comparisonSnapshot && (
          <button
            type="button"
            className={`overlay-btn ${isSplitComparison ? 'active' : ''}`}
            onClick={onToggleSplitComparison}
            title="개선 전·후 동일 범위 나란히 비교"
          >
            <Columns size={15} />
            <span>전·후 비교뷰</span>
          </button>
        )}
      </div>

      {/* Legend & Tool Status Pill (Top-Left of Canvas) */}
      <div className="canvas-legend-bar">
        <span className="legend-item">
          <span className="dot cyan" /> 원활 주행
        </span>
        <span className="legend-item">
          <span className="dot amber" /> 감속·서행
        </span>
        <span className="legend-item">
          <span className="dot rose" /> 적색·스필백 대기
        </span>
        {toolMode === 'ADD_ROAD' && (
          <span className="tool-hint-pill">
            <Navigation size={12} />
            {roadDraftFromId
              ? `출발 교차로(${roadDraftFromId}) 선택됨 → 연결할 도착 교차로를 클릭하세요`
              : '도로 추가 모드: 출발 교차로를 먼저 클릭하세요'}
          </span>
        )}
        {toolMode === 'ADD_NODE' && (
          <span className="tool-hint-pill">
            <Navigation size={12} /> 교차로 추가 모드: 지도의 빈 공간을 클릭하세요
          </span>
        )}
      </div>
    </div>
  );
};
