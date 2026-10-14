import hashlib
import secrets
import threading
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from zoneinfo import ZoneInfo
from fastapi import APIRouter, FastAPI, Depends, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse, FileResponse
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select, delete
from sqlalchemy.exc import IntegrityError
from .config import settings
from .db import get_db
from .models import Semester, Course, Component, Session, Attendance, ChangeLog, SyncRun, now
from .schemas import SemesterIn, CourseIn, ComponentIn, SessionIn, Marks, ImportIn, CommitIn, AuthIn
from .auth import validate_init_data, issue_token, require_auth
from .services import dump, get, version, session_view, component_view, check_session_bounds
from .importer import parse_calendar, preview, commit_events, fingerprint, fetch_usos
from .backup import Backup, export_data, restore_data, sqlite_backup
from .analytics import attendance_history

app=FastAPI(title='Attendance',docs_url=None,redoc_url=None,openapi_url=None)
app.add_middleware(CORSMiddleware,allow_origins=[settings.public_app_url.rstrip('/')],allow_methods=['GET','POST','PUT','DELETE'],allow_headers=['Authorization','Content-Type'])
lock=threading.RLock()  # Exactly one web worker; SQLite additionally serializes transactions.
sync_lock=threading.Lock()
previews={}


@app.middleware('http')
async def boundaries(request, call_next):
    if int(request.headers.get('content-length','0') or 0)>10_000_000:
        return JSONResponse({'detail':'Файл слишком большой'},status_code=413)
    response=await call_next(request)
    response.headers['Cache-Control']='no-store' if request.url.path.startswith('/api') else 'no-cache'
    response.headers['X-Content-Type-Options']='nosniff'
    response.headers['Referrer-Policy']='no-referrer'
    response.headers['Content-Security-Policy']="default-src 'self'; script-src 'self' https://telegram.org; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors https://web.telegram.org https://*.telegram.org"
    return response


@app.exception_handler(RequestValidationError)
async def validation_error(request, exc):
    # Do not echo request body, initData, calendar URLs, or Pydantic input values.
    return JSONResponse({'detail':'Проверьте значения полей: '+', '.join('.'.join(map(str,e['loc'][1:])) for e in exc.errors())},status_code=422)


@app.exception_handler(IntegrityError)
async def integrity_error(request, exc):
    return JSONResponse({'detail':'Конфликт связанных записей. Обновите данные'},status_code=409)


@app.post('/api/auth')
def auth(data: AuthIn, request: Request, db=Depends(get_db)):
    if settings.dev_auth_bypass:
        if request.client and request.client.host not in ('127.0.0.1','::1','testclient'):
            raise HTTPException(403,'Dev-вход разрешён только с этого компьютера')
    else:
        validate_init_data(data.init_data,settings.bot_token,settings.owner_telegram_id)
    with lock: return issue_token(db)


api=APIRouter(prefix='/api',dependencies=[Depends(require_auth)])


@api.get('/summary')
def summary(semester_id: int | None=None, db=Depends(get_db)):
    with lock:
        return build_summary(semester_id,db)


def build_summary(semester_id,db):
    clock=datetime.now(timezone.utc)
    components=[component_view(db,c,clock) for c in db.scalars(select(Component).where(Component.semester_id==semester_id) if semester_id else select(Component))]
    today=clock.astimezone(ZoneInfo('Europe/Warsaw')).date().isoformat()
    sessions=[{**s,'course_name':c['course']['display_name'],'kind':c['kind']} for c in components for s in c['sessions']]
    today_sessions=[s for s in sessions if datetime.fromisoformat(s['start']).astimezone(ZoneInfo('Europe/Warsaw')).date().isoformat()==today]
    latest=db.scalar(select(SyncRun).order_by(SyncRun.id.desc()))
    success=db.scalar(select(SyncRun).where(SyncRun.success==True).order_by(SyncRun.id.desc()))
    return dict(components=components,semesters=[dump(s) for s in db.scalars(select(Semester))],today=sorted(today_sessions,key=lambda s:s['start']),today_date=today,
                unmarked=sum(s['state']=='unmarked' for s in sessions),no_reserve=sum(c['stats']['reserve']==0 for c in components),analytics=attendance_history(sessions,today),
                sync={'connected':bool(settings.usos_ical_url),'last':dump(latest) if latest else None,'last_success':success.created_at if success else None},dev_bypass=settings.dev_auth_bypass)


@api.post('/semesters')
def create_semester(data: SemesterIn, db=Depends(get_db)):
    with lock:
        row=Semester(**data.model_dump(mode='json',exclude={'version'})); db.add(row); db.commit(); return dump(row)


@api.put('/semesters/{id}')
def update_semester(id: int, data: SemesterIn, db=Depends(get_db)):
    with lock:
        row=get(db,Semester,id); version(row,data.version)
        component_ids=list(db.scalars(select(Component.id).where(Component.semester_id==id)))
        for s in db.scalars(select(Session).where(Session.component_id.in_(component_ids))):
            day=datetime.fromisoformat(session_view(db,s)['start']).astimezone(ZoneInfo('Europe/Warsaw')).date()
            if not data.start<=day<=data.end: raise HTTPException(422,'Новые границы исключают существующие занятия')
        for k,v in data.model_dump(mode='json',exclude={'version'}).items(): setattr(row,k,v)
        row.version+=1; db.commit(); return dump(row)


@api.post('/courses')
def create_course(data: CourseIn, db=Depends(get_db)):
    with lock:
        row=Course(**data.model_dump(exclude={'version'})); db.add(row); db.commit(); return dump(row)


@api.put('/courses/{id}')
def update_course(id:int,data:CourseIn,db=Depends(get_db)):
    with lock:
        row=get(db,Course,id); version(row,data.version)
        # Original imported identity remains immutable.
        row.display_name=data.display_name; row.version+=1; db.commit(); return dump(row)


@api.post('/components')
def create_component(data: ComponentIn, db=Depends(get_db)):
    with lock:
        get(db,Course,data.course_id); get(db,Semester,data.semester_id)
        row=Component(**data.model_dump(mode='json',exclude={'version'})); db.add(row); db.commit(); return dump(row)


@api.put('/components/{id}')
def update_component(id:int,data:ComponentIn,db=Depends(get_db)):
    with lock:
        row=get(db,Component,id); version(row,data.version)
        if (row.course_id,row.semester_id)!=(data.course_id,data.semester_id): raise HTTPException(422,'Перенос компонента между курсами/семестрами не поддерживается')
        for k,v in data.model_dump(mode='json',exclude={'version'}).items(): setattr(row,k,v)
        row.version+=1; db.commit(); return dump(row)


@api.delete('/courses/{id}')
def delete_course(id:int,version_number:int,db=Depends(get_db)):
    with lock:
        row=get(db,Course,id); version(row,version_number)
        if db.scalar(select(Component.id).where(Component.course_id==id)): raise HTTPException(409,'Сначала удалите пустые компоненты. История не удаляется каскадно')
        db.delete(row); db.commit(); return {'ok':True}


@api.delete('/components/{id}')
def delete_component(id:int,version_number:int,db=Depends(get_db)):
    with lock:
        row=get(db,Component,id); version(row,version_number)
        if db.scalar(select(Session.id).where(Session.component_id==id)): raise HTTPException(409,'Компонент содержит историю. Отменяйте занятия, чтобы сохранить её')
        db.delete(row); db.commit(); return {'ok':True}


@api.post('/sessions')
def create_session(data:SessionIn,db=Depends(get_db)):
    with lock:
        check_session_bounds(db,data.component_id,data.start,data.end)
        row=Session(**data.model_dump(mode='json',exclude={'version','reset_overrides'}),uid=str(uuid.uuid4()))
        db.add(row); db.commit(); return session_view(db,row)


@api.put('/sessions/{id}')
def update_session(id:int,data:SessionIn,db=Depends(get_db)):
    with lock:
        row=get(db,Session,id); version(row,data.version)
        if row.component_id!=data.component_id: raise HTTPException(422,'Для сопоставления импортов используйте предпросмотр')
        check_session_bounds(db,data.component_id,data.start,data.end)
        values=data.model_dump(mode='json',exclude={'version','reset_overrides','component_id'})
        if row.source=='manual':
            for k,v in values.items(): setattr(row,k,v)
        else:
            def changed(k,v):
                old=getattr(row,k)
                return datetime.fromisoformat(old)!=datetime.fromisoformat(v) if k in ('start','end') else old!=v
            row.overrides={} if data.reset_overrides else {k:v for k,v in values.items() if changed(k,v)}
        row.version+=1; row.updated_at=now(); db.commit(); return session_view(db,row)


@api.post('/attendance')
def marks(data:Marks,db=Depends(get_db)):
    with lock:
        old=db.scalar(select(ChangeLog).where(ChangeLog.request_id==data.request_id))
        if old: return {'change_id':old.id,'replayed':True}
        if len({i.session_id for i in data.items})!=len(data.items): raise HTTPException(422,'Повтор занятия в группе')
        entries=[]
        for item in data.items:
            s=get(db,Session,item.session_id); view=session_view(db,s)
            if view['cancelled'] or (not view['finished'] and item.status!='unmarked'): raise HTTPException(422,'Отмечать можно только завершившиеся неотменённые занятия')
            a=db.get(Attendance,s.id)
            if (a.version if a else 0)!=item.version: raise HTTPException(409,'Отметка уже изменена. Обновите данные')
            before={'status':a.status,'note':a.note} if a else {'status':'unmarked','note':''}
            after={'status':item.status,'note':item.note}
            if before==after: continue
            if not a: a=Attendance(session_id=s.id,version=0); db.add(a)
            a.status=item.status; a.note=item.note; a.version+=1; a.updated_at=now()
            entries.append({'session_id':s.id,'before':before,'after':after,'version':a.version})
        change=ChangeLog(request_id=data.request_id,entries=entries); db.add(change); db.commit()
        return {'change_id':change.id}


