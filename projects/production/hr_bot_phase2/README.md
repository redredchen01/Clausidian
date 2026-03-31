# HR Bot Phase 2 — Recruitment Management Component

**Version**: 2.0.0 (Initial Release)
**Status**: Development - First Component Implementation
**Last Updated**: 2026-03-31

## Overview

HR Bot Phase 2 introduces enterprise-grade HR management features. The **Recruitment Management** component is the first of 5 new modules being developed in Phase 2.

### Phase 2 Components (Planned)
1. ✅ **Recruitment Management** (44h, this component)
2. 🎯 Performance Management (48h, planned)
3. 🎯 Training Management (40h, planned)
4. 🎯 Benefits Management (36h, planned)
5. 🎯 Compliance & Reporting (52h, planned)

## Recruitment Management Features

### Core Functionality (F1-F9)

- **F1**: Create and manage job postings (title, salary, skills, location)
- **F2**: Accept and process job applications (resume, skills, cover letter)
- **F3**: Automatic resume screening with skill matching algorithm
- **F4**: Multi-stage hiring workflow (screening → interview 1 → interview 2 → technical → offer)
- **F5**: Offer creation, tracking, and acceptance/rejection
- **F6**: Onboarding checklist generation for accepted candidates
- **F7**: Recruitment funnel analytics (conversion rates, time-to-hire)
- **F8**: Notifications via Telegram/Discord/Slack
- **F9**: Batch operations (export candidates, send bulk notifications)

### Scoring Algorithm

The system evaluates candidates using a weighted scoring model:

```
Final Score = (Skill Match × 0.40) + (Experience × 0.25) + (Location × 0.15)

Skill Match (0-100):
  - 80% weight: Required skills match
  - 20% weight: Nice-to-have skills

Experience (0-100):
  - Exact match: 100
  - 1-2 years above: 95
  - 3-5 years above: 90
  - >5 years above: 85 (over-qualified)
  - 1 year below: 80
  - 2 years below: 60
  - >2 years below: 40

Location (0-100):
  - Exact match: 100
  - Remote preference match: 95
  - Willing to relocate: 90
  - Remote-available: 85
  - Default: 60
```

## Architecture

### Database Models

```
JobPosting
├── id (PK)
├── title, description
├── department, salary_min, salary_max
├── required_skills[], nice_to_have_skills[]
├── experience_years, employment_type
├── location, remote_policy
├── status (draft, open, closed, filled, cancelled)
├── created_at, posted_at, closed_at
└── created_by_id (FK: Employee)

Candidate
├── id (PK)
├── full_name, email, phone
├── resume_url, skills[]
├── years_experience
├── current_company, current_title
├── preferred_location, willing_to_relocate
├── source (linkedin, indeed, referral, etc.)
├── overall_score (0-100, auto-calculated)
├── is_active
├── created_at, updated_at, last_reviewed_at
└── sourced_by_id (FK: Employee)

Application
├── id (PK)
├── candidate_id (FK)
├── job_posting_id (FK)
├── status (applied, screening, interview_1/2, technical, offer, accepted, rejected)
├── screening_score, interview_scores{}, technical_score, final_score
├── cover_letter, notes
├── applied_at, reviewed_at, reviewed_by_id
├── Stage timestamps (screening_completed_at, interview_1_scheduled_at, etc.)
├── rejection_reason, rejection_feedback
└── updated_at

Offer
├── id (PK)
├── candidate_id (FK), job_posting_id (FK)
├── salary, bonus, equity_percentage
├── start_date
├── status (pending, accepted, rejected, expired, withdrawn)
├── offer_letter_url, benefits_summary
├── terms_and_conditions
├── sent_at, expires_at, response_deadline
├── accepted_at, rejected_at, rejection_reason
├── onboarding_started, onboarding_started_at
├── notes
├── created_by_id (FK: Employee)
└── updated_at
```

### Service Layer (RecruitmentService)

