"""Recruitment Management Module for HR Bot Phase 2.

Handles job postings, candidate applications, screening, and offer management.
"""

from .models import JobPosting, Candidate, Application, Offer
from .service import RecruitmentService
from .handlers import RecruitmentHandlers

__all__ = [
    'JobPosting',
    'Candidate',
    'Application',
    'Offer',
    'RecruitmentService',
    'RecruitmentHandlers',
]

__version__ = '2.0.0'
