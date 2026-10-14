"""Audit indexed Git files without displaying secret values or matched lines."""
import os
from pathlib import Path
import re
import subprocess
import sys
from urllib.parse import urlsplit,parse_qs
from dotenv import dotenv_values

ROOT=Path(__file__).resolve().parents[1]
PRIVATE_DIRS={'.runtime','.venv','.qa','node_modules','data','exports','backups','__pycache__','.pytest_cache','dist'}
SECRET_PATTERNS={
    'Telegram bot token':re.compile(rb'(?<![A-Za-z0-9])\d{6,12}:[A-Za-z0-9_-]{30,}'),
    'GitHub token':re.compile(rb'(?:gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{30,})'),
    'Private key':re.compile(rb'-----BEGIN [A-Z ]*PRIVATE KEY-----'),
}


def git(*args):
    result=subprocess.run(['git',*args],cwd=ROOT,capture_output=True,check=True)
    return result.stdout


def main():
    paths=[p.decode('utf-8') for p in git('ls-files','-z').split(b'\0') if p]
    if not paths:raise RuntimeError('No indexed files to audit')
    known=[]
    env=dotenv_values(ROOT/'.env')
    for key in ('BOT_TOKEN','USOS_ICAL_URL','PUBLIC_APP_URL','OWNER_TELEGRAM_ID'):
        if env.get(key):known.append((key,env[key].encode()))
    private_url=ROOT/'.runtime/usos-source-url.txt'
    if private_url.exists():
        query=parse_qs(urlsplit(private_url.read_text().strip()).query)
        for key in ('token','key'):
            if query.get(key):known.append(('private calendar '+key,query[key][0].encode()))
    failures=[]
    for path in paths:
        parts=set(Path(path).parts)
        filename=Path(path).name
        if parts&PRIVATE_DIRS or (filename.startswith('.env') and path!='.env.example') or re.search(r'\.(?:db|sqlite\w*)(?:-\w+)?$|\.log$',path):
            failures.append((path,'private/runtime artifact'))
        content=git('show',':'+path)
        for label,value in known:
            if len(value)>=6 and value in content:failures.append((path,'configured '+label))
        for label,pattern in SECRET_PATTERNS.items():
            if pattern.search(content):failures.append((path,label))
    template=dotenv_values(ROOT/'.env.example')
    if any(template.values()):failures.append(('.env.example','template must contain empty values only'))
    if failures:
        for path,label in sorted(set(failures)):print(f'BLOCKED: {path}: {label}',file=sys.stderr)
        return 1
    print(f'PASS: {len(paths)} indexed files audited; no configured secrets, credential patterns or private/runtime artifacts. Empty environment template verified.')
    return 0


if __name__=='__main__':
    try:sys.exit(main())
    except Exception:
        print('Publication audit failed; private values and diagnostic content withheld',file=sys.stderr);sys.exit(1)
