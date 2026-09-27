import type { ScoringBasis } from './scoring.js';

export type Station = { id: string; code: string; name: string; region: string; elevationM: number; status: 'online' | 'maintenance' | 'offline'; lastSeenAt: string };
export type Observation = { id: string; stationId: string; observedAt: string; ingestedAt: string; samples: number; sampleRateHz: number; peakAmplitude: number; timingOffsetMs: number; qualityScore: number; issues: string[] };
export type QualityReport = { id: string; stationId: string; windowStart: string; windowEnd: string; observationCount: number; averageScore: number; issues: string[]; generatedAt: string };
export type SnapshotStatus = 'building' | 'ready' | 'failed';
export type SnapshotSummary = { observationCount: number; reportCount: number; averageScore: number | null; issues: string[]; empty: boolean };
export type SnapshotContent = { station: Station; scoringBasis: ScoringBasis; observations: Observation[]; reports: QualityReport[]; summary: SnapshotSummary };
export type ReviewSnapshot = { id: string; stationId: string; windowStart: string; windowEnd: string; status: SnapshotStatus; requestKey: string | null; capturedAt: string; createdAt: string; completedAt: string | null; error: string | null; content: SnapshotContent | null; checksum: string | null };
