import { useEffect, useRef, useState } from 'react';
import { api, describeError } from '../api';
import { dateTime, statusLabels, typeLabels, type Event } from '../types';
import './detail.css';

type Tab = 'overview' | 'observed' | 'raw';
function Fact({ label, value, mono = false }: { label: string; value: string | number | null | undefined; mono?: boolean }) {
  return <div><dt>{label}</dt><dd className={mono ? 'mono' : ''}>{value === null || value === undefined || value === '' ? '미확인' : value}</dd></div>;
}
const endpoint = (ip: string | null, port: number | null) => ip ? `${ip}${port === null ? '' : `:${port}`}` : '미확인';

export function Detail({ id, onClose }: { id: string; onClose: () => void }) {
  const closeButton = useRef<HTMLButtonElement>(null);
  const [tab, setTab] = useState<Tab>('overview');
  const [data, setData] = useState<{ event: Event; rawEvent: object }>();
  const [error, setError] = useState('');
  useEffect(() => {
    closeButton.current?.focus();
    setTab('overview');
  }, [id]);
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
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);
  const event = data?.event;
  return <aside className="event-drawer" aria-labelledby="event-drawer-title">
    <div className="event-drawer-top"><span>관찰 이벤트 상세</span><button ref={closeButton} type="button" onClick={onClose} aria-label="상세 닫기">×</button></div>
    <div className="event-drawer-head">
      <div className="event-drawer-tags">{event && <><span className={`badge ${event.source}`}>{event.source === 'sample' ? 'SAMPLE · 예시/재생' : 'LIVE · 현재 수집'}</span><span className={`badge ${event.status}`}>{statusLabels[event.status]}</span></>}</div>
      <h2 id="event-drawer-title">{event ? typeLabels[event.eventType] : '이벤트 상세'}</h2>
      <p>{event ? `${event.instanceId} · 수신 ${dateTime(event.receivedAt)}` : id}</p>
    </div>
    <div className="event-drawer-tabs" role="tablist" aria-label="상세 정보 탭">{([['overview', '개요'], ['observed', '관찰 데이터'], ['raw', '원본 로그']] as const).map(([value, label]) => <button key={value} type="button" role="tab" aria-selected={tab === value} className={tab === value ? 'active' : ''} onClick={() => setTab(value)}>{label}</button>)}</div>
    <div className="event-drawer-body" role="tabpanel">
      {error ? <p className="error-text" role="alert">{error}</p> : !data ? <p className="empty" role="status">상세정보를 불러오는 중…</p> : <>
        {tab === 'overview' && <>
          <section><h3>무슨 일이 관찰됐나 <small>수집된 사실</small></h3><dl className="event-drawer-facts"><Fact label="이벤트 유형" value={typeLabels[event!.eventType]} /><Fact label="발생 시각" value={dateTime(event!.occurredAt)} /><Fact label="실행 프로그램" value={event!.process.binary} mono /><Fact label="부모 프로세스" value={event!.process.parentBinary} mono /><Fact label="대상" value={event!.target} mono /></dl></section>
          <section><h3>정책과 확인 범위</h3><div className="event-drawer-note"><strong>{event!.status === 'attention' ? '정책 일치' : '관찰된 이벤트'}</strong><p>{event!.reason || '추가 경고 근거는 제공되지 않았습니다.'}</p><p>보고된 동작: {event!.reportedAction || '미확인'} · 실제 차단 결과: 미확인</p></div><small className="event-drawer-caution">정책 일치만으로 공격이나 차단 성공을 확정하지 않습니다.</small></section>
          <section><h3>다음 확인 항목</h3><ul className="event-drawer-steps"><li>이벤트의 서버와 발생 시각을 확인하세요.</li><li>프로세스·대상·정책 정보와 운영 작업 기록을 대조하세요.</li><li>필요한 대응은 담당자와 별도 절차로 결정하세요.</li></ul><small className="event-drawer-caution">이 화면은 대응 상태 변경이나 서버 조치를 실행하지 않습니다.</small></section>
        </>}
        {tab === 'observed' && <>
          <section><h3>프로세스 및 정책</h3><dl className="event-drawer-facts"><Fact label="서버" value={event!.instanceId} mono /><Fact label="노드명" value={event!.nodeName} mono /><Fact label="프로세스" value={event!.process.binary} mono /><Fact label="부모 프로세스" value={event!.process.parentBinary} mono /><Fact label="PID / UID" value={`${event!.process.pid ?? '미확인'} / ${event!.process.uid ?? '미확인'}`} /><Fact label="실행 ID" value={event!.process.execId} mono /><Fact label="정책명" value={event!.policyName} /><Fact label="보고된 동작" value={event!.reportedAction} /></dl></section>
          {event!.file && <section><h3>파일 관찰</h3><dl className="event-drawer-facts"><Fact label="경로" value={event!.file.path} mono /><Fact label="동작" value={event!.file.operation} /></dl></section>}
          {event!.network && <section><h3>네트워크 관찰</h3><dl className="event-drawer-facts"><Fact label="출발지" value={endpoint(event!.network.sourceIp, event!.network.sourcePort)} mono /><Fact label="목적지" value={endpoint(event!.network.destinationIp, event!.network.destinationPort)} mono /><Fact label="프로토콜" value={event!.network.protocol} /><Fact label="동작" value={event!.network.operation} /></dl></section>}
        </>}
        {tab === 'raw' && <section><h3>원본 JSON 로그</h3><p className="event-drawer-caution">원본 문자열은 텍스트로 표시하며 안전 분석 캡처와 AI 전송에서 제외됩니다.</p><pre>{JSON.stringify(data.rawEvent, null, 2)}</pre></section>}
      </>}
    </div>
  </aside>;
}
