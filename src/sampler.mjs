/**
 * Sampling utility for large vault link suggestion capping
 * Prevents O(n²) explosion on vaults with 500+ notes
 */

/**
 * Sample note pairs for link suggestion scoring
 * @param {Array} notes - All non-journal notes
 * @param {number} sampleLimit - Maximum pairs to return (default 1000)
 * @returns {Array<{noteA, noteB}>} Sampled pairs, deterministic
 */
export function samplePairs(notes, sampleLimit = 1000) {
  if (notes.length <= 50) {
    // Small vault: use all pairs
    const pairs = [];
    for (let i = 0; i < notes.length; i++) {
      for (let j = i + 1; j < notes.length; j++) {
        pairs.push({ noteA: notes[i], noteB: notes[j] });
      }
    }
    return pairs;
  }

  const totalPairs = (notes.length * (notes.length - 1)) / 2;

  if (totalPairs <= sampleLimit) {
    // Within limit: use all pairs
    const pairs = [];
    for (let i = 0; i < notes.length; i++) {
      for (let j = i + 1; j < notes.length; j++) {
        pairs.push({ noteA: notes[i], noteB: notes[j] });
      }
    }
    return pairs;
  }

  // Large vault: sample deterministically (by index hash)
  const sampled = [];
  const step = Math.max(1, Math.floor(totalPairs / sampleLimit));

  let count = 0;
  for (let i = 0; i < notes.length; i++) {
    for (let j = i + 1; j < notes.length; j++) {
      if (count % step === 0) {
        sampled.push({ noteA: notes[i], noteB: notes[j] });
      }
      count++;
      if (sampled.length >= sampleLimit) break;
    }
    if (sampled.length >= sampleLimit) break;
  }

  return sampled;
}

/**
 * Calculate sampling quality degradation estimate
 * @param {number} vaultSize - Number of notes
 * @param {number} sampleLimit - Sample size cap
 * @returns {number} Estimated quality loss (0-1, where 1 = 100% loss)
 */
export function estimateSamplingLoss(vaultSize, sampleLimit = 1000) {
  const totalPairs = (vaultSize * (vaultSize - 1)) / 2;
  if (totalPairs <= sampleLimit) return 0;
  // Rough estimate: quality loss proportional to pairs skipped
  return Math.min(1, 1 - (sampleLimit / totalPairs));
}
