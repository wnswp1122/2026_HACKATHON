import { useEffect, useState } from 'react';
export const routes = [
  { path: '/overview', label: '보안 개요', node: '387:2' },
  { path: '/incidents', label: '보안 사고', node: '319:2' },
  { path: '/servers', label: '서버 보안 대시보드', node: '387:1158' },
  { path: '/telemetry', label: '텔레메트리 탐색기', node: '387:777' },
  { path: '/replay', label: '관찰 활동 리플레이', node: '387:215' },
  { path: '/readiness', label: '수집·정책 준비 점검', node: '387:462' },
] as const;
function currentPath() {
  const url = new URL(location.href);
  const legacy: Record<string, string> = {
    '#overview': '/overview',
    '#events': '/telemetry',
    '#analysis': '/overview',
  };
  if (url.pathname === '/' || legacy[url.hash]) {
    if (url.hash === '#analysis') url.searchParams.set('analysis', 'open');
    url.pathname = legacy[url.hash] || '/overview';
    url.hash = '';
    history.replaceState(null, '', url);
  }
  return url.pathname.replace(/\/$/, '') || '/overview';
}
export function useNavigation() {
  const [path, setPath] = useState(currentPath);
  useEffect(() => {
    const pop = () => setPath(currentPath());
    window.addEventListener('popstate', pop);
    window.addEventListener('hashchange', pop);
    return () => {
      window.removeEventListener('popstate', pop);
      window.removeEventListener('hashchange', pop);
    };
  }, []);
  function navigate(target: string) {
    const url = new URL(target, location.origin),
      current = new URL(location.href);
    for (const name of ['snapshot', 'replay'])
      if (!url.searchParams.has(name) && current.searchParams.has(name))
        url.searchParams.set(name, current.searchParams.get(name)!);
    history.pushState(null, '', url);
    setPath(currentPath());
    window.scrollTo(0, 0);
  }
  return { path, navigate };
}
