import crypto from 'node:crypto';

export const factKeys = ['date', 'venue', 'price', 'expiry', 'bookingUrl'];

export function traceId(seed = '') {
  return crypto.createHash('sha256').update(`${seed}:${JSON.stringify(factKeys)}`).digest('hex').slice(0, 12);
}

export function fingerprint(facts) {
  return crypto.createHash('sha256').update(JSON.stringify(factKeys.map((key) => facts[key]?.value ?? facts[key] ?? null))).digest('hex').slice(0, 16);
}

export function updateFactState(campaign, factKey, value, actor = 'owner') {
  if (!factKeys.includes(factKey)) throw new Error(`Unsupported campaign fact: ${factKey}`);
  const next = structuredClone(campaign);
  const fact = next.facts[factKey];
  if (!fact) throw new Error(`Missing campaign fact: ${factKey}`);
  if (String(fact.value) === String(value)) return next;
  const previous = fact.value;
  fact.value = value;
  fact.version += 1;
  next.updatedAt = new Date().toISOString();
  next.changes.unshift({ id: `change-${Date.now()}`, factKey, previous, value, actor, at: next.updatedAt });
  next.assets = next.assets.map((asset) => {
    if (!asset.factKeys.includes(factKey)) return asset;
    return { ...asset, status: 'outdated', approval: null, reviewNote: `Update ${fact.label.toLowerCase()} before publishing.` };
  });
  return next;
}

export function reviseAssetState(campaign, assetId, body, actor = 'owner') {
  const next = structuredClone(campaign);
  const asset = next.assets.find((item) => item.id === assetId);
  if (!asset) throw new Error('Asset not found');
  asset.body = String(body ?? '').trim();
  asset.version += 1;
  asset.status = 'needs_review';
  asset.approval = null;
  asset.reviewNote = 'Revision saved; a reviewer must approve this version.';
  next.changes.unshift({ id: `revision-${Date.now()}`, assetId, actor, at: new Date().toISOString(), type: 'revision' });
  return next;
}

export function approveAssetState(campaign, assetId, actor = 'client') {
  const next = structuredClone(campaign);
  const asset = next.assets.find((item) => item.id === assetId);
  if (!asset) throw new Error('Asset not found');
  asset.status = 'approved';
  asset.reviewNote = 'Approved for this version.';
  asset.approval = { version: asset.version, actor, at: new Date().toISOString() };
  next.changes.unshift({ id: `approval-${Date.now()}`, assetId, actor, at: new Date().toISOString(), type: 'approval', version: asset.version });
  return next;
}

export function reportChecks(rows = []) {
  const checks = [];
  const seen = new Set();
  rows.forEach((row, index) => {
    const line = index + 2;
    const postId = String(row.postId ?? row.id ?? '').trim();
    const date = String(row.date ?? row.publishedAt ?? '').trim();
    if (!postId) checks.push({ line, severity: 'error', code: 'missing_id', message: 'Missing post ID.' });
    if (!date || Number.isNaN(Date.parse(date))) checks.push({ line, severity: 'error', code: 'invalid_date', message: 'Date is missing or invalid.' });
    if (postId && seen.has(postId)) checks.push({ line, severity: 'error', code: 'duplicate_post', message: `Duplicate post ID: ${postId}.` });
    if (postId) seen.add(postId);
    for (const key of ['reach', 'impressions', 'likes', 'comments', 'saves']) {
      if (row[key] !== undefined && row[key] !== '' && Number(row[key]) < 0) checks.push({ line, severity: 'error', code: 'negative_metric', message: `${key} cannot be negative.` });
    }
  });
  return { rows: rows.length, checks, valid: checks.length === 0 };
}

export function demoState() {
  const now = new Date().toISOString();
  return {
    workspace: { id: 'workspace-demo', name: 'StudioDesk demo workspace', role: 'owner', synthetic: true },
    campaign: {
      id: 'campaign-cafe-monsoon', name: 'Café Monsoon launch', client: 'Fictional Bhagalpur café', updatedAt: now,
      facts: {
        date: { label: 'Event date', value: '2026-10-18', version: 1 },
        venue: { label: 'Venue', value: 'Riverside Courtyard', version: 1 },
        price: { label: 'Ticket price', value: '₹299', version: 1 },
        expiry: { label: 'Offer expiry', value: '2026-10-20', version: 1 },
        bookingUrl: { label: 'Booking URL', value: 'cafemonsoon.example/book', version: 1 }
      },
      assets: [
        { id: 'asset-poster', type: 'Poster', channel: 'Instagram', owner: 'Maya', deadline: '2026-10-10', body: 'Opening night · 18 Oct · Riverside Courtyard · Tickets ₹299', factKeys: ['date', 'venue', 'price'], status: 'approved', version: 1, approval: { version: 1, actor: 'client', at: now } },
        { id: 'asset-caption', type: 'Caption', channel: 'Instagram', owner: 'Shivam', deadline: '2026-10-11', body: 'Join us on 18 Oct at Riverside Courtyard. Book for ₹299.', factKeys: ['date', 'venue', 'price', 'bookingUrl'], status: 'approved', version: 1, approval: { version: 1, actor: 'client', at: now } },
        { id: 'asset-story', type: 'Story', channel: 'Instagram', owner: 'Maya', deadline: '2026-10-12', body: 'Last call: ₹299 tickets for 18 Oct.', factKeys: ['date', 'price'], status: 'approved', version: 1, approval: { version: 1, actor: 'client', at: now } },
        { id: 'asset-ticket', type: 'Ticket page', channel: 'Web', owner: 'Arjun', deadline: '2026-10-12', body: 'Reserve your place at Riverside Courtyard · ₹299', factKeys: ['venue', 'price', 'bookingUrl'], status: 'approved', version: 1, approval: { version: 1, actor: 'client', at: now } },
        { id: 'asset-linkedin', type: 'LinkedIn post', channel: 'LinkedIn', owner: 'Shivam', deadline: '2026-10-13', body: 'A small café launch for the local community — 18 Oct.', factKeys: ['date'], status: 'approved', version: 1, approval: { version: 1, actor: 'client', at: now } },
        { id: 'asset-reminder', type: 'Reminder', channel: 'Email', owner: 'Maya', deadline: '2026-10-15', body: 'Reminder: your ₹299 reservation is waiting.', factKeys: ['price', 'bookingUrl'], status: 'approved', version: 1, approval: { version: 1, actor: 'client', at: now } },
        { id: 'asset-reel', type: 'Reel storyboard', channel: 'Instagram', owner: 'Riya', deadline: '2026-10-14', body: 'Frame 4: find us at Riverside Courtyard.', factKeys: ['venue'], status: 'approved', version: 1, approval: { version: 1, actor: 'client', at: now } },
        { id: 'asset-guide', type: 'Team guide', channel: 'Internal', owner: 'Arjun', deadline: '2026-10-16', body: 'Use the booking page for questions about the 18 Oct launch.', factKeys: ['date', 'bookingUrl'], status: 'approved', version: 1, approval: { version: 1, actor: 'client', at: now } }
      ],
      changes: []
    }
  };
}
