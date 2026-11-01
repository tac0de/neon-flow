import { CityNetworkData, EdgeData, NodeData } from '../types/simulation';
import { computeEdgeCapacity, computeEdgeLength } from '../engine/router';

function makeEdge(
  id: string,
  name: string,
  from: NodeData,
  to: NodeData,
  lanes: number,
  speedLimitKmh: number,
  overrideLength?: number
): EdgeData {
  const lengthMeters = overrideLength ?? computeEdgeLength(from, to);
  return {
    id,
    name,
    from: from.id,
    to: to.id,
    lanes,
    speedLimitKmh,
    lengthMeters,
    capacity: computeEdgeCapacity(lengthMeters, lanes),
  };
}

/**
 * Scenario 1: 출퇴근 혼잡 (Commute Rush)
 * 3x3 urban grid where commute flows converge on the central arterial corridor (N21 -> N22 -> N23 & N12 -> N22 -> N32).
 */
export function createCommuteRushScenario(): CityNetworkData {
  const nodes: NodeData[] = [
    {
      id: 'N11',
      name: '북서 주거단지',
      x: 200,
      y: 160,
      signal: { enabled: true, nsGreenSeconds: 22, ewGreenSeconds: 22, yellowSeconds: 2, allRedSeconds: 1, offsetSeconds: 0 },
    },
    {
      id: 'N12',
      name: '북부 환승센터',
      x: 500,
      y: 160,
      signal: { enabled: true, nsGreenSeconds: 20, ewGreenSeconds: 24, yellowSeconds: 2, allRedSeconds: 1, offsetSeconds: 8 },
    },
    {
      id: 'N13',
      name: '북동 업무지구',
      x: 800,
      y: 160,
      signal: { enabled: true, nsGreenSeconds: 22, ewGreenSeconds: 22, yellowSeconds: 2, allRedSeconds: 1, offsetSeconds: 16 },
    },
    {
      id: 'N21',
      name: '서부 게이트',
      x: 200,
      y: 380,
      signal: { enabled: true, nsGreenSeconds: 26, ewGreenSeconds: 18, yellowSeconds: 2, allRedSeconds: 1, offsetSeconds: 0 },
    },
    {
      id: 'N22',
      name: '중앙 네온광장',
      x: 500,
      y: 380,
      signal: { enabled: true, nsGreenSeconds: 22, ewGreenSeconds: 18, yellowSeconds: 2, allRedSeconds: 1, offsetSeconds: 20 },
    },
    {
      id: 'N23',
      name: '동부 테크노밸리',
      x: 800,
      y: 380,
      signal: { enabled: true, nsGreenSeconds: 26, ewGreenSeconds: 18, yellowSeconds: 2, allRedSeconds: 1, offsetSeconds: 5 },
    },
    {
      id: 'N31',
      name: '남서 물류단지',
      x: 200,
      y: 600,
      signal: { enabled: true, nsGreenSeconds: 22, ewGreenSeconds: 22, yellowSeconds: 2, allRedSeconds: 1, offsetSeconds: 10 },
    },
    {
      id: 'N32',
      name: '남부 고속터미널',
      x: 500,
      y: 600,
      signal: { enabled: true, nsGreenSeconds: 20, ewGreenSeconds: 24, yellowSeconds: 2, allRedSeconds: 1, offsetSeconds: 14 },
    },
    {
      id: 'N33',
      name: '남동 산업단지',
      x: 800,
      y: 600,
      signal: { enabled: true, nsGreenSeconds: 22, ewGreenSeconds: 22, yellowSeconds: 2, allRedSeconds: 1, offsetSeconds: 4 },
    },
  ];

  const nm = new Map(nodes.map((n) => [n.id, n]));
  const edges: EdgeData[] = [];

  const addBidirectional = (
    aId: string,
    bId: string,
    corridorName: string,
    lanes: number,
    speedKmh: number
  ) => {
    const a = nm.get(aId)!;
    const b = nm.get(bId)!;
    edges.push(makeEdge(`E_${aId}_${bId}`, `${corridorName} (${a.name}→${b.name})`, a, b, lanes, speedKmh));
    edges.push(makeEdge(`E_${bId}_${aId}`, `${corridorName} (${b.name}→${a.name})`, b, a, lanes, speedKmh));
  };

  // Horizontal rows
  addBidirectional('N11', 'N12', '북부순환로 서측', 2, 50);
  addBidirectional('N12', 'N13', '북부순환로 동측', 2, 50);
  addBidirectional('N21', 'N22', '중앙대로 서측', 2, 60);
  addBidirectional('N22', 'N23', '중앙대로 동측', 2, 60);
  addBidirectional('N31', 'N32', '남부순환로 서측', 2, 50);
  addBidirectional('N32', 'N33', '남부순환로 동측', 2, 50);

  // Vertical columns
  addBidirectional('N11', 'N21', '서부간선 북측', 2, 50);
  addBidirectional('N21', 'N31', '서부간선 남측', 2, 50);
  addBidirectional('N12', 'N22', '중앙간선 북측', 2, 55);
  addBidirectional('N22', 'N32', '중앙간선 남측', 2, 55);
  addBidirectional('N13', 'N23', '동부간선 북측', 2, 50);
  addBidirectional('N23', 'N33', '동부간선 남측', 2, 50);

  return {
    version: '1.0.0',
    id: 'commute_rush',
    name: '시나리오 1: 출퇴근 혼잡 (도심 집중)',
    description:
      '서부·북부 주거지에서 중앙 네온광장(N22)을 거쳐 동부 테크노밸리(N23) 및 남부 터미널(N32)로 출근 수요가 집중됩니다.',
    hypothesis:
      '중앙 네온광장(N22)과 동부 테크노밸리(N23)의 동서(EW) 녹색 시간 및 연동 오프셋을 최적화하면 도심 대기열과 통행 시간이 크게 감소합니다.',
    nodes,
    edges,
    demands: [
      { id: 'OD_1', origin: 'N21', destination: 'N23', vehiclesPerHour: 950, label: '서부→동부 핵심 통근축' },
      { id: 'OD_2', origin: 'N11', destination: 'N23', vehiclesPerHour: 620, label: '북서주거→동부테크노' },
      { id: 'OD_3', origin: 'N12', destination: 'N32', vehiclesPerHour: 720, label: '북부환승→남부터미널' },
      { id: 'OD_4', origin: 'N31', destination: 'N23', vehiclesPerHour: 480, label: '남서물류→동부테크노' },
      { id: 'OD_5', origin: 'N23', destination: 'N21', vehiclesPerHour: 420, label: '동부→서부 역방향 통행' },
      { id: 'OD_6', origin: 'N32', destination: 'N12', vehiclesPerHour: 380, label: '남부→북부 간선 통행' },
      { id: 'OD_7', origin: 'N13', destination: 'N33', vehiclesPerHour: 310, label: '동부 외곽 종단' },
    ],
    config: {
      seed: 101,
      demandMultiplier: 1.0,
      routingMode: 'freeflow',
      dtSeconds: 0.2,
      initialActiveVehicles: 42,
    },
  };
}

/**
 * Scenario 2: 교차로 병목 (Signal Bottleneck)
 * Heavy East-West arterial flow is choked by an inefficient signal plan that gives 40s to NS (light demand) and only 10s to EW (heavy demand).
 */
export function createSignalBottleneckScenario(): CityNetworkData {
  const nodes: NodeData[] = [
    {
      id: 'B_W',
      name: '서부 진입로',
      x: 150,
      y: 380,
      signal: { enabled: true, nsGreenSeconds: 20, ewGreenSeconds: 28, yellowSeconds: 2, allRedSeconds: 1, offsetSeconds: 0 },
    },
    {
      id: 'B_C1',
      name: '제1 병목교차로',
      x: 420,
      y: 380,
      // Deliberately skewed signal: NS has 40s green, EW has only 10s green!
      signal: { enabled: true, nsGreenSeconds: 40, ewGreenSeconds: 10, yellowSeconds: 2, allRedSeconds: 1, offsetSeconds: 0 },
    },
    {
      id: 'B_C2',
      name: '제2 병목교차로',
      x: 690,
      y: 380,
      // Deliberately skewed signal: NS has 38s green, EW has only 12s green!
      signal: { enabled: true, nsGreenSeconds: 38, ewGreenSeconds: 12, yellowSeconds: 2, allRedSeconds: 1, offsetSeconds: 18 },
    },
    {
      id: 'B_E',
      name: '동부 종점',
      x: 960,
      y: 380,
      signal: { enabled: true, nsGreenSeconds: 18, ewGreenSeconds: 30, yellowSeconds: 2, allRedSeconds: 1, offsetSeconds: 6 },
    },
    {
      id: 'B_N1',
      name: '북1 지선',
      x: 420,
      y: 150,
      signal: { enabled: true, nsGreenSeconds: 24, ewGreenSeconds: 20, yellowSeconds: 2, allRedSeconds: 1, offsetSeconds: 0 },
    },
    {
      id: 'B_S1',
      name: '남1 지선',
      x: 420,
      y: 610,
      signal: { enabled: true, nsGreenSeconds: 24, ewGreenSeconds: 20, yellowSeconds: 2, allRedSeconds: 1, offsetSeconds: 0 },
    },
    {
      id: 'B_N2',
      name: '북2 지선',
      x: 690,
      y: 150,
      signal: { enabled: true, nsGreenSeconds: 24, ewGreenSeconds: 20, yellowSeconds: 2, allRedSeconds: 1, offsetSeconds: 0 },
    },
    {
      id: 'B_S2',
      name: '남2 지선',
      x: 690,
      y: 610,
      signal: { enabled: true, nsGreenSeconds: 24, ewGreenSeconds: 20, yellowSeconds: 2, allRedSeconds: 1, offsetSeconds: 0 },
    },
  ];

  const nm = new Map(nodes.map((n) => [n.id, n]));
  const edges: EdgeData[] = [];
  const addBi = (aId: string, bId: string, label: string, lanes: number, speed: number) => {
    const a = nm.get(aId)!;
    const b = nm.get(bId)!;
    edges.push(makeEdge(`E_${aId}_${bId}`, `${label} (${a.name}→${b.name})`, a, b, lanes, speed));
    edges.push(makeEdge(`E_${bId}_${aId}`, `${label} (${b.name}→${a.name})`, b, a, lanes, speed));
  };

  // Main East-West Arterial (2 lanes each way, 60 km/h)
  addBi('B_W', 'B_C1', '동서간선 1구간', 2, 60);
  addBi('B_C1', 'B_C2', '동서간선 중앙구간', 2, 60);
  addBi('B_C2', 'B_E', '동서간선 2구간', 2, 60);

  // Minor North-South Cross Streets (1 lane each way, 40 km/h)
  addBi('B_N1', 'B_C1', '1번 남북지선 북측', 1, 40);
  addBi('B_C1', 'B_S1', '1번 남북지선 남측', 1, 40);
  addBi('B_N2', 'B_C2', '2번 남북지선 북측', 1, 40);
  addBi('B_C2', 'B_S2', '2번 남북지선 남측', 1, 40);

  return {
    version: '1.0.0',
    id: 'signal_bottleneck',
    name: '시나리오 2: 교차로 병목 (비효율 신호 배분)',
    description:
      '동서 간선도로에 시간당 1,700대 이상의 수요가 몰리지만, 제1·제2 병목교차로의 동서(EW) 녹색 시간이 10~12초로 묶여 심각한 적색 대기와 스필백이 발생합니다.',
    hypothesis:
      '제1·제2 병목교차로를 클릭해 동서(EW) 녹색 시간을 34초 이상으로 늘리고 남북(NS) 녹색 시간을 줄이거나 [신호 최적화]를 실행하면 대기열이 즉시 해소됩니다.',
    nodes,
    edges,
    demands: [
      { id: 'OD_EW_1', origin: 'B_W', destination: 'B_E', vehiclesPerHour: 1150, label: '서부→동부 주간선 급행' },
      { id: 'OD_WE_1', origin: 'B_E', destination: 'B_W', vehiclesPerHour: 650, label: '동부→서부 주간선 복귀' },
      { id: 'OD_NS_1', origin: 'B_N1', destination: 'B_S1', vehiclesPerHour: 160, label: '1번 지선 남하 (한산)' },
      { id: 'OD_SN_1', origin: 'B_S1', destination: 'B_N1', vehiclesPerHour: 140, label: '1번 지선 북상 (한산)' },
      { id: 'OD_NS_2', origin: 'B_N2', destination: 'B_S2', vehiclesPerHour: 150, label: '2번 지선 남하 (한산)' },
      { id: 'OD_SN_2', origin: 'B_S2', destination: 'B_N2', vehiclesPerHour: 140, label: '2번 지선 북상 (한산)' },
    ],
    config: {
      seed: 202,
      demandMultiplier: 1.0,
      routingMode: 'freeflow',
      dtSeconds: 0.2,
      initialActiveVehicles: 36,
    },
  };
}

