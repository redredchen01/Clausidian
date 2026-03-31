"""Recruitment Service - Business logic for recruitment operations.

Handles candidate screening, scoring, application workflow, and offer management.
"""

import logging
from datetime import datetime, timedelta
from typing import List, Dict, Optional, Tuple
from enum import Enum

from .models import (
    JobPosting, Candidate, Application, Offer,
    JobStatus, ApplicationStatus, OfferStatus
)

logger = logging.getLogger(__name__)


class SkillMatchLevel(str, Enum):
    """Skill match levels for scoring."""
    EXPERT = "expert"      # 100% match
    PROFICIENT = "proficient"  # 70-99% match
    BEGINNER = "beginner"   # 40-69% match
    MINIMAL = "minimal"     # 1-39% match
    NONE = "none"           # 0% match


class RecruitmentService:
    """Service layer for recruitment operations."""

    # Scoring weights
    SKILL_MATCH_WEIGHT = 0.40
    EXPERIENCE_WEIGHT = 0.25
    LOCATION_WEIGHT = 0.15
    INTERVIEW_WEIGHT = 0.20

    # Screening thresholds
    MIN_SCREENING_SCORE = 50.0  # Minimum score to advance to interview
    MIN_INTERVIEW_SCORE = 70.0  # Minimum score to proceed to next round
    MIN_OFFER_SCORE = 75.0  # Minimum score to make offer

    def __init__(self, db_session):
        """Initialize service with database session."""
        self.db = db_session

    # ====== Candidate Screening ======

    def calculate_skill_match_score(
        self,
        candidate_skills: List[str],
        required_skills: List[str],
        nice_to_have: List[str]
    ) -> Tuple[float, Dict[str, str]]:
        """
        Calculate skill match score (0-100) and match details.

        Args:
            candidate_skills: List of candidate's skills
            required_skills: List of required skills
            nice_to_have: List of nice-to-have skills

        Returns:
            (score, match_details) where score is 0-100
        """
        if not required_skills:
            return 100.0, {}

        candidate_skills_lower = [s.lower() for s in candidate_skills]
        required_lower = [s.lower() for s in required_skills]
        nice_lower = [s.lower() for s in nice_to_have]

        # Calculate required skill matches
        required_matches = sum(1 for skill in required_lower if skill in candidate_skills_lower)
        required_match_pct = (required_matches / len(required_lower)) * 100

        # Calculate nice-to-have matches
        nice_matches = 0
        if nice_lower:
            nice_matches = sum(1 for skill in nice_lower if skill in candidate_skills_lower)

        # Weighted score: 80% required, 20% nice-to-have
        base_score = (required_match_pct * 0.8) + ((nice_matches / len(nice_lower)) * 100 * 0.2) if nice_lower else required_match_pct

        match_details = {
            'required_match_pct': f"{required_match_pct:.1f}",
            'required_matched': f"{required_matches}/{len(required_lower)}",
            'nice_matched': f"{nice_matches}/{len(nice_lower) or 'N/A'}",
        }

        return base_score, match_details

    def calculate_experience_score(
        self,
        candidate_years: int,
        required_years: int
    ) -> float:
        """
        Calculate experience match score (0-100).

        Scoring:
        - Exact match: 100
        - 1-2 years above: 95
        - 3-5 years above: 90
        - >5 years above: 85 (over-qualified)
        - 1 year below: 80
        - 2 years below: 60
        - >2 years below: 40
        """
        diff = candidate_years - required_years

        if diff >= 0:
            # Has required experience
            if diff == 0:
                return 100.0
            elif diff <= 2:
                return 95.0
            elif diff <= 5:
                return 90.0
            else:
                return 85.0  # Over-qualified
        else:
            # Below required experience
            if diff == -1:
                return 80.0
            elif diff == -2:
                return 60.0
            else:
                return 40.0

    def calculate_location_score(
        self,
        candidate_location: Optional[str],
        job_location: str,
        candidate_remote_willing: bool,
        job_remote_policy: str
    ) -> float:
        """
        Calculate location fit score (0-100).

        Scoring:
        - Same location: 100
        - Willing to relocate: 90
        - Prefers remote + job is remote: 95
        - Remote-willing + remote available: 85
        - Other: 60
        """
        if not candidate_location:
            return 60.0

        candidate_loc_lower = candidate_location.lower()
        job_loc_lower = job_location.lower()

        # Exact location match
        if candidate_loc_lower == job_loc_lower:
            return 100.0

        # Remote preferences
        if job_remote_policy == 'remote':
            return 95.0 if 'remote' in candidate_location.lower() else 85.0

        # Willing to relocate
        if candidate_remote_willing:
            return 90.0

        # Default
        return 60.0

    def screen_resume(
        self,
        candidate: Candidate,
        job_posting: JobPosting
    ) -> Tuple[float, Dict[str, any]]:
        """
        Screen a resume against job requirements.

        Returns:
            (screening_score, details_dict)
        """
        # Calculate component scores
        skill_score, skill_details = self.calculate_skill_match_score(
            candidate.skills,
            job_posting.required_skills,
            job_posting.nice_to_have_skills
        )

        exp_score = self.calculate_experience_score(
            candidate.years_experience,
            job_posting.experience_years
        )

        loc_score = self.calculate_location_score(
            candidate.preferred_location,
            job_posting.location,
            candidate.willing_to_relocate,
            job_posting.remote_policy
        )

        # Weighted final score
        final_score = (
            skill_score * self.SKILL_MATCH_WEIGHT +
            exp_score * self.EXPERIENCE_WEIGHT +
            loc_score * self.LOCATION_WEIGHT
        )

        details = {
            'skill_score': skill_score,
            'skill_details': skill_details,
            'experience_score': exp_score,
            'location_score': loc_score,
            'final_score': final_score,
            'passes_screening': final_score >= self.MIN_SCREENING_SCORE,
        }

        return final_score, details

    # ====== Application Management ======

    def get_application_status_summary(self, job_posting_id: int) -> Dict[str, int]:
        """Get count of applications by status for a job."""
        applications = self.db.query(Application).filter(
            Application.job_posting_id == job_posting_id
        ).all()

        summary = {}
        for app in applications:
            status = app.status.value
            summary[status] = summary.get(status, 0) + 1

        return summary

    def advance_application_stage(
        self,
        application: Application,
        new_status: ApplicationStatus,
        score: Optional[float] = None,
        notes: Optional[str] = None,
        reviewed_by_id: Optional[int] = None
    ) -> bool:
        """
        Advance application to next stage.

        Returns:
            True if successful, False otherwise
        """
        try:
            old_status = application.status
            application.status = new_status
            application.reviewed_at = datetime.utcnow()

            if reviewed_by_id:
                application.reviewed_by_id = reviewed_by_id

            if notes:
                application.notes = (application.notes or '') + f"\n{notes}"

            # Update stage timestamps
            if new_status == ApplicationStatus.SCREENING:
                application.screening_completed_at = datetime.utcnow()
            elif new_status == ApplicationStatus.INTERVIEW_1:
                application.interview_1_scheduled_at = datetime.utcnow()
            elif new_status == ApplicationStatus.INTERVIEW_2:
                application.interview_2_scheduled_at = datetime.utcnow()
            elif new_status == ApplicationStatus.TECHNICAL:
                application.technical_scheduled_at = datetime.utcnow()

            # Update scores
            if score is not None:
                if new_status == ApplicationStatus.SCREENING:
                    application.screening_score = score
                elif new_status in [ApplicationStatus.INTERVIEW_1]:
                    application.interview_scores['interview_1'] = score
                elif new_status in [ApplicationStatus.INTERVIEW_2]:
                    application.interview_scores['interview_2'] = score
                elif new_status == ApplicationStatus.TECHNICAL:
                    application.technical_score = score

                # Calculate final score
                application.final_score = self._calculate_final_score(application)

            # Update updated_at
            application.updated_at = datetime.utcnow()

            logger.info(
                f"Advanced application {application.id} from {old_status} to {new_status}"
            )
            return True

        except Exception as e:
            logger.error(f"Failed to advance application: {e}")
            return False

    def reject_application(
        self,
        application: Application,
        reason: str,
        feedback: Optional[str] = None
    ) -> bool:
        """Reject an application."""
        try:
            application.status = ApplicationStatus.REJECTED
            application.rejection_reason = reason
            application.rejection_feedback = feedback
            application.reviewed_at = datetime.utcnow()
            application.updated_at = datetime.utcnow()

            logger.info(f"Rejected application {application.id}: {reason}")
            return True

        except Exception as e:
            logger.error(f"Failed to reject application: {e}")
            return False

    # ====== Offer Management ======

    def create_offer(
        self,
        candidate_id: int,
        job_posting_id: int,
        salary: float,
        start_date: datetime,
        bonus: float = 0.0,
        equity_percentage: float = 0.0,
        benefits_summary: Optional[str] = None,
        created_by_id: int = None
    ) -> Optional[Offer]:
        """
        Create a job offer.

        Returns:
            Offer object if successful, None otherwise
        """
        try:
            # Verify application exists and is in offer stage
            application = self.db.query(Application).filter(
                Application.candidate_id == candidate_id,
                Application.job_posting_id == job_posting_id
            ).first()

            if not application or application.final_score < self.MIN_OFFER_SCORE:
                logger.warning(
                    f"Cannot create offer for candidate {candidate_id}: "
                    f"score {application.final_score if application else 'N/A'} < {self.MIN_OFFER_SCORE}"
                )
                return None

            # Create offer
            sent_at = datetime.utcnow()
            expires_at = sent_at + timedelta(days=7)  # Default 7-day expiration

            offer = Offer(
                candidate_id=candidate_id,
                job_posting_id=job_posting_id,
                salary=salary,
                bonus=bonus,
                equity_percentage=equity_percentage,
                start_date=start_date,
                benefits_summary=benefits_summary,
                sent_at=sent_at,
                expires_at=expires_at,
                response_deadline=expires_at,
                created_by_id=created_by_id or 1,  # Default to admin
                status=OfferStatus.PENDING,
            )

            self.db.add(offer)
            self.db.commit()

            # Update application status
            application.status = ApplicationStatus.OFFER
            application.updated_at = datetime.utcnow()
            self.db.commit()

            logger.info(f"Created offer {offer.id} for candidate {candidate_id}")
            return offer

        except Exception as e:
            logger.error(f"Failed to create offer: {e}")
            self.db.rollback()
            return None

    def accept_offer(self, offer: Offer) -> bool:
        """Accept an offer."""
        try:
            offer.status = OfferStatus.ACCEPTED
            offer.accepted_at = datetime.utcnow()
            offer.onboarding_started_at = datetime.utcnow()
            offer.onboarding_started = True
            offer.updated_at = datetime.utcnow()

            # Update application status
            application = self.db.query(Application).filter(
                Application.candidate_id == offer.candidate_id,
                Application.job_posting_id == offer.job_posting_id
            ).first()

            if application:
                application.status = ApplicationStatus.ACCEPTED
                application.updated_at = datetime.utcnow()

            self.db.commit()
            logger.info(f"Offer {offer.id} accepted")
            return True

        except Exception as e:
            logger.error(f"Failed to accept offer: {e}")
            self.db.rollback()
            return False

    def reject_offer(self, offer: Offer, reason: Optional[str] = None) -> bool:
        """Reject an offer."""
        try:
            offer.status = OfferStatus.REJECTED
            offer.rejected_at = datetime.utcnow()
            offer.rejection_reason = reason
            offer.updated_at = datetime.utcnow()

            self.db.commit()
            logger.info(f"Offer {offer.id} rejected: {reason or 'N/A'}")
            return True

        except Exception as e:
            logger.error(f"Failed to reject offer: {e}")
            self.db.rollback()
            return False

    def get_expiring_offers(self, days_threshold: int = 3) -> List[Offer]:
        """Get offers expiring within N days."""
        threshold_date = datetime.utcnow() + timedelta(days=days_threshold)

        return self.db.query(Offer).filter(
            Offer.status == OfferStatus.PENDING,
            Offer.expires_at <= threshold_date
        ).all()

    # ====== Reporting ======

    def get_recruitment_funnel(self, job_posting_id: int) -> Dict[str, any]:
        """Get recruitment funnel metrics for a job."""
        job = self.db.query(JobPosting).filter(
            JobPosting.id == job_posting_id
        ).first()

        if not job:
            return {}

        applications = self.db.query(Application).filter(
            Application.job_posting_id == job_posting_id
        ).all()

        # Count by stage
        funnel = {
            'total_applications': len(applications),
            'by_status': self.get_application_status_summary(job_posting_id),
            'average_time_to_hire': self._calculate_avg_time_to_hire(applications),
            'top_candidates': self._get_top_candidates(applications, limit=5),
        }

        return funnel

    def get_candidate_comparison(
        self,
        job_posting_id: int,
        top_n: int = 5
    ) -> List[Dict[str, any]]:
        """Get top candidates for a job with detailed comparison."""
        applications = self.db.query(Application).filter(
            Application.job_posting_id == job_posting_id,
            Application.status != ApplicationStatus.REJECTED
        ).order_by(Application.final_score.desc()).limit(top_n).all()

        comparison = []
        for app in applications:
            comparison.append({
                'candidate_name': app.candidate.full_name,
                'candidate_id': app.candidate_id,
                'screening_score': app.screening_score,
                'interview_scores': app.interview_scores,
                'technical_score': app.technical_score,
                'final_score': app.final_score,
                'status': app.status.value,
                'applied_at': app.applied_at.isoformat(),
                'days_in_pipeline': (datetime.utcnow() - app.applied_at).days,
            })

        return comparison

    # ====== Private Methods ======

    def _calculate_final_score(self, application: Application) -> float:
        """Calculate weighted final score from component scores."""
        scores = [application.screening_score]

        # Add interview scores
        if 'interview_1' in application.interview_scores:
            scores.append(application.interview_scores['interview_1'])
        if 'interview_2' in application.interview_scores:
            scores.append(application.interview_scores['interview_2'])

        # Add technical score
        if application.technical_score:
            scores.append(application.technical_score)

        if not scores:
            return 0.0

        return sum(scores) / len(scores)

    def _calculate_avg_time_to_hire(self, applications: List[Application]) -> int:
        """Calculate average days from application to offer."""
        accepted_apps = [
            app for app in applications
            if app.status in [ApplicationStatus.ACCEPTED, ApplicationStatus.OFFER]
        ]

        if not accepted_apps:
            return 0

        total_days = sum(
            (app.updated_at - app.applied_at).days
            for app in accepted_apps
        )

        return int(total_days / len(accepted_apps))

    def _get_top_candidates(self, applications: List[Application], limit: int = 5) -> List[Dict]:
        """Get top candidates by score."""
        top = sorted(
            applications,
            key=lambda a: a.final_score,
            reverse=True
        )[:limit]

        return [
            {
                'name': app.candidate.full_name,
                'score': app.final_score,
                'status': app.status.value,
            }
            for app in top
        ]
