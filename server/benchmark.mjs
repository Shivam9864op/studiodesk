import { demoState, updateFactState } from './domain.mjs';
const started = performance.now();
const base = demoState().campaign;
let flagged = 0;
for (let i = 0; i < 10000; i += 1) {
  const next = updateFactState(base, 'venue', `Venue ${i}`, 'benchmark');
  flagged += next.assets.filter((asset) => asset.status === 'outdated').length;
}
console.log(JSON.stringify({ records: 10000, decisions: 10000, flaggedAssetReferences: flagged, ms: Math.round(performance.now() - started) }, null, 2));
