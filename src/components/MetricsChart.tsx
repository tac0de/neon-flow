import React, { useState } from 'react';
import { TimeSeriesPoint } from '../types/simulation';
import { Activity, Clock, Users, CheckCircle2, Gauge } from 'lucide-react';

type ChartMetricTab = 'TRAVEL_AND_WAIT' | 'QUEUES' | 'COMPLETED' | 'SPEED';

interface MetricsChartProps {
  history: TimeSeriesPoint[];
  baselineHistory?: TimeSeriesPoint[] | null;
  warmupSeconds?: number;
}

export const MetricsChart: React.FC<MetricsChartProps> = ({
  history,
  baselineHistory,
  warmupSeconds = 30,
}) => {
  const [activeTab, setActiveTab] = useState<ChartMetricTab>('TRAVEL_AND_WAIT');

  const width = 760;
  const height = 128;
  const padLeft = 58;
  const padRight = 18;
  const padTop = 16;
  const padBottom = 22;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  const allPoints = [...history, ...(baselineHistory || [])];
  const maxTime = Math.max(
    60,
    ...allPoints.map((p) => p.timeSeconds)
  );

  const getValue = (p: TimeSeriesPoint): number => {
    switch (activeTab) {
      case 'TRAVEL_AND_WAIT':
        return p.avgTravelTimeSeconds;
      case 'QUEUES':
        return p.waitingVehicles;
      case 'COMPLETED':
        return p.completedVehicles;
      case 'SPEED':
        return p.networkAvgSpeedKmh;
    }
  };

  const getSecondaryValue = (p: TimeSeriesPoint): number | null => {
    if (activeTab === 'TRAVEL_AND_WAIT') return p.activeAvgWaitSeconds;
    if (activeTab === 'QUEUES') return p.externalQueue;
    return null;
  };

  let maxY = 10;
  for (const p of allPoints) {
    const v1 = getValue(p);
    const v2 = getSecondaryValue(p) ?? 0;
    if (v1 > maxY) maxY = v1;
    if (v2 > maxY) maxY = v2;
  }
  maxY = Math.ceil(maxY * 1.15);

  const toX = (t: number) => padLeft + (t / Math.max(1, maxTime)) * plotW;
  const toY = (v: number) => padTop + plotH - (Math.min(maxY, Math.max(0, v)) / Math.max(1, maxY)) * plotH;

  const buildPath = (pts: TimeSeriesPoint[], extractor: (p: TimeSeriesPoint) => number): string => {
    if (pts.length === 0) return '';
    return pts
      .map((p, i) => `${i === 0 ? 'M' : 'L'}${toX(p.timeSeconds).toFixed(1)},${toY(extractor(p)).toFixed(1)}`)
      .join(' ');
  };

  const primaryPath = buildPath(history, getValue);
  const secondaryPath =
    activeTab === 'TRAVEL_AND_WAIT' || activeTab === 'QUEUES'
      ? buildPath(history, (p) => getSecondaryValue(p) ?? 0)
      : '';
  const baselinePrimaryPath =
    baselineHistory && baselineHistory.length > 0 ? buildPath(baselineHistory, getValue) : '';

  const unitLabel =
    activeTab === 'TRAVEL_AND_WAIT'
      ? '초(s)'
      : activeTab === 'SPEED'
      ? 'km/h'
      : '대(veh)';

  return (
    <div className="bottom-chart-panel">
      <div className="chart-header">
        <div className="chart-title-group">
          <Activity size={15} className="icon-cyan" />
          <span className="chart-title">시간별 교통 흐름 추이 (공통 시간·척도 비교)</span>
        </div>

        <div className="chart-tabs">
          <button
            type="button"
            className={`chart-tab-btn ${activeTab === 'TRAVEL_AND_WAIT' ? 'active' : ''}`}
            onClick={() => setActiveTab('TRAVEL_AND_WAIT')}
          >
            <Clock size={12} /> 통행시간·미완료대기 (s)
          </button>
          <button
            type="button"
            className={`chart-tab-btn ${activeTab === 'QUEUES' ? 'active' : ''}`}
            onClick={() => setActiveTab('QUEUES')}
          >
            <Users size={12} /> 대기차량·외부대기열 (대)
          </button>
          <button
            type="button"
            className={`chart-tab-btn ${activeTab === 'COMPLETED' ? 'active' : ''}`}
            onClick={() => setActiveTab('COMPLETED')}
          >
            <CheckCircle2 size={12} /> 도착 완료 차량 (대)
          </button>
          <button
            type="button"
            className={`chart-tab-btn ${activeTab === 'SPEED' ? 'active' : ''}`}
            onClick={() => setActiveTab('SPEED')}
          >
            <Gauge size={12} /> 평균 속도 (km/h)
          </button>
        </div>

        <div className="chart-legend">
          <span className="legend-chip cyan">
            <span className="line-swatch solid-cyan" />
            {activeTab === 'TRAVEL_AND_WAIT'
              ? '현재 도착 평균통행(s)'
              : activeTab === 'QUEUES'
              ? '현재 총 대기차량(대)'
              : activeTab === 'COMPLETED'
              ? '현재 도착완료(대)'
              : '현재 평균속도(km/h)'}
          </span>
          {(activeTab === 'TRAVEL_AND_WAIT' || activeTab === 'QUEUES') && (
            <span className="legend-chip rose">
              <span className="line-swatch solid-rose" />
              {activeTab === 'TRAVEL_AND_WAIT' ? '미완료 차량 대기(s)' : '미진입 외부 대기열(대)'}
            </span>
          )}
          {baselineHistory && baselineHistory.length > 0 && (
            <span className="legend-chip amber">
              <span className="line-swatch dashed-amber" />
              개선 전 기준(Baseline)
            </span>
          )}
        </div>
      </div>

      <div className="chart-body">
        <svg viewBox={`0 0 ${width} ${height}`} className="metrics-svg" preserveAspectRatio="none">
          {/* Horizontal grid lines */}
          {[0, 0.5, 1].map((frac, idx) => {
            const y = padTop + plotH * (1 - frac);
            const val = Math.round(maxY * frac);
            return (
              <g key={idx}>
                <line
                  x1={padLeft}
                  y1={y}
                  x2={width - padRight}
                  y2={y}
                  stroke="rgba(51, 65, 85, 0.45)"
                  strokeDasharray={frac === 0 ? undefined : '3 3'}
                />
                <text
                  x={padLeft - 6}
                  y={y + 3}
                  textAnchor="end"
                  fill="#94a3b8"
                  fontSize="10"
                  fontFamily="JetBrains Mono, monospace"
                >
                  {val}
                </text>
              </g>
            );
          })}

          {/* Warmup vertical marker if within range */}
          {warmupSeconds > 0 && warmupSeconds < maxTime && (
            <g>
              <line
                x1={toX(warmupSeconds)}
                y1={padTop}
                x2={toX(warmupSeconds)}
                y2={padTop + plotH}
                stroke="rgba(148, 163, 184, 0.35)"
                strokeDasharray="2 3"
              />
              <text
                x={toX(warmupSeconds) + 4}
                y={padTop + 10}
                fill="#64748b"
                fontSize="9"
                fontFamily="Pretendard, sans-serif"
              >
                워밍업 {warmupSeconds}s
              </text>
            </g>
          )}

          {/* Time axis ticks */}
          {[0, 0.25, 0.5, 0.75, 1].map((frac, idx) => {
            const t = Math.round(maxTime * frac);
            const x = toX(t);
            return (
              <text
                key={idx}
                x={x}
                y={height - 5}
                textAnchor="middle"
                fill="#94a3b8"
                fontSize="10"
                fontFamily="JetBrains Mono, monospace"
              >
                {t}s
              </text>
            );
          })}

          {/* Baseline comparison path */}
          {baselinePrimaryPath && (
            <path
              d={baselinePrimaryPath}
              fill="none"
              stroke="#f59e0b"
              strokeWidth="2"
              strokeDasharray="5 4"
            />
          )}

          {/* Secondary metric path */}
          {secondaryPath && (
            <path d={secondaryPath} fill="none" stroke="#fb7185" strokeWidth="1.8" />
          )}

          {/* Primary metric path */}
          {primaryPath && (
            <path d={primaryPath} fill="none" stroke="#22d3ee" strokeWidth="2.3" />
          )}

          {/* Unit label */}
          <text
            x={6}
            y={padTop + 4}
            fill="#64748b"
            fontSize="9"
            fontFamily="JetBrains Mono, monospace"
          >
            [{unitLabel}]
          </text>
        </svg>
      </div>
    </div>
  );
};
