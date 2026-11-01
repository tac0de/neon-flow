import {
  ApproachDirection,
  EdgeData,
  EdgeRuntimeStats,
  NodeData,
  RoutingMode,
  SignalAxis,
  TurnType,
} from '../types/simulation';

export const VEHICLE_LENGTH_METERS = 4.8;
export const MIN_HEADWAY_GAP_METERS = 2.7;
export const VEHICLE_EFFECTIVE_LENGTH_METERS = VEHICLE_LENGTH_METERS + MIN_HEADWAY_GAP_METERS; // 7.5m

export function computeEdgeLength(from: NodeData, to: NodeData): number {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  return Math.max(40, Math.round(Math.hypot(dx, dy)));
}

export function computeEdgeCapacity(lengthMeters: number, lanes: number): number {
  const safeLanes = Math.max(1, Math.min(4, Math.floor(lanes)));
  const perLane = Math.max(1, Math.floor(lengthMeters / VEHICLE_EFFECTIVE_LENGTH_METERS));
  return perLane * safeLanes;
}

/**
 * Classifies which cardinal quadrant an edge `from -> to` approaches node `to` from.
 * World coordinates: +X is East, -X is West, +Y is South, -Y is North.
 */
export function getIncomingApproachDirection(from: NodeData, to: NodeData): ApproachDirection {
  const dx = from.x - to.x;
  const dy = from.y - to.y;
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx < 0 ? 'W' : 'E';
  }
  return dy < 0 ? 'N' : 'S';
}

/**
 * Classifies which cardinal quadrant an edge `from -> to` leaves node `from` toward.
 */
export function getOutgoingDirection(from: NodeData, to: NodeData): ApproachDirection {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0 ? 'E' : 'W';
  }
  return dy >= 0 ? 'S' : 'N';
}

export function getApproachAxis(dir: ApproachDirection): SignalAxis {
  return dir === 'N' || dir === 'S' ? 'NS' : 'EW';
}

export function getTurnType(inEdgeFrom: NodeData, viaNode: NodeData, outEdgeTo: NodeData): TurnType {
  const inDir = getIncomingApproachDirection(inEdgeFrom, viaNode);
  const outDir = getOutgoingDirection(viaNode, outEdgeTo);

  const order: ApproachDirection[] = ['N', 'E', 'S', 'W'];
  const inIdx = order.indexOf(inDir);
  const outIdx = order.indexOf(outDir);

  // If entering from N (moving South):
  // - Outgoing S (idx + 2) => STRAIGHT
  // - Outgoing W (idx + 3) => RIGHT turn
  // - Outgoing E (idx + 1) => LEFT turn
  const diff = (outIdx - inIdx + 4) % 4;
  if (diff === 2) return 'STRAIGHT';
  if (diff === 3) return 'RIGHT';
  return 'LEFT';
}

/**
 * Enforces the 4-way orthogonal intersection constraint when adding a road `fromId -> toId`.
 */
export function validateRoadAddition(
  nodes: NodeData[],
  edges: EdgeData[],
  fromId: string,
  toId: string
): { valid: boolean; reason?: string } {
  if (fromId === toId) {
    return { valid: false, reason: '출발 교차로와 도착 교차로가 같을 수 없습니다.' };
  }
  const fromNode = nodes.find((n) => n.id === fromId);
  const toNode = nodes.find((n) => n.id === toId);
  if (!fromNode || !toNode) {
    return { valid: false, reason: '존재하지 않는 교차로입니다.' };
  }
  if (edges.some((e) => e.from === fromId && e.to === toId)) {
    return { valid: false, reason: '이미 동일한 방향의 도로가 존재합니다.' };
  }

  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const newIncomingDir = getIncomingApproachDirection(fromNode, toNode);
  const incomingEdgesToTarget = edges.filter((e) => e.to === toId);

  if (incomingEdgesToTarget.length >= 4) {
    return {
      valid: false,
      reason: `교차로 '${toNode.name}'은(는) 이미 최대 4방향 진입 도로를 가지고 있습니다.`,
    };
  }

  for (const existing of incomingEdgesToTarget) {
    const existingFrom = nodeMap.get(existing.from);
    if (existingFrom) {
      const dir = getIncomingApproachDirection(existingFrom, toNode);
      if (dir === newIncomingDir) {
        return {
          valid: false,
          reason: `교차로 '${toNode.name}'의 ${dir}측 진입 방향에는 이미 도로(${existing.name})가 연결되어 있습니다 (직교 4방향 제한).`,
        };
      }
    }
  }

  const newOutgoingDir = getOutgoingDirection(fromNode, toNode);
  const outgoingEdgesFromSource = edges.filter((e) => e.from === fromId);
  if (outgoingEdgesFromSource.length >= 4) {
    return {
      valid: false,
      reason: `교차로 '${fromNode.name}'은(는) 이미 최대 4방향 진출 도로를 가지고 있습니다.`,
    };
  }

  for (const existing of outgoingEdgesFromSource) {
    const existingTo = nodeMap.get(existing.to);
    if (existingTo) {
      const dir = getOutgoingDirection(fromNode, existingTo);
      if (dir === newOutgoingDir) {
        return {
          valid: false,
          reason: `교차로 '${fromNode.name}'의 ${dir}측 진출 방향에는 이미 도로(${existing.name})가 연결되어 있습니다 (직교 4방향 제한).`,
        };
      }
    }
  }

  return { valid: true };
}

