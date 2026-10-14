import hashlib
import hmac
import json
import secrets
import time
from urllib.parse import parse_qsl
from fastapi import Depends, HTTPException, Request
from sqlalchemy import delete
from .config import settings
from .db import get_db
from .models import AuthSession


def validate_init_data(raw, bot_token, owner, clock=None):
    clock = int(time.time()) if clock is None else clock
    try:
        pairs = parse_qsl(raw, strict_parsing=True)
        fields = dict(pairs)
        if len(fields) != len(pairs):
            raise ValueError()
        received = fields.pop('hash')
        message = '\n'.join(f'{k}={v}' for k,v in sorted(fields.items()))
        secret = hmac.new(b'WebAppData', bot_token.encode(), hashlib.sha256).digest()
        expected = hmac.new(secret, message.encode(), hashlib.sha256).hexdigest()
        if not bot_token or not hmac.compare_digest(received, expected):
            raise ValueError()
        age = clock-int(fields['auth_date'])
        user = json.loads(fields['user'])
        if age < -30 or age > 300 or type(user['id']) is not int or user['id'] != owner or owner <= 0:
            raise ValueError()
        return owner
    except (ValueError, KeyError, TypeError):
        raise HTTPException(401, 'Откройте приложение через бота. Данные авторизации недействительны или устарели') from None


def issue_token(db):
    db.execute(delete(AuthSession).where(AuthSession.expires < int(time.time())))
    token = secrets.token_urlsafe(32)
    db.add(AuthSession(token_hash=hashlib.sha256(token.encode()).hexdigest(),expires=int(time.time())+3600))
    db.commit()
    return {'token': token, 'expires_in':3600,'dev_bypass':settings.dev_auth_bypass}


def require_auth(request: Request, db=Depends(get_db)):
    token = request.headers.get('Authorization','').removeprefix('Bearer ')
    row = db.get(AuthSession, hashlib.sha256(token.encode()).hexdigest()) if token else None
    if row is None or row.expires < int(time.time()):
        raise HTTPException(401,'Откройте через бота или повторите вход')
