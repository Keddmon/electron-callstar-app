// import { CidAdapter } from '../cid/cid.adapter';
// import { settingsStore } from '../state/settings-store';
// import logger from '../logs/logger';

// const INITIAL_DELAY_MS = 3000;
// const MAX_DELAY_MS = 60000; // 1분

// type ReconnectState = {
//     enabled: boolean;
//     timer?: NodeJS.Timeout;
//     retries: number;
// };

// export class AutoReconnectService {
//     private state: ReconnectState = { enabled: false, retries: 0 };

//     constructor(private adapter: CidAdapter) {
//         // 어댑터 상태/이벤트를 보고 끊김 감지
//         this.adapter.on('status', (s) => {
//             if (s.isOpen) {
//                 // 연결 성공 시 재시도 횟수 초기화
//                 this.state.retries = 0;
//                 logger.info('[reconnect] Port opened successfully, auto-reconnect reset.');
//             } else if (this.state.enabled) {
//                 // 포트 닫힘/오류 후 자동 재연결 스케줄
//                 this.schedule();
//             }
//         });

//         this.adapter.on('event', (evt: any) => {
//             if (evt?.type === 'port:closed' && this.state.enabled) {
//                 this.schedule();
//             }
//         });

//         // 설정 기반으로 초기 상태 동기화
//         const { cid } = settingsStore.get();
//         if (cid.autoReconnect) this.enable();
//     }

//     enable() {
//         this.state.enabled = true;
//         logger.info('[reconnect] Auto-reconnect enabled.');
//     }

//     disable() {
//         this.state.enabled = false;
//         if (this.state.timer) {
//             clearTimeout(this.state.timer);
//             this.state.timer = undefined;
//         }
//         this.state.retries = 0;
//         logger.info('[reconnect] Auto-reconnect disabled.');
//     }

//     isEnabled() {
//         return this.state.enabled;
//     }

//     private schedule() {
//         if (this.state.timer) return;

//         // Exponential backoff 계산
//         const delay = Math.min(INITIAL_DELAY_MS * Math.pow(2, this.state.retries), MAX_DELAY_MS);
//         logger.info(`[reconnect] Scheduling reconnect attempt #${this.state.retries + 1} in ${delay}ms`);

//         this.state.timer = setTimeout(async () => {
//             this.state.timer = undefined;
//             const st = settingsStore.get();
//             const path = st.cid.lastPortPath;
//             const baud = st.cid.baudRate ?? 19200;
//             if (!path) {
//                 logger.warn('[reconnect] No last port path found, skipping reconnect.');
//                 return;
//             }

//             try {
//                 await this.adapter.open({ path, baudRate: baud });
//                 // 성공 시 retries는 status 이벤트 핸들러에서 초기화됨
//             } catch (e) {
//                 // 실패하면 재시도 횟수 증가 후 다음 시도 예약
//                 this.state.retries++;
//                 this.schedule();
//             }
//         }, delay);
//     }
// }
