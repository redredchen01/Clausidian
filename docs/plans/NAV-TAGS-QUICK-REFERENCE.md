# Navigation Tags - Quick Reference

## Problem Statement
Code generates `| nav | nav-prev |` and `| nav | nav-next |` but test expects `| nav |`

## Decision
Use **nav-prev / nav-next format** (Option B) - Status quo, already implemented

## Why This Format?
1. Semantic: Direction explicitly encoded
2. Graph tools can reconstruct timelines
3. Matches origin/main branch
4. Enables future nav-parent, nav-child, etc.
5. User-readable when reviewing _graph.md

## Changes Needed

### File 1: src/index-manager.mjs
- Status: Code is CORRECT (already nav-prev/nav-next)
- Action: Add 3-line comment block at line 75

### File 2: test/index-manager.test.mjs
- Status: Test is INCORRECT (expects old format)
- Action: Update line 70 assertion (2 lines)
- Action: Add new test for direction validation

### File 3: ARCHITECTURE.md
- Status: May need Knowledge Graph format section
- Action: Document 4-column format and nav tags

## Testing
```bash
npm test -- test/index-manager.test.mjs    # Should pass after changes
npm test                                     # All 168 tests should pass
```

## Success Metrics
- All 168 tests pass
- index-manager tests validate nav-prev AND nav-next
- No code changes to index-manager.mjs logic
- ARCHITECTURE.md documents format

## Time Estimate
- Implementation: 15 minutes
- Testing: 2 minutes
- Verification: 5 minutes
- Total: 22 minutes

## Verification Checklist
- [ ] Test assertions updated
- [ ] New test case added
- [ ] Comments added to code
- [ ] ARCHITECTURE.md updated
- [ ] All 17 index-manager tests pass
- [ ] All 168 total tests pass
- [ ] Manual verification with 5-day journal sequence

