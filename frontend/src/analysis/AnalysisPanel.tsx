import { useEffect, useRef, useState } from 'react';
import { createPortal, flushSync } from 'react-dom';
import { ApiError, api, describeError } from '../api';
import {
  dateTime,
  selectionFilters,
  type Analysis,
  type Selection,
  type Snapshot,
  type Filters,
  safeSnapshotFilters,
} from '../types';
import { SnapshotView } from './SnapshotView';

type Props = {
  selection: Selection;
  filters?: Filters;
  onBusy: (busy: boolean) => void;
  onResult: (result: Analysis | undefined) => void;
};
const storedId = () => new URLSearchParams(window.location.search).get('snapshot');
export default function AnalysisPanel({
  selection,
  filters: contextFilters,
  onBusy,
  onResult,
}: Props) {
  const [snapshot, setSnapshot] = useState<Snapshot>();
  const [analysis, setAnalysis] = useState<Analysis>();
  const [step, setStep] = useState('');
  const [error, setError] = useState('');
  const [pngUrl, setPngUrl] = useState('');
  const [imageSha, setImageSha] = useState('');
  const [restoreId, setRestoreId] = useState(storedId() || '');
  const captureRef = useRef<HTMLDivElement>(null);
  const lock = useRef(false);
  const png = useRef<Blob | null>(null);
  const generation = useRef(0);
  const mounted = useRef(true);
  const busy = step !== '';
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      generation.current++;
    };
  }, []);
  useEffect(
    () => () => {
      if (pngUrl) URL.revokeObjectURL(pngUrl);
    },
    [pngUrl],
  );
  useEffect(() => {
    const id = storedId();
    if (id) void restore(id);
  }, []); // URL만 읽어 서버에서 영속 스냅샷 복원

  function begin(label: string) {
    if (lock.current) return false;
    lock.current = true;
    setStep(label);
    setError('');
    onBusy(true);
    return true;
  }
  function finish() {
    lock.current = false;
    if (mounted.current) {
      setStep('');
      onBusy(false);
    }
  }
  function remember(id: string) {
    const url = new URL(window.location.href);
    url.searchParams.set('snapshot', id);
    window.history.replaceState(null, '', url);
    setRestoreId(id);
  }
  async function restore(id: string) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      setError('스냅샷 UUID를 확인하세요.');
      return;
    }
    id = id.toLowerCase();
    if (!begin('저장한 스냅샷 불러오는 중…')) return;
    const current = ++generation.current;
    const controller = new AbortController();
    try {
      const value = await api.getSnapshot(id, controller.signal);
      if (!mounted.current || current !== generation.current) return;
      if (value.snapshotId !== id) throw new Error('복원 응답의 스냅샷 ID가 일치하지 않습니다.');
      setSnapshot(value);
      setAnalysis(undefined);
      onResult(undefined);
      png.current = null;
      setPngUrl('');
      setImageSha('');
      remember(value.snapshotId);
      try {
        const result = await api.analysis(value.snapshotId, controller.signal);
        if (result.snapshotId !== id)
          throw new Error('저장한 분석의 스냅샷 ID가 일치하지 않습니다.');
        if (mounted.current && current === generation.current) {
          setAnalysis(result);
          onResult(result);
        }
      } catch (error) {
        if (!(error instanceof ApiError && error.status === 404)) throw error;
      }
    } catch (error) {
      if (mounted.current && current === generation.current) setError(describeError(error));
    } finally {
      finish();
    }
  }
  async function run(existing?: Snapshot) {
    if (!begin(existing ? '같은 스냅샷으로 재시도 중…' : '스냅샷 생성 중…')) return;
    const current = ++generation.current;
    const alive = () => mounted.current && current === generation.current;
    try {
      let value = existing;
      if (!value) {
        const filters = safeSnapshotFilters(contextFilters || selectionFilters(selection));
        value = await api.snapshot(filters);
        if (!alive()) return;
        flushSync(() => {
          setSnapshot(value);
          setAnalysis(undefined);
          onResult(undefined);
          setPngUrl('');
          setImageSha('');
        });
        png.current = null;
        remember(value.snapshotId);
      }
      const id = value.snapshotId;
      if (existing && !png.current) {
        setStep('저장된 캡처로 AI 분석 중…');
        try {
          const result = await api.analyze(id);
          if (!alive()) return;
          if (result.snapshotId !== id) throw new Error('분석 응답의 스냅샷 ID가 일치하지 않습니다.');
          setAnalysis(result);
          onResult(result);
          return;
        } catch (error) {
          if (!(error instanceof ApiError && error.code === 'IMAGE_REQUIRED')) throw error;
        }
      }
      if (!png.current) {
        setStep('폰트·차트 준비 후 PNG 생성 중…');
        const { captureSnapshot } = await import('./capture');
        if (!alive()) return;
        const node = captureRef.current;
        if (!node || node.dataset.snapshotId !== id)
          throw new Error('선택한 스냅샷과 캡처 영역이 일치하지 않습니다.');
        png.current = await captureSnapshot(node);
        if (!alive()) return;
        setPngUrl(URL.createObjectURL(png.current));
      }
      setStep('고정 PNG 업로드 중…');
      const image = await api.upload(id, png.current);
      if (!alive()) return;
      if (image.snapshotId !== id) throw new Error('이미지 응답의 스냅샷 ID가 일치하지 않습니다.');
      setImageSha(image.imageSha256);
      setStep('AI 분석 요청 중…');
      const result = await api.analyze(id);
      if (!alive()) return;
      if (result.snapshotId !== id) throw new Error('분석 응답의 스냅샷 ID가 일치하지 않습니다.');
      setAnalysis(result);
      onResult(result);
    } catch (error) {
      if (alive()) setError(describeError(error));
    } finally {
      finish();
    }
  }
  return (
    <section id="analysis" className="analysis-section" aria-labelledby="analysis-title">
      <div className="section-heading">
        <div>
          <h3 id="analysis-title">현재 조회 범위 분석</h3>
        </div>
        <button className="primary" disabled={busy} onClick={() => void run()}>
          {snapshot ? '새 스냅샷 분석' : 'AI 분석 시작'}
        </button>
      </div>
      <p className="analysis-disclosure">요약 데이터와 대시보드 캡처를 외부 AI에 전송합니다.</p>
      <details className="restore-analysis">
        <summary>저장한 분석 불러오기</summary>
        <form className="restore" onSubmit={(e) => { e.preventDefault(); void restore(restoreId); }}>
          <label htmlFor="snapshot-id">스냅샷 ID</label>
          <input id="snapshot-id" placeholder="스냅샷 UUID" value={restoreId} onChange={(e) => setRestoreId(e.target.value)} disabled={busy} />
          <button disabled={busy || !restoreId}>불러오기</button>
        </form>
      </details>
      {busy && (
        <p className="status-line" role="status">
          <span className="spinner" />
          {step}
        </p>
      )}
      {error && (
        <div role="alert" className="error-banner">
          <b>분석할 수 없습니다</b>
          <p>{error}</p>
          {error.includes('AI_QUOTA_EXHAUSTED') && <a className="button" href="https://aistudio.google.com/usage" target="_blank" rel="noreferrer">Gemini 사용 한도 확인 ↗</a>}
        </div>
      )}
      {analysis && (
        <div className="panel analysis-result">
          <div className="panel-heading">
            <h3>분석 결과</h3>
            <span>
              {analysis.model} · {dateTime(analysis.createdAt)}
            </span>
          </div>
          {analysis.model.toLowerCase().includes('mock') && (
            <p className="mock-label">mock 응답입니다. 실제 모델 분석이 아닙니다.</p>
          )}
          <div className="result-grid">
            {(['facts', 'hypotheses', 'checks', 'limitations'] as const).map((key, index) => (
              <article key={key}>
                <h4>{['관찰된 사실', '가능한 해석', '추가 확인 사항', '분석의 한계'][index]}</h4>
                <ul>
                  {analysis.result[key].map((text, i) => (
                    <li key={i}>{text}</li>
                  ))}
                </ul>
                {analysis.result[key].length === 0 && <p>제시된 내용 없음</p>}
              </article>
            ))}
          </div>
        </div>
      )}
      {snapshot && (
        <div className="analysis-snapshot">
          <div className="panel-heading"><h3>분석 데이터</h3><span>{dateTime(snapshot.createdAt)}</span></div>
          <div className="snapshot-summary"><span>관찰 이벤트 <b>{snapshot.dashboard.total}건</b></span><span>주의 <b>{snapshot.dashboard.attention}건</b></span></div>
          <div className="snapshot-toolbar">
            {pngUrl && <a className="button" href={pngUrl} download={`snapshot-${snapshot.snapshotId}.png`}>캡처 다운로드</a>}
            {!analysis && <button disabled={busy} onClick={() => void run(snapshot)}>같은 데이터로 다시 분석</button>}
          </div>
          {pngUrl && <details className="analysis-image-preview"><summary>분석에 사용한 화면</summary><img src={pngUrl} alt="분석에 전송한 고정 대시보드 캡처" /></details>}
          <details className="snapshot-metadata"><summary>스냅샷 정보</summary><p className="mono">{snapshot.snapshotId}</p>{imageSha && <p className="mono">SHA-256 {imageSha}</p>}</details>
        </div>
      )}
      {snapshot && createPortal(
        <div className="snapshot-capture-stage" aria-hidden="true">
          <SnapshotView snapshot={snapshot} ref={captureRef} />
        </div>, document.body,
      )}
    </section>
  );
}
