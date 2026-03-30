"""Smart recommendations based on historical data."""
from datetime import date, datetime
import logging

logger = logging.getLogger(__name__)


class SmartAssistant:
    def __init__(self, sheets_client):
        self.sheets_client = sheets_client

    def suggest_leave_type(self, employee_id: str) -> str | None:
        """Suggest most frequently used leave type for this employee."""
        rows = self.sheets_client.find_rows("leaves", filters={"employee_id": employee_id})
        if not rows:
            return None
        type_counts = {}
        for r in rows:
            lt = r.get("leave_type", "")
            if lt:
                type_counts[lt] = type_counts.get(lt, 0) + 1
        if not type_counts:
            return None
        return max(type_counts, key=type_counts.get)

    def suggest_reason(self, employee_id: str, leave_type: str) -> str | None:
        """Suggest most common reason for this leave type from employee's history."""
        rows = self.sheets_client.find_rows("leaves", filters={
            "employee_id": employee_id, "leave_type": leave_type
        })
        if not rows:
            return None
        reasons = {}
        for r in rows:
            reason = r.get("reason", "").strip()
            if reason:
                reasons[reason] = reasons.get(reason, 0) + 1
        if not reasons:
            return None
        return max(reasons, key=reasons.get)

    def detect_anomalies(self, employee_id: str) -> list[dict]:
        """Detect anomalous patterns for an employee.
        Returns list of {type, severity, message} dicts.
        """
        anomalies = []
        leaves = self.sheets_client.find_rows("leaves", filters={"employee_id": employee_id})

        current_year = str(date.today().year)
        this_year = [r for r in leaves if r.get("start_date", "").startswith(current_year)]

        # 1. High frequency: >3 leave requests in last 30 days
        recent = []
        cutoff = (datetime.now() - __import__('datetime').timedelta(days=30)).isoformat()[:10]
        for r in this_year:
            if r.get("apply_date", "") >= cutoff:
                recent.append(r)
        if len(recent) > 3:
            anomalies.append({
                "type": "high_frequency",
                "severity": "warning",
                "message": f"近 30 天內提交 {len(recent)} 次請假申請"
            })

        # 2. Monday/Friday pattern: >60% of leaves start on Mon or end on Fri
        mon_fri_count = 0
        for r in this_year:
            try:
                start = date.fromisoformat(r.get("start_date", ""))
                end = date.fromisoformat(r.get("end_date", ""))
                if start.weekday() == 0 or end.weekday() == 4:
                    mon_fri_count += 1
            except (ValueError, TypeError):
                pass
        if len(this_year) >= 3 and mon_fri_count / len(this_year) > 0.6:
            anomalies.append({
                "type": "weekend_extension",
                "severity": "info",
                "message": f"本年度 {mon_fri_count}/{len(this_year)} 次請假涉及週一或週五"
            })

        # 3. Quick resignation: check if employee joined < 90 days ago and has offboarding
        emp = self.sheets_client.find_employee(employee_id)
        if emp:
            hire_date_str = emp.get("hire_date", "")
            if hire_date_str:
                try:
                    hire = date.fromisoformat(hire_date_str)
                    if (date.today() - hire).days < 90:
                        offboards = self.sheets_client.find_rows("offboarding", filters={"employee_id": employee_id})
                        if offboards:
                            anomalies.append({
                                "type": "quick_resignation",
                                "severity": "critical",
                                "message": f"入職不到 90 天即提出離職（入職日：{hire_date_str}）"
                            })
                except (ValueError, TypeError):
                    pass

        return anomalies

    def generate_monthly_summary(self) -> dict:
        """Generate monthly HR summary statistics."""
        now = date.today()
        month_prefix = now.strftime("%Y-%m")

        summary = {
            "month": month_prefix,
            "leave": {"total": 0, "by_type": {}, "by_status": {}, "avg_days": 0},
            "onboarding": {"total": 0},
            "work_permit": {"total": 0},
            "offboarding": {"total": 0},
            "anomalies": [],
        }

        # Leave stats
        all_leaves = self.sheets_client.find_rows("leaves")
        month_leaves = [r for r in all_leaves if r.get("apply_date", "").startswith(month_prefix)]
        summary["leave"]["total"] = len(month_leaves)

        total_days = 0
        for r in month_leaves:
            lt = r.get("leave_type", "unknown")
            st = r.get("status", "unknown")
            summary["leave"]["by_type"][lt] = summary["leave"]["by_type"].get(lt, 0) + 1
            summary["leave"]["by_status"][st] = summary["leave"]["by_status"].get(st, 0) + 1
            try:
                total_days += float(r.get("days", 0))
            except (ValueError, TypeError):
                pass

        if month_leaves:
            summary["leave"]["avg_days"] = round(total_days / len(month_leaves), 1)

        # Other sheets
        for sheet_name in ("onboarding", "work_permit", "offboarding"):
            try:
                rows = self.sheets_client.find_rows(sheet_name)
                count = sum(1 for r in rows if r.get("apply_date", r.get("onboarding_date", "")).startswith(month_prefix))
                summary[sheet_name]["total"] = count
            except Exception:
                pass

        # Collect anomalies for all employees with activity this month
        seen = set()
        for r in month_leaves:
            eid = r.get("employee_id", "")
            if eid and eid not in seen:
                seen.add(eid)
                anoms = self.detect_anomalies(eid)
                for a in anoms:
                    a["employee_id"] = eid
                    summary["anomalies"].append(a)

        return summary
