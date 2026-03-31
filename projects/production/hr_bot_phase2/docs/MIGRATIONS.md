# Database Migrations Guide — HR Bot Phase 2

Version: 2.0.0
Last Updated: 2026-03-31
Status: Production Ready

## Overview

HR Bot Phase 2 uses **Alembic** for database version control. The migration system supports:

- **Dual database**: SQLite (development/testing) and PostgreSQL (production)
- **Automatic versioning**: Track all schema changes
- **Upgrade/downgrade**: Roll forward and backward through migrations
- **Auto-generation**: Generate migrations from model changes

## Quick Start

### Prerequisites

```bash
pip install -r requirements.txt
```

### First Time Setup

```bash
# Apply all migrations (creates all tables)
alembic upgrade head

# Verify schema
python -c "from recruitment.models import Base; print('Models loaded successfully')"
```

### View Migration History

```bash
alembic history
```

### Current Database Version

```bash
alembic current
```

## Migration Structure

```
alembic/
├── versions/              # Migration files
│   ├── __init__.py
│   └── 001_initial_schema.py
├── env.py                 # Alembic environment configuration
├── helpers.py             # Migration utilities
├── script.py.mako         # Migration template
└── __init__.py

alembic.ini                # Alembic configuration
```

## Migrations

### 001_initial_schema.py

**Version ID**: `001_initial_schema`
**Date**: 2026-03-31
**Description**: Initial schema for Recruitment Management

Creates 4 core tables:

1. **job_postings** (18 columns)
   - Job posting information
   - Status tracking (draft → open → closed/filled)
   - Salary range, location, remote policy
   - Required and nice-to-have skills
   - Indexes on: id, title, status, department, posted_at

2. **candidates** (17 columns)
   - Candidate profile
   - Contact info, skills, experience
   - Activity tracking (is_active, last_reviewed_at)
   - Overall score for ranking
   - Indexes on: id, email, full_name, is_active

3. **applications** (25 columns)
   - Job applications
   - Scoring data (screening, interview, technical, final)
   - Status tracking through hiring pipeline
   - Stage timestamps (screening_completed_at, etc.)
   - Unique constraint: (candidate_id, job_posting_id)
   - Indexes on: id, candidate_id, job_posting_id, status, final_score

4. **offers** (23 columns)
   - Job offers
   - Compensation (salary, bonus, equity)
   - Status lifecycle (pending → accepted/rejected/expired)
   - Onboarding tracking
   - Indexes on: id, candidate_id, job_posting_id, status, expires_at

## Enum Types

The migration creates 3 enum types:

### JobStatus
```
- draft
- open
- closed
- filled
- cancelled
```

### ApplicationStatus
```
- applied
- screening
- interview_1
- interview_2
- technical
- offer
- accepted
- rejected
- withdrawn
```

### OfferStatus
```
- pending
- accepted
- rejected
- expired
- withdrawn
```

## Configuration

### alembic.ini

Key settings:

```ini
[alembic]
script_location = alembic
file_template = %%(rev)s_%%(slug)s

[development]
sqlalchemy.url = sqlite:///./hr_bot.db

[production]
sqlalchemy.url = postgresql://localhost/hr_bot
```

### Environment Variable Override

Set `DATABASE_URL` to override configuration:

```bash
# Use PostgreSQL
export DATABASE_URL=postgresql://user:pass@host:5432/hr_bot

# Use custom SQLite path
export DATABASE_URL=sqlite:////tmp/hr_bot.db

# Run migrations
alembic upgrade head
```

## Usage

### Apply All Migrations

```bash
alembic upgrade head
```

### Apply Specific Number of Migrations

```bash
# Apply next 3 migrations
alembic upgrade +3
```

### Rollback

```bash
# Rollback to previous version
alembic downgrade -1

# Rollback to specific revision
alembic downgrade 001_initial_schema

# Rollback all
alembic downgrade base
```

### Create New Migration (After Model Changes)

```bash
# Auto-generate from model changes
alembic revision --autogenerate -m "Add new_column to table"

# Manual creation
alembic revision -m "Custom migration description"
```

## Naming Conventions

The migration system uses consistent naming:

### Indexes
```
ix_<table>_<column>
ix_job_postings_title
ix_candidates_email
```

### Foreign Keys
```
fk_<table>_<column>_<ref_table>_<ref_column>
fk_applications_candidate_id_candidates_id
```

### Unique Constraints
```
uq_<table>_<column(s)>
uq_candidates_email
uq_candidate_job
```

## Testing

### Run Migration Tests

```bash
# All migration tests
pytest tests/test_migrations.py -v

# Specific test
pytest tests/test_migrations.py::TestMigrationExecution::test_001_migration_creates_job_postings_table -v

# With coverage
pytest tests/test_migrations.py --cov=alembic --cov-report=html
```

### Test Database

Tests use in-memory SQLite for isolation:

```python
pytest.fixture
def sqlite_session():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    # ...
```

## Database Setup

### SQLite (Development)

