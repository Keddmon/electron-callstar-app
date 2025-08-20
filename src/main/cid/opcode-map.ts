/**
 * opcode-map.ts
 * ---
 * opcode -> 비즈 이벤트 맵핑(I/S/E/F/P/K)
 */

export const STX = '\x02';
export const ETX = '\x03';

export const FRAME_BODY_LEN = 21;

export type Opcode = 
    | 'P' // 장비 정보 요청/응답

    | 'I' // incoming

    | 'O' // dial out (PC->장치), 또는 'I'일 때 payload = 'O'는 "번호수집불가"
    | 'K' // 다이얼 완료(장치->PC)
    | 'F' // 발신 강제종료(PC->장치)

    | 'S' // 수화기 들림(장치->PC)
    | 'E' // 수화기 내려놓음(장치->PC)
    ;

export const MASK_PAYLOAD = {
    PRIVATE: 'P',   // 발신번호표시 금지
    PUBLIC: 'C',    // 공중전화
    UNKNOWN: 'O',   // 발신번호 수집불가
} as const;

export const BAUD_RATE = 19200;