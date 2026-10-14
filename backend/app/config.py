from pathlib import Path
from urllib.parse import urlsplit
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=str(Path(__file__).resolve().parents[2] / '.env'), extra='ignore', env_ignore_empty=True)
    app_env: str = 'development'
    dev_auth_bypass: bool = False
    bot_token: str = ''
    owner_telegram_id: int = 0
    usos_ical_url: str = ''
    public_app_url: str = 'http://localhost:5173'
    database_url: str = 'sqlite:///./data/attendance.db'

    def validate_security(self):
        if self.app_env not in ('development', 'test', 'production'):
            raise RuntimeError('Unknown APP_ENV')
        if self.app_env == 'production':
            if self.dev_auth_bypass:
                raise RuntimeError('DEV_AUTH_BYPASS is prohibited in production')
            if not self.bot_token or self.owner_telegram_id <= 0 or urlsplit(self.public_app_url).scheme != 'https':
                raise RuntimeError('Production requires Telegram credentials and HTTPS PUBLIC_APP_URL')
        if not self.database_url.startswith('sqlite:///'):
            raise RuntimeError('This single-server application requires SQLite')


settings = Settings()
settings.validate_security()
