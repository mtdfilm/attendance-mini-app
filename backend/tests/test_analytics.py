from app.analytics import attendance_history


def lesson(start, status='unmarked', finished=True, cancelled=False, units=1):
    return {'start':start, 'attendance':{'status':status}, 'finished':finished, 'cancelled':cancelled, 'units':units}


def test_descriptive_history_keeps_unknown_separate_and_excludes_future_cancelled():
    result = attendance_history([
        lesson('2026-10-01T10:00:00Z','present', units=3),
        lesson('2026-10-02T10:00:00Z','absent'),
        lesson('2026-10-05T10:00:00Z'),
        lesson('2026-10-15T10:00:00Z',finished=False),
        lesson('2026-10-06T10:00:00Z','present',cancelled=True),
    ], '2026-10-15')
    assert result['unit']=='sessions'
    assert result['recent']['totals']=={'present':1,'absent':1,'unmarked':1}
    assert result['recent']['completed']==3 and result['recent']['marked']==2
    assert sum(w['unmarked'] for w in result['all']['weeks'])==1


def test_period_boundary_and_warsaw_day():
    result = attendance_history([
        lesson('2026-09-15T21:59:00Z','present'), # Warsaw Sep 15: outside last 30 days
        lesson('2026-09-15T22:00:00Z','absent'), # Warsaw Sep 16: first included day
        lesson('2026-10-14T23:00:00Z','present'), # Warsaw Oct 15
    ], '2026-10-15')
    assert result['recent']['start']=='2026-09-16'
    assert result['recent']['totals']=={'present':1,'absent':1,'unmarked':0}
    assert result['all']['totals']=={'present':2,'absent':1,'unmarked':0}


def test_empty_and_unmarked_are_not_absence():
    empty=attendance_history([], '2026-10-15')
    assert empty['all']['completed']==0 and empty['all']['marked']==0
    result=attendance_history([lesson('2026-10-01T10:00:00Z')], '2026-10-15')
    assert result['recent']['totals']['absent']==0
    assert result['recent']['marked']==0
