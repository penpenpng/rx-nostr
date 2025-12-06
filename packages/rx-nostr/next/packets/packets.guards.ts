import type {
  AuthPacket,
  ClosedPacket,
  CountPacket,
  EosePacket,
  EventPacket,
  MessagePacket,
  NoticePacket,
  OkPacket,
} from "./packets.interface.ts";

export function isEventPacket(packet: MessagePacket): packet is EventPacket {
  return packet.type === "EVENT";
}

export function isEosePacket(packet: MessagePacket): packet is EosePacket {
  return packet.type === "EOSE";
}

export function isClosedPacket(packet: MessagePacket): packet is ClosedPacket {
  return packet.type === "CLOSED";
}

export function isOkPacket(packet: MessagePacket): packet is OkPacket {
  return packet.type === "OK";
}

export function isNoticePacket(packet: MessagePacket): packet is NoticePacket {
  return packet.type === "NOTICE";
}

export function isAuthPacket(packet: MessagePacket): packet is AuthPacket {
  return packet.type === "AUTH";
}

export function isCountPacket(packet: MessagePacket): packet is CountPacket {
  return packet.type === "COUNT";
}
