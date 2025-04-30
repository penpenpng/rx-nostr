export class SetOp {
  static union<T>(...sets: Set<T>[]): Set<T> {
    return sets.reduce((acc, set) => acc.union(set), new Set<T>());
  }

  static intersection<T>(...sets: Set<T>[]): Set<T> {
    return sets.reduce((acc, set) => acc.intersection(set), new Set<T>());
  }
}
