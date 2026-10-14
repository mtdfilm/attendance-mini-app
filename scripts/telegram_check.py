"""Safe Telegram bootstrap: credentials stay in .env, never in arguments/logs."""
import hashlib
import sys
from pathlib import Path

import httpx
from dotenv import dotenv_values, set_key

ROOT = Path(__file__).resolve().parents[1]


def main():
    values = dotenv_values(ROOT / '.env')
    token = values.get('BOT_TOKEN', '')
    if not token or not str(values.get('OWNER_TELEGRAM_ID', '')).isdigit():
        raise RuntimeError('Set BOT_TOKEN and numeric OWNER_TELEGRAM_ID in .env')
    with httpx.Client(timeout=45, trust_env=False, follow_redirects=True) as client:
        def telegram(method, body=None):
            result = client.post('https://api.telegram.org/bot' + token + '/' + method, json=body or {}).json()
            if not result.get('ok'):
                raise RuntimeError('Telegram rejected ' + method + '; check credentials and bot configuration')
            return result['result']

        if len(sys.argv) > 1 and sys.argv[1] == 'menu':
            url = values.get('PUBLIC_APP_URL', '')
            if not url.startswith('https://'):
                raise RuntimeError('PUBLIC_APP_URL must be HTTPS')
            telegram('setChatMenuButton', {'menu_button': {'type': 'web_app', 'text': 'Attendance', 'web_app': {'url': url}}})
            menu = telegram('getChatMenuButton')
            if menu.get('web_app', {}).get('url', '').rstrip('/') != url.rstrip('/'):
                raise RuntimeError('Telegram menu URL verification failed')
            print('Telegram menu button configured')
            return
        me = telegram('getMe')
        if telegram('getWebhookInfo').get('url'):
            raise RuntimeError('Bot already has a webhook. Disable it deliberately before polling')
        runtime = ROOT / '.runtime'
        runtime.mkdir(exist_ok=True)
        executable = runtime / 'cloudflared.exe'
        if not executable.exists():
            release = client.get('https://api.github.com/repos/cloudflare/cloudflared/releases/latest')
            release.raise_for_status()
            asset = next(a for a in release.json()['assets'] if a['name'] == 'cloudflared-windows-amd64.exe')
            binary = client.get(asset['browser_download_url'])
            binary.raise_for_status()
            digest = asset.get('digest', '')
            if not digest.startswith('sha256:') or hashlib.sha256(binary.content).hexdigest() != digest.split(':', 1)[1]:
                raise RuntimeError('Official cloudflared asset checksum could not be verified')
            executable.write_bytes(binary.content)
        print('BOT_USERNAME=' + me['username'])
        print('Official cloudflared executable ready; no credentials printed')


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        # HTTP exceptions can include a token-bearing URL; never print them.
        print(str(error) if isinstance(error, RuntimeError) else 'Bootstrap failed: network or configuration error', file=sys.stderr)
        sys.exit(1)
