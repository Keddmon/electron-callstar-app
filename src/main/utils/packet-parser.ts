import { STX, ETX, FRAME_BODY_LEN, CHANNEL } from '../constants/callstar.constant';
// import { OPCODE } from '../constants/callstar.constant';
import { logger } from '../logs';

export const makePacket = (opcode: string, payload = ''): string => {
  let body = `${CHANNEL}${opcode}${payload}`;

  if (body.length > FRAME_BODY_LEN) {
    logger.warn(`[PacketParser][makePacket] 패킷의 body가 너무 깁니다. OPCODE: ${opcode}`, {
      originalLength: body.length,
      maxLength: FRAME_BODY_LEN,
    });
    body = body.slice(0, FRAME_BODY_LEN);
  } else {
    body = body.padEnd(FRAME_BODY_LEN, ' ');
  }

  const packet = `${STX}${body}${ETX}`;
  logger.debug(`[PacketParser][makePacket]: ${packet}`);

  return packet;
}

export const parsePacket = (raw: string) => {
  logger.debug(`[PacketParser][parsePacket] raw: `, { raw });

  if (!raw.startsWith(STX)) {
    logger.warn(`[PacketParser][parsePacket] 실패: STX 없음`, { raw });
    return null;
  }
  if (!raw.endsWith(ETX)) {
    logger.warn(`[PacketParser][parsePacket] 실패: ETX 없음`, { raw });
    return null;
  }

  const body = raw.slice(1, -1);
  if (body.length !== FRAME_BODY_LEN) {
    logger.warn(`[PacketParser][parsePacket] 실패: body가 너무 긺`, {
      expected: FRAME_BODY_LEN,
      actual: body.length,
      raw,
    });
    return null;
  }

  const channel = body[0];
  const opcode = body[1];
  const payload = body.slice(2).trim();
  logger.debug(`[PacketParser][parsePacket] 성공: `, { channel, opcode, payload });

  return {
    channel,
    opcode,
    payload,
    raw,
  };
}