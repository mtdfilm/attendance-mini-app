"""Calendar parsing is delegated to icalendar + recurring-ical-events."""
import hashlib
import ipaddress
import socket
import time
from datetime import datetime, timedelta, timezone
from urllib.parse import urlsplit
from zoneinfo import ZoneInfo
import httpx
from icalendar import Calendar
import recurring_ical_events
from sqlalchemy import select
from fastapi import HTTPException
from .models import Course, Component, Session, Attendance, now
from .services import get, session_view

MAX_BYTES = 2_000_000


def parse_calendar(content, semester):
    if not content.strip() or len(content.encode()) > MAX_BYTES:
        raise ValueError('Пустой или слишком большой календарь (максимум 2 МБ)')
    cal = Calendar.from_ical(content)
    zone = ZoneInfo(str(cal.get('X-WR-TIMEZONE','Europe/Warsaw')))
    start = datetime.fromisoformat(semester.start).replace(tzinfo=zone)
    end = datetime.fromisoformat(semester.end).replace(tzinfo=zone)+timedelta(days=1)
    originals = cal.walk('VEVENT')
    if len(originals)>5000: raise ValueError('Слишком много событий')
    recurring = {str(e.get('UID')) for e in originals if e.get('RRULE') or e.get('RDATE') or e.get('RECURRENCE-ID')}
    warnings = []
    valid = []
    for e in originals:
        if not e.get('DTSTART') or not isinstance(e['DTSTART'].dt,datetime):
            warnings.append('Пропущено событие без времени / all-day; проверьте его вручную')
            cal.subcomponents.remove(e)
            continue
        rule = e.get('RRULE')
        if rule and str(rule.get('FREQ',[''])[0]) in ('SECONDLY','MINUTELY','HOURLY'):
            raise ValueError('Слишком частое повторение; допустимы DAILY и реже')
        # Normalize floating times before recurrence expansion; zoneinfo handles DST.
        for key in ('DTSTART','DTEND','RECURRENCE-ID'):
            if e.get(key) and isinstance(e[key].dt,datetime) and e[key].dt.tzinfo is None:
                e[key].dt = e[key].dt.replace(tzinfo=zone)
    events = recurring_ical_events.of(cal, skip_bad_series=False).between(start,end)
    if len(events)>5000: raise ValueError('Слишком много повторений в семестре')
    identities = set()
    for e in events:
        uid = str(e.get('UID',''))
        if not uid: raise ValueError('Событие без UID')
        a = e['DTSTART'].dt
        b = e['DTEND'].dt if e.get('DTEND') else a+e.get('DURATION').dt if e.get('DURATION') else None
        if not isinstance(a,datetime) or not isinstance(b,datetime) or b<=a:
            warnings.append('Пропущено событие без корректного начала/конца')
            continue
        if a.tzinfo is None: a=a.replace(tzinfo=zone)
        if b.tzinfo is None: b=b.replace(tzinfo=zone)
        rid = e.get('RECURRENCE-ID')
        occurrence = (rid.dt if rid else a).astimezone(timezone.utc).isoformat() if uid in recurring else ''
        summary = str(e.get('SUMMARY','Без названия'))
        # Only separate a literal trailing code; never expand its meaning.
        name, sep, kind = summary.rpartition(': ')
        if not sep: name,kind = summary,'?'
        group = str(e.get('X-USOS-GROUP-ID',''))
        cycle = str(e.get('X-USOS-CYCLE-ID',''))
        external_group = f'{cycle}/{group}' if group or cycle else f'unidentified:{uid}'
        if (uid,occurrence) in identities: raise ValueError('Повторяющийся UID/occurrence в файле')
        identities.add((uid,occurrence))
        valid.append(dict(uid=uid,occurrence=occurrence,start=a.astimezone(timezone.utc).isoformat(),end=b.astimezone(timezone.utc).isoformat(),location=str(e.get('LOCATION','')),cancelled=str(e.get('STATUS','')).upper()=='CANCELLED',original_timezone=str(a.tzinfo),original_summary=summary,name=name,kind=kind,external_group=external_group))
    if any(e['external_group'].startswith('unidentified:') for e in valid):
        warnings.append('В ленте нет явного ID группы/цикла. Такие UID создают отдельные компоненты. Выберите существующий компонент в предпросмотре, чтобы явно сопоставить их; названия сами по себе не доказывают общую группу.')
    if not valid: raise ValueError('В выбранном семестре нет пригодных занятий')
    return valid,sorted(set(warnings))


def fingerprint(db):
    # Preview must not overwrite modifications made after it was shown.
    values=[]
    from .models import Semester
    for model in (Semester,Course,Component,Session,Attendance):
        values += [(model.__tablename__,getattr(r,'id',getattr(r,'session_id',0)),r.version) for r in db.scalars(select(model))]
    return hashlib.sha256(repr(sorted(values)).encode()).hexdigest()


