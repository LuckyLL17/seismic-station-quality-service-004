# 地震台站数据质量检测服务

纯后端 Node.js + TypeScript + Fastify 服务，面向地震台站观测数据接入与质量检测。

## 能力

- 台站档案管理
- 观测摘要批量接入
- 采样完整性、波形削顶、时间同步检测
- 质量评分与问题标签
- 按台站/分数查询观测记录
- 生成时间窗口质量报告
- 质量复盘快照：固定创建时刻的台站档案、窗口观测（含评分与问题标签）及与窗口交集的全部历史报告，供多团队一致复盘

## 质量复盘快照

- `POST /api/quality/snapshots`：创建快照，body 为 `{ stationId, windowStart, windowEnd, requestKey? }`，也可用 `Idempotency-Key` 请求头。创建时刻同步深拷贝数据，之后接入的观测、台站状态变更、新生成的报告均不影响快照内容；空窗口正常生成（计数为 0）。
- 幂等：相同 `requestKey` 且参数一致的重复请求返回原快照（`200`，不新建）；同键不同参数返回 `409`。
- `GET /api/quality/snapshots?stationId=`：快照摘要列表；`GET /api/quality/snapshots/:id`：快照完整内容。
- `GET /api/quality/snapshots/:id/verify`：重算 sha256 校验和并与创建时比对，返回 `consistent` 验证快照内容未被篡改。

## 启动

```bash
npm install
npm run dev
```

默认端口：`4301`。当前使用内存存储，后续可替换 PostgreSQL/时序数据库，并接入 Kafka、SeedLink 或对象存储。
