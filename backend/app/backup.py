import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal
from pydantic import Field, model_validator
from sqlalchemy import select, delete
from .db import db_path
from .models import Semester, Course, Component, Session, Attendance, ChangeLog
from .schemas import Strict, SemesterIn, CourseIn, ComponentIn, SessionIn, Mark
from .services import dump


class SemesterRow(SemesterIn):
    id: int = Field(gt=0)
    version: int = Field(ge=1)


class CourseRow(CourseIn):
    id: int = Field(gt=0)
    version: int = Field(ge=1)


class ComponentRow(ComponentIn):
    id: int = Field(gt=0)
    version: int = Field(ge=1)


class SessionRow(SessionIn):
    id: int = Field(gt=0)
    version: int = Field(ge=1)
    source: Literal['manual','ics','usos']
    uid: str = Field(min_length=1,max_length=1000)
    occurrence: str = Field(max_length=100)
    original_timezone: str = Field(max_length=100)
    original_summary: str = Field(max_length=1000)
    overrides: dict
    updated_at: datetime

    @model_validator(mode='after')
    def valid_overrides(self):
        if set(self.overrides)-{'start','end','location','cancelled','units','component_id'}:
            raise ValueError('Недопустимые overrides')
        normalized=SessionIn.model_validate({**self.model_dump(include=set(SessionIn.model_fields)),**self.overrides}).model_dump(mode='json')
        self.overrides={k:normalized[k] for k in self.overrides}
        return self


class AttendanceRow(Mark):
    version: int = Field(ge=1)
    updated_at: datetime


class Backup(Strict):
    format_version: Literal[1]
    exported_at: datetime
    semesters: list[SemesterRow] = Field(max_length=100)
    courses: list[CourseRow] = Field(max_length=10000)
    components: list[ComponentRow] = Field(max_length=10000)
    sessions: list[SessionRow] = Field(max_length=100000)
    attendance: list[AttendanceRow] = Field(max_length=100000)

    @model_validator(mode='after')
    def integrity(self):
        sets={}
        for name in ('semesters','courses','components','sessions','attendance'):
            rows=getattr(self,name)
            ids=[getattr(r,'id',getattr(r,'session_id',None)) for r in rows]
            if len(ids)!=len(set(ids)): raise ValueError('Повторяющиеся ID')
            sets[name]=set(ids)
        if any(c.course_id not in sets['courses'] or c.semester_id not in sets['semesters'] for c in self.components): raise ValueError('Нарушены ссылки компонентов')
        if any(s.component_id not in sets['components'] or s.overrides.get('component_id',s.component_id) not in sets['components'] for s in self.sessions): raise ValueError('Нарушены ссылки занятий')
        if any(a.session_id not in sets['sessions'] for a in self.attendance): raise ValueError('Нарушены ссылки отметок')
        identities=[(s.source,s.uid,s.occurrence) for s in self.sessions]
        if len(identities)!=len(set(identities)): raise ValueError('Дубли идентичности событий')
        return self


TABLES=(('semesters',Semester),('courses',Course),('components',Component),('sessions',Session),('attendance',Attendance))


def export_data(db):
    raw={'format_version':1,'exported_at':datetime.now(timezone.utc).isoformat(),**{name:[dump(r) for r in db.scalars(select(model))] for name,model in TABLES}}
    canonical=Backup.model_validate(raw).model_dump(mode='json')
    for name,model in TABLES:
        columns={c.name for c in model.__table__.columns}
        canonical[name]=[{k:v for k,v in row.items() if k in columns} for row in canonical[name]]
    return canonical


def sqlite_backup():
    if db_path==':memory:': raise ValueError('Backup requires a persistent database')
    folder=Path(db_path).resolve().parent/'backups'
    folder.mkdir(parents=True,exist_ok=True)
    target=folder/f'attendance-{datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%f")}.sqlite3'
    with sqlite3.connect(db_path) as source, sqlite3.connect(target) as dest:
        source.backup(dest)
    return target.name


def restore_data(db, data):
    backup_name=sqlite_backup()
    db.execute(delete(ChangeLog))
    for _,model in reversed(TABLES): db.execute(delete(model))
    for name,model in TABLES:
        columns={c.name for c in model.__table__.columns}
        for row in getattr(data,name):
            values=row.model_dump(mode='json')
            db.add(model(**{k:v for k,v in values.items() if k in columns}))
        db.flush()
    return backup_name
