import type { Event } from '../types';

export function describeEvent(event: Event): string {
  const process = event.process.binary?.split('/').filter(Boolean).at(-1) || '프로세스';
  switch (event.eventType) {
    case 'PROCESS_EXEC':
      return `${process} 프로세스가 실행됐습니다.`;
    case 'PROCESS_EXIT':
      return `${process} 프로세스가 종료됐습니다.`;
    case 'FILE_ACCESS': {
      const target = event.file?.path || event.target;
      const operation = event.file?.operation;
      const action = operation === 'read' ? '읽기' : operation === 'write' ? '쓰기' : '접근';
      return `${process}의 ${target ? `${target} 파일 ` : '파일 '}${action} 동작이 관찰됐습니다.`;
    }
    case 'NETWORK': {
      const ip = event.network?.destinationIp || event.network?.sourceIp;
      const port = event.network?.destinationIp ? event.network.destinationPort : event.network?.sourcePort;
      const target = ip ? `${ip}${port ? `:${port}` : ''}` : event.target;
      return `${process}에서 ${target ? `${target} 대상 ` : ''}네트워크 활동이 관찰됐습니다.`;
    }
    default:
      return `${process}의 런타임 활동이 관찰됐습니다.`;
  }
}
