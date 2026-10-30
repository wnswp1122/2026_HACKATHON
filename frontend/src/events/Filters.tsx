import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  dateTime,
  type PeriodFilters,
  eventTypes,
  selectionFilters,
  typeLabels,
  type Instance,
  type Selection,
  type EventType,
  type Source,
  type Status,
} from '../types';

const localInput = (time: number) => {
  const d = new Date(time);
  return new Date(time - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};
export const initialSelection: Selection = {
  source: 'live',
  period: '60',
  from: localInput(Date.now() - 3600_000),
  to: localInput(Date.now()),
};
export function Filters({
  instances,
  disabled,
  onChange,
  selection,
  readinessOnly = false,
  timePicker = false,
  range,
}: {
  readinessOnly?: boolean;
  timePicker?: boolean;
  range?: PeriodFilters;
  selection: Selection;
  instances: Instance[];
  disabled: boolean;
  onChange: (selection: Selection) => void;
}) {
  const [draft, setDraft] = useState<Selection>(selection);
  useEffect(() => setDraft(selection), [selection, readinessOnly]);
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
      if (!readinessOnly) selectionFilters(value);
      setError('');
      onChange(readinessOnly
        ? { ...selection, instanceId: value.instanceId, source: value.source }
        : { ...value });
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
        <label>
          인스턴스
          <select
            aria-label="인스턴스"
            value={draft.instanceId || ''}
            onChange={(e) => update({ instanceId: e.target.value || undefined })}
          >
            <option value="">전체 인스턴스</option>
            {draft.instanceId &&
              !instances.some((instance) => instance.instanceId === draft.instanceId) && (
                <option value={draft.instanceId}>{draft.instanceId}</option>
              )}
            {instances.map((i) => (
              <option key={i.instanceId}>{i.instanceId}</option>
            ))}
          </select>
        </label>
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
        <label hidden={readinessOnly}>
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
        )}
        <label hidden={readinessOnly}>
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
        <label hidden={readinessOnly}>
          경고 상태
          <select
            aria-label="경고 상태"
            value={draft.status || ''}
            onChange={(e) => update({ status: (e.target.value as Status) || undefined })}
          >
            <option value="">전체 상태</option>
            <option value="attention">주의 필요</option>
            <option value="observed">관찰됨</option>
          </select>
        </label>
        <label>
          데이터 출처
          <select
            aria-label="데이터 출처"
            value={draft.source || ''}
            onChange={(e) => update({ source: (e.target.value as Source) || undefined })}
          >
            <option value="">live + sample</option>
            <option value="live">live · 현재 수집</option>
            <option value="sample">sample · 예시/재생</option>
          </select>
        </label>
        <label hidden={readinessOnly}>
          프로세스 execId
          <input
            aria-label="프로세스 execId"
            maxLength={1024}
            placeholder="정확히 일치"
            value={draft.processExecId || ''}
            onChange={(e) => update({ processExecId: e.target.value || undefined })}
          />
        </label>
        <label hidden={readinessOnly}>
          정책명
          <input
            aria-label="정책명"
            maxLength={100}
            placeholder="정확히 일치"
            value={draft.policyName || ''}
            onChange={(e) => update({ policyName: e.target.value || undefined })}
          />
        </label>
        {!readinessOnly && !timePicker && draft.period === 'custom' && (
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
      </fieldset>
      {error && (!timePicker || !picker.current?.open) && (
        <p role="alert" className="error-text">
          {error}
        </p>
      )}
      <p className="hint">
        {readinessOnly
          ? '서버·단일 출처로 저장된 최신 상태 보고를 조회합니다. 이벤트 수나 조회 기간으로 준비 상태를 판정하지 않습니다.'
          : '수신 시각 기준 · 시작 포함, 종료 제외 · 최대 31일 · 프로세스·정책 필터는 정확 일치 조회에만 적용하며 AI 안전 스냅샷에서는 제외됩니다.'}
      </p>
    </form>
  );
}
