import { useEffect, useState, type FormEvent } from 'react';
import {
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
  source: 'live',
  period: '60',
  from: localInput(Date.now() - 3600_000),
  to: localInput(Date.now()),
};
export function Filters({
  disabled,
  onChange,
  selection,
}: {
  selection: Selection;
  disabled: boolean;
  onChange: (selection: Selection) => void;
}) {
  const [draft, setDraft] = useState<Selection>(selection);
  useEffect(() => setDraft(selection), [selection]);
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
      </fieldset>
      {error && (
        <p role="alert" className="error-text">
          {error}
        </p>
      )}
      <p className="hint">
        수신 시각 기준 · 시작 포함, 종료 제외 · 최대 31일 · 프로세스·정책 필터는 정확 일치 조회에만 적용하며 AI 안전 스냅샷에서는 제외됩니다.
      </p>
    </form>
  );
}
