"""Synthetic, relative-date fixtures for explicit demo and portfolio previews."""
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo
from sqlalchemy import select
from .models import Semester, Course, Component, Session, Attendance


def populate_demo(db, name='ДЕМО · учебный семестр'):
    if db.scalar(select(Semester.id)):
        raise ValueError('Demo seed requires an empty database')
    reference=datetime.now(ZoneInfo('Europe/Warsaw')).replace(hour=8,minute=0,second=0,microsecond=0)
    semester=Semester(name=name,start=(reference-timedelta(days=60)).date().isoformat(),end=(reference+timedelta(days=60)).date().isoformat())
    db.add(semester);db.flush()
    # course, type, P, A, U, F, policy, full calendar, explicit total
    specs=[
        ('Java Programming','Lab',8,1,0,3,{'mode':'percent','value':'75'},True,None),
        ('Java Programming','W',9,0,0,3,{'mode':'percent','value':'75'},True,None),
        ('Operating Systems','Lab',5,2,2,3,{'mode':'percent','value':'75'},True,None),
        ('Operating Systems','W',3,2,0,3,{'mode':'percent','value':'75'},True,None),
        ('Discrete Mathematics','C',4,5,0,3,{'mode':'percent','value':'75'},True,None),
        ('Computer Networks','Lab',6,1,0,3,{'mode':'percent','value':'80'},True,None),
        ('Computer Security','Proj',4,1,1,3,{'mode':'unknown','value':None},False,None),
        ('Computer Architecture','Proj',5,1,3,3,{'mode':'percent','value':'80'},False,15),
        ('Physical Education','C',4,1,0,3,{'mode':'max_absences','value':'2'},True,None),
    ]
    courses={}
    for index,(name,kind,P,A,U,F,policy,complete,total) in enumerate(specs):
        if name not in courses:
            course=Course(original_name=name,display_name=name);db.add(course);db.flush();courses[name]=course
        course=courses[name]
        component=Component(course_id=course.id,semester_id=semester.id,kind=kind,external_group=f'demo-group-{index+1}',policy=policy,complete=complete,expected_total=total)
        db.add(component);db.flush()
        statuses=['present']*P+['absent']*A+['unmarked']*U
        # Space fictional dates over the last month; never infer real attendance.
        for j in range(len(statuses)+F):
            if j<len(statuses):
                start=reference-timedelta(days=(len(statuses)-1-j)*3+(index%3+1))
            else:
                start=reference+timedelta(days=(j-len(statuses)+1)*7+index%3)
            start+=timedelta(hours=index%4*2)
            session=Session(component_id=component.id,uid=f'demo-{index}-{j}@attendance.example',start=start.astimezone(timezone.utc).isoformat(),end=(start+timedelta(minutes=95)).astimezone(timezone.utc).isoformat(),location=f'Room {101+index}' if kind!='Proj' else 'Online')
            db.add(session);db.flush()
            if j<len(statuses) and statuses[j]!='unmarked':
                db.add(Attendance(session_id=session.id,status=statuses[j],note='Синтетическая демонстрационная отметка'))
    db.commit()
    return semester
