import { describe, expect, it } from 'vitest';
import { demoState, updateFactState, reviseAssetState, approveAssetState, reportChecks, fingerprint } from './domain.mjs';

describe('StudioDesk campaign rules', () => {
  it('flags exactly four unique assets for a venue change', () => {
    const state = demoState().campaign;
    const next = updateFactState(state, 'venue', 'Harbour Hall', 'owner');
    expect(next.assets.filter((asset) => asset.status === 'outdated').map((asset) => asset.id)).toEqual(['asset-poster', 'asset-caption', 'asset-ticket', 'asset-reel']);
    expect(next.assets.filter((asset) => asset.status === 'outdated')).toHaveLength(4);
  });
  it('resets approval after an edit and permits approval of the new version', () => {
    const state = demoState().campaign;
    const revised = reviseAssetState(state, 'asset-caption', 'Revised copy', 'editor');
    expect(revised.assets.find((asset) => asset.id === 'asset-caption').approval).toBeNull();
    const approved = approveAssetState(revised, 'asset-caption', 'client');
    expect(approved.assets.find((asset) => asset.id === 'asset-caption').status).toBe('approved');
  });
  it('catches duplicate, missing and negative report rows', () => {
    const result = reportChecks([{ postId: 'a', date: '2026-09-01', likes: 4 }, { postId: 'a', date: 'not-a-date', likes: -1 }]);
    expect(result.valid).toBe(false);
    expect(result.checks.map((item) => item.code)).toEqual(['invalid_date', 'duplicate_post', 'negative_metric']);
  });
  it('keeps fingerprints deterministic', () => {
    const facts = demoState().campaign.facts;
    expect(fingerprint(facts)).toBe(fingerprint(facts));
  });
});
