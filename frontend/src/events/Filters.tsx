import { useState, type FormEvent } from 'react';
import {
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
  period: '60',
  from: localInput(Date.now() - 3600_000),
  to: localInput(Date.now()),
};
export function Filters({
  instances,
  disabled,
  onChange,
}: {
  instances: Instance[];
  disabled: boolean;
  onChange: (selection: Selection) => void;
}) {
  const [draft, setDraft] = useState<Selection>(initialSelection);
  const [error, setError] = useState('');
  const update = (value: Partial<Selection>) => setDraft((current) => ({ ...current, ...value }));
  function submit(event: FormEvent) {
    event.preventDefault();
    try {
      selectionFilters(draft);
      setError('');
      onChange({ ...draft });
    } catch (error) {
      setError(error instanceof Error ? error.message : '기간을 확인하세요.');
    }
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
            {instances.map((i) => (
              <option key={i.instanceId}>{i.instanceId}</option>
            ))}
          </select>
        </label>
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
        {draft.period === 'custom' && (
          <>
            <label>
              시작 · 로컬 시각
              <input
                aria-label="시작 시각"
                type="datetime-local"
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
      {error && (
        <p role="alert" className="error-text">
          {error}
        </p>
      )}
      <p className="hint">
        수신 시각 기준 · 시작 포함, 종료 제외 · 최대 31일 · 현재 선택한 기간과 필터로 스냅샷을
        만듭니다.
      </p>
    </form>
  );
}
