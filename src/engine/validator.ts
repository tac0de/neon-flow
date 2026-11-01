import {
  CityNetworkData,
  EdgeData,
  NodeData,
  ODDemand,
  SignalConfig,
} from '../types/simulation';
import { computeEdgeCapacity, computeEdgeLength } from './router';

export const MIN_GREEN_SECONDS = 8;
export const MAX_GREEN_SECONDS = 90;
export const DEFAULT_YELLOW_SECONDS = 2;
export const DEFAULT_ALL_RED_SECONDS = 1;

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  sanitizedData?: CityNetworkData;
}

export function sanitizeSignalConfig(sig: Partial<SignalConfig> | undefined): SignalConfig {
  const nsGreen = Math.max(
    MIN_GREEN_SECONDS,
    Math.min(MAX_GREEN_SECONDS, Math.round(Number(sig?.nsGreenSeconds) || 24))
  );
  const ewGreen = Math.max(
    MIN_GREEN_SECONDS,
    Math.min(MAX_GREEN_SECONDS, Math.round(Number(sig?.ewGreenSeconds) || 24))
  );
  const yellow = Math.max(1, Math.min(5, Math.round(Number(sig?.yellowSeconds) || DEFAULT_YELLOW_SECONDS)));
  const allRed = Math.max(1, Math.min(5, Math.round(Number(sig?.allRedSeconds) || DEFAULT_ALL_RED_SECONDS)));
  const cycle = nsGreen + ewGreen + 2 * (yellow + allRed);
  const rawOffset = Math.round(Number(sig?.offsetSeconds) || 0);
  const offset = ((rawOffset % cycle) + cycle) % cycle;

  return {
    enabled: sig?.enabled !== undefined ? Boolean(sig.enabled) : true,
    nsGreenSeconds: nsGreen,
    ewGreenSeconds: ewGreen,
    yellowSeconds: yellow,
    allRedSeconds: allRed,
    offsetSeconds: offset,
  };
}