def preview(db, events, source, semester_id):
    existing = list(db.scalars(select(Session)))
    result=[]
    for i,e in enumerate(events):
        exact = next((s for s in existing if (s.source,s.uid,s.occurrence)==(source,e['uid'],e['occurrence'])),None)
        candidates=[]
        if exact is None:
            for s in existing:
                c = get(db,Component,s.component_id)
                course = get(db,Course,c.course_id)
                if c.semester_id == semester_id and course.original_name==e['name'] and c.kind==e['kind'] and abs((datetime.fromisoformat(s.start)-datetime.fromisoformat(e['start'])).total_seconds())<=86400:
                    candidates.append({'id':s.id,'start':s.start,'source':s.source})
        result.append({**e,'index':i,'action':'update' if exact else 'new','session_id':exact.id if exact else None,'candidates':candidates})
    return result


def commit_events(db, events, source, semester_id, resolutions, components):
    added=updated=skipped=0
    matched=set()
    for e in events:
        key=str(e['index'])
        choice=resolutions.get(key)
        if choice == -1:
            skipped+=1
            continue
        if e['candidates'] and choice is None:
            raise HTTPException(422,'Сначала разрешите неоднозначности в предпросмотре')
        s=db.get(Session,e['session_id']) if e['session_id'] else None
        if choice and choice>0:
            if choice not in [c['id'] for c in e['candidates']]: raise HTTPException(422,'Недопустимое сопоставление')
            s=get(db,Session,choice)
        if s and s.id in matched: raise HTTPException(422,'Два события сопоставлены одной паре')
        if s: matched.add(s.id)
        component_id=components.get(key)
        if component_id:
            comp=get(db,Component,component_id)
            if comp.semester_id!=semester_id: raise HTTPException(422,'Другой семестр')
        elif s:
            comp=get(db,Component,s.component_id)
        else:
            course=db.scalar(select(Course).where(Course.original_name==e['name']))
            if not course:
                course=Course(original_name=e['name'],display_name=e['name'])
                db.add(course); db.flush()
            comp=db.scalar(select(Component).where(Component.course_id==course.id,Component.semester_id==semester_id,Component.kind==e['kind'],Component.external_group==e['external_group']))
            if not comp:
                comp=Component(course_id=course.id,semester_id=semester_id,kind=e['kind'],external_group=e['external_group'])
                db.add(comp); db.flush()
        values={k:e[k] for k in ('uid','occurrence','start','end','location','cancelled','original_timezone','original_summary')}
        values.update(source=source,component_id=comp.id)
        if s:
            if any(getattr(s,k)!=v for k,v in values.items()):
                for k,v in values.items(): setattr(s,k,v)
                s.version+=1; s.updated_at=now(); updated+=1
        else:
            s=Session(**values); db.add(s); added+=1
        db.flush()
    return dict(added=added,updated=updated,skipped=skipped)


def fetch_usos(url):
    p=urlsplit(url)
    if p.scheme!='https' or p.hostname!='usosapps.vistula.edu.pl' or p.port not in (None,443) or p.username or p.password or p.fragment or p.path!='/services/tt/upcoming_ical':
        raise ValueError('Проверьте USOS_ICAL_URL: разрешён только официальный HTTPS endpoint')
    addresses=socket.getaddrinfo(p.hostname,443,type=socket.SOCK_STREAM)
    if not addresses or any(not ipaddress.ip_address(a[4][0]).is_global for a in addresses):
        raise ValueError('Адрес сервера USOS не разрешён')
    # Pin the validated IP: no second DNS resolution between validation and connect.
    address=addresses[0][4][0]
    host=f'[{address}]' if ':' in address else address
    pinned=f'https://{host}{p.path}'+('?' + p.query if p.query else '')
    deadline=time.monotonic()+30
    with httpx.Client(timeout=httpx.Timeout(15,connect=5),follow_redirects=False,trust_env=False) as client:
        with client.stream('GET',pinned,headers={'Host':p.hostname},extensions={'sni_hostname':p.hostname}) as response:
            if response.status_code!=200: raise ValueError('USOS вернул ошибку. Проверьте подключение и приватную ссылку')
            data=bytearray()
            for chunk in response.iter_bytes():
                if time.monotonic()>deadline: raise ValueError('Превышен общий таймаут USOS')
                data.extend(chunk)
                if len(data)>MAX_BYTES: raise ValueError('Ответ USOS превышает 2 МБ')
    if not data: raise ValueError('USOS вернул пустой ответ; данные сохранены')
    return data.decode('utf-8-sig')
