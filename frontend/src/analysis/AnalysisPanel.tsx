import { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { ApiError, api, describeError } from '../api';
import { dateTime, selectionFilters, type Analysis, type Selection, type Snapshot } from '../types';
import { SnapshotView } from './SnapshotView';

type Props = {
  selection: Selection;
  onBusy: (busy: boolean) => void;
  onResult: (result: Analysis | undefined) => void;
};
const storedId = () => new URLSearchParams(window.location.search).get('snapshot');
export default function AnalysisPanel({ selection, onBusy, onResult }: Props) {
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
        const filters = selectionFilters(selection);
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
          <p className="eyebrow">SNAPSHOT ANALYSIS</p>
          <h2 id="analysis-title">한 시점에 고정해서, 함께 살펴보기</h2>
        </div>
        <button className="primary" disabled={busy} onClick={() => void run()}>
          스냅샷 생성 · AI 분석
        </button>
      </div>
      <p className="notice">
        현재 적용한 기간·필터로 고정합니다. 안전한 이벤트 요약·전체 집계·기간·출처와 아래 고정 영역
        PNG를 서버를 통해 외부 AI에 전송합니다. 원본·명령 인자·프로세스 경로는 제외합니다.
      </p>
      <form
        className="restore"
        onSubmit={(e) => {
          e.preventDefault();
          void restore(restoreId);
        }}
      >
        <label htmlFor="snapshot-id">저장한 스냅샷</label>
        <input
          id="snapshot-id"
          placeholder="스냅샷 UUID"
          value={restoreId}
          onChange={(e) => setRestoreId(e.target.value)}
          disabled={busy}
        />
        <button disabled={busy || !restoreId}>불러오기</button>
      </form>
      {busy && (
        <p className="status-line" role="status">
          <span className="spinner" />
          {step} 선택 변경과 중복 요청은 잠시 잠깁니다.
        </p>
      )}
      {error && (
        <div role="alert" className="error-banner">
          <b>분석 흐름이 중단되었습니다.</b>
          <p>{error}</p>
          <p>고정 데이터는 유지됩니다. 캡처·업로드 실패 시 AI는 호출하지 않습니다.</p>
        </div>
      )}
      {snapshot ? (
        <>
          <div className="snapshot-toolbar">
            <span>라이브 폴링과 분리된 고정 영역 · 너비 1100px</span>
            <div>
              {pngUrl && (
                <a
                  className="button"
                  href={pngUrl}
                  download={`snapshot-${snapshot.snapshotId}.png`}
                >
                  PNG 다운로드
                </a>
              )}
              {!analysis && (
                <button disabled={busy} onClick={() => void run(snapshot)}>
                  같은 스냅샷 분석 재시도
                </button>
              )}
            </div>
          </div>
          <div className="snapshot-scroll">
            <SnapshotView snapshot={snapshot} ref={captureRef} />
          </div>
          {imageSha && <p className="hint mono">업로드 이미지 SHA-256 · {imageSha}</p>}
        </>
      ) : (
        <div className="empty panel">
          기간을 선택하고 스냅샷을 생성하세요. 고정 데이터와 캡처를 만든 뒤 분석합니다.
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
          <p className="hint">
            분석 {analysis.analysisId} · 지침 {analysis.instructionVersion} · 판단을 돕는 자료이며
            명령이나 정책을 실행하지 않습니다.
          </p>
        </div>
      )}
    </section>
  );
}