@api.post('/undo/{id}')
def undo(id:int,db=Depends(get_db)):
    with lock:
        change=get(db,ChangeLog,id)
        if change.undone: return {'ok':True}
        for e in change.entries:
            a=get(db,Attendance,e['session_id']); version(a,e['version'])
            a.status=e['before']['status']; a.note=e['before']['note']; a.version+=1; a.updated_at=now()
        change.undone=True; db.commit(); return {'ok':True}


def save_preview(db,events,source,semester_id,warnings):
    for key in list(previews):
        if previews[key]['expires']<time.time(): del previews[key]
    if len(previews)>20: previews.pop(next(iter(previews)))
    token=secrets.token_urlsafe(24)
    rows=preview(db,events,source,semester_id)
    previews[token]=dict(events=rows,source=source,semester_id=semester_id,fingerprint=fingerprint(db),expires=time.time()+1800)
    return dict(token=token,events=rows,warnings=warnings,added=sum(r['action']=='new' for r in rows),updated=sum(r['action']=='update' for r in rows),cancelled=sum(r['cancelled'] for r in rows),start=min(e['start'] for e in rows),end=max(e['end'] for e in rows))


@api.post('/import/preview')
def import_preview(data:ImportIn,db=Depends(get_db)):
    with lock:
        semester=get(db,Semester,data.semester_id)
        try: events,warnings=parse_calendar(data.content,semester)
        except Exception: raise HTTPException(422,'Не удалось прочитать календарь: проверьте даты семестра, UID, время и частоту повторений (DAILY или реже)') from None
        return save_preview(db,events,'ics',semester.id,warnings)


@api.post('/import/commit')
def import_commit(data:CommitIn,db=Depends(get_db)):
    with lock:
        p=previews.get(data.token)
        if not p or 'events' not in p or p['expires']<time.time(): raise HTTPException(409,'Предпросмотр истёк; загрузите файл снова')
        if fingerprint(db)!=p['fingerprint']: raise HTTPException(409,'Данные изменились после предпросмотра. Повторите его')
        result=commit_events(db,p['events'],p['source'],p['semester_id'],data.resolutions,data.components)
        if p['source']=='usos': db.add(SyncRun(success=True,added=result['added'],updated=result['updated']))
        db.commit(); del previews[data.token]; return result


@api.post('/sync')
def sync(semester_id:int,db=Depends(get_db)):
    if not settings.usos_ical_url: raise HTTPException(422,'Задайте USOS_ICAL_URL в локальном .env и перезапустите сервер')
    if not sync_lock.acquire(blocking=False): raise HTTPException(409,'Обновление уже выполняется')
    try:
        semester=get(db,Semester,semester_id)
        try: events,warnings=parse_calendar(fetch_usos(settings.usos_ical_url),semester)
        except Exception:
            with lock: db.add(SyncRun(success=False,error='Не удалось загрузить USOS. Проверьте приватную ссылку, сеть и границы семестра. Сохранённые данные не изменены')); db.commit()
            raise HTTPException(502,'Не удалось загрузить USOS. Проверьте ссылку, сеть и границы семестра. Сохранённые данные не изменены') from None
        with lock: return save_preview(db,events,'usos',semester.id,warnings)
    finally: sync_lock.release()


@api.get('/export')
def export(db=Depends(get_db)):
    with lock: return export_data(db)


@api.post('/restore/preview')
def restore_preview(data:Backup,db=Depends(get_db)):
    with lock:
        token=secrets.token_urlsafe(24)
        previews[token]={'backup':data,'fingerprint':fingerprint(db),'expires':time.time()+1800}
        return {'token':token,'courses':len(data.courses),'components':len(data.components),'sessions':len(data.sessions),'attendance':len(data.attendance)}


@api.post('/restore/commit')
def restore_commit(data:CommitIn,confirm:bool=False,db=Depends(get_db)):
    if not confirm: raise HTTPException(422,'Подтвердите замену данных')
    with lock:
        p=previews.get(data.token)
        if not p or 'backup' not in p or p['expires']<time.time(): raise HTTPException(409,'Предпросмотр истёк')
        if fingerprint(db)!=p['fingerprint']: raise HTTPException(409,'Данные изменились; повторите предпросмотр')
        name=restore_data(db,p['backup']); db.commit(); previews.clear(); return {'ok':True,'backup':name}


@api.post('/backup')
def backup():
    with lock: return {'file':sqlite_backup()}


app.include_router(api)
dist=Path(__file__).resolve().parents[2]/'frontend'/'dist'


@app.get('/{path:path}')
def frontend(path:str):
    if path.startswith('api/'): raise HTTPException(404,'API endpoint не найден')
    target=(dist/path).resolve()
    if dist.resolve() not in target.parents or not target.is_file(): target=dist/'index.html'
    if not target.is_file(): raise HTTPException(404,'Соберите frontend или запустите Vite на порту 5173')
    return FileResponse(target)
