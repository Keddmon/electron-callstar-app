import { CidAdapter } from '../cid/cid.adapter';
import { settingsStore } from '../state/settings-store';

type ReconnectState = {
    enabled: boolean;
    timer?: NodeJS.Timeout;
    delayMs: number;
};

export class AutoReconnectService {
    private state: ReconnectState = { enabled: false, delayMs: 3000 };

    constructor(private adapter: CidAdapter) {
        // 어댑터 상태/이벤트를 보고 끊김 감지
        this.adapter.on('status', (s) => {
            // 포트 닫힘/오류 후 자동 재연결 스케줄
            if (!s.isOpen && this.state.enabled) {
                this.schedule();
            }
        });
        this.adapter.on('event', (evt: any) => {
            if (evt?.type === 'port:closed' && this.state.enabled) {
                this.schedule();
            }
        });

        // 설정 기반으로 초기 상태 동기화
        const { cid } = settingsStore.get();
        if (cid.autoReconnect) this.enable();
    }

    enable() {
        this.state.enabled = true;
    }
    disable() {
        this.state.enabled = false;
        if (this.state.timer) {
            clearTimeout(this.state.timer);
            this.state.timer = undefined;
        }
    }
    isEnabled() {
        return this.state.enabled;
    }

    private schedule() {
        if (this.state.timer) return;
        this.state.timer = setTimeout(async () => {
            this.state.timer = undefined;
            const st = settingsStore.get();
            const path = st.cid.lastPortPath;
            const baud = st.cid.baudRate ?? 19200;
            if (!path) return;

            try {
                await this.adapter.open({ path, baudRate: baud });
            } catch (e) {
                // 실패하면 다음 시도 예약(간단한 고정 backoff)
                this.schedule();
            }
        }, this.state.delayMs);
    }
}