from datetime import datetime, timezone
from sqlalchemy import select
from fastapi import HTTPException
from .models import Course, Component, Session, Attendance, Semester
from .calculations import calculate


def dump(row):
    return {c.name:getattr(row,c.name) for c in row.__table__.columns}


def get(db, model, id):
    row = db.get(model,id)
    if row is None: raise HTTPException(404,'Запись не найдена')
    return row


def version(row, received):
    if row.version != received: raise HTTPException(409,'Запись изменена на другом клиенте. Обновите данные и повторите действие')


def session_view(db, row, clock=None):
    clock = clock or datetime.now(timezone.utc)
    result = dump(row)
    result.update(row.overrides)
    a = db.get(Attendance,row.id)
    result['attendance'] = dump(a) if a else dict(session_id=row.id,status='unmarked',note='',version=0)
    result['finished'] = datetime.fromisoformat(result['end']) <= clock
    result['state'] = 'cancelled' if result['cancelled'] else ('planned' if not result['finished'] else result['attendance']['status'])
    return result


def component_view(db, row, clock=None):
    sessions = [session_view(db,s,clock) for s in db.scalars(select(Session).where(Session.component_id==row.id))]
    counts = dict(P=0,A=0,U=0,F=0)
    missing = False
    for s in sessions:
        if s['cancelled']: continue
        weight = 1 if row.unit == 'sessions' else s['units']
        if weight is None:
            missing = True
            continue
        key = 'F' if not s['finished'] else {'present':'P','absent':'A','unmarked':'U'}[s['attendance']['status']]
        counts[key] += weight
    return {**dump(row),'course':dump(get(db,Course,row.course_id)),
            'stats':calculate(**counts,expected_total=row.expected_total,complete=row.complete,policy=row.policy,missing_units=missing),
            'sessions':sorted(sessions,key=lambda s:s['start'])}


def check_session_bounds(db, component_id, start, end):
    from zoneinfo import ZoneInfo
    comp = get(db,Component,component_id)
    semester = get(db,Semester,comp.semester_id)
    day = start.astimezone(ZoneInfo('Europe/Warsaw')).date().isoformat()
    if not semester.start <= day <= semester.end:
        raise HTTPException(422,'Занятие выходит за границы семестра')
    return comp
