from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Literal
from pydantic import BaseModel, ConfigDict, Field, model_validator


class Strict(BaseModel):
    model_config = ConfigDict(extra='forbid')


class Policy(Strict):
    mode: Literal['unknown','percent','minimum','max_absences'] = 'unknown'
    value: Decimal | None = None

    @model_validator(mode='after')
    def valid(self):
        if self.mode == 'unknown':
            self.value = None
        elif self.value is None or not self.value.is_finite() or self.value < 0:
            raise ValueError('Требуется неотрицательное значение')
        elif self.mode == 'percent' and self.value > 100:
            raise ValueError('Процент должен быть от 0 до 100')
        elif self.mode != 'percent' and self.value != int(self.value):
            raise ValueError('Число должно быть целым')
        return self


class SemesterIn(Strict):
    name: str = Field(min_length=1,max_length=200)
    start: date
    end: date
    timezone: Literal['Europe/Warsaw'] = 'Europe/Warsaw'
    version: int = 0

    @model_validator(mode='after')
    def valid(self):
        if self.end < self.start or (self.end-self.start).days > 366:
            raise ValueError('Границы семестра: от 1 до 367 дней')
        return self


class CourseIn(Strict):
    original_name: str = Field(min_length=1,max_length=300)
    display_name: str = Field(min_length=1,max_length=300)
    version: int = 0


class ComponentIn(Strict):
    course_id: int
    semester_id: int
    kind: str = Field(min_length=1,max_length=100)
    external_group: str = Field(default='',max_length=500)
    policy: Policy = Field(default_factory=Policy)
    unit: Literal['sessions','academic'] = 'sessions'
    expected_total: int | None = Field(default=None,ge=0,le=100000,strict=True)
    complete: bool = False
    version: int = 0


class SessionIn(Strict):
    component_id: int
    start: datetime
    end: datetime
    location: str = Field(default='',max_length=1000)
    cancelled: bool = False
    units: int | None = Field(default=None,ge=1,le=1000,strict=True)
    version: int = 0
    reset_overrides: bool = False

    @model_validator(mode='after')
    def valid(self):
        if self.start.tzinfo is None or self.end.tzinfo is None:
            raise ValueError('Укажите время с часовым поясом')
        if self.end <= self.start:
            raise ValueError('Конец занятия должен быть позже начала')
        self.start = self.start.astimezone(timezone.utc)
        self.end = self.end.astimezone(timezone.utc)
        return self


class Mark(Strict):
    session_id: int
    version: int = Field(ge=0)
    status: Literal['present','absent','unmarked']
    note: str = Field(default='',max_length=4000)


class Marks(Strict):
    request_id: str = Field(min_length=8,max_length=100)
    items: list[Mark] = Field(min_length=1,max_length=500)


class ImportIn(Strict):
    semester_id: int
    content: str = Field(max_length=2000000)


class CommitIn(Strict):
    token: str
    # Event index -> existing session id. -1 = skip, 0 = explicit new event.
    resolutions: dict[str,int] = Field(default_factory=dict)
    components: dict[str,int] = Field(default_factory=dict)


class AuthIn(Strict):
    init_data: str = Field(default='',max_length=16000)
