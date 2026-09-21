import { filter, type OperatorFunction } from "rxjs";

export function filterByType<T extends string, P extends { type: string } = { type: string }>(
  type: T,
): OperatorFunction<P, P & { type: T }> {
  return filter((packet): packet is P & { type: T } => packet.type === type);
}
