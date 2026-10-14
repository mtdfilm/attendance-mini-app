import pytest
from sqlalchemy import select,func
from app.db import SessionLocal
from app.demo_data import populate_demo
from app.models import Session,Component,Semester
from app.services import component_view


def test_demo_is_explicit_and_has_coherent_components(client):
    with SessionLocal() as db:
        populate_demo(db)
        components=list(db.scalars(select(Component)))
        assert len(components)==9
        assert db.scalar(select(func.count()).select_from(Session))>50
        statuses={component_view(db,c)['stats']['status'] for c in components}
        assert {'achieved','all','ongoing','impossible','unknown','incomplete','provisional'}<=statuses
        with pytest.raises(ValueError):populate_demo(db)
        assert db.scalar(select(func.count()).select_from(Semester))==1
