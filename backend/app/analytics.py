"""Descriptive history by actual lessons, independent of semester requirements."""
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

ZONE = ZoneInfo('Europe/Warsaw')
STATES = ('present', 'absent', 'unmarked')


def attendance_history(sessions, today):
    if isinstance(today, str):
        today = date.fromisoformat(today)
    history = []
    for session in sessions:
        if session['cancelled'] or not session['finished']:
            continue
        day = datetime.fromisoformat(session['start']).astimezone(ZONE).date()
        if day <= today:
            history.append((day, session['attendance']['status']))

    def period(start):
        totals = dict.fromkeys(STATES, 0)
        buckets = {}
        monday = start - timedelta(days=start.weekday())
        while monday <= today:
            buckets[monday] = {'start': monday.isoformat(), 'end': (monday + timedelta(days=6)).isoformat(), **dict.fromkeys(STATES, 0)}
            monday += timedelta(days=7)
        for day, status in history:
            if day < start:
                continue
            totals[status] += 1
            buckets[day - timedelta(days=day.weekday())][status] += 1
        return {'start': start.isoformat(), 'end': today.isoformat(), 'totals': totals,
                'weeks': list(buckets.values()), 'completed': sum(totals.values()),
                'marked': totals['present'] + totals['absent']}

    first = min((day for day, _ in history), default=today)
    return {'unit': 'sessions', 'recent': period(today - timedelta(days=29)), 'all': period(first)}
