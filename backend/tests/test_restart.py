"""Start/stop two actual server processes against the same isolated SQLite file."""
import os
import socket
import subprocess
import sys
import time
import httpx


def test_process_restart_preserves_data(client,setup_data):
    session=setup_data[-1][0]
    client.post('/api/attendance',json={'request_id':'restart-mark-001','items':[{'session_id':session['id'],'status':'present','version':0,'note':'Persistent note'}]})
    snapshots=[]
    for _ in range(2):
        with socket.socket() as sock:
            sock.bind(('127.0.0.1',0));port=sock.getsockname()[1]
        process=subprocess.Popen([sys.executable,'-m','uvicorn','app.main:app','--host','127.0.0.1','--port',str(port),'--no-access-log'],env=os.environ.copy(),stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
        try:
            with httpx.Client(base_url=f'http://127.0.0.1:{port}',trust_env=False,timeout=2) as http:
                for attempt in range(50):
                    try:
                        auth=http.post('/api/auth',json={})
                        if auth.status_code==200:break
                    except httpx.TransportError: pass
                    time.sleep(.1)
                else:raise AssertionError('Test server did not start')
                result=http.get('/api/export',headers={'Authorization':'Bearer '+auth.json()['token']}).json()
                result.pop('exported_at');snapshots.append(result)
        finally:
            process.terminate();process.wait(timeout=10)
    assert snapshots[0]==snapshots[1]
    assert snapshots[1]['attendance'][0]['note']=='Persistent note'
