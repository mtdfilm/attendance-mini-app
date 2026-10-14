import os
import tempfile
from pathlib import Path
os.environ['APP_ENV']='test'
os.environ['DEV_AUTH_BYPASS']='true'
test_root=Path(__file__).resolve().parents[1]/'.qa'
test_root.mkdir(exist_ok=True)
os.environ['DATABASE_URL']='sqlite:///'+(Path(tempfile.mkdtemp(prefix='test-',dir=test_root))/'test.db').as_posix()
os.environ['USOS_ICAL_URL']=''
import pytest
from fastapi.testclient import TestClient
from app.db import Base,engine
from app.main import app,previews


@pytest.fixture
def client():
    Base.metadata.drop_all(engine); Base.metadata.create_all(engine); previews.clear()
    with TestClient(app) as c:
        token=c.post('/api/auth',json={}).json()['token']
        c.headers['Authorization']='Bearer '+token
        yield c


@pytest.fixture
def setup_data(client):
    sem=client.post('/api/semesters',json={'name':'TEST','start':'2020-01-01','end':'2020-12-31'}).json()
    course=client.post('/api/courses',json={'original_name':'Java Programming','display_name':'Java Programming'}).json()
    comp=client.post('/api/components',json={'course_id':course['id'],'semester_id':sem['id'],'kind':'Lab','complete':True,'policy':{'mode':'percent','value':75}}).json()
    sessions=[]
    for d in range(1,5):
        sessions.append(client.post('/api/sessions',json={'component_id':comp['id'],'start':f'2020-10-0{d}T10:00:00Z','end':f'2020-10-0{d}T11:00:00Z'}).json())
    return sem,course,comp,sessions
