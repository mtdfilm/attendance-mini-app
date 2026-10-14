"""Pure semester attendance calculations. All counts use the chosen accounting unit."""
from decimal import Decimal, ROUND_CEILING


def calculate(*, P, A, U, F, expected_total=None, complete=False, policy=None, missing_units=False):
    counts = (P, A, U, F)
    if any(not isinstance(x, int) or x < 0 for x in counts):
        raise ValueError('Counts must be nonnegative integers')
    known = sum(counts)
    N = expected_total if expected_total is not None else (known if complete else None)
    result = dict(P=P, A=A, U=U, F=F, N=N, R=None, budget=None, excess=None,
                  remaining=None, reserve=None, reserve_range=None, progress=None,
                  marked_percent=round(P / (P + A) * 100, 1) if P + A else None,
                  status='unknown', warnings=[])
    warnings = result['warnings']
    if missing_units:
        warnings.append('Не заданы академические единицы части занятий')
    if not complete:
        warnings.append('Полнота календаря не подтверждена')
    if N is not None and (not isinstance(N, int) or N < 0):
        raise ValueError('N must be a nonnegative integer')
    if N is not None and N != known:
        warnings.append(f'Объём {N} не совпадает с известными занятиями/единицами ({known}). Восстановите историю и проверьте отмены')
    policy = policy or {'mode': 'unknown'}
    mode, value = policy.get('mode'), policy.get('value')
    if mode == 'unknown' or N is None:
        warnings.append('Укажите полный объём и требование посещаемости')
        return result
    d = Decimal(str(value))
    if not d.is_finite() or d < 0 or (mode == 'percent' and d > 100):
        raise ValueError('Invalid policy value')
    if mode != 'percent' and d != int(d):
        raise ValueError('Policy count must be an integer')
    if mode == 'percent':
        R = int((Decimal(N) * d / 100).to_integral_value(rounding=ROUND_CEILING))
    elif mode == 'minimum':
        R = int(d)
    elif mode == 'max_absences':
        R = max(0, N - int(d))
    else:
        raise ValueError('Unknown policy')
    if R > N:
        warnings.append('Минимум превышает полный объём')
        result.update(R=R, status='conflict')
        return result
    B = N - R
    result.update(R=R, budget=B, excess=max(0, A - B), remaining=max(0, R-P), progress=min(1, P/R) if R else 1)
    if warnings:
        result['status'] = 'incomplete'
        return result
    if U:
        warnings.append('Есть неотмеченные занятия — расчёт предварительный')
        result['reserve_range'] = [min(F, max(0, B-A-U)), min(F, max(0, B-A))]
        result['status'] = 'achieved' if P >= R else ('impossible' if P+U+F < R else 'provisional')
        return result
    result['reserve'] = min(F, max(0, B-A))
    result['status'] = 'achieved' if P >= R else ('impossible' if P+F < R else ('all' if P+F == R else 'ongoing'))
    return result
