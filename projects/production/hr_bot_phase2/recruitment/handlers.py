"""Telegram command handlers for Recruitment Management.

Implements /job_post, /apply, /candidates, /offer commands and related workflows.
"""

import logging
from typing import Optional, Dict, Any
from datetime import datetime

from telegram import Update
from telegram.ext import ContextTypes, ConversationHandler
from telegram.constants import ChatAction

from .models import (
    JobPosting, Candidate, Application, Offer,
    JobStatus, ApplicationStatus, OfferStatus
)
from .service import RecruitmentService

logger = logging.getLogger(__name__)

# Conversation states
(
    JOB_POST_TITLE,
    JOB_POST_DESCRIPTION,
    JOB_POST_SALARY,
    JOB_POST_SKILLS,
    JOB_POST_LOCATION,
    APPLY_CANDIDATE,
    APPLY_SKILLS,
    APPLY_RESUME,
) = range(8)


class RecruitmentHandlers:
    """Telegram command handlers for recruitment operations."""

    def __init__(self, service: RecruitmentService, db_session):
        """Initialize handlers."""
        self.service = service
        self.db = db_session

    # ====== Command: /job_post ======

    async def cmd_job_post(self, update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
        """Start job posting wizard."""
        await update.message.reply_text(
            "📝 <b>Create New Job Posting</b>\n\n"
            "Let's create a new job posting. Please provide the job title.",
            parse_mode="HTML"
        )
        return JOB_POST_TITLE

    async def job_post_title(self, update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
        """Handle job title input."""
        title = update.message.text.strip()

        if len(title) < 5:
            await update.message.reply_text(
                "❌ Job title too short (min 5 chars). Please try again."
            )
            return JOB_POST_TITLE

        context.user_data['job_title'] = title
        await update.message.reply_text(
            f"✅ Title: <b>{title}</b>\n\n"
            "Now, provide the job description (max 500 chars):",
            parse_mode="HTML"
        )
        return JOB_POST_DESCRIPTION

    async def job_post_description(self, update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
        """Handle job description input."""
        description = update.message.text.strip()

        if len(description) < 20 or len(description) > 500:
            await update.message.reply_text(
                "❌ Description must be 20-500 chars. Please try again."
            )
            return JOB_POST_DESCRIPTION

        context.user_data['job_description'] = description
        await update.message.reply_text(
            f"✅ Description saved.\n\n"
            "Now, provide salary range (e.g., '50000 100000' for $50k-$100k):",
            parse_mode="HTML"
        )
        return JOB_POST_SALARY

    async def job_post_salary(self, update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
        """Handle salary input."""
        try:
            parts = update.message.text.strip().split()
            if len(parts) != 2:
                raise ValueError("Expected 2 numbers")

            min_sal = float(parts[0])
            max_sal = float(parts[1])

            if min_sal >= max_sal:
                raise ValueError("Min must be < Max")

            context.user_data['salary_min'] = min_sal
            context.user_data['salary_max'] = max_sal

            await update.message.reply_text(
                f"✅ Salary: ${min_sal:,.0f} - ${max_sal:,.0f}\n\n"
                "Now, list required skills (comma-separated, e.g., 'Python, SQL, Docker'):",
                parse_mode="HTML"
            )
            return JOB_POST_SKILLS

        except ValueError as e:
            await update.message.reply_text(
                f"❌ Invalid salary format: {e}\n\n"
                "Please provide two numbers: <min_salary> <max_salary>"
            )
            return JOB_POST_SALARY

    async def job_post_skills(self, update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
        """Handle required skills input."""
        skills = [s.strip() for s in update.message.text.split(',') if s.strip()]

        if not skills:
            await update.message.reply_text(
                "❌ Please provide at least one skill."
            )
            return JOB_POST_SKILLS

        context.user_data['required_skills'] = skills
        await update.message.reply_text(
            f"✅ Required skills: {', '.join(skills)}\n\n"
            "Finally, provide job location (e.g., 'San Francisco, CA'):",
            parse_mode="HTML"
        )
        return JOB_POST_LOCATION

    async def job_post_location(self, update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
        """Handle location input and create job."""
        location = update.message.text.strip()

        if not location:
            await update.message.reply_text("❌ Location cannot be empty.")
            return JOB_POST_LOCATION

        context.user_data['location'] = location

        try:
            # Create job posting
            job = JobPosting(
                title=context.user_data['job_title'],
                description=context.user_data['job_description'],
                department='Engineering',  # TODO: add department selection
                salary_min=context.user_data['salary_min'],
                salary_max=context.user_data['salary_max'],
                required_skills=context.user_data['required_skills'],
                experience_years=2,  # TODO: add experience selection
                location=location,
                status=JobStatus.DRAFT,
                created_by_id=update.effective_user.id,
            )

            self.db.add(job)
            self.db.commit()

            summary = (
                f"✅ <b>Job Posted Successfully!</b>\n\n"
                f"Title: <b>{job.title}</b>\n"
                f"Salary: ${job.salary_min:,.0f} - ${job.salary_max:,.0f}\n"
                f"Location: {job.location}\n"
                f"Skills: {', '.join(job.required_skills)}\n\n"
                f"Job ID: <code>{job.id}</code>\n"
                f"Status: {job.status.value}"
            )

            await update.message.reply_text(summary, parse_mode="HTML")
            context.user_data.clear()

            return ConversationHandler.END

        except Exception as e:
            logger.error(f"Failed to create job posting: {e}")
            await update.message.reply_text(f"❌ Error: {str(e)}")
            return ConversationHandler.END

    async def cancel_job_post(self, update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
        """Cancel job posting."""
        await update.message.reply_text("Job posting cancelled.")
        context.user_data.clear()
        return ConversationHandler.END

    # ====== Command: /apply ======

    async def cmd_apply(self, update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
        """Start job application wizard."""
        args = context.args

        if not args:
            # Show available jobs
            jobs = self.db.query(JobPosting).filter(
                JobPosting.status == JobStatus.OPEN
            ).all()

            if not jobs:
                await update.message.reply_text("❌ No open positions available.")
                return ConversationHandler.END

            msg = "📋 <b>Open Positions</b>\n\n"
            for job in jobs:
                msg += f"ID: {job.id} | {job.title} @ {job.location}\n"
            msg += "\nReply: <code>/apply &lt;JOB_ID&gt;</code>"

            await update.message.reply_text(msg, parse_mode="HTML")
            return ConversationHandler.END

        try:
            job_id = int(args[0])
            job = self.db.query(JobPosting).filter(
                JobPosting.id == job_id
            ).first()

            if not job:
                await update.message.reply_text("❌ Job not found.")
                return ConversationHandler.END

            context.user_data['job_id'] = job_id
            await update.message.reply_text(
                f"👤 <b>Apply for: {job.title}</b>\n\n"
                "Please provide your full name:",
                parse_mode="HTML"
            )
            return APPLY_CANDIDATE

        except (ValueError, IndexError):
            await update.message.reply_text("❌ Invalid job ID.")
            return ConversationHandler.END

    async def apply_candidate(self, update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
        """Handle candidate name input."""
        name = update.message.text.strip()

        if len(name) < 3:
            await update.message.reply_text("❌ Name too short.")
            return APPLY_CANDIDATE

        context.user_data['candidate_name'] = name
        await update.message.reply_text(
            f"✅ Name: <b>{name}</b>\n\n"
            "What are your key skills? (comma-separated)",
            parse_mode="HTML"
        )
        return APPLY_SKILLS

    async def apply_skills(self, update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
        """Handle candidate skills input."""
        skills = [s.strip() for s in update.message.text.split(',') if s.strip()]

        if not skills:
            await update.message.reply_text("❌ Please provide at least one skill.")
            return APPLY_SKILLS

        context.user_data['candidate_skills'] = skills
        await update.message.reply_text(
            f"✅ Skills: {', '.join(skills)}\n\n"
            "Paste your resume or provide a summary:",
            parse_mode="HTML"
        )
        return APPLY_RESUME

    async def apply_resume(self, update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
        """Handle resume input and create application."""
        resume = update.message.text.strip()

        if not resume or len(resume) < 20:
            await update.message.reply_text("❌ Resume too short.")
            return APPLY_RESUME

        try:
            # Find or create candidate
            candidate = self.db.query(Candidate).filter(
                Candidate.email == update.effective_user.username or 'unknown@telegram.local'
            ).first()

            if not candidate:
                candidate = Candidate(
                    full_name=context.user_data['candidate_name'],
                    email=update.effective_user.username or 'unknown@telegram.local',
                    skills=context.user_data['candidate_skills'],
                    source='telegram',
                )
                self.db.add(candidate)
                self.db.flush()

            # Create application
            job_id = context.user_data['job_id']
            application = Application(
                candidate_id=candidate.id,
                job_posting_id=job_id,
                cover_letter=resume,
                status=ApplicationStatus.APPLIED,
            )

            self.db.add(application)
            self.db.commit()

            # Screen resume
            job = self.db.query(JobPosting).filter(
                JobPosting.id == job_id
            ).first()

            score, details = self.service.screen_resume(candidate, job)
            application.screening_score = score
            self.db.commit()

            msg = (
                f"✅ <b>Application Submitted!</b>\n\n"
                f"Job: {job.title}\n"
                f"Candidate: {candidate.full_name}\n"
                f"Screening Score: {score:.1f}/100\n\n"
                f"Application ID: <code>{application.id}</code>"
            )

            await update.message.reply_text(msg, parse_mode="HTML")
            context.user_data.clear()

            return ConversationHandler.END

        except Exception as e:
            logger.error(f"Failed to create application: {e}")
            await update.message.reply_text(f"❌ Error: {str(e)}")
            return ConversationHandler.END

    # ====== Command: /candidates ======

    async def cmd_candidates(self, update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
        """Show top candidates for a job."""
        args = context.args

        if not args:
            await update.message.reply_text(
                "Usage: <code>/candidates &lt;JOB_ID&gt;</code>",
                parse_mode="HTML"
            )
            return

        try:
            job_id = int(args[0])
            candidates = self.service.get_candidate_comparison(job_id, top_n=5)

            if not candidates:
                await update.message.reply_text("❌ No candidates found.")
                return

            msg = f"🎯 <b>Top Candidates for Job {job_id}</b>\n\n"

            for i, cand in enumerate(candidates, 1):
                msg += (
                    f"{i}. {cand['candidate_name']}\n"
                    f"   Score: {cand['final_score']:.1f} | "
                    f"Status: {cand['status']}\n"
                    f"   Days in pipeline: {cand['days_in_pipeline']}\n\n"
                )

            await update.message.reply_text(msg, parse_mode="HTML")

        except (ValueError, IndexError):
            await update.message.reply_text("❌ Invalid job ID.")

    # ====== Command: /offer ======

    async def cmd_offer(self, update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
        """Send offer to candidate."""
        args = context.args

        if len(args) < 3:
            await update.message.reply_text(
                "Usage: <code>/offer &lt;CANDIDATE_ID&gt; &lt;JOB_ID&gt; &lt;SALARY&gt;</code>",
                parse_mode="HTML"
            )
            return

        try:
            candidate_id = int(args[0])
            job_id = int(args[1])
            salary = float(args[2])

            # Create offer
            offer = self.service.create_offer(
                candidate_id=candidate_id,
                job_posting_id=job_id,
                salary=salary,
                start_date=datetime.utcnow(),
                created_by_id=update.effective_user.id,
            )

            if not offer:
                await update.message.reply_text(
                    "❌ Cannot create offer (candidate score too low or not found)."
                )
                return

            msg = (
                f"✅ <b>Offer Created!</b>\n\n"
                f"Offer ID: <code>{offer.id}</code>\n"
                f"Candidate: {offer.candidate.full_name}\n"
                f"Salary: ${offer.salary:,.2f}\n"
                f"Start Date: {offer.start_date.strftime('%Y-%m-%d')}\n"
                f"Expires: {offer.expires_at.strftime('%Y-%m-%d')}"
            )

            await update.message.reply_text(msg, parse_mode="HTML")

        except (ValueError, IndexError):
            await update.message.reply_text("❌ Invalid arguments.")
        except Exception as e:
            logger.error(f"Failed to create offer: {e}")
            await update.message.reply_text(f"❌ Error: {str(e)}")
