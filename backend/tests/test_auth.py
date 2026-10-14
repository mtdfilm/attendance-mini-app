import hashlib,hmac,json
from urllib.parse import urlencode
import pytest
from fastapi import HTTPException
from app.auth import validate_init_data


def signed(user=42,when=1000):
    fields={'auth_date':str(when),'user':json.dumps({'id':user}),'query_id':'x','signature':'optional-telegram-signature'}
    secret=hmac.new(b'WebAppData',b'test-token',hashlib.sha256).digest()
    fields['hash']=hmac.new(secret,'\n'.join(f'{k}={v}' for k,v in sorted(fields.items())).encode(),hashlib.sha256).hexdigest()
    return urlencode(fields)


def test_valid(): assert validate_init_data(signed(),'test-token',42,1100)==42


@pytest.mark.parametrize('raw,clock',[(signed(user=41),1100),(signed(),1400),(signed(when=1200),1000),(signed()+'x',1100),(signed()+'&auth_date=1000',1100)])
def test_rejected(raw,clock):
    with pytest.raises(HTTPException): validate_init_data(raw,'test-token',42,clock)
