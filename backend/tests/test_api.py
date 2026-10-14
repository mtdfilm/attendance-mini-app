import uuid
from app.db import SessionLocal,engine
from app.models import Attendance
from app.config import Settings
import pytest


def mark(client,items,rid=None):
    return client.post('/api/attendance',json={'request_id':rid or str(uuid.uuid4()),'items':items})


def test_marks_conflicts_undo_restart(client,setup_data):
    *_,sessions=setup_data
    items=[{'session_id':s['id'],'version':0,'status':'present'} for s in sessions[:3]]
    rid=str(uuid.uuid4());r=mark(client,items,rid);assert r.status_code==200
    assert mark(client,items,rid).json()['replayed']
    r2=mark(client,[{'session_id':sessions[1]['id'],'version':1,'status':'absent'}]);assert r2.status_code==200
    engine.dispose() # new connections read committed state after restart boundary
    stats=client.get('/api/summary').json()['components'][0]['stats']
    assert (stats['P'],stats['A'],stats['U'])==(2,1,1)
    assert mark(client,items).status_code==409
    assert client.post('/api/undo/'+str(r2.json()['change_id'])).status_code==200
    assert client.get('/api/summary').json()['components'][0]['stats']['P']==3


def test_atomic_group(client,setup_data):
    *_,s=setup_data
    r=mark(client,[{'session_id':s[0]['id'],'version':0,'status':'present'},{'session_id':s[1]['id'],'version':12,'status':'absent'}])
    assert r.status_code==409
    with SessionLocal() as db: assert db.get(Attendance,s[0]['id']) is None


def test_cancel_and_manual_total(client,setup_data):
    _,_,c,s=setup_data
    row=s[0]
    payload={k:row[k] for k in ('component_id','start','end','location','units','version')};payload['cancelled']=True
    assert client.put('/api/sessions/'+str(row['id']),json=payload).status_code==200
    assert client.get('/api/summary').json()['components'][0]['stats']['N']==3
    cp={k:c[k] for k in ('course_id','semester_id','kind','policy','version','complete')};cp['expected_total']=4
    assert client.put('/api/components/'+str(c['id']),json=cp).status_code==200
    stats=client.get('/api/summary').json()['components'][0]['stats']
    assert stats['status']=='incomplete' and stats['reserve'] is None


def test_export_restore_and_schema(client,setup_data):
    backup=client.get('/api/export').json()
    assert set(backup)=={'format_version','exported_at','semesters','courses','components','sessions','attendance'}
    p=client.post('/api/restore/preview',json=backup);assert p.status_code==200,p.text
    token=p.json()['token']
    assert client.post('/api/restore/commit',json={'token':token}).status_code==422
    r=client.post('/api/restore/commit?confirm=true',json={'token':token});assert r.status_code==200,r.text
    restored=client.get('/api/export').json();restored.pop('exported_at');backup.pop('exported_at');assert restored==backup
    broken=client.get('/api/export').json();broken['sessions'][0]['component_id']=999
    assert client.post('/api/restore/preview',json=broken).status_code==422


def test_auth_required_everything(client):
    client.headers.pop('Authorization')
    for path in ('summary','export'):
        assert client.get('/api/'+path).status_code==401
    for path in ('backup','sync?semester_id=1','undo/1'):
        assert client.post('/api/'+path).status_code==401
    with pytest.raises(RuntimeError): Settings(app_env='production',dev_auth_bypass=True).validate_security()


def test_future_and_weighted(client):
    sem=client.post('/api/semesters',json={'name':'Future','start':'2090-01-01','end':'2090-12-31'}).json()
    c=client.post('/api/courses',json={'original_name':'Weighted','display_name':'Weighted'}).json()
    comp=client.post('/api/components',json={'course_id':c['id'],'semester_id':sem['id'],'kind':'W','unit':'academic','complete':True,'policy':{'mode':'percent','value':100}}).json()
    s=client.post('/api/sessions',json={'component_id':comp['id'],'start':'2090-10-01T10:00:00Z','end':'2090-10-01T12:00:00Z','units':3}).json()
    assert mark(client,[{'session_id':s['id'],'version':0,'status':'present'}]).status_code==422
    stats=client.get('/api/summary').json()['components'][0]['stats'];assert stats['F']==3 and stats['R']==3


def test_two_clients_conflict_and_retry(client,setup_data):
    s=setup_data[-1][0]
    assert mark(client,[{'session_id':s['id'],'version':0,'status':'absent'}]).status_code==200
    assert mark(client,[{'session_id':s['id'],'version':0,'status':'present'}]).status_code==409
    assert client.get('/api/summary').json()['components'][0]['sessions'][0]['attendance']['status']=='absent'


def test_group_undo_atomic_conflict(client,setup_data):
    sessions=setup_data[-1]
    items=[{'session_id':s['id'],'version':0,'status':'present'} for s in sessions[:3]]
    change=mark(client,items).json()['change_id']
    assert client.post(f'/api/undo/{change}').status_code==200
    assert client.get('/api/summary').json()['components'][0]['stats']['P']==0
    for item in items:item['version']=2
    change=mark(client,items).json()['change_id']
    mark(client,[{'session_id':sessions[1]['id'],'version':3,'status':'absent'}])
    assert client.post(f'/api/undo/{change}').status_code==409
    stats=client.get('/api/summary').json()['components'][0]['stats'];assert (stats['P'],stats['A'])==(2,1)


def test_dashboard_history_follows_group_marks_and_undo(client,setup_data):
    sessions=setup_data[-1]
    initial=client.get('/api/summary').json()['analytics']['all']
    assert initial['totals']=={'present':0,'absent':0,'unmarked':4}
    change=mark(client,[{'session_id':s['id'],'version':0,'status':'present'} for s in sessions[:3]]).json()['change_id']
    history=client.get('/api/summary').json()['analytics']['all']
    assert history['totals']=={'present':3,'absent':0,'unmarked':1}
    assert history['marked']==3 and history['completed']==4
    assert client.post(f'/api/undo/{change}').status_code==200
    assert client.get('/api/summary').json()['analytics']['all']['totals']==initial['totals']
