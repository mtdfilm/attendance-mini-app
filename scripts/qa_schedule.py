"""Isolated local QA server. Never connects to the owner's working database."""
import os
import sys
import uuid
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
folder=ROOT/'backend/.qa';folder.mkdir(exist_ok=True)
os.environ['APP_ENV']='test'
os.environ['DEV_AUTH_BYPASS']='true'
os.environ['DATABASE_URL']='sqlite:///'+(folder/f'schedule-{uuid.uuid4().hex}.db').as_posix()
os.environ['USOS_ICAL_URL']=''
sys.path.insert(0,str(ROOT/'backend'))
from app.db import Base,engine,SessionLocal
from app.config import settings
from app.demo_data import populate_demo
settings.bot_token='synthetic-demo-token'
settings.owner_telegram_id=0
settings.usos_ical_url=''

Base.metadata.create_all(engine)
with SessionLocal() as db:
    populate_demo(db,name='QA · демонстрационный семестр')
print('Isolated QA database ready; synthetic marks only',flush=True)
import uvicorn
uvicorn.run('app.main:app',host='127.0.0.1',port=int(os.environ.get('QA_PORT','8002')),access_log=False)