```bash
# Default path: ./hr_bot.db
alembic upgrade head

# Check file created
ls -lh hr_bot.db
```

### PostgreSQL (Production)

**Prerequisites**:
- PostgreSQL 12+
- psycopg2-binary installed

```bash
# Set environment
export DATABASE_URL=postgresql://user:pass@localhost:5432/hr_bot

# Create database
createdb hr_bot

# Run migrations
alembic upgrade head

# Verify
psql hr_bot -c "\\dt"  # List tables
```

## Troubleshooting

### "Target database is not up to date"

This occurs when Alembic detects a mismatch between code models and migrations.

**Solution**:
```bash
# Check current status
alembic current

# Auto-generate migration
alembic revision --autogenerate -m "Fix schema mismatch"

# Review and apply
alembic upgrade head
```

### "No such table: candidates"

Migrations haven't been applied yet.

**Solution**:
```bash
alembic upgrade head
```

### "UNIQUE constraint failed"

Duplicate data in unique column (e.g., duplicate email).

**Solution**:
```python
# Check duplicates
from recruitment.models import Candidate
# ... identify and fix duplicates
# Retry migration
```

### "Foreign key constraint failed"

Referential integrity violation.

**Solution**:
1. Check that referenced records exist
2. Remove orphaned records before migration
3. Apply migration

### Database Lock (SQLite)

SQLite is sensitive to concurrent access.

**Solution**:
```bash
# Restart SQLite connection
rm hr_bot.db
alembic upgrade head
```

## Best Practices

### Migration Creation

1. **Keep migrations atomic** — one logical change per migration
2. **Use descriptive names** — e.g., `add_resume_parsing_status`
3. **Test both directions** — upgrade AND downgrade
4. **Include data migrations** — for schema changes affecting data

### Schema Changes

When modifying models:

```bash
# 1. Update model in models.py
# 2. Auto-generate migration
alembic revision --autogenerate -m "Update job_postings schema"

# 3. Review generated migration
# 4. Test locally
pytest tests/test_migrations.py

# 5. Apply
alembic upgrade head
```

### Production Deployments

```bash
# 1. Backup database
pg_dump hr_bot > backup_$(date +%Y%m%d).sql

# 2. Test migration on staging
alembic upgrade head  # On staging DB

# 3. Deploy to production
alembic upgrade head  # On production DB

# 4. Verify
psql hr_bot -c "SELECT version() FROM alembic_version;"
```

## Helper Utilities

The `alembic/helpers.py` module provides:

### MigrationHelpers
```python
from alembic.helpers import MigrationHelpers

# Get version info
info = MigrationHelpers.get_version_info()

# Get enum types
enums = MigrationHelpers.get_enum_types()

# Naming conventions
idx_name = MigrationHelpers.index_naming("table", ["col1", "col2"])
```

### StatusEnumHelpers
```python
from alembic.helpers import StatusEnumHelpers

# Validate status values
assert StatusEnumHelpers.is_valid_job_status("open")
```

### IndexingStrategy
```python
from alembic.helpers import IndexingStrategy

# Get recommended indexes
indexes = IndexingStrategy.get_indexes_for_table("job_postings")
```

## Performance Considerations

### Query Optimization

The initial schema includes indexes on:
- **Frequently filtered** columns: status, is_active, created_at
- **Join columns**: candidate_id, job_posting_id
- **Sorting columns**: final_score, expires_at

### Index Coverage

Common queries and their indexes:

```sql
-- Find open jobs in department
SELECT * FROM job_postings
  WHERE status = 'open' AND department = 'Engineering'
  -- Indexes: ix_job_postings_status, ix_job_postings_department

-- Get active candidates
SELECT * FROM candidates
  WHERE is_active = true ORDER BY overall_score DESC
  -- Indexes: ix_candidates_is_active, final_score

-- Find applications for candidate
SELECT * FROM applications
  WHERE candidate_id = 42 AND status != 'rejected'
  -- Indexes: ix_applications_candidate_id, ix_applications_status
```

## Future Migrations

Planned migrations for Phase 2:

1. **002_add_audit_log** — Audit trail for all changes
2. **003_add_performance_review** — Performance review schema
3. **004_add_leave_management** — Leave request tracking
4. **005_add_payroll** — Payroll and compensation data

## Reference

### Alembic Documentation
- [Alembic Tutorial](https://alembic.sqlalchemy.org/en/latest/tutorial.html)
- [Operations Reference](https://alembic.sqlalchemy.org/en/latest/ops.html)

### SQLAlchemy
- [SQLAlchemy ORM](https://docs.sqlalchemy.org/en/20/orm/)
- [Types](https://docs.sqlalchemy.org/en/20/core/types.html)

## Support

For migration issues:
1. Check `alembic history` for version status
2. Run tests: `pytest tests/test_migrations.py -v`
3. Review migration file in `alembic/versions/`
4. Check environment variables: `echo $DATABASE_URL`

## Contact

**Project Lead**: HR Bot Team
**Issues**: GitHub Issues (HR-Bot-Phase2)
**Slack**: #hr-bot-phase2
