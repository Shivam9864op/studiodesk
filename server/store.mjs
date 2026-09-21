import { demoState, updateFactState, reviseAssetState, approveAssetState, reportChecks } from './domain.mjs';

export class MemoryStore {
  constructor() { this.state = demoState(); }
  async init() { return this; }
  async snapshot() { return structuredClone(this.state); }
  async updateFact(key, value, actor) { this.state.campaign = updateFactState(this.state.campaign, key, value, actor); return this.snapshot(); }
  async revise(id, body, actor) { this.state.campaign = reviseAssetState(this.state.campaign, id, body, actor); return this.snapshot(); }
  async approve(id, actor) { this.state.campaign = approveAssetState(this.state.campaign, id, actor); return this.snapshot(); }
  async report(rows) { return reportChecks(rows); }
}

export class PostgresStore extends MemoryStore {
  constructor(pool) { super(); this.pool = pool; }
  async init() {
    await this.pool.query(`CREATE TABLE IF NOT EXISTS campaign_state (id TEXT PRIMARY KEY, state JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
    const result = await this.pool.query('SELECT state FROM campaign_state WHERE id = $1', ['demo']);
    if (result.rows[0]?.state) this.state = result.rows[0].state;
    else await this.persist();
    return this;
  }
  async persist() { await this.pool.query('INSERT INTO campaign_state (id, state) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET state = EXCLUDED.state, updated_at = NOW()', ['demo', this.state]); }
  async updateFact(key, value, actor) { const result = await super.updateFact(key, value, actor); await this.persist(); return result; }
  async revise(id, body, actor) { const result = await super.revise(id, body, actor); await this.persist(); return result; }
  async approve(id, actor) { const result = await super.approve(id, actor); await this.persist(); return result; }
}
