from types import SimpleNamespace
from app.importer import parse_calendar,fetch_usos
from app.db import SessionLocal
from app.models import Session
from sqlalchemy import select
import pytest


def calendar(start='20201010T100000Z',uid='event-a',status='',extra=''):
    return f'''BEGIN:VCALENDAR\r
VERSION:2.0\r
PRODID:-//Attendance Test//EN\r
X-WR-TIMEZONE:Europe/Warsaw\r
BEGIN:VEVENT\r
UID:{uid}\r
DTSTART:{start}\r
DURATION:PT1H\r
SUMMARY:Java Programming: Lab\r
LOCATION:Room\\, 1\r
X-USOS-GROUP-ID:group-1\r
{status}{extra}END:VEVENT\r
END:VCALENDAR\r
'''


def import_file(client,sem,content,resolutions=None):
    p=client.post('/api/import/preview',json={'semester_id':sem['id'],'content':content});assert p.status_code==200,p.text
    r=client.post('/api/import/commit',json={'token':p.json()['token'],'resolutions':resolutions or {}})
    assert r.status_code==200,r.text
    return r.json()


def test_idempotent_move_cancel_missing_and_override(client,setup_data):
    sem=setup_data[0]
    assert import_file(client,sem,calendar())['added']==1
    assert import_file(client,sem,calendar())=={'added':0,'updated':0,'skipped':0}
    data=client.get('/api/summary').json()
    s=next(s for c in data['components'] for s in c['sessions'] if s['source']=='ics')
    assert client.post('/api/attendance',json={'request_id':'mark-import-001','items':[{'session_id':s['id'],'version':0,'status':'present'}]}).status_code==200
    payload={k:s[k] for k in ('component_id','start','end','location','cancelled','units','version')};payload['location']='My override'
    assert client.put('/api/sessions/'+str(s['id']),json=payload).status_code==200
    assert import_file(client,sem,calendar(start='20201010T120000Z'))['updated']==1
    assert import_file(client,sem,calendar(start='20201105T120000Z',uid='event-b'))['added']==1
    data=client.get('/api/summary').json();old=next(x for c in data['components'] for x in c['sessions'] if x['id']==s['id'])
    assert old['attendance']['status']=='present' and old['location']=='My override' and '12:00' in old['start']
    assert import_file(client,sem,calendar(start='20201010T120000Z',status='STATUS:CANCELLED\r\n'))['updated']==1
    with SessionLocal() as db: assert db.get(Session,s['id']).cancelled


def test_changed_uid_requires_resolution(client,setup_data):
    sem=setup_data[0];import_file(client,sem,calendar())
    p=client.post('/api/import/preview',json={'semester_id':sem['id'],'content':calendar(uid='changed')}).json()
    assert p['events'][0]['candidates']
    assert client.post('/api/import/commit',json={'token':p['token']}).status_code==422
    target=p['events'][0]['candidates'][0]['id']
    assert client.post('/api/import/commit',json={'token':p['token'],'resolutions':{'0':target}}).status_code==200


def test_recurrence_exdate_dst_and_folded():
    sem=SimpleNamespace(start='2020-10-01',end='2020-11-30')
    content=calendar(start='20201018T100000',extra='RRULE:FREQ=WEEKLY;COUNT=4\r\nEXDATE:20201025T100000\r\n').replace('SUMMARY:Java Programming: Lab','SUMMARY:Java Progra\r\n mming: Lab')
    events,warnings=parse_calendar(content,sem)
    assert len(events)==3
    assert events[0]['name']=='Java Programming'
    assert events[0]['location']=='Room, 1'
    assert '08:00' in events[0]['start'] and '09:00' in events[-1]['start']
    assert len({e['occurrence'] for e in events})==3


def test_all_day_rejected():
    text=calendar().replace('DTSTART:20201010T100000Z','DTSTART;VALUE=DATE:20201010')
    with pytest.raises(ValueError):parse_calendar(text,SimpleNamespace(start='2020-01-01',end='2020-12-31'))


@pytest.mark.parametrize('url',['http://usosapps.vistula.edu.pl/services/tt/upcoming_ical','https://localhost/services/tt/upcoming_ical','https://usosapps.vistula.edu.pl.evil.com/services/tt/upcoming_ical','https://usosapps.vistula.edu.pl:444/services/tt/upcoming_ical'])
def test_ssrf_rejection(url):
    with pytest.raises(ValueError):fetch_usos(url)


def test_recurrence_exception_identity():
    text=calendar(start='20201018T100000Z',extra='RRULE:FREQ=WEEKLY;COUNT=3\r\n')
    exception='''BEGIN:VEVENT\r
UID:event-a\r
RECURRENCE-ID:20201025T100000Z\r
DTSTART:20201025T120000Z\r
DTEND:20201025T130000Z\r
SUMMARY:Java Programming: Lab\r
END:VEVENT\r
'''
    text=text.replace('END:VCALENDAR',exception+'END:VCALENDAR')
    events,_=parse_calendar(text,SimpleNamespace(start='2020-10-01',end='2020-11-30'))
    assert len(events)==3
    moved=next(e for e in events if '2020-10-25' in e['start'])
    assert '12:00' in moved['start'] and '10:00' in moved['occurrence']


def test_preview_stale_and_empty_preserve(client,setup_data):
    sem=setup_data[0]
    p=client.post('/api/import/preview',json={'semester_id':sem['id'],'content':calendar()}).json()
    client.post('/api/courses',json={'original_name':'Other','display_name':'Other'})
    assert client.post('/api/import/commit',json={'token':p['token']}).status_code==409
    assert client.post('/api/import/preview',json={'semester_id':sem['id'],'content':''}).status_code==422
    assert len(client.get('/api/summary').json()['components'][0]['sessions'])==4
