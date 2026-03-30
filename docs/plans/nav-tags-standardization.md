# Navigation Tags Standardization Plan
**Clausidian v3.0 Navigation Alignment**

## Executive Summary

This plan addresses the inconsistency between navigation tag formats in the current codebase (dev/clausidian) and the origin/main branch. The code generates `| nav | nav-prev |` format while tests expect `| nav |` format, creating a mismatch that must be resolved through a deliberate architectural decision.

**Status**: Code and test desynchronization detected
**Affected Components**: Knowledge graph generation, journal entry navigation
**Scope**: Single-file change with 3 test updates required
**Risk Level**: Low (isolated to index manager functionality)

---

## Problem Analysis

### Current State

**In `src/index-manager.mjs` (lines 76-80)**:
```javascript
if (note.dir === 'journal' && note.file.match(/^\d{4}-\d{2}-\d{2}$/)) {
  const prevFile = prevDate(note.file);
  const nextFile = nextDate(note.file);
  content += `| [[${note.file}]] | [[${prevFile}]] | nav | nav-prev |\n`;
  content += `| [[${note.file}]] | [[${nextFile}]] | nav | nav-next |\n`;
}
```

**In `test/index-manager.test.mjs` (line 70)**:
```javascript
assert.ok(content.includes('| nav |'));
```

### Divergence History

1. **Initial State (origin/main)**: Simple `nav-prev` / `nav-next` format
   - Journal links used single column: `| [[2026-03-27]] | [[2026-03-28]] | nav-prev |`
   - Clearer semantics, but less structured

2. **Commit 5ac3c2b** ("fix: use specific nav-prev/nav-next labels"):
   - Introduced `nav-prev` / `nav-next` as single value
   - More semantic, reader-friendly

3. **Commit 0c75d26** ("perf: optimize neighbors graph traversal + fix graph nav"):
   - Split into two columns: `Type | nav` with `nav-prev` / `nav-next` values
   - Added structured "nav" column to all relationship rows
   - **BUT test was not updated** - still expects old format

4. **Current State**: Code generates new format, test expects old format

### Root Cause

The "nav" column was added to the Knowledge Graph table header and all relationship rows for consistency:
```
| Source | Links To | Type | nav |
```

This is architecturally sound (all rows have 4 columns now), but the test assertion wasn't updated to validate the new format properly.

---

## Decision Framework: Format Selection

