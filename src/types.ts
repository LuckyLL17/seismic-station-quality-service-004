export type Station = { id: string; code: string; name: string; region: string; elevationM: number; status: 'online' | 'maintenance' | 'offline'; lastSeenAt: string };
export type Observation = { id: string; stationId: string; observedAt: string; samples: number; sampleRateHz: number; peakAmplitude: number; timingOffsetMs: number; qualityScore: number; issues: string[] };
export type QualityReport = { id: string; stationId: string; windowStart: string; windowEnd: string; observationCount: number; averageScore: number; issues: string[]; generatedAt: string };
export type ReviewSnapshotSummary = { observationCount: number; reportCount: number; averageScore: number; issues: string[] };
export type ReviewSnapshot = { id: string; stationId: string; windowStart: string; windowEnd: string; status: 'ready'; requestKey: string | null; createdAt: string; station: Station; observations: Observation[]; reports: QualityReport[]; summary: ReviewSnapshotSummary; checksum: string };