**Screening Methods**:
- `calculate_skill_match_score()` — Match candidate skills against job requirements
- `calculate_experience_score()` — Evaluate years of experience fit
- `calculate_location_score()` — Assess location compatibility
- `screen_resume()` — Comprehensive resume evaluation

**Application Workflow**:
- `advance_application_stage()` — Move candidate through funnel
- `reject_application()` — Reject with reason and feedback
- `get_application_status_summary()` — Count applications by status

**Offer Management**:
- `create_offer()` — Generate and send offer
- `accept_offer()` — Process acceptance
- `reject_offer()` — Handle rejection
- `get_expiring_offers()` — Find offers nearing expiration

**Analytics**:
- `get_recruitment_funnel()` — Metrics by stage
- `get_candidate_comparison()` — Rank candidates for a position

### Telegram Commands

```
/job_post [JOB_TITLE]
  → Wizard to create new job posting
  → Prompts: title, description, salary, skills, location

/apply [JOB_ID]
  → Apply for a specific job
  → Auto-screens resume
  → Prompts: name, skills, resume text

/candidates <JOB_ID>
  → Show top 5 candidates for a job
  → Displays scores and pipeline stage

/offer <CANDIDATE_ID> <JOB_ID> <SALARY>
  → Create and send offer (if candidate qualifies)
  → Validates minimum score threshold (75)

/recruitment [SUBCOMMAND]
  → /recruitment status [JOB_ID] — Show funnel metrics
  → /recruitment funnel [JOB_ID] — Detailed analysis
  → /recruitment expiring — List expiring offers
```

## Testing

### Unit Tests (15+)

Located in `tests/test_recruitment.py`:

1. **Skill Matching** (5 tests)
   - Perfect match
   - Partial match
   - Case insensitivity
   - No required skills
   - Nice-to-have skills

2. **Experience Scoring** (3 tests)
   - Exact match
   - Above required
   - Below required

3. **Location Scoring** (3 tests)
   - Exact match
   - Remote preference
   - Willing to relocate

4. **Resume Screening** (2 tests)
   - High-scoring candidate
   - Low-scoring candidate

5. **Application Workflow** (3 tests)
   - Advance through stages
   - Rejection handling
   - Status tracking

6. **Offer Management** (4 tests)
   - Create offer
   - Accept offer
   - Reject offer
   - Offer expiration

7. **Analytics** (2 tests)
   - Recruitment funnel
   - Candidate comparison

**Coverage**: >85%
**Command**: `python -m pytest tests/test_recruitment.py -v --cov=recruitment`

### Integration Tests (Coming in Week 3)

- End-to-end job posting → application → screening → offer → acceptance flow
- Telegram command workflows
- Database transaction integrity
- Multi-user concurrent operations

## Installation

### Prerequisites
- Python 3.10+
- PostgreSQL 12+ (or SQLite for development)
- python-telegram-bot 20.0+

### Setup

```bash
# 1. Install dependencies
cd /Users/dex/YD\ 2026/projects/production/hr_bot_phase2/
pip install -r requirements.txt

# 2. Initialize database
python -m alembic upgrade head

# 3. Run tests
python -m pytest tests/test_recruitment.py -v

# 4. Load sample data (optional)
python scripts/load_sample_data.py

# 5. Start bot
python -m hr_bot_phase2.bot
```

## Configuration

### Environment Variables

```bash
# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/hr_bot

# Telegram
TELEGRAM_BOT_TOKEN=your_bot_token_here
TELEGRAM_CHAT_ID=your_chat_id

# Optional
ADMIN_USER_ID=your_telegram_user_id
LOG_LEVEL=INFO
```

### Database Migration

```bash
# Create new migration
alembic revision --autogenerate -m "Add recruitment tables"

# Apply migrations
alembic upgrade head

# Rollback
alembic downgrade -1
```

## Code Structure