/**
 * Scenario 3: 우회 실험 — 브래스의 역설 (Braess's Paradox / Detour Experiment)
 * Demonstrates that adding a fast shortcut link (N_HUB -> S_HUB) causes selfish shortest-path routing to overload S_HUB,
 * degrading overall travel time compared to removing the shortcut road.
 */
export function createBraessDetourScenario(): CityNetworkData {
  const nodes: NodeData[] = [
    {
      id: 'W_ORIG',
      name: '서부 출발허브',
      x: 160,
      y: 380,
      signal: { enabled: false, nsGreenSeconds: 24, ewGreenSeconds: 24, yellowSeconds: 2, allRedSeconds: 1, offsetSeconds: 0 },
    },
    {
      id: 'N_HUB',
      name: '북부 코어교차로',
      x: 520,
      y: 160,
      signal: { enabled: true, nsGreenSeconds: 16, ewGreenSeconds: 28, yellowSeconds: 2, allRedSeconds: 1, offsetSeconds: 0 },
    },
    {
      id: 'S_HUB',
      name: '남부 합류교차로',
      x: 520,
      y: 600,
      // S_HUB gives 34s green to EW main road, and only 10s green to NS (where the shortcut arrives)
      signal: { enabled: true, nsGreenSeconds: 10, ewGreenSeconds: 34, yellowSeconds: 2, allRedSeconds: 1, offsetSeconds: 6 },
    },
    {
      id: 'E_DEST',
      name: '동부 도착허브',
      x: 880,
      y: 380,
      signal: { enabled: false, nsGreenSeconds: 26, ewGreenSeconds: 26, yellowSeconds: 2, allRedSeconds: 1, offsetSeconds: 0 },
    },
    {
      id: 'N_FEED',
      name: '북부 지선진입',
      x: 520,
      y: 40,
      signal: { enabled: false, nsGreenSeconds: 24, ewGreenSeconds: 24, yellowSeconds: 2, allRedSeconds: 1, offsetSeconds: 0 },
    },
    {
      id: 'S_FEED',
      name: '남부 지선진입',
      x: 160,
      y: 600,
      signal: { enabled: false, nsGreenSeconds: 24, ewGreenSeconds: 24, yellowSeconds: 2, allRedSeconds: 1, offsetSeconds: 0 },
    },
  ];

  const nm = new Map(nodes.map((n) => [n.id, n]));
  const edges: EdgeData[] = [
    // Diamond Upper Links: W_ORIG -> N_HUB (Fast 75km/h, 220m => 10.6s) -> E_DEST (Wide 2-lane arterial, 36km/h, 390m => 39.0s)
    makeEdge('E_W_NHUB', '북서 고속진입로 (빠름)', nm.get('W_ORIG')!, nm.get('N_HUB')!, 2, 75, 220),
    makeEdge('E_NHUB_EDEST', '북동 우회간선 (2차선 여유)', nm.get('N_HUB')!, nm.get('E_DEST')!, 2, 36, 390),

    // Diamond Lower Links: W_ORIG -> S_HUB (Wide 2-lane arterial, 36km/h, 390m => 39.0s) -> E_DEST (1-lane bottleneck exit, 75km/h, 220m => 10.6s)
    makeEdge('E_W_SHUB', '남서 우회간선 (2차선 여유)', nm.get('W_ORIG')!, nm.get('S_HUB')!, 2, 36, 390),
    makeEdge('E_SHUB_EDEST', '남동 진출로 (1차선 집중)', nm.get('S_HUB')!, nm.get('E_DEST')!, 1, 75, 220),

    // Feeder links
    makeEdge('E_SFEED_SHUB', '남부 지선 진입로', nm.get('S_FEED')!, nm.get('S_HUB')!, 1, 55, 260),
    makeEdge('E_NFEED_NHUB', '북부 지선 진입로', nm.get('N_FEED')!, nm.get('N_HUB')!, 1, 55, 120),

    // THE BRAESS SHORTCUT ROAD: N_HUB -> S_HUB (1 lane, 80km/h, 130m => 5.85s)
    // Free-flow time via shortcut: 10.6s + 5.85s + 10.6s + turns(6s) = 33.1s << 49.6s (direct upper/lower)!
    // Every W_ORIG -> E_DEST vehicle selfishly takes E_SHORTCUT_NS, hitting S_HUB's 10s NS green & 1-lane E_SHUB_EDEST bottleneck!
    makeEdge('E_SHORTCUT_NS', '중앙 지름길 (브래스 연결로)', nm.get('N_HUB')!, nm.get('S_HUB')!, 1, 80, 130),
  ];

  return {
    version: '1.0.0',
    id: 'braess_detour',
    name: '시나리오 3: 우회 실험 (도로 추가의 역설)',
    description:
      '북부 코어교차로(N_HUB)에서 남부 합류교차로(S_HUB)로 이어지는 1차선 고속 지름길(E_SHORTCUT_NS) 때문에 자유류 최단경로를 따르는 차량들이 지름길로 몰려 남부 합류교차로(NS 녹색 10초)와 남동 진출로에서 심각한 병목과 스필백이 발생합니다.',
    hypothesis:
      '중앙 지름길 도로(E_SHORTCUT_NS)를 클릭해 [도로 삭제]하면 차량들이 2차선 북동·남서 간선으로 분산되어 완료 차량 수가 늘고 평균 통행 시간과 대기열이 크게 감소합니다.',
    nodes,
    edges,
    demands: [
      { id: 'OD_MAIN', origin: 'W_ORIG', destination: 'E_DEST', vehiclesPerHour: 1150, label: '서부→동부 주류 통행 (지름길 유인)' },
      { id: 'OD_SOUTH_LOCAL', origin: 'S_FEED', destination: 'E_DEST', vehiclesPerHour: 520, label: '남부지선→동부 합류 수요' },
      { id: 'OD_NORTH_LOCAL', origin: 'N_FEED', destination: 'E_DEST', vehiclesPerHour: 420, label: '북부지선→동부 상단 수요' },
    ],
    config: {
      seed: 303,
      demandMultiplier: 1.0,
      routingMode: 'freeflow',
      dtSeconds: 0.2,
      initialActiveVehicles: 24,
    },
  };
}

