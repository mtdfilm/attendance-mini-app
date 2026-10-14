from datetime import datetime, timezone
from sqlalchemy import String, Integer, Boolean, ForeignKey, JSON, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column
from .db import Base


def now():
    return datetime.now(timezone.utc).isoformat()


class Semester(Base):
    __tablename__ = 'semesters'
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    start: Mapped[str] = mapped_column(String(10))
    end: Mapped[str] = mapped_column(String(10))
    timezone: Mapped[str] = mapped_column(default='Europe/Warsaw')
    version: Mapped[int] = mapped_column(default=1)


class Course(Base):
    __tablename__ = 'courses'
    id: Mapped[int] = mapped_column(primary_key=True)
    original_name: Mapped[str] = mapped_column(String(300))
    display_name: Mapped[str] = mapped_column(String(300))
    version: Mapped[int] = mapped_column(default=1)


class Component(Base):
    __tablename__ = 'components'
    id: Mapped[int] = mapped_column(primary_key=True)
    course_id: Mapped[int] = mapped_column(ForeignKey('courses.id'))
    semester_id: Mapped[int] = mapped_column(ForeignKey('semesters.id'))
    kind: Mapped[str] = mapped_column(String(100))
    external_group: Mapped[str] = mapped_column(default='')
    policy: Mapped[dict] = mapped_column(JSON, default=lambda: {'mode': 'unknown', 'value': None})
    unit: Mapped[str] = mapped_column(default='sessions')
    expected_total: Mapped[int | None] = mapped_column(Integer, nullable=True)
    complete: Mapped[bool] = mapped_column(Boolean, default=False)
    version: Mapped[int] = mapped_column(default=1)


class Session(Base):
    __tablename__ = 'sessions'
    __table_args__ = (UniqueConstraint('source', 'uid', 'occurrence', name='event_identity'),)
    id: Mapped[int] = mapped_column(primary_key=True)
    component_id: Mapped[int] = mapped_column(ForeignKey('components.id'))
    source: Mapped[str] = mapped_column(default='manual')
    uid: Mapped[str] = mapped_column(String(1000))
    occurrence: Mapped[str] = mapped_column(default='')
    start: Mapped[str] = mapped_column(String(40))
    end: Mapped[str] = mapped_column(String(40))
    location: Mapped[str] = mapped_column(default='')
    original_timezone: Mapped[str] = mapped_column(default='Europe/Warsaw')
    original_summary: Mapped[str] = mapped_column(default='')
    cancelled: Mapped[bool] = mapped_column(default=False)
    units: Mapped[int | None] = mapped_column(nullable=True)
    overrides: Mapped[dict] = mapped_column(JSON, default=dict)
    version: Mapped[int] = mapped_column(default=1)
    updated_at: Mapped[str] = mapped_column(default=now)


class Attendance(Base):
    __tablename__ = 'attendance'
    session_id: Mapped[int] = mapped_column(ForeignKey('sessions.id'), primary_key=True)
    status: Mapped[str] = mapped_column(default='unmarked')
    note: Mapped[str] = mapped_column(default='')
    version: Mapped[int] = mapped_column(default=1)
    updated_at: Mapped[str] = mapped_column(default=now)


class ChangeLog(Base):
    __tablename__ = 'changes'
    id: Mapped[int] = mapped_column(primary_key=True)
    request_id: Mapped[str] = mapped_column(unique=True)
    entries: Mapped[list] = mapped_column(JSON)
    undone: Mapped[bool] = mapped_column(default=False)
    created_at: Mapped[str] = mapped_column(default=now)


class SyncRun(Base):
    __tablename__ = 'sync_runs'
    id: Mapped[int] = mapped_column(primary_key=True)
    created_at: Mapped[str] = mapped_column(default=now)
    success: Mapped[bool] = mapped_column()
    added: Mapped[int] = mapped_column(default=0)
    updated: Mapped[int] = mapped_column(default=0)
    error: Mapped[str] = mapped_column(default='')


class AuthSession(Base):
    __tablename__ = 'auth_sessions'
    token_hash: Mapped[str] = mapped_column(primary_key=True)
    expires: Mapped[int] = mapped_column()