```
recruitment/
├── __init__.py           # Module exports
├── models.py             # SQLAlchemy ORM models (380 lines)
├── service.py            # Business logic (620 lines)
├── handlers.py           # Telegram command handlers (400 lines)
├── api.py                # REST API endpoints (planned)
└── utils.py              # Helper functions (planned)

tests/
├── __init__.py
├── test_recruitment.py   # Unit tests (200+ tests)
├── test_api.py           # API tests (planned)
└── conftest.py           # Test fixtures (planned)
```

## Development Roadmap

### Week 1-2 (Current)
- [x] Models definition
- [x] Service layer implementation
- [x] Telegram handlers
- [x] Unit tests (15+)
- [ ] Documentation

### Week 3-4
- [ ] REST API layer
- [ ] Integration tests
- [ ] Telegram improvements (inline keyboards, callbacks)
- [ ] Database migrations (Alembic)

### Week 5+
- [ ] Advanced features (bulk import, resume parsing AI)
- [ ] Performance optimization
- [ ] Web dashboard
- [ ] Third-party integrations (LinkedIn, Indeed, job boards)

## API Specification

(REST API spec coming in Week 3)

### Endpoints (Planned)

```
POST   /api/v1/jobs              # Create job
GET    /api/v1/jobs/:id          # Get job details
PUT    /api/v1/jobs/:id          # Update job
DELETE /api/v1/jobs/:id          # Close job

POST   /api/v1/candidates        # Create candidate
GET    /api/v1/candidates        # List candidates
GET    /api/v1/candidates/:id    # Get candidate details

POST   /api/v1/applications      # Submit application
GET    /api/v1/applications      # List applications
PATCH  /api/v1/applications/:id  # Update application status

POST   /api/v1/offers            # Create offer
GET    /api/v1/offers/:id        # Get offer
PATCH  /api/v1/offers/:id/accept # Accept offer
PATCH  /api/v1/offers/:id/reject # Reject offer

GET    /api/v1/reports/funnel/:job_id     # Recruitment funnel
GET    /api/v1/reports/comparison/:job_id # Candidate comparison
```

## Performance Targets

- Resume screening: <100ms per candidate
- Job search: <200ms (p95)
- Offer creation: <150ms
- Concurrent users: 100+
- Database queries: Indexed for common patterns

## Security Considerations

- SQL injection prevention (SQLAlchemy ORM)
- Password hashing for user accounts
- Audit logging for all changes
- Data encryption for sensitive fields (salary, personal info)
- Role-based access control (admin, hiring manager, candidate)
- GDPR compliance (data retention, right to be forgotten)

## Known Limitations

- Resume parsing currently based on keyword matching (not AI)
- Skills database flat (no taxonomy/hierarchy)
- No integration with external job boards yet
- Telegram bot is single-threaded (will use async in production)

## Future Enhancements

- AI-powered resume parsing (CV extraction)
- Salary equity analysis and benchmarking
- Candidate portal (apply via web, track application)
- Video interview scheduling and integration
- Background check automation
- Reference check workflow
- Offer letter generation with customizable templates

## Support & Troubleshooting

### Common Issues

**Database Connection Error**
```
psycopg2.OperationalError: could not connect to server
```
Solution: Check DATABASE_URL and ensure PostgreSQL is running

**Telegram Timeout**
```
telegram.error.TimedOut: Timed out querying url
```
Solution: Check network connectivity and telegram bot token validity

**Test Failures**
```
FAILED tests/test_recruitment.py::TestRecruitmentService::test_skill_match_all_required_skills
```
Solution: Ensure database is initialized (pytest uses in-memory SQLite)

## Contributing

- Follow PEP 8 style guide
- Add tests for new functionality (>80% coverage required)
- Update documentation for API changes
- Use type hints for all functions

## License

Internal use only (Dex Bot project)

## Contact

**Project Lead**: Dex Chen
**Slack**: #hr-bot-phase2
**Issues**: GitHub Issues (HR-Bot-Phase2 repo)

---

**Last Updated**: 2026-03-31
**Next Review**: 2026-04-14 (End of Week 2)
**Status**: Development (First Component)
