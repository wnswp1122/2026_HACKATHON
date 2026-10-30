import { useEffect, useRef, useState } from 'react';
import { api, describeError } from '../api';
import { dateTime, type Event } from '../types';
export function Detail({ id, onClose }: { id: string; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [data, setData] = useState<{ event: Event; rawEvent: object }>();
  const [error, setError] = useState('');
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setData(undefined);
    setError('');
    api
      .detail(id, controller.signal)
      .then((data) => {
        if (active) setData(data);
      })
      .catch((error) => {
        if (active) setError(describeError(error));
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [id]);
  return (
    <dialog ref={dialog} className="detail" onCancel={onClose} aria-labelledby="detail-title">
      <div className="panel-heading">
        <h2 id="detail-title">이벤트 원본 상세</h2>
        <button autoFocus onClick={onClose} aria-label="상세 닫기">
          닫기 ×
        </button>
      </div>
      <p className="notice">
        이 영역은 캡처와 AI 전송에서 제외됩니다. 원본 문자열은 실행하지 않고 표시합니다.
      </p>
      <p className="mono">{id}</p>
      {error ? (
        <p className="error-text" role="alert">
          {error}
        </p>
      ) : !data ? (
        <p role="status">원본을 불러오는 중…</p>
      ) : (
        <>
          <dl className="detail-meta">
            <dt>수신</dt>
            <dd>{dateTime(data.event.receivedAt)}</dd>
            <dt>발생</dt>
            <dd>{dateTime(data.event.occurredAt)}</dd>
            <dt>경고 근거</dt>
            <dd>{data.event.reason || '없음'}</dd>
            <dt>정책 / 보고된 동작</dt>
            <dd>
              {data.event.policyName || '미확인'} / {data.event.reportedAction || '미확인'}
            </dd>
            <dt>실제 결과</dt>
            <dd>unknown · 차단 성공 여부는 확인되지 않음</dd>
            <dt>대상</dt>
            <dd>{data.event.target || '미확인'}</dd>
          </dl>
          <pre>{JSON.stringify(data.rawEvent, null, 2)}</pre>
        </>
      )}
    </dialog>
  );
}
