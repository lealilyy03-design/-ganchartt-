import { useMemo } from 'react';
import type { Task } from '../types';
import type { DepEdge, ScheduleResult } from '../lib/schedule';
import { formatNumber } from '../lib/format';

const W = 184;
const H = 70;
const GX = 96;
const GY = 22;
const PAD = 22;
const TOP = 34;

interface Pos {
  x: number;
  y: number;
  layer: number;
}

export function PertDiagram({
  nodes,
  edges,
  schedule,
  expected,
  variance,
  chain,
  onNodeClick,
}: {
  nodes: Task[];
  edges: DepEdge[];
  schedule: ScheduleResult;
  expected: Map<string, number>;
  variance: Map<string, number>;
  chain: string[];
  onNodeClick: (id: string) => void;
}) {
  const layout = useMemo(() => {
    const ids = new Set(nodes.map((n) => n.id));
    const layer = new Map<string, number>(nodes.map((n) => [n.id, 0]));
    const indeg = new Map<string, number>(nodes.map((n) => [n.id, 0]));
    const succs = new Map<string, string[]>();
    const relevant = edges.filter((e) => ids.has(e.pred) && ids.has(e.succ));

    for (const e of relevant) {
      const list = succs.get(e.pred) ?? [];
      list.push(e.succ);
      succs.set(e.pred, list);
      indeg.set(e.succ, (indeg.get(e.succ) ?? 0) + 1);
    }

    const queue = nodes.filter((n) => (indeg.get(n.id) ?? 0) === 0).map((n) => n.id);
    const processed = new Set<string>();
    while (queue.length > 0) {
      const id = queue.shift()!;
      processed.add(id);
      for (const s of succs.get(id) ?? []) {
        layer.set(s, Math.max(layer.get(s) ?? 0, (layer.get(id) ?? 0) + 1));
        const next = (indeg.get(s) ?? 0) - 1;
        indeg.set(s, next);
        if (next === 0) queue.push(s);
      }
    }
    for (const n of nodes) if (!processed.has(n.id)) layer.set(n.id, 0);

    const maxLayer = Math.max(0, ...layer.values());
    const columns: string[][] = Array.from({ length: maxLayer + 1 }, () => []);
    for (const n of nodes) columns[layer.get(n.id) ?? 0].push(n.id);
    for (const col of columns) {
      col.sort((a, b) => (schedule.tasks.get(a)?.es ?? 0) - (schedule.tasks.get(b)?.es ?? 0));
    }

    const pos = new Map<string, Pos>();
    columns.forEach((col, l) => {
      col.forEach((id, r) => {
        pos.set(id, { x: PAD + l * (W + GX), y: PAD + TOP + r * (H + GY), layer: l });
      });
    });

    const width = PAD * 2 + (maxLayer + 1) * (W + GX) - GX;
    const maxRows = Math.max(1, ...columns.map((c) => c.length));
    const height = PAD + TOP + maxRows * (H + GY) - GY + PAD;

    return { pos, columns, width, height };
  }, [nodes, edges, schedule.tasks]);

  const chainSet = useMemo(() => new Set(chain), [chain]);

  const links = useMemo(() => {
    const seen = new Set<string>();
    const out: { key: string; d: string; critical: boolean; label?: string; lx: number; ly: number }[] = [];
    for (const e of edges) {
      const a = layout.pos.get(e.pred);
      const b = layout.pos.get(e.succ);
      if (!a || !b) continue;
      const key = `${e.pred}->${e.succ}-${e.type}-${e.lag}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const x1 = a.x + W;
      const y1 = a.y + H / 2;
      const x2 = b.x;
      const y2 = b.y + H / 2;
      const dx = Math.max(30, (x2 - x1) * 0.5);
      out.push({
        key,
        d: `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`,
        critical: chainSet.has(e.pred) && chainSet.has(e.succ),
        label: e.lag > 0 ? `${e.type}+${e.lag}` : e.type,
        lx: (x1 + x2) / 2,
        ly: (y1 + y2) / 2 - 5,
      });
    }
    return out;
  }, [edges, layout, chainSet]);

  if (nodes.length === 0) return null;

  return (
    <div className="pert-scroll">
      <svg className="pert-svg" width={Math.max(layout.width, 640)} height={layout.height}>
        <defs>
          <marker id="p-arw" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
            <path d="M0,0 L8,4 L0,8 z" fill="#94a3b8" />
          </marker>
          <marker id="p-arw-c" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
            <path d="M0,0 L8,4 L0,8 z" fill="#dc2626" />
          </marker>
        </defs>

        {layout.columns.map((_col, i) => (
          <text
            key={`stage-${i}`}
            className="stage-label"
            x={PAD + i * (W + GX) + W / 2}
            y={TOP - 12}
            textAnchor="middle"
          >
            Tahap {i + 1}
          </text>
        ))}

        {links.map((l) => (
          <g key={l.key}>
            <path
              d={l.d}
              fill="none"
              stroke={l.critical ? '#dc2626' : '#a5b4c8'}
              strokeWidth={l.critical ? 1.9 : 1.4}
              markerEnd={l.critical ? 'url(#p-arw-c)' : 'url(#p-arw)'}
            />
            <text className="edge-label" x={l.lx} y={l.ly} textAnchor="middle">
              {l.label}
            </text>
          </g>
        ))}

        {nodes.map((t) => {
          const p = layout.pos.get(t.id);
          if (!p) return null;
          const sched = schedule.tasks.get(t.id);
          const onChain = chainSet.has(t.id);
          const exp = expected.get(t.id) ?? 0;
          const va = variance.get(t.id) ?? 0;
          const cls = `pert-node${onChain ? ' critical' : ''}${sched?.critical ? ' near' : ''}`;
          return (
            <g
              key={t.id}
              className={cls}
              transform={`translate(${p.x}, ${p.y})`}
              onClick={() => onNodeClick(t.id)}
            >
              <rect className="node-bg" width={W} height={H} rx="9" />
              <rect className="node-accent" width="5" height={H} rx="2.5" fill={t.color} />
              <text className="node-title" x="14" y="21">
                {t.name.length > 24 ? `${t.name.slice(0, 23)}…` : t.name}
              </text>
              <text className="node-metric" x="14" y="40">
                E = {formatNumber(exp, 2)} hari
                <tspan className="node-dim" dx="8">
                  σ² = {formatNumber(va, 2)}
                </tspan>
              </text>
              <text className="node-est" x="14" y="58">
                O {formatNumber(t.pert.optimistic, 1)} · M {formatNumber(t.pert.mostLikely, 1)} · P{' '}
                {formatNumber(t.pert.pessimistic, 1)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
