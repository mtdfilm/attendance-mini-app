import pytest
from app.calculations import calculate


@pytest.mark.parametrize('P,A,U,F,p,status,reserve,remaining', [
    (5,2,0,8,80,'ongoing',1,7), (5,2,0,8,75,'ongoing',1,7),
    (5,3,0,7,80,'all',0,7), (5,4,0,6,80,'impossible',0,7),
    (12,1,0,2,80,'achieved',2,0), (5,1,2,7,80,'provisional',None,7),
])
def test_required_cases(P,A,U,F,p,status,reserve,remaining):
    r = calculate(P=P,A=A,U=U,F=F,expected_total=15,complete=True,policy={'mode':'percent','value':p})
    assert (r['R'],r['status'],r['reserve'],r['remaining']) == (12,status,reserve,remaining)
    if U: assert r['reserve_range'] == [0,2]
    if A == 4: assert r['excess'] == 1


def test_edge_cases():
    base = dict(P=0,A=0,U=0,F=0,complete=True)
    assert calculate(**base,policy={'mode':'percent','value':0})['status'] == 'achieved'
    assert calculate(**base,policy={'mode':'percent','value':100})['progress'] == 1
    assert calculate(**base,policy={'mode':'minimum','value':1})['status'] == 'conflict'
    assert calculate(P=2,A=1,U=0,F=1,policy={'mode':'percent','value':80})['N'] is None
    assert calculate(P=2,A=1,U=0,F=1,expected_total=15,complete=True,policy={'mode':'percent','value':80})['reserve'] is None
    assert calculate(P=2,A=0,U=0,F=2,complete=True,missing_units=True,policy={'mode':'percent','value':80})['status'] == 'incomplete'
    assert calculate(**base)['status'] == 'unknown'
    assert calculate(P=0,A=0,U=0,F=3,complete=True,policy={'mode':'max_absences','value':20})['budget'] == 3


def test_exact_decimal():
    assert calculate(P=0,A=0,U=0,F=1000,complete=True,policy={'mode':'percent','value':'80.01'})['R'] == 801
