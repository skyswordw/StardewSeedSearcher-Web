export function updateAt<T>(items: T[], setItems: (items: T[]) => void, index: number, patch: Partial<T>) {
  setItems(items.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)))
}

export function removeAt<T>(items: T[], setItems: (items: T[]) => void, index: number) {
  setItems(items.filter((_, itemIndex) => itemIndex !== index))
}
