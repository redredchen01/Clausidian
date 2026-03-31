export class PatternDetector {
  constructor(options = {}) {
    this.stopwords = new Set([
      'over',
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
      'of', 'with', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
      'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
      'should', 'may', 'might', 'can', 'must', 'shall', 'this', 'that',
      'these', 'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they', 'what',
      'which', 'who', 'when', 'where', 'why', 'how', 'as', 'by', 'from',
      'up', 'about', 'into', 'through', 'during', 'before', 'after', 'above',
      'below', 'between', 'under', 'again', 'further', 'then', 'once',
      'here', 'there', 'all', 'both', 'each', 'few', 'more', 'most', 'other',
      'some', 'such', 'no', 'nor', 'not', 'only', 'same', 'so', 'than',
      'too', 'very', 'just', 'me', 'my', 'yourself', 'yourselves', 'himself',
      'herself', 'itself', 'themselves', 'their', 'theirs', 'our', 'ours',
      'his', 'hers', 'its', 'am'
    ]);

    this.painKeywords = {
      'manual': 3, 'tedious': 3, 'repetitive': 3, 'error-prone': 4,
      'slow': 2, 'missing': 4, 'broken': 4, 'timeout': 2, 'retry': 2,
      'duplicate': 3, 'inconsistent': 2, 'complex': 1, 'difficult': 2,
      'hard': 2, 'awkward': 2, 'cumbersome': 3,
    };

    this.solutionMapping = {
      'manual': '/linear-slack-reporter',
      'api': '/api-aggregation-notifier',
      'report': '/daily-report-from-sheets',
      'code': '/code-review-assistant',
      'monitor': '/monitoring-agent',
      'sync': '/obsidian-sync-agent',
      'automation': '/automation-engine',
    };

    this.kRange = options.kRange || [8, 9, 10, 11, 12];
    this.maxIterations = options.maxIterations || 100;
    this.convergenceThreshold = options.convergenceThreshold || 0.01;
  }

  tokenize(text) {
    if (!text) return [];
    return text
      .toLowerCase()
      .replace(/[^\w\s-]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 1 && !this.stopwords.has(word));
  }

  buildVocabulary(notes) {
    const vocab = new Set();
    const docTermFreqs = [];

    for (const note of notes) {
      const text = note.title ? `${note.title} ${note.body || ''}` : (note.body || '');
      const tokens = this.tokenize(text);
      const termFreq = {};
      for (const token of tokens) {
        termFreq[token] = (termFreq[token] || 0) + 1;
        vocab.add(token);
      }
      docTermFreqs.push({ file: note.file, title: note.title, termFreq, tokenCount: tokens.length });
    }

    return { vocab: Array.from(vocab), docTermFreqs, totalDocs: notes.length };
  }

  computeTFIDF(notes) {
    const { vocab, docTermFreqs, totalDocs } = this.buildVocabulary(notes);
    const docFreq = {};
    for (const { termFreq } of docTermFreqs) {
      for (const term of Object.keys(termFreq)) {
        docFreq[term] = (docFreq[term] || 0) + 1;
      }
    }

    const vectors = docTermFreqs.map(({ file, title, termFreq, tokenCount }) => {
      const vector = {};
      for (const term of vocab) {
        const idf = Math.log(totalDocs / (docFreq[term] || 1));
        const tf = (termFreq[term] || 0) / (tokenCount || 1);
        if (tf > 0) vector[term] = tf * idf;
      }
      return { file, title, vector };
    });

    return { vectors, vocab };
  }

  cosineSimilarity(vec1, vec2) {
    let dotProduct = 0, norm1 = 0, norm2 = 0;
    const keys = new Set([...Object.keys(vec1), ...Object.keys(vec2)]);
    for (const key of keys) {
      const v1 = vec1[key] || 0;
      const v2 = vec2[key] || 0;
      dotProduct += v1 * v2;
      norm1 += v1 * v1;
      norm2 += v2 * v2;
    }
    const denominator = Math.sqrt(norm1) * Math.sqrt(norm2);
    return denominator === 0 ? 0 : dotProduct / denominator;
  }

  initializeCenters(vectors, k) {
    const indices = new Set();
    while (indices.size < k) {
      indices.add(Math.floor(Math.random() * vectors.length));
    }
    return Array.from(indices).map(i => vectors[i].vector);
  }

  assignClusters(vectors, centers) {
    const assignments = [];
    for (const { vector } of vectors) {
      let maxSim = -Infinity, cluster = 0;
      for (let i = 0; i < centers.length; i++) {
        const sim = this.cosineSimilarity(vector, centers[i]);
        if (sim > maxSim) { maxSim = sim; cluster = i; }
      }
      assignments.push(cluster);
    }
    return assignments;
  }

  updateCenters(vectors, centers, assignments) {
    const k = centers.length;
    const newCenters = [];
    for (let c = 0; c < k; c++) {
      const clusterVecs = vectors.filter((_, i) => assignments[i] === c).map(v => v.vector);
      if (clusterVecs.length === 0) {
        newCenters.push(centers[c]);
      } else {
        const center = {};
        const allKeys = new Set();
        for (const vec of clusterVecs) Object.keys(vec).forEach(k => allKeys.add(k));
        for (const key of allKeys) {
          const sum = clusterVecs.reduce((acc, vec) => acc + (vec[key] || 0), 0);
          center[key] = sum / clusterVecs.length;
        }
        newCenters.push(center);
      }
    }
    return newCenters;
  }

  calculateChange(oldAssignments, newAssignments) {
    let changes = 0;
    for (let i = 0; i < oldAssignments.length; i++) {
      if (oldAssignments[i] !== newAssignments[i]) changes++;
    }
    return changes / oldAssignments.length;
  }

  kMeansClustering(vectors, k) {
    let centers = this.initializeCenters(vectors, k);
    let assignments = this.assignClusters(vectors, centers);
    for (let iter = 0; iter < this.maxIterations; iter++) {
      const newCenters = this.updateCenters(vectors, centers, assignments);
      const newAssignments = this.assignClusters(vectors, newCenters);
      const change = this.calculateChange(assignments, newAssignments);
      centers = newCenters;
      assignments = newAssignments;
      if (change < this.convergenceThreshold) break;
    }
    return { centers, assignments };
  }

  calculateSilhouetteScore(vectors, assignments, centers, k) {
    let totalScore = 0, count = 0;
    for (let i = 0; i < vectors.length; i++) {
      const clusterIdx = assignments[i];
      const vector = vectors[i].vector;
      const intraScore = this.cosineSimilarity(vector, centers[clusterIdx]);
      let interScore = Infinity;
      for (let c = 0; c < k; c++) {
        if (c !== clusterIdx) {
          const sim = this.cosineSimilarity(vector, centers[c]);
          interScore = Math.min(interScore, sim);
        }
      }
      const silhouette = (intraScore - interScore) / Math.max(intraScore, interScore || 0.001);
      totalScore += silhouette;
      count++;
    }
    return count === 0 ? 0 : totalScore / count;
  }

  extractTopTerms(vectors, assignments, clusterIdx, topN = 5) {
    const termWeights = {};
    for (let i = 0; i < vectors.length; i++) {
      if (assignments[i] === clusterIdx) {
        const vector = vectors[i].vector;
        for (const [term, weight] of Object.entries(vector)) {
          termWeights[term] = (termWeights[term] || 0) + weight;
        }
      }
    }
    return Object.entries(termWeights).sort((a, b) => b[1] - a[1]).slice(0, topN).map(([term]) => term);
  }

  generateClusterLabel(topTerms) {
    if (topTerms.length === 0) return 'Miscellaneous';
    const label = topTerms.slice(0, 3).map(t => t.charAt(0).toUpperCase() + t.slice(1)).join(' ');
    return label || 'Miscellaneous';
  }

  clusterByContent(notes) {
    if (notes.length === 0) {
      return { clusters: [], overallQuality: 0, recommendedK: 8 };
    }

    const { vectors } = this.computeTFIDF(notes);
    let bestK = Math.min(8, vectors.length);
    let bestScore = -Infinity;
    const resultsByK = {};

    for (const k of this.kRange) {
      if (k > vectors.length) continue;
      const { centers, assignments } = this.kMeansClustering(vectors, k);
      const silhouette = this.calculateSilhouetteScore(vectors, assignments, centers, k);
      resultsByK[k] = { centers, assignments, silhouette };
      if (silhouette > bestScore) {
        bestScore = silhouette;
        bestK = k;
      }
    }

    if (!resultsByK[bestK]) {
      const kValue = Object.keys(resultsByK)[0];
      bestK = parseInt(kValue);
    }

    const result = resultsByK[bestK];
    if (!result) {
      return { clusters: [], overallQuality: 0, recommendedK: 8 };
    }

    const { centers, assignments, silhouette } = result;
    const clusters = [];
    for (let c = 0; c < bestK; c++) {
      const clusterNotes = vectors.filter((_, i) => assignments[i] === c).map(v => ({ file: v.file, title: v.title }));
      if (clusterNotes.length > 0) {
        const topTerms = this.extractTopTerms(vectors, assignments, c, 5);
        clusters.push({
          id: c + 1,
          label: this.generateClusterLabel(topTerms),
          quality: silhouette,
          notes: clusterNotes,
          topTerms,
          size: clusterNotes.length,
          suggestedSkills: this.suggestSkillsForCluster(topTerms),
        });
      }
    }

    return {
      clusters: clusters.sort((a, b) => b.size - a.size),
      overallQuality: silhouette || 0,
      recommendedK: bestK,
    };
  }

  suggestSkillsForCluster(topTerms) {
    const suggested = new Set();
    for (const term of topTerms) {
      for (const [keyword, skill] of Object.entries(this.solutionMapping)) {
        if (term.includes(keyword) || keyword.includes(term)) {
          suggested.add(skill);
        }
      }
    }
    return Array.from(suggested);
  }

  detectPainPoints(notes) {
    const painSignals = {};
    const affectedNotes = {};

    for (const note of notes) {
      const text = `${note.title || ''} ${note.body || ''}`.toLowerCase();
      for (const [keyword, weight] of Object.entries(this.painKeywords)) {
        const regex = new RegExp(keyword, 'gi');
        const matches = text.match(regex) || [];
        for (const match of matches) {
          if (!painSignals[keyword]) {
            painSignals[keyword] = { keyword, weight, frequency: 0, totalScore: 0 };
          }
          painSignals[keyword].frequency++;
          painSignals[keyword].totalScore += weight;
          if (!affectedNotes[keyword]) affectedNotes[keyword] = [];
          if (!affectedNotes[keyword].includes(note.file)) {
            affectedNotes[keyword].push(note.file);
          }
        }
      }
    }

    const painPoints = [];
    for (const [keyword, signal] of Object.entries(painSignals)) {
      const severity = Math.min(100, (signal.frequency * signal.weight) / notes.length * 50);
      painPoints.push({
        pain: `${keyword} processes`,
        severity: Math.round(severity),
        frequency: signal.frequency,
        affectedNotes: affectedNotes[keyword] || [],
        suggestedSolution: this.suggestSolution(keyword),
        estimatedROI: this.estimateROI(signal.frequency),
      });
    }

    painPoints.sort((a, b) => b.severity - a.severity);
    const topPains = painPoints.slice(0, 5).map(p => `${p.pain} (${p.severity})`);

    return { painPoints: painPoints.slice(0, 10), topPains };
  }

  estimateROI(frequency) {
    if (frequency >= 10) return '5h saved per week';
    if (frequency >= 5) return '2h saved per week';
    if (frequency >= 2) return '30m saved per week';
    return 'minor optimization';
  }

  suggestSolution(keyword) {
    for (const [key, skill] of Object.entries(this.solutionMapping)) {
      if (keyword.includes(key) || key.includes(keyword)) {
        return skill;
      }
    }
    return '/automation-engine';
  }
}

export default PatternDetector;
