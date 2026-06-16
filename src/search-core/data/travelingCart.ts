import rawCartData from './TravelingCartData.json'

export interface RawCartItem {
  Id: string
  Name: string
  Type: string
  Category: number
  Price: number
  OffLimits: boolean
}

export interface SearchableCartItem {
  name: string
  price: number
  isEligible: boolean
}

export const skillBooks = ['星露谷年历', '鱼饵和浮漂', '樵夫周刊', '采矿月刊', '战斗季刊']
export const skillBookSet = new Set(skillBooks)

function parseInSourceOrder(data: Record<string, RawCartItem>): RawCartItem[] {
  return Object.values(data)
}

export const rawCartItems = parseInSourceOrder(rawCartData as Record<string, RawCartItem>)

export const optimizedCartItems: SearchableCartItem[] = rawCartItems.map((item) => {
  const id = Number.parseInt(item.Id, 10)
  const isEligible =
    Number.isFinite(id) &&
    id >= 2 &&
    id <= 789 &&
    item.Price > 0 &&
    !item.OffLimits &&
    (item.Category < 0 || item.Category === -999) &&
    item.Type !== 'Arch' &&
    item.Type !== 'Minerals' &&
    item.Type !== 'Quest'

  return {
    name: item.Name,
    price: item.Price,
    isEligible,
  }
})

export const allCartItemNames = Array.from(
  new Set([...optimizedCartItems.filter((item) => item.isEligible).map((item) => item.name), ...skillBooks]),
).sort((a, b) => a.localeCompare(b, 'zh-CN'))
