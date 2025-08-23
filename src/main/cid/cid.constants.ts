/**
 * CID 기기 프로토콜 정의
 * --
 */
export const STX = '\x02';              // 02H: 시작 (1byte)
export const ETX = '\x03';              // 03H: 끝  (1byte)

export const FRAME_BODY_LEN = 20;       // Total 20(22 - 1 - 1) byte 통신

/** CID 프로토콜 명령어 */
export const OPCODE = {

    /* ===== 장비 ID 확인 ===== */
    // 요청 및 응답 프로토콜 명령어가 'P'로 동일하여, 구분 불가
    DEVICE_INFO: 'P',                       // 장치 정보 요청 및 응답 (PC → 장치) 및 (장치 → PC)

    /* ===== 수신호 처리 Protocol ===== */
    INCOMING: 'I',                          // 수신 전화        (장치 → PC)
    PRIVATE: 'P',                           // 발신번호표시 금지  (payload='P')
    PUBLIC: 'C',                            // 공중전화         (payload='C')
    UNKNOWN: 'O',                           // 발신번호 수집불가  (payload='O')
    
    /* ===== 발신호 처리 Protocol ===== */
    DIAL_OUT: 'O',                          // 발신 요청  (PC → 장치)
    DIAL_COMPLETE: 'K',                     // 다이얼 완료 (장치 → PC)
    FORCED_END: 'F',                        // 강제 종료  (PC → 장치)

    /* ===== 수화기 처리 Protocol ===== */
    OFF_HOOK: 'S',                          // 수화기 들음
    ON_HOOK: 'E',                           // 수화기 내려놓음
} as const;

export type Opcode = typeof OPCODE[keyof typeof OPCODE];

export const BAUD_RATE = 19200;