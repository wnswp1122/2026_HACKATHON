import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  dateTime,
  type PeriodFilters,
  eventTypes,
  selectionFilters,
  typeLabels,
  type Selection,
  type EventType,
  type Status,
} from '../types';

const localInput = (time: number) => {
  const d = new Date(time);
  return new Date(time - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};
export const initialSelection: Selection = {
  source: import.meta.env.VITE_PRESENTATION_INSTANCE ? 'sample' : 'live',
  ...(import.meta.env.VITE_PRESENTATION_INSTANCE
    ? { instanceId: import.meta.env.VITE_PRESENTATION_INSTANCE }
    : {}),
  period: '60',
  from: localInput(Date.now() - 3600_000),
  to: localInput(Date.now()),
};
export function Filters({
  disabled,
  onChange,
  selection,
  timePicker = false,
  range,
}: {
  timePicker?: boolean;
  range?: PeriodFilters;
  selection: Selection;
  disabled: boolean;
  onChange: (selection: Selection) => void;
}) {
  const [draft, setDraft] = useState<Selection>(selection);
  useEffect(() => setDraft(selection), [selection]);
  const [error, setError] = useState('');
  const picker = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    if (!timePicker) return;
    const closeOutside = (event: PointerEvent) => {
      if (picker.current && event.target instanceof Node && !picker.current.contains(event.target)) {
        picker.current.open = false;
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && picker.current?.open) {
        picker.current.open = false;
        picker.current.querySelector('summary')?.focus();
      }
    };
    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [timePicker]);
  const periods = [
    ['15', '최근 15분'], ['60', '최근 1시간'],
    ['360', '최근 6시간'], ['1440', '최근 24시간'],
  ];
  const rangeText = range ? `${dateTime(range.from)} — ${dateTime(range.to)}` : '조회 중…';
  function openPicker() {
    if (!picker.current?.open) return;
    setError('');
    setDraft({
      ...selection,
      from: range ? localInput(Date.parse(range.from)) : selection.from,
      to: range ? localInput(Date.parse(range.to)) : selection.to,
    });
  }
  const update = (value: Partial<Selection>) => setDraft((current) => ({ ...current, ...value }));
  function apply(value: Selection) {
    try {
      selectionFilters(value);
      setError('');
      onChange({ ...value });
      if (picker.current) picker.current.open = false;
    } catch (error) {
      setError(error instanceof Error ? error.message : '기간을 확인하세요.');
    }
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    apply(picker.current?.open ? { ...draft, period: 'custom' } : draft);
  }
  return (
    <form className="panel filters" onSubmit={submit}>
      <fieldset disabled={disabled}>
        {timePicker ? (
          <div className="telemetry-time-control">
            <span className="time-control-label">조회 기간</span>
            <details className="time-picker" ref={picker} onToggle={openPicker}>
              <summary
                aria-label="조회 기간 변경"
                aria-disabled={disabled}
                onClick={(event) => { if (disabled) event.preventDefault(); }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
                {selection.period === 'custom' ? '직접 지정한 기간' : periods.find(([value]) => value === selection.period)?.[1]}
                <span aria-hidden="true">⌄</span>
              </summary>
              <div className="time-picker-content">
                <div className="quick-time-ranges">
                  <strong>빠른 선택</strong>
                  {periods.map(([period, label]) => (
                    <button type="button" key={period} aria-pressed={selection.period === period}
                      onClick={() => apply({ ...selection, period })}>
                      {label}
                    </button>
                  ))}
                </div>
                <div className="absolute-time-range">
                  <strong>날짜·시간 직접 지정</strong>
                  <label>
                    시작 시각
                    <input aria-label="시작 시각" type="datetime-local" step="any" value={draft.from}
                      onChange={(e) => update({ period: 'custom', from: e.target.value })} />
                  </label>
                  <label>
                    종료 시각
                    <input aria-label="종료 시각" type="datetime-local" step="any" value={draft.to}
                      onChange={(e) => update({ period: 'custom', to: e.target.value })} />
                  </label>
                  <span className="time-zone">{Intl.DateTimeFormat().resolvedOptions().timeZone} · 최대 31일</span>
                  <button className="primary" type="button" onClick={() => apply({ ...draft, period: 'custom' })}>이 기간 조회</button>
                  {error && <p role="alert" className="error-text">{error}</p>}
                </div>
              </div>
            </details>
            <span className="applied-time-range">{rangeText}</span>
          </div>
        ) : (
          <>
        <label>
          조회 기간
          <select
            aria-label="조회 기간"
            value={draft.period}
            onChange={(e) => update({ period: e.target.value })}
          >
            <option value="15">최근 15분</option>
            <option value="60">최근 1시간</option>
            <option value="360">최근 6시간</option>
            <option value="1440">최근 24시간</option>
            <option value="custom">시점 직접 선택</option>
          </select>
        </label>
        {draft.period === 'custom' && (
          <>
            <label>
              시작 · 로컬 시각
              <input
                aria-label="시작 시각"
                type="datetime-local"
                step="any"
                required
                value={draft.from}
                onChange={(e) => update({ from: e.target.value })}
              />
            </label>
            <label>
              종료 · 로컬 시각
              <input
                aria-label="종료 시각"
                type="datetime-local"
                step="any"
                required
                value={draft.to}
                onChange={(e) => update({ to: e.target.value })}
              />
            </label>
          </>
        )}
        <button className="primary" type="submit">
          필터 적용
        </button>
          </>
        )}
        <details className="advanced-filters">
          <summary>상세 필터{[draft.eventType, draft.status, draft.processExecId, draft.policyName].filter(Boolean).length ? ' · 적용 중' : ''}</summary>
          <div className="advanced-filter-fields">
            <label>
              이벤트 유형
              <select
                aria-label="이벤트 유형"
                value={draft.eventType || ''}
                onChange={(e) => update({ eventType: (e.target.value as EventType) || undefined })}
              >
                <option value="">전체 유형</option>
                {eventTypes.map((t) => (
                  <option key={t} value={t}>
                    {typeLabels[t]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              경고 상태
              <select
                aria-label="경고 상태"
                value={draft.status || ''}
                onChange={(e) => update({ status: (e.target.value as Status) || undefined })}
              >
                <option value="">전체 상태</option>
                <option value="attention">주의</option>
                <option value="observed">관찰됨</option>
              </select>
            </label>
            <label>
              프로세스 execId
              <input
                aria-label="프로세스 execId"
                maxLength={1024}
                placeholder="정확히 일치"
                value={draft.processExecId || ''}
                onChange={(e) => update({ processExecId: e.target.value || undefined })}
              />
            </label>
            <label>
              정책명
              <input
                aria-label="정책명"
                maxLength={100}
                placeholder="정확히 일치"
                value={draft.policyName || ''}
                onChange={(e) => update({ policyName: e.target.value || undefined })}
              />
            </label>
            {timePicker && <button className="primary" type="submit">필터 적용</button>}
          </div>
        </details>
      </fieldset>
      {error && (!timePicker || !picker.current?.open) && (
        <p role="alert" className="error-text">
          {error}
        </p>
      )}
    </form>
  );
}