export function validateAndSanitizeNetworkJson(rawInput: unknown): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!rawInput || typeof rawInput !== 'object') {
    return { valid: false, errors: ['입력 데이터가 올바른 JSON 객체 형식이 아닙니다.'], warnings: [] };
  }

  const obj = rawInput as Record<string, unknown>;

  if (typeof obj.version !== 'string' || !obj.version.trim()) {
    errors.push('버전 정보(version) 필드가 누락되었거나 문자열이 아닙니다.');
  }

  if (!Array.isArray(obj.nodes) || obj.nodes.length < 2) {
    errors.push('교차로 목록(nodes)은 최소 2개 이상의 배열이어야 합니다.');
  }

  if (!Array.isArray(obj.edges) || obj.edges.length < 1) {
    errors.push('도로 목록(edges)은 최소 1개 이상의 배열이어야 합니다.');
  }

  if (!Array.isArray(obj.demands)) {
    errors.push('수요 목록(demands) 배열이 누락되었습니다.');
  }

  if (errors.length > 0) {
    return { valid: false, errors, warnings };
  }

  const rawNodes = obj.nodes as unknown[];
  const rawEdges = obj.edges as unknown[];
  const rawDemands = obj.demands as unknown[];

  const nodeMap = new Map<string, NodeData>();
  const sanitizedNodes: NodeData[] = [];

  for (let i = 0; i < rawNodes.length; i++) {
    const item = rawNodes[i] as Record<string, unknown>;
    if (!item || typeof item !== 'object') {
      errors.push(`nodes[${i}] 항목이 객체가 아닙니다.`);
      continue;
    }
    const id = typeof item.id === 'string' ? item.id.trim() : '';
    if (!id) {
      errors.push(`nodes[${i}]의 id가 비어 있습니다.`);
      continue;
    }
    if (nodeMap.has(id)) {
      errors.push(`중복된 교차로 ID가 존재합니다: '${id}'`);
      continue;
    }
    const x = Number(item.x);
    const y = Number(item.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      errors.push(`교차로 '${id}'의 좌표(x, y)가 유효한 숫자가 아닙니다.`);
      continue;
    }

    const sigRaw = (item.signal as Partial<SignalConfig>) || {};
    if (
      (sigRaw.nsGreenSeconds !== undefined && Number(sigRaw.nsGreenSeconds) < MIN_GREEN_SECONDS) ||
      (sigRaw.ewGreenSeconds !== undefined && Number(sigRaw.ewGreenSeconds) < MIN_GREEN_SECONDS)
    ) {
      warnings.push(
        `교차로 '${id}'의 녹색 시간이 최소 안전 시간(${MIN_GREEN_SECONDS}초)보다 작아 보정되었습니다.`
      );
    }

    const node: NodeData = {
      id,
      name: typeof item.name === 'string' && item.name.trim() ? item.name.trim() : id,
      x,
      y,
      signal: sanitizeSignalConfig(sigRaw),
    };
    nodeMap.set(id, node);
    sanitizedNodes.push(node);
  }

  const edgeIdSet = new Set<string>();
  const pairSet = new Set<string>();
  const sanitizedEdges: EdgeData[] = [];

  for (let i = 0; i < rawEdges.length; i++) {
    const item = rawEdges[i] as Record<string, unknown>;
    if (!item || typeof item !== 'object') {
      errors.push(`edges[${i}] 항목이 객체가 아닙니다.`);
      continue;
    }
    const id = typeof item.id === 'string' ? item.id.trim() : '';
    const from = typeof item.from === 'string' ? item.from.trim() : '';
    const to = typeof item.to === 'string' ? item.to.trim() : '';

    if (!id) {
      errors.push(`edges[${i}]의 id가 비어 있습니다.`);
      continue;
    }
    if (edgeIdSet.has(id)) {
      errors.push(`중복된 도로 ID가 존재합니다: '${id}'`);
      continue;
    }
    const fromNode = nodeMap.get(from);
    const toNode = nodeMap.get(to);
    if (!fromNode) {
      errors.push(`도로 '${id}'의 출발 교차로('${from}')를 찾을 수 없습니다 (참조 무결성 오류).`);
      continue;
    }
    if (!toNode) {
      errors.push(`도로 '${id}'의 도착 교차로('${to}')를 찾을 수 없습니다 (참조 무결성 오류).`);
      continue;
    }
    if (from === to) {
      errors.push(`도로 '${id}'의 출발지와 도착지가 동일합니다 ('${from}').`);
      continue;
    }
    const pairKey = `${from}->${to}`;
    if (pairSet.has(pairKey)) {
      errors.push(`동일 구간에 중복된 방향의 도로가 존재합니다: ${pairKey}`);
      continue;
    }

    const lanes = Math.max(1, Math.min(4, Math.round(Number(item.lanes) || 1)));
    const speedLimitKmh = Math.max(20, Math.min(100, Math.round(Number(item.speedLimitKmh) || 50)));
    const lengthMeters =
      Number.isFinite(Number(item.lengthMeters)) && Number(item.lengthMeters) >= 40
        ? Math.round(Number(item.lengthMeters))
        : computeEdgeLength(fromNode, toNode);
    const capacity = computeEdgeCapacity(lengthMeters, lanes);

    edgeIdSet.add(id);
    pairSet.add(pairKey);
    sanitizedEdges.push({
      id,
      name:
        typeof item.name === 'string' && item.name.trim()
          ? item.name.trim()
          : `${fromNode.name} → ${toNode.name}`,
      from,
      to,
      lanes,
      speedLimitKmh,
      lengthMeters,
      capacity,
    });
  }

  const sanitizedDemands: ODDemand[] = [];
  const demandIds = new Set<string>();

  for (let i = 0; i < rawDemands.length; i++) {
    const item = rawDemands[i] as Record<string, unknown>;
    if (!item || typeof item !== 'object') {
      errors.push(`demands[${i}] 항목이 객체가 아닙니다.`);
      continue;
    }
    const id = typeof item.id === 'string' && item.id.trim() ? item.id.trim() : `od_${i + 1}`;
    if (demandIds.has(id)) {
      errors.push(`중복된 수요(OD) ID가 존재합니다: '${id}'`);
      continue;
    }
    const origin = typeof item.origin === 'string' ? item.origin.trim() : '';
    const destination = typeof item.destination === 'string' ? item.destination.trim() : '';
    if (!nodeMap.has(origin)) {
      errors.push(`수요 '${id}'의 출발지 교차로('${origin}')가 존재하지 않습니다 (참조 무결성 오류).`);
      continue;
    }
    if (!nodeMap.has(destination)) {
      errors.push(`수요 '${id}'의 목적지 교차로('${destination}')가 존재하지 않습니다 (참조 무결성 오류).`);
      continue;
    }
    if (origin === destination) {
      errors.push(`수요 '${id}'의 출발지와 목적지가 동일합니다 ('${origin}').`);
      continue;
    }
    const vph = Number(item.vehiclesPerHour);
    if (!Number.isFinite(vph) || vph < 0 || vph > 5000) {
      errors.push(`수요 '${id}'의 시간당 차량 수(vehiclesPerHour)가 유효 범위(0~5000)를 벗어났습니다.`);
      continue;
    }

    demandIds.add(id);
    sanitizedDemands.push({
      id,
      origin,
      destination,
      vehiclesPerHour: Math.round(vph),
      label: typeof item.label === 'string' ? item.label : undefined,
    });
  }

  if (errors.length > 0) {
    return { valid: false, errors, warnings };
  }

  const rawConfig = (obj.config as Record<string, unknown>) || {};
  const seed = Number.isFinite(Number(rawConfig.seed)) ? Math.floor(Number(rawConfig.seed)) : 42;
  const demandMultiplier = Number.isFinite(Number(rawConfig.demandMultiplier))
    ? Math.max(0.25, Math.min(2.5, Number(rawConfig.demandMultiplier)))
    : 1.0;
  const routingMode = rawConfig.routingMode === 'congested' ? 'congested' : 'freeflow';

  const sanitizedData: CityNetworkData = {
    version: String(obj.version),
    id: typeof obj.id === 'string' && obj.id.trim() ? obj.id.trim() : 'custom_city',
    name: typeof obj.name === 'string' && obj.name.trim() ? obj.name.trim() : '사용자 정의 도시',
    description: typeof obj.description === 'string' ? obj.description : '',
    hypothesis: typeof obj.hypothesis === 'string' ? obj.hypothesis : undefined,
    nodes: sanitizedNodes,
    edges: sanitizedEdges,
    demands: sanitizedDemands,
    config: {
      seed,
      demandMultiplier,
      routingMode,
      dtSeconds: 0.2,
    },
  };

  return {
    valid: true,
    errors: [],
    warnings,
    sanitizedData,
  };
}