/**
 * Dijkstra shortest path from originNodeId to destinationNodeId.
 * Returns array of Edge IDs, or null if no path exists.
 */
export function findShortestPath(
  nodes: NodeData[],
  edges: EdgeData[],
  originNodeId: string,
  destinationNodeId: string,
  mode: RoutingMode = 'freeflow',
  edgeStats?: Record<string, EdgeRuntimeStats>
): string[] | null {
  if (originNodeId === destinationNodeId) return [];

  const nodeMap = new Map<string, NodeData>();
  for (const n of nodes) nodeMap.set(n.id, n);
  if (!nodeMap.has(originNodeId) || !nodeMap.has(destinationNodeId)) {
    return null;
  }

  const adj = new Map<string, EdgeData[]>();
  for (const e of edges) {
    let list = adj.get(e.from);
    if (!list) {
      list = [];
      adj.set(e.from, list);
    }
    list.push(e);
  }

  const dist = new Map<string, number>();
  const prevEdge = new Map<string, EdgeData>();
  const visited = new Set<string>();

  for (const n of nodes) {
    dist.set(n.id, Infinity);
  }
  dist.set(originNodeId, 0);

  while (visited.size < nodes.length) {
    let u: string | null = null;
    let bestD = Infinity;
    for (const [nodeId, d] of dist.entries()) {
      if (!visited.has(nodeId) && d < bestD) {
        bestD = d;
        u = nodeId;
      }
    }

    if (u === null || bestD === Infinity) break;
    if (u === destinationNodeId) break;
    visited.add(u);

    const outgoing = adj.get(u) || [];
    const inEdge = prevEdge.get(u);

    for (const edge of outgoing) {
      if (visited.has(edge.to)) continue;

      // Avoid immediate U-turn if alternatives exist
      let turnPenaltySeconds = 1.5;
      if (inEdge) {
        if (inEdge.from === edge.to) {
          turnPenaltySeconds = 25.0; // U-turn penalty
        } else {
          const nFrom = nodeMap.get(inEdge.from);
          const nVia = nodeMap.get(u);
          const nTo = nodeMap.get(edge.to);
          if (nFrom && nVia && nTo) {
            const turn = getTurnType(nFrom, nVia, nTo);
            turnPenaltySeconds = turn === 'STRAIGHT' ? 0.5 : turn === 'RIGHT' ? 2.0 : 4.0;
          }
        }
      }

      const speedMps = Math.max(2.0, edge.speedLimitKmh / 3.6);
      const freeFlowTime = edge.lengthMeters / speedMps;

      let edgeCost = freeFlowTime + turnPenaltySeconds;
      if (mode === 'congested' && edgeStats && edgeStats[edge.id]) {
        const st = edgeStats[edge.id];
        const ratio = Math.min(1.5, st.densityRatio);
        // BPR-style congestion penalty + active queue wait
        edgeCost = freeFlowTime * (1 + 2.2 * Math.pow(ratio, 2)) + st.avgWaitSeconds * 0.4 + turnPenaltySeconds;
      }

      const alt = bestD + edgeCost;
      if (alt < (dist.get(edge.to) ?? Infinity)) {
        dist.set(edge.to, alt);
        prevEdge.set(edge.to, edge);
      }
    }
  }

  if (!prevEdge.has(destinationNodeId)) {
    return null;
  }

  const route: string[] = [];
  let curr = destinationNodeId;
  let guard = 0;
  while (curr !== originNodeId && guard < nodes.length + 5) {
    const e = prevEdge.get(curr);
    if (!e) return null;
    route.push(e.id);
    curr = e.from;
    guard++;
  }

  route.reverse();
  return route;
}
