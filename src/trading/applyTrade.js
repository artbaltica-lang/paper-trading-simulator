import { checkSymbolChoice } from '../contracts/formats.js'

function roundMoney(value) {
  return Math.round(value * 100) / 100
}

function roundQuantity(value) {
  return Math.round(value * 1e6) / 1e6
}

function isTime(value) {
  return typeof value === 'string' && value.trim() !== '' && !Number.isNaN(Date.parse(value))
}

function copyState(state) {
  return {
    balance: state.balance,
    positions: state.positions.map((row) => ({ ...row })),
    transactions: state.transactions.map((row) => ({ ...row })),
  }
}

export function createAccount(balance) {
  return { balance, positions: [], transactions: [] }
}

export function applyTrade(state, order) {
  const errors = []
  if (!state || !Number.isFinite(state.balance) || !Array.isArray(state.positions) || !Array.isArray(state.transactions)) {
    return { ok: false, errors: ['Sąskaita turi turėti balansą, pozicijas ir sandorių istoriją.'], state }
  }
  if (!order || (order.side !== 'buy' && order.side !== 'sell')) errors.push('side turi būti buy arba sell.')
  const symbolCheck = checkSymbolChoice({ symbol: order?.symbol })
  if (!symbolCheck.ok) errors.push(symbolCheck.errors[0])
  if (!Number.isFinite(order?.quantity) || order.quantity <= 0) errors.push('quantity turi būti teigiamas skaičius.')
  if (!Number.isFinite(order?.price) || order.price <= 0) errors.push('price turi būti teigiamas skaičius.')
  if (!isTime(order?.time)) errors.push('time turi būti data.')
  if (errors.length > 0) return { ok: false, errors, state }

  const total = roundMoney(order.quantity * order.price)
  const next = copyState(state)
  const position = next.positions.find((row) => row.symbol === order.symbol)

  if (order.side === 'buy') {
    if (total > next.balance) return { ok: false, errors: ['Balanso neužtenka.'], state }
    next.balance = roundMoney(next.balance - total)
    if (!position) {
      next.positions.push({ symbol: order.symbol, quantity: order.quantity, avg_price: order.price })
    } else {
      const quantity = roundQuantity(position.quantity + order.quantity)
      position.avg_price = roundMoney((position.quantity * position.avg_price + total) / quantity)
      position.quantity = quantity
    }
  } else if (!position || order.quantity > position.quantity) {
    return { ok: false, errors: ['Pozicijos neužtenka.'], state }
  } else {
    next.balance = roundMoney(next.balance + total)
    position.quantity = roundQuantity(position.quantity - order.quantity)
    if (position.quantity === 0) {
      next.positions = next.positions.filter((row) => row.symbol !== order.symbol)
    }
  }

  next.transactions.push({
    symbol: order.symbol,
    side: order.side,
    quantity: order.quantity,
    price: order.price,
    total,
    time: order.time,
  })

  return { ok: true, errors: [], state: next }
}
