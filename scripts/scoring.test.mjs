import assert from 'node:assert/strict';
import { calculateMatchPoints, calculatePodiumPoints } from './scoring.mjs';

assert.deepEqual(calculateMatchPoints(2, 1, 2, 1), { points: 5, type: 'exact' });
assert.deepEqual(calculateMatchPoints(1, 0, 2, 0), { points: 3, type: 'outcome' });
assert.deepEqual(calculateMatchPoints(2, 0, 2, 3), { points: 1, type: 'partial' });
assert.deepEqual(calculateMatchPoints(1, 0, 0, 2), { points: 0, type: 'miss' });

assert.equal(
  calculatePodiumPoints(
    { champion: 'br', runnerUp: 'fr', thirdPlace: 'es' },
    { champion: 'br', runnerUp: 'fr', thirdPlace: 'es' }
  ),
  23
);
assert.equal(
  calculatePodiumPoints(
    { champion: 'br', runnerUp: 'fr', thirdPlace: 'es' },
    { champion: 'fr', runnerUp: 'br', thirdPlace: 'es' }
  ),
  12
);
assert.equal(
  calculatePodiumPoints(
    { champion: 'ar', runnerUp: 'de', thirdPlace: 'jp' },
    { champion: 'ar', runnerUp: 'fr', thirdPlace: 'de' }
  ),
  13
);

console.log('scoring tests passed');
