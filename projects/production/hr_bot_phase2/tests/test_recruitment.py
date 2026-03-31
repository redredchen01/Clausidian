"""Unit tests for Recruitment Management module.

Test coverage includes:
- Resume screening and scoring
- Candidate evaluation
- Application workflow
- Offer management
- Funnel analytics
"""

import unittest
from datetime import datetime, timedelta
from unittest.mock import MagicMock, patch

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from hr_bot_phase2.recruitment.models import (
    Base, JobPosting, Candidate, Application, Offer,
    JobStatus, ApplicationStatus, OfferStatus
)
from hr_bot_phase2.recruitment.service import RecruitmentService


class TestRecruitmentService(unittest.TestCase):
    """Test cases for RecruitmentService."""

    def setUp(self):
        """Set up test database and service."""
        # Create in-memory SQLite database
        engine = create_engine('sqlite:///:memory:')
        Base.metadata.create_all(engine)

        Session = sessionmaker(bind=engine)
        self.db = Session()
        self.service = RecruitmentService(self.db)

    def tearDown(self):
        """Clean up database session."""
        self.db.close()

    # ====== Skill Match Tests ======

    def test_skill_match_all_required_skills(self):
        """Test perfect skill match."""
        score, details = self.service.calculate_skill_match_score(
            candidate_skills=['Python', 'SQL', 'Docker'],
            required_skills=['Python', 'SQL', 'Docker'],
            nice_to_have=['AWS']
        )

        self.assertEqual(score, 100.0)
        self.assertEqual(details['required_matched'], '3/3')

    def test_skill_match_partial(self):
        """Test partial skill match."""
        score, details = self.service.calculate_skill_match_score(
            candidate_skills=['Python', 'SQL'],
            required_skills=['Python', 'SQL', 'Docker'],
            nice_to_have=[]
        )

        self.assertGreater(score, 60.0)
        self.assertLess(score, 100.0)
        self.assertEqual(details['required_matched'], '2/3')

    def test_skill_match_case_insensitive(self):
        """Test case-insensitive skill matching."""
        score, _ = self.service.calculate_skill_match_score(
            candidate_skills=['python', 'sql'],
            required_skills=['Python', 'SQL'],
            nice_to_have=[]
        )

        self.assertEqual(score, 100.0)

    def test_skill_match_no_required(self):
        """Test scoring when no required skills."""
        score, _ = self.service.calculate_skill_match_score(
            candidate_skills=['Python'],
            required_skills=[],
            nice_to_have=[]
        )

        self.assertEqual(score, 100.0)

    def test_skill_match_with_nice_to_have(self):
        """Test nice-to-have skills in scoring."""
        score, details = self.service.calculate_skill_match_score(
            candidate_skills=['Python', 'SQL', 'AWS'],
            required_skills=['Python', 'SQL'],
            nice_to_have=['AWS', 'Docker']
        )

        # Should account for 1/2 nice-to-have skills
        self.assertGreater(score, 90.0)

    # ====== Experience Tests ======

    def test_experience_exact_match(self):
        """Test exact experience match."""
        score = self.service.calculate_experience_score(
            candidate_years=5,
            required_years=5
        )

        self.assertEqual(score, 100.0)

    def test_experience_above_required(self):
        """Test candidate with more experience."""
        score = self.service.calculate_experience_score(
            candidate_years=7,
            required_years=5
        )

        self.assertIn(score, [85.0, 90.0, 95.0])  # Over-qualified

    def test_experience_below_required(self):
        """Test candidate with less experience."""
        score = self.service.calculate_experience_score(
            candidate_years=3,
            required_years=5
        )

        self.assertEqual(score, 60.0)

    # ====== Location Tests ======

    def test_location_exact_match(self):
        """Test exact location match."""
        score = self.service.calculate_location_score(
            candidate_location='San Francisco, CA',
            job_location='San Francisco, CA',
            candidate_remote_willing=False,
            job_remote_policy='on-site'
        )

        self.assertEqual(score, 100.0)

    def test_location_remote_preference(self):
        """Test remote location preference."""
        score = self.service.calculate_location_score(
            candidate_location='Remote',
            job_location='New York, NY',
            candidate_remote_willing=True,
            job_remote_policy='remote'
        )

        self.assertGreaterEqual(score, 85.0)

    def test_location_willing_to_relocate(self):
        """Test candidate willing to relocate."""
        score = self.service.calculate_location_score(
            candidate_location='Boston, MA',
            job_location='San Francisco, CA',
            candidate_remote_willing=True,
            job_remote_policy='on-site'
        )

        self.assertEqual(score, 90.0)

    # ====== Resume Screening Tests ======

    def test_resume_screening_high_score(self):
        """Test resume screening with high-scoring candidate."""
        job = JobPosting(
            title='Senior Python Developer',
            description='Looking for senior Python dev',
            department='Engineering',
            salary_min=100000,
            salary_max=150000,
            required_skills=['Python', 'SQL'],
            nice_to_have_skills=['Docker', 'AWS'],
            experience_years=5,
            location='San Francisco, CA',
            employment_type='full-time',
            remote_policy='hybrid',
            status=JobStatus.OPEN,
            created_by_id=1,
        )

        candidate = Candidate(
            full_name='John Doe',
            email='john@example.com',
            skills=['Python', 'SQL', 'Docker', 'AWS'],
            years_experience=7,
            preferred_location='San Francisco, CA',
            willing_to_relocate=True,
        )

        score, details = self.service.screen_resume(candidate, job)

        self.assertGreater(score, 80.0)
        self.assertTrue(details['passes_screening'])

    def test_resume_screening_low_score(self):
        """Test resume screening with low-scoring candidate."""
        job = JobPosting(
            title='Senior Developer',
            description='Senior role',
            department='Engineering',
            salary_min=120000,
            salary_max=180000,
            required_skills=['Python', 'Go', 'Rust'],
            nice_to_have_skills=['Kubernetes'],
            experience_years=7,
            location='San Francisco, CA',
            employment_type='full-time',
            remote_policy='on-site',
            status=JobStatus.OPEN,
            created_by_id=1,
        )

        candidate = Candidate(
            full_name='Jane Smith',
            email='jane@example.com',
            skills=['JavaScript'],  # No matching skills
            years_experience=1,
            preferred_location='Boston, MA',
            willing_to_relocate=False,
        )

        score, details = self.service.screen_resume(candidate, job)

        self.assertLess(score, 50.0)
        self.assertFalse(details['passes_screening'])

    # ====== Application Workflow Tests ======

    def test_advance_application_to_interview(self):
        """Test advancing application through stages."""
        # Create test data
        job = JobPosting(
            title='Developer',
            description='Test',
            department='Engineering',
            salary_min=50000,
            salary_max=100000,
            required_skills=['Python'],
            experience_years=2,
            location='Remote',
            status=JobStatus.OPEN,
            created_by_id=1,
        )
        self.db.add(job)
        self.db.flush()

        candidate = Candidate(
            full_name='Test Candidate',
            email='test@example.com',
            skills=['Python'],
            years_experience=3,
        )
        self.db.add(candidate)
        self.db.flush()

        application = Application(
            candidate_id=candidate.id,
            job_posting_id=job.id,
            status=ApplicationStatus.APPLIED,
        )
        self.db.add(application)
        self.db.commit()

        # Advance to screening
        success = self.service.advance_application_stage(
            application,
            ApplicationStatus.SCREENING,
            score=85.0,
            notes='Good resume'
        )

        self.assertTrue(success)
        self.assertEqual(application.status, ApplicationStatus.SCREENING)
        self.assertEqual(application.screening_score, 85.0)

    def test_reject_application(self):
        """Test rejecting an application."""
        job = JobPosting(
            title='Developer',
            description='Test',
            department='Engineering',
            salary_min=50000,
            salary_max=100000,
            required_skills=['Python'],
            experience_years=2,
            location='Remote',
            status=JobStatus.OPEN,
            created_by_id=1,
        )
        self.db.add(job)
        self.db.flush()

        candidate = Candidate(
            full_name='Test Candidate',
            email='test@example.com',
            skills=['JavaScript'],
            years_experience=1,
        )
        self.db.add(candidate)
        self.db.flush()

        application = Application(
            candidate_id=candidate.id,
            job_posting_id=job.id,
            status=ApplicationStatus.APPLIED,
        )
        self.db.add(application)
        self.db.commit()

        success = self.service.reject_application(
            application,
            reason='Skill mismatch',
            feedback='We need more Python experience'
        )

        self.assertTrue(success)
        self.assertEqual(application.status, ApplicationStatus.REJECTED)
        self.assertEqual(application.rejection_reason, 'Skill mismatch')

    # ====== Offer Management Tests ======

    def test_create_offer(self):
        """Test creating a job offer."""
        job = JobPosting(
            title='Developer',
            description='Test',
            department='Engineering',
            salary_min=50000,
            salary_max=100000,
            required_skills=['Python'],
            experience_years=2,
            location='Remote',
            status=JobStatus.OPEN,
            created_by_id=1,
        )
        self.db.add(job)
        self.db.flush()

        candidate = Candidate(
            full_name='Test Candidate',
            email='test@example.com',
            skills=['Python'],
            years_experience=3,
        )
        self.db.add(candidate)
        self.db.flush()

        # Create application with high score
        application = Application(
            candidate_id=candidate.id,
            job_posting_id=job.id,
            status=ApplicationStatus.TECHNICAL,
            final_score=85.0,
        )
        self.db.add(application)
        self.db.commit()

        # Create offer
        offer = self.service.create_offer(
            candidate_id=candidate.id,
            job_posting_id=job.id,
            salary=80000,
            start_date=datetime.utcnow() + timedelta(days=14),
            created_by_id=1,
        )

        self.assertIsNotNone(offer)
        self.assertEqual(offer.status, OfferStatus.PENDING)
        self.assertEqual(offer.salary, 80000)

    def test_accept_offer(self):
        """Test accepting an offer."""
        job = JobPosting(
            title='Developer',
            description='Test',
            department='Engineering',
            salary_min=50000,
            salary_max=100000,
            required_skills=['Python'],
            experience_years=2,
            location='Remote',
            status=JobStatus.OPEN,
            created_by_id=1,
        )
        self.db.add(job)
        self.db.flush()

        candidate = Candidate(
            full_name='Test Candidate',
            email='test@example.com',
            skills=['Python'],
            years_experience=3,
        )
        self.db.add(candidate)
        self.db.flush()

        offer = Offer(
            candidate_id=candidate.id,
            job_posting_id=job.id,
            salary=80000,
            start_date=datetime.utcnow() + timedelta(days=14),
            expires_at=datetime.utcnow() + timedelta(days=7),
            response_deadline=datetime.utcnow() + timedelta(days=7),
            status=OfferStatus.PENDING,
            created_by_id=1,
        )
        self.db.add(offer)
        self.db.commit()

        success = self.service.accept_offer(offer)

        self.assertTrue(success)
        self.assertEqual(offer.status, OfferStatus.ACCEPTED)
        self.assertIsNotNone(offer.accepted_at)

    def test_reject_offer(self):
        """Test rejecting an offer."""
        job = JobPosting(
            title='Developer',
            description='Test',
            department='Engineering',
            salary_min=50000,
            salary_max=100000,
            required_skills=['Python'],
            experience_years=2,
            location='Remote',
            status=JobStatus.OPEN,
            created_by_id=1,
        )
        self.db.add(job)
        self.db.flush()

        candidate = Candidate(
            full_name='Test Candidate',
            email='test@example.com',
            skills=['Python'],
            years_experience=3,
        )
        self.db.add(candidate)
        self.db.flush()

        offer = Offer(
            candidate_id=candidate.id,
            job_posting_id=job.id,
            salary=80000,
            start_date=datetime.utcnow() + timedelta(days=14),
            expires_at=datetime.utcnow() + timedelta(days=7),
            response_deadline=datetime.utcnow() + timedelta(days=7),
            status=OfferStatus.PENDING,
            created_by_id=1,
        )
        self.db.add(offer)
        self.db.commit()

        success = self.service.reject_offer(offer, reason='Accepted another offer')

        self.assertTrue(success)
        self.assertEqual(offer.status, OfferStatus.REJECTED)

    # ====== Analytics Tests ======

    def test_recruitment_funnel(self):
        """Test recruitment funnel metrics calculation."""
        job = JobPosting(
            title='Developer',
            description='Test',
            department='Engineering',
            salary_min=50000,
            salary_max=100000,
            required_skills=['Python'],
            experience_years=2,
            location='Remote',
            status=JobStatus.OPEN,
            created_by_id=1,
        )
        self.db.add(job)
        self.db.flush()

        # Create multiple applications with different statuses
        for i in range(5):
            candidate = Candidate(
                full_name=f'Candidate {i}',
                email=f'candidate{i}@example.com',
                skills=['Python'],
                years_experience=3,
            )
            self.db.add(candidate)
            self.db.flush()

            status = [
                ApplicationStatus.APPLIED,
                ApplicationStatus.SCREENING,
                ApplicationStatus.INTERVIEW_1,
                ApplicationStatus.INTERVIEW_2,
                ApplicationStatus.OFFER,
            ][i]

            application = Application(
                candidate_id=candidate.id,
                job_posting_id=job.id,
                status=status,
                final_score=75 + i * 5,
            )
            self.db.add(application)

        self.db.commit()

        funnel = self.service.get_recruitment_funnel(job.id)

        self.assertEqual(funnel['total_applications'], 5)
        self.assertIn('by_status', funnel)
        self.assertEqual(len(funnel['by_status']), 5)

    def test_candidate_comparison(self):
        """Test candidate comparison ranking."""
        job = JobPosting(
            title='Developer',
            description='Test',
            department='Engineering',
            salary_min=50000,
            salary_max=100000,
            required_skills=['Python'],
            experience_years=2,
            location='Remote',
            status=JobStatus.OPEN,
            created_by_id=1,
        )
        self.db.add(job)
        self.db.flush()

        # Create 3 candidates with different scores
        for i, score in enumerate([95, 85, 75]):
            candidate = Candidate(
                full_name=f'Candidate {i}',
                email=f'candidate{i}@example.com',
                skills=['Python'],
                years_experience=3 + i,
            )
            self.db.add(candidate)
            self.db.flush()

            application = Application(
                candidate_id=candidate.id,
                job_posting_id=job.id,
                status=ApplicationStatus.INTERVIEW_2,
                final_score=score,
            )
            self.db.add(application)

        self.db.commit()

        comparison = self.service.get_candidate_comparison(job.id, top_n=3)

        self.assertEqual(len(comparison), 3)
        # Verify sorted by score (highest first)
        self.assertEqual(comparison[0]['final_score'], 95)
        self.assertEqual(comparison[1]['final_score'], 85)
        self.assertEqual(comparison[2]['final_score'], 75)


if __name__ == '__main__':
    unittest.main()
