# 地震台站数据质量检测服务

纯后端 Node.js + TypeScript + Fastify 服务，面向地震台站观测数据接入与质量检测。

## 能力

- 台站档案管理
- 观测摘要批量接入
- 采样完整性、波形削顶、时间同步检测
- 质量评分与问题标签
- 按台站/分数查询观测记录
- 生成时间窗口质量报告
- 质量复盘快照：固定创建时刻可见的台站档案、观测、报告与评分依据

## 质量复盘快照

多团队复盘时，实时内存数据持续变化会导致各方看到的结果不一致。快照在创建时刻冻结数据，供各方共同查看同一内容。

- `POST /api/quality/snapshots`：创建快照（`stationId`、`windowStart`、`windowEnd`）。支持 `Idempotency-Key` 请求头去重；同窗口构建中的并发重复请求自动复用，重复请求返回 `200` 与同一快照，新快照返回 `201`
- `GET /api/quality/snapshots`：按 `stationId` / `status` 过滤的摘要列表
- `GET /api/quality/snapshots/:id`：快照状态（`building` / `ready` / `failed`）与完整内容
- `GET /api/quality/snapshots/:id/verify`：重算内容 sha256 校验和并与创建时比对，返回 `match`

行为说明：

- 快照状态异步推进（构建耗时可用 `SNAPSHOT_BUILD_DELAY_MS` 调整），仅纳入 `capturedAt` 截止时刻前已接入的观测与已生成的报告，构建期间新到的数据不会混入
- 空窗口正常生成，`summary.empty = true`、`averageScore = null`
- 窗口内已有多份质量报告时全部冻结纳入 `content.reports`
- `content.scoringBasis` 随快照保存评分规则版本与阈值，与观测接入共用同一实现

## 启动

```bash
npm install
npm run dev
```

默认端口：`4301`。当前使用内存存储，后续可替换 PostgreSQL/时序数据库，并接入 Kafka、SeedLink 或对象存储。
