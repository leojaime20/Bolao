function calculateMatchPoints(predictedA, predictedB, actualA, actualB) {
  if (actualA == null || actualB == null) return null;
  if (predictedA === actualA && predictedB === actualB) return { points: 5, type: 'exact' };
  if (Math.sign(predictedA - predictedB) === Math.sign(actualA - actualB)) {
    return { points: 3, type: 'outcome' };
  }
  if (predictedA === actualA || predictedB === actualB) return { points: 1, type: 'partial' };
  return { points: 0, type: 'miss' };
}

function calculatePodiumPoints(prediction, podium) {
  const slots = [
    { key: 'champion', points: 10 },
    { key: 'runnerUp', points: 6 },
    { key: 'thirdPlace', points: 4 },
  ];
  const officialTeams = new Set(slots.map(({ key }) => podium[key]));
  let points = 0;
  let exactCount = 0;

  for (const { key, points: exactPoints } of slots) {
    const predicted = prediction[key];
    if (predicted === podium[key]) {
      points += exactPoints;
      exactCount += 1;
    } else if (officialTeams.has(predicted)) {
      points += Math.ceil(exactPoints / 2);
    }
  }

  if (exactCount === 3) points += 3;
  return points;
}

module.exports = { calculateMatchPoints, calculatePodiumPoints };
