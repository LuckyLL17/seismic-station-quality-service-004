import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { evaluateObservation } from './scoring.js';
import { checksumContent, createSnapshot, findReusableSnapshot, findSnapshot, snapshots, toSnapshotListItem } from './snapshots.js';
import { createReport, observations, reports, stations } from './store.js';

const ingestSchema = z.object({ stationId: z.string(), observedAt: z.string().datetime().optional(), samples: z.number().int().nonnegative(), sampleRateHz: z.number().positive(), peakAmplitude: z.number().nonnegative(), timingOffsetMs: z.number() });
const reportSchema = z.object({ stationId: z.string(), windowStart: z.string().datetime(), windowEnd: z.string().datetime() });
const snapshotSchema = z.object({ stationId: z.string(), windowStart: z.string().datetime(), windowEnd: z.string().datetime() }).refine(value => value.windowStart < value.windowEnd, { message: 'windowStart 必须早于 windowEnd' });
export async function registerRoutes(app: FastifyInstance) {
  app.get('/health', async () => ({ status: 'ok', service: 'seismic-station-quality-service', workflow: '接收台站数据 → 检测完整性 → 计算质量分 → 生成质量报告' }));
  app.get('/api/stations', async () => stations);
  app.post('/api/stations', async (request, reply) => { const body = request.body as Partial<(typeof stations)[number]>; const station = { id: randomUUID(), code: body.code ?? `QZ-${stations.length + 1}`, name: body.name ?? '未命名台站', region: body.region ?? '未设置', elevationM: body.elevationM ?? 0, status: body.status ?? 'offline', lastSeenAt: new Date().toISOString() } as (typeof stations)[number]; stations.push(station); return reply.code(201).send(station); });
  app.post('/api/observations/ingest', async (request, reply) => { const parsed = ingestSchema.safeParse(request.body); if (!parsed.success) return reply.code(400).send({ error: '参数校验失败', details: parsed.error.flatten() }); const input = parsed.data; const station = stations.find(item => item.id === input.stationId); if (!station) return reply.code(404).send({ error: '台站不存在' }); const { issues, qualityScore } = evaluateObservation(input); const now = new Date().toISOString(); const observation = { id: randomUUID(), ...input, observedAt: input.observedAt ?? now, ingestedAt: now, qualityScore, issues }; observations.push(observation); station.lastSeenAt = observation.observedAt; station.status = 'online'; return reply.code(201).send(observation); });
  app.get('/api/observations', async (request) => { const query = request.query as { stationId?: string; minScore?: string }; return observations.filter(item => (!query.stationId || item.stationId === query.stationId) && (!query.minScore || item.qualityScore >= Number(query.minScore))); });
  app.post('/api/quality/reports/run', async (request, reply) => { const parsed = reportSchema.safeParse(request.body); if (!parsed.success) return reply.code(400).send({ error: '参数校验失败', details: parsed.error.flatten() }); if (!stations.some(item => item.id === parsed.data.stationId)) return reply.code(404).send({ error: '台站不存在' }); return reply.code(201).send(createReport(parsed.data.stationId, parsed.data.windowStart, parsed.data.windowEnd)); });
  app.get('/api/quality/reports', async (request) => { const query = request.query as { stationId?: string }; return reports.filter(item => !query.stationId || item.stationId === query.stationId); });
  // 质量复盘快照：固定创建时刻可见的台站档案、观测、报告与评分依据
  app.post('/api/quality/snapshots', async (request, reply) => {
    const parsed = snapshotSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: '参数校验失败', details: parsed.error.flatten() });
    const { stationId, windowStart, windowEnd } = parsed.data;
    if (!stations.some(item => item.id === stationId)) return reply.code(404).send({ error: '台站不存在' });
    const keyHeader = request.headers['idempotency-key'];
    const requestKey = typeof keyHeader === 'string' && keyHeader.trim() ? keyHeader.trim() : null;
    const reused = findReusableSnapshot(stationId, windowStart, windowEnd, requestKey);
    if (reused) return reply.code(200).header('x-snapshot-reused', 'true').send(reused);
    return reply.code(201).send(createSnapshot(stationId, windowStart, windowEnd, requestKey));
  });
  app.get('/api/quality/snapshots', async (request) => { const query = request.query as { stationId?: string; status?: string }; return snapshots.filter(item => (!query.stationId || item.stationId === query.stationId) && (!query.status || item.status === query.status)).map(toSnapshotListItem); });
  app.get('/api/quality/snapshots/:id', async (request, reply) => { const snapshot = findSnapshot((request.params as { id: string }).id); if (!snapshot) return reply.code(404).send({ error: '快照不存在' }); return snapshot; });
  app.get('/api/quality/snapshots/:id/verify', async (request, reply) => {
    const snapshot = findSnapshot((request.params as { id: string }).id);
    if (!snapshot) return reply.code(404).send({ error: '快照不存在' });
    if (snapshot.status !== 'ready' || !snapshot.content || !snapshot.checksum) return reply.code(409).send({ error: '快照尚未就绪，无法校验', id: snapshot.id, status: snapshot.status });
    const recomputedChecksum = checksumContent(snapshot.content);
    return { id: snapshot.id, status: snapshot.status, match: recomputedChecksum === snapshot.checksum, checksum: snapshot.checksum, recomputedChecksum, verifiedAt: new Date().toISOString() };
  });
}
