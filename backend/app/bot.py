"""Owner-only /start bot using official Telegram Bot API over HTTPS."""
import time
import httpx
from .config import settings


def run():
    if not settings.bot_token or settings.owner_telegram_id<=0 or not settings.public_app_url.startswith('https://'):
        raise SystemExit('Set BOT_TOKEN, OWNER_TELEGRAM_ID and HTTPS PUBLIC_APP_URL')
    # Never print exceptions: HTTP clients may put a token-bearing URL in them.
    base='https://api.telegram.org/bot'+settings.bot_token+'/'
    offset=0
    with httpx.Client(timeout=40,trust_env=False) as client:
        while True:
            try:
                result=client.post(base+'getUpdates',json={'offset':offset,'timeout':25,'allowed_updates':['message']}).json()
                if not result.get('ok'): raise ValueError()
                for update in result['result']:
                    offset=update['update_id']+1
                    message=update.get('message',{})
                    if message.get('from',{}).get('id')!=settings.owner_telegram_id or message.get('chat',{}).get('type')!='private':continue
                    if message.get('text','').split(' ')[0]=='/start':
                        response=client.post(base+'sendMessage',json={'chat_id':settings.owner_telegram_id,'text':'Attendance · Vistula\nВаше расписание и посещаемость.','reply_markup':{'inline_keyboard':[[{'text':'Открыть Attendance','web_app':{'url':settings.public_app_url}}]]}})
                        if not response.json().get('ok'): raise ValueError()
            except (httpx.HTTPError,ValueError,KeyError):
                print('Telegram temporarily unavailable; retrying without diagnostic payload',flush=True)
                time.sleep(5)


if __name__=='__main__':run()
