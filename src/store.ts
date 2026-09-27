import { createHash, randomUUID } from 'node:crypto';
import type { Observation, QualityReport, ReviewSnapshot, Station } from './types.js';

export const stations: Station[] = [
  { id: 'st-001', code: 'QZ-A01', name: '青岚台站', region: '川西断裂带', elevationM: 1840, status: 'online', lastSeenAt: new Date().toISOString() },
  { id: 'st-002', code: 'QZ-B07', name: '白石台站', region: '龙门山南段', elevationM: 920, status: 'online', lastSeenAt: new Date().toISOString() },
  { id: 'st-003', code: 'QZ-C12', name: '岷江台站', region: '岷江河谷', elevationM: 2470, status: 'maintenance', lastSeenAt: new Date().toISOString() }
];
export const observations: Observation[] = [];
export const reports: QualityReport[] = [];
export function createReport(stationId: string, start: string, end: string): QualityReport {
  const rows = observations.filter(item => item.stationId === stationId && item.observedAt >= start && item.observedAt <= end);
  const averageScore = rows.length ? Math.round(rows.reduce((sum, item) => sum + item.qualityScore, 0) / rows.length) : 0;
  const issues = [...new Set(rows.flatMap(item => item.issues))];
  const report = { id: randomUUID(), stationId, windowStart: start, windowEnd: end, observationCount: rows.length, averageScore, issues, generatedAt: new Date().toISOString() };
  reports.push(report); return report;
}

export const snapshots: ReviewSnapshot[] = [];
function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value !== null && typeof value === 'object') return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`).join(',')}}`;
  return JSON.stringify(value) ?? 'null';
}
function checksumOf(content: unknown): string { return createHash('sha256').update(stableStringify(content)).digest('hex'); }
function snapshotContent(snapshot: ReviewSnapshot): unknown { return { stationId: snapshot.stationId, windowStart: snapshot.windowStart, windowEnd: snapshot.windowEnd, station: snapshot.station, observations: snapshot.observations, reports: snapshot.reports, summary: snapshot.summary }; }
export function findSnapshotByRequestKey(requestKey: string): ReviewSnapshot | undefined { return snapshots.find(item => item.requestKey === requestKey); }
export function createSnapshot(input: { stationId: string; windowStart: string; windowEnd: string; requestKey: string | null }): ReviewSnapshot {
  const createdAt = new Date().toISOString(); // 生成截止时刻：此刻之后的观测接入与报告变更均不进入快照
  const station = structuredClone(stations.find(item => item.id === input.stationId)) as Station;
  const windowObservations = observations.filter(item => item.stationId === input.stationId && item.observedAt >= input.windowStart && item.observedAt <= input.windowEnd).map(item => structuredClone(item)).sort((a, b) => a.observedAt.localeCompare(b.observedAt) || a.id.localeCompare(b.id));
  const windowReports = reports.filter(item => item.stationId === input.stationId && item.windowStart <= input.windowEnd && item.windowEnd >= input.windowStart).map(item => structuredClone(item)).sort((a, b) => a.generatedAt.localeCompare(b.generatedAt) || a.id.localeCompare(b.id));
  const summary: ReviewSnapshot['summary'] = { observationCount: windowObservations.length, reportCount: windowReports.length, averageScore: windowObservations.length ? Math.round(windowObservations.reduce((sum, item) => sum + item.qualityScore, 0) / windowObservations.length) : 0, issues: [...new Set(windowObservations.flatMap(item => item.issues))] };
  const snapshot: ReviewSnapshot = { id: randomUUID(), stationId: input.stationId, windowStart: input.windowStart, windowEnd: input.windowEnd, status: 'ready', requestKey: input.requestKey, createdAt, station, observations: windowObservations, reports: windowReports, summary, checksum: '' };
  snapshot.checksum = checksumOf(snapshotContent(snapshot));
  snapshots.push(snapshot); return snapshot;
}
export function verifySnapshot(snapshot: ReviewSnapshot): { id: string; status: ReviewSnapshot['status']; checksum: string; recomputedChecksum: string; consistent: boolean; summary: ReviewSnapshot['summary'] } {
  const recomputedChecksum = checksumOf(snapshotContent(snapshot));
  return { id: snapshot.id, status: snapshot.status, checksum: snapshot.checksum, recomputedChecksum, consistent: recomputedChecksum === snapshot.checksum, summary: snapshot.summary };
}