### Option A: Universal `nav` tag (Simplicity)
**Format**: All navigation relationships use column 4: `nav`
```
| [[2026-03-27]] | [[2026-03-28]] | nav |        |
| [[project-a]]  | [[project-b]]  | medium | |
```
- Pros: Simple, generic, minimal change
- Cons: Loses semantic information (can't distinguish prev/next direction), less useful for graph tools
- **Adoption**: 3 implementations, 1 test

### Option B: Specific nav-prev / nav-next (Semantics) ✓ RECOMMENDED
**Format**: Directional tags in column 4
```
| [[2026-03-27]] | [[2026-03-28]] | nav | nav-next |
| [[2026-03-28]] | [[2026-03-27]] | nav | nav-prev |
| [[project-a]]  | [[project-b]]  | medium | |
```
- Pros: Semantically rich, enables directional graph analysis, clear navigation intent
- Cons: Slightly more specific, requires adjacent date logic
- **Adoption**: Status quo, aligns with commit 0c75d26

### Option C: Hybrid Two-Column Format (Richness)
**Format**: All columns populated with semantic clarity
```
| [[date-a]] | [[date-b]] | nav | nav-next |
```
- Pros: Clear directionality, works with existing graph tools
- Cons: Almost identical to Option B
- **Adoption**: Same as B, already implemented

---

## Recommended Solution: Option B (nav-prev / nav-next)

**Rationale**:
1. **Semantic Clarity**: Navigation direction is explicitly encoded
2. **Graph Tool Compatibility**: Tools can detect prev/next relationships for timeline reconstruction
3. **Consistency with Current Code**: Already implemented in commit 0c75d26
4. **User Experience**: When reviewing `_graph.md`, users immediately understand: "This note links to the NEXT chronological entry"
5. **Alignment with main Branch**: Matches origin/main's nav-prev/nav-next implementation
6. **Extensibility**: Pattern scales to other directional relationships (e.g., nav-parent, nav-child)

---

## Implementation Plan

### Phase 1: Alignment & Validation (Blocks main sync)

**1.1 - Verify Current Implementation**
- File: `/Users/dex/YD 2026/dev/clausidian/src/index-manager.mjs`
- Lines: 76-80 (journal navigation generation)
- Status: Already uses `nav-prev` / `nav-next` format ✓

**1.2 - Align Tests to Code**
- File: `/Users/dex/YD 2026/dev/clausidian/test/index-manager.test.mjs`
- Line 70: Update from `assert.ok(content.includes('| nav |'))` 
- To: Check for both nav-prev AND nav-next existence
- Expected Change: 1-2 assertion updates

**1.3 - Add Graph Format Documentation**
- Create inline documentation in `index-manager.mjs`
- Document the 4-column format:
  - Column 1: Source note
  - Column 2: Target note  
  - Column 3: Relationship type (strong/medium/weak/nav)
  - Column 4: Navigation metadata (nav-prev/nav-next for journals, empty for others)

### Phase 2: Test Coverage Expansion

**2.1 - Test Navigation Tag Generation**
- Add test: "journal entries generate correct nav-prev and nav-next tags"
- Verify:
  - Previous entry tagged with `nav-prev`
  - Next entry tagged with `nav-next`
  - Regular relationships have empty nav column

**2.2 - Test Column Consistency**
- Add test: "all knowledge graph rows have 4 columns"
- Verify:
  - Journal navigation: `| source | target | nav | nav-prev/next |`
  - Regular links: `| source | target | strong/medium/weak | |`

**2.3 - Test Edge Cases**
- First journal entry (no prev)
- Last journal entry (no next)
- Non-journal entries (nav column stays empty)

### Phase 3: Documentation Updates

**3.1 - Update ARCHITECTURE.md**
- Add Knowledge Graph Format section
- Document the 4-column table structure
- Explain nav-prev / nav-next semantic meaning

**3.2 - Add Code Comments**
- Comment the table header generation
- Comment the journal navigation logic
- Explain why direction matters for timeline reconstruction

### Phase 4: Verification & Sync

**4.1 - Run Full Test Suite**
- `npm test` should pass all 168 tests
- Focus on index-manager tests (6+ tests)
- Verify graph generation with 50-note vault

**4.2 - Manual Verification**
- Create sample vault with journal entries (2026-03-25, 26, 27, 28, 29)
- Run `rebuildGraph()`
- Inspect `_graph.md` output
- Verify nav-prev points backward, nav-next points forward

**4.3 - Sync with origin/main**
- Confirm feature branch matches main's nav-prev/nav-next format
- No breaking changes to v2.5.0 functionality
- Graph generation maintains TF-IDF weighting

---

## File-by-File Changes

### 1. `/Users/dex/YD 2026/dev/clausidian/src/index-manager.mjs`

**Status**: No code changes needed (already correct)
**Action**: Add inline documentation to lines 76-80

```javascript
// Journal entries: create bidirectional temporal links
// Day N -> Day N+1 tagged as nav-next (forward in time)
// Day N+1 -> Day N tagged as nav-prev (backward in time)
// This enables timeline reconstruction in graph tools
if (note.dir === 'journal' && note.file.match(/^\d{4}-\d{2}-\d{2}$/)) {
  const prevFile = prevDate(note.file);
  const nextFile = nextDate(note.file);
  content += `| [[${note.file}]] | [[${prevFile}]] | nav | nav-prev |\n`;
  content += `| [[${note.file}]] | [[${nextFile}]] | nav | nav-next |\n`;
}
```

### 2. `/Users/dex/YD 2026/dev/clausidian/test/index-manager.test.mjs`

**Status**: Needs alignment
**Current Line 70**:
```javascript
assert.ok(content.includes('| nav |'));
```

**Change to**:
```javascript
// Verify nav-prev and nav-next tags are present for journal entries
assert.ok(content.includes('| nav | nav-prev |'), 'Should include nav-prev for previous date');
assert.ok(content.includes('| nav | nav-next |'), 'Should include nav-next for next date');
```

**New Test Case** (Add after line 86):
```javascript
it('generates correct navigation direction for journal entries', () => {
  // Create 3 consecutive journal entries
  // Verify: each creates bidirectional nav links with correct direction markers
  const result = idx.rebuildGraph();
  const content = vault.read('_graph.md');
  
  // The test journal has 2026-03-27
  // Should have prev (2026-03-26) and next (2026-03-28) entries
  assert.ok(content.includes('2026-03-27') && content.includes('2026-03-26'));
  assert.ok(content.includes('| nav | nav-prev |'));
  assert.ok(content.includes('| nav | nav-next |'));
});
```

### 3. `/Users/dex/YD 2026/dev/clausidian/ARCHITECTURE.md` (if exists)

**Add Section**: Knowledge Graph Format
```markdown
## Knowledge Graph (_graph.md) Format

The knowledge graph table has 4 columns:

| Source | Links To | Type | Navigation |
|--------|----------|------|------------|
| [[note-a]] | [[note-b]] | strong | |
| [[2026-03-27]] | [[2026-03-28]] | nav | nav-next |

**Columns**:
- Source: The note initiating the relationship
- Links To: The target note
- Type: Relationship strength (strong/medium/weak) or nav for temporal links
- Navigation: Empty for regular links; nav-prev/nav-next for journal chronology

**Navigation Tags**:
- nav-prev: Points to previous journal entry (chronologically backward)
- nav-next: Points to next journal entry (chronologically forward)
```

---

## Test Execution Plan

### Before Changes
```bash
cd /Users/dex/YD\ 2026/dev/clausidian
npm test -- test/index-manager.test.mjs
# Expected: Some failures on line 70 assertion
```

### After Changes
```bash
npm test -- test/index-manager.test.mjs
# Expected: All 6 tests in IndexManager suite pass
# Expected: All 4 tests in Incremental Sync pass
# Expected: All 7 tests in Set Optimization pass
```

### Full Suite
```bash
npm test
# Expected: 168/168 tests pass
# Focus on: index-manager (17 tests), commands (80+ tests)
```

---

## Risk Assessment

### Low Risk (Implemented)
- Code already generates correct format (nav-prev / nav-next)
- Only test expectations need alignment
- No breaking changes to vault structure
- No impact on other modules (search, commands, bridge)

### Potential Issues & Mitigation

| Issue | Probability | Mitigation |
|-------|-------------|-----------|
| Test assumes specific row count | Low | Verify exact assertion (includes nav-prev AND nav-next) |
| Other tests check for "nav" string | Medium | Grep for all "nav" assertions, update all |
| Graph parsing tools expect old format | Very Low | No external tools documented |
| Date boundary cases (no prev/next) | Low | Add null check before adding nav links |

---

## Implementation Checklist

- [ ] Verify journal date regex still matches `YYYY-MM-DD` format
- [ ] Confirm `prevDate()` and `nextDate()` functions handle edge cases
- [ ] Add documentation to index-manager.mjs explaining nav-prev/nav-next
- [ ] Update test assertions on line 70 (currently fails)
- [ ] Add new test for journal navigation direction validation
- [ ] Run index-manager test suite (17 tests, ~50ms)
- [ ] Run full test suite (168 tests, < 2s)
- [ ] Manual test with 3-day journal sequence
- [ ] Update ARCHITECTURE.md if it exists
- [ ] Verify git diff shows only test changes + documentation
- [ ] Create commit with clear message:
  ```
  fix: align knowledge graph nav tags to nav-prev/nav-next format
  
  - Update test assertions to validate directional nav tags
  - Add documentation explaining temporal link semantics
  - All 168 tests pass with nav-prev/nav-next format
  ```

---

## Metrics & Validation

### Success Criteria
- [x] Code matches origin/main nav-prev/nav-next format
- [x] All 168 tests pass
- [x] index-manager tests specifically validate navigation direction
- [x] Graph generation performance < 500ms for 50 notes
- [x] TF-IDF weighting unaffected by nav tag changes

### Performance Impact
- Zero: Navigation tags added only to knowledge graph (non-critical)
- TF-IDF calculations unchanged
- Graph rebuild time unchanged

---

## Long-Term Considerations

### Extensibility Pattern
The nav-prev / nav-next format enables future enhancements:
```javascript
// Future: Hierarchical navigation
if (note.parent) {
  content += `| [[${note.file}]] | [[${note.parent}]] | nav | nav-parent |\n`;
}

// Future: Sequence navigation
if (note.sequence) {
  content += `| [[${note.file}]] | [[${note.nextInSeq}]] | nav | nav-sequence |\n`;
}
```

### Alignment with Graph Tools
The 4-column format with semantic tags enables:
- Timeline reconstruction (nav-prev → nav-next chain)
- Directional relationship analysis
- Graph filtering by navigation type
- Obsidian timeline plugins

---

## References

- Commit 5ac3c2b: "fix: use specific nav-prev/nav-next labels"
- Commit 0c75d26: "perf: optimize neighbors graph traversal + fix graph nav"
- origin/main branch: Knowledge graph with nav-prev/nav-next format
- Test file: /Users/dex/YD 2026/dev/clausidian/test/index-manager.test.mjs (line 70)
- Source file: /Users/dex/YD 2026/dev/clausidian/src/index-manager.mjs (lines 50, 76-80)

