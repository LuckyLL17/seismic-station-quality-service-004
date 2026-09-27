import { createHash, randomUUID } from 'node:crypto';
import { SCORING_BASIS } from './scoring.js';
import { observations, reports, stations } from './store.js';
import type { Observation, QualityReport, ReviewSnapshot, SnapshotContent, SnapshotSummary, Station } from './types.js';

export const snapshots: ReviewSnapshot[] = [];

// 模拟快照构建耗时；构建期间新接入的数据通过 capturedAt 截止时刻排除
const BUILD_DELAY_MS = Math.max(0, Number(process.env.SNAPSHOT_BUILD_DELAY_MS ?? 30));

export function findSnapshot(id: string): ReviewSnapshot | undefined {
  return snapshots.find(item => item.id === id);
}

// 重复请求复用：幂等键命中（排除已失败）或同窗口正在构建中的快照
export function findReusableSnapshot(stationId: string, windowStart: string, windowEnd: string, requestKey: string | null): ReviewSnapshot | undefined {
  if (requestKey) {
    const byKey = snapshots.find(item => item.requestKey === requestKey && item.status !== 'failed');
    if (byKey) return byKey;
  }
  return snapshots.find(item => item.status === 'building' && item.stationId === stationId && item.windowStart === windowStart && item.windowEnd === windowEnd);
}

export function createSnapshot(stationId: string, windowStart: string, windowEnd: string, requestKey: string | null): ReviewSnapshot {
  const capturedAt = new Date().toISOString();
  // 台站档案在创建瞬间冻结，避免构建期间被接入流程改写（lastSeenAt/status）
  const station = stations.find(item => item.id === stationId);
  const frozenStation = station ? structuredClone(station) : null;
  const snapshot: ReviewSnapshot = { id: randomUUID(), stationId, windowStart, windowEnd, status: 'building', requestKey, capturedAt, createdAt: capturedAt, completedAt: null, error: null, content: null, checksum: null };
  snapshots.push(snapshot);
  setTimeout(() => finalizeSnapshot(snapshot, frozenStation), BUILD_DELAY_MS);
  return snapshot;
}

function finalizeSnapshot(snapshot: ReviewSnapshot, frozenStation: Station | null): void {
  try {
    if (!frozenStation) throw new Error('台站在快照生成期间不可用');
    // 仅纳入创建时刻已可见的数据：接入/生成时间晚于 capturedAt 的一律排除
    const frozenObservations = observations
      .filter(item => item.stationId === snapshot.stationId && item.observedAt >= snapshot.windowStart && item.observedAt <= snapshot.windowEnd && item.ingestedAt <= snapshot.capturedAt)
      .map(item => structuredClone(item))
      .sort(compareObservations);
    const frozenReports = reports
      .filter(item => item.stationId === snapshot.stationId && item.generatedAt <= snapshot.capturedAt && item.windowStart <= snapshot.windowEnd && item.windowEnd >= snapshot.windowStart)
      .map(item => structuredClone(item))
      .sort(compareReports);
    const content: SnapshotContent = { station: frozenStation, scoringBasis: SCORING_BASIS, observations: frozenObservations, reports: frozenReports, summary: buildSummary(frozenObservations, frozenReports) };
    snapshot.content = content;
    snapshot.checksum = checksumContent(content);
    snapshot.status = 'ready';
  } catch (error) {
    snapshot.status = 'failed';
    snapshot.error = error instanceof Error ? error.message : String(error);
  }
  snapshot.completedAt = new Date().toISOString();
}

function compareObservations(a: Observation, b: Observation): number {
  return a.observedAt === b.observedAt ? a.id.localeCompare(b.id) : a.observedAt < b.observedAt ? -1 : 1;
}

function compareReports(a: QualityReport, b: QualityReport): number {
  return a.generatedAt === b.generatedAt ? a.id.localeCompare(b.id) : a.generatedAt < b.generatedAt ? -1 : 1;
}

function buildSummary(frozenObservations: Observation[], frozenReports: QualityReport[]): SnapshotSummary {
  const averageScore = frozenObservations.length ? Math.round(frozenObservations.reduce((sum, item) => sum + item.qualityScore, 0) / frozenObservations.length) : null;
  return { observationCount: frozenObservations.length, reportCount: frozenReports.length, averageScore, issues: [...new Set(frozenObservations.flatMap(item => item.issues))], empty: frozenObservations.length === 0 };
}

// 键名排序的稳定序列化，保证同一内容得到同一校验和
function sortDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortDeep);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, sortDeep(item)]));
  }
  return value;
}

export function checksumContent(content: SnapshotContent): string {
  return createHash('sha256').update(JSON.stringify(sortDeep(content))).digest('hex');
}

export function toSnapshotListItem(snapshot: ReviewSnapshot) {
  const { content, ...meta } = snapshot;
  return { ...meta, summary: content?.summary ?? null };
}
