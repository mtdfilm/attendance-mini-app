"""Explicit synthetic data for an empty development database only."""
from datetime import datetime,timedelta,timezone
from zoneinfo import ZoneInfo
from sqlalchemy import select
from .config import settings
from .db import SessionLocal
from .models import Semester,Course,Component,Session,Attendance


def run():
    if settings.app_env=='production' or not settings.dev_auth_bypass: raise SystemExit('Seed requires development + explicit DEV_AUTH_BYPASS')
    with SessionLocal() as db:
        from .demo_data import populate_demo
        try:populate_demo(db)
        except ValueError as error:raise SystemExit(str(error)) from None
    print('Synthetic DEMO data created. These are not your real attendance records.')


if __name__=='__main__':run()