/**
 * Scenario 4: 메가시티 1,000대 성능 스트레스 테스트 (4x4 High-Capacity Grid)
 * Verifies desktop 1,000+ simultaneous active vehicles performance and conservation.
 */
export function createMegacityStressScenario(): CityNetworkData {
  const nodes: NodeData[] = [];
  const cols = 4;
  const rows = 4;

  for (let r = 1; r <= rows; r++) {
    for (let c = 1; c <= cols; c++) {
      const id = `M${r}${c}`;
      nodes.push({
        id,
        name: `메가교차로 ${r}-${c}`,
        x: (c - 1) * 340 + 120,
        y: (r - 1) * 260 + 100,
        signal: {
          enabled: true,
          nsGreenSeconds: 24,
          ewGreenSeconds: 24,
          yellowSeconds: 2,
          allRedSeconds: 1,
          offsetSeconds: ((r * 7 + c * 11) % 48),
        },
      });
    }
  }

  const nm = new Map(nodes.map((n) => [n.id, n]));
  const edges: EdgeData[] = [];
  const addBi = (aId: string, bId: string) => {
    const a = nm.get(aId)!;
    const b = nm.get(bId)!;
    // Use 3 lanes and 340m effective length => capacity 135 vehicles per edge (48 edges => 6,480 capacity)
    edges.push(makeEdge(`E_${aId}_${bId}`, `${a.name}→${b.name}`, a, b, 3, 65, 340));
    edges.push(makeEdge(`E_${bId}_${aId}`, `${b.name}→${a.name}`, b, a, 3, 65, 340));
  };

  for (let r = 1; r <= rows; r++) {
    for (let c = 1; c <= cols; c++) {
      if (c < cols) addBi(`M${r}${c}`, `M${r}${c + 1}`);
      if (r < rows) addBi(`M${r}${c}`, `M${r + 1}${c}`);
    }
  }

  return {
    version: '1.0.0',
    id: 'megacity_stress',
    name: '시나리오 4: 1,000대 부하 벤치마크 (메가시티)',
    description:
      '4x4 3차선 대도시 격자망에서 1,050대의 초기 활성 차량과 고밀도 유입 수요를 동시에 시뮬레이션하여 1,000대 실시간 물리 연산 및 렌더링 성능을 검증합니다.',
    hypothesis:
      '고밀도 차량(1,000대+) 환경에서도 고정 시간 간격(0.2s) 물리 업데이트와 Canvas 렌더링이 분리되어 실시간 프레임을 유지하며 차량 보존식이 100% 성립합니다.',
    nodes,
    edges,
    demands: [
      { id: 'OD_M1', origin: 'M11', destination: 'M44', vehiclesPerHour: 1800, label: '북서→남동 대각 축' },
      { id: 'OD_M2', origin: 'M41', destination: 'M14', vehiclesPerHour: 1800, label: '남서→북동 대각 축' },
      { id: 'OD_M3', origin: 'M21', destination: 'M24', vehiclesPerHour: 1600, label: '중북부 동서 관통' },
      { id: 'OD_M4', origin: 'M34', destination: 'M31', vehiclesPerHour: 1600, label: '중남부 서향 관통' },
      { id: 'OD_M5', origin: 'M12', destination: 'M42', vehiclesPerHour: 1500, label: '서부 남북 종단' },
      { id: 'OD_M6', origin: 'M43', destination: 'M13', vehiclesPerHour: 1500, label: '동부 북향 종단' },
      { id: 'OD_M7', origin: 'M14', destination: 'M41', vehiclesPerHour: 1400, label: '북동→남서 역방향' },
      { id: 'OD_M8', origin: 'M44', destination: 'M11', vehiclesPerHour: 1400, label: '남동→북서 역방향' },
    ],
    config: {
      seed: 404,
      demandMultiplier: 1.2,
      routingMode: 'freeflow',
      dtSeconds: 0.2,
      initialActiveVehicles: 1050,
    },
  };
}

export const BUILTIN_SCENARIOS: Record<string, () => CityNetworkData> = {
  commute_rush: createCommuteRushScenario,
  signal_bottleneck: createSignalBottleneckScenario,
  braess_detour: createBraessDetourScenario,
  megacity_stress: createMegacityStressScenario,
};
