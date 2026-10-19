import {
  checkPortfolioSeries,
  checkPriceQuote,
  checkPriceSeries,
  checkSymbolChoice,
  examples,
  priceQuoteToPoint,
  snapshotToPoint,
} from '../src/contracts/formats.js'

const steps = [
  '1. Trade forma perduoda { symbol }.',
  '2. Serverinė kainos funkcija grąžina { symbol, price, currency, time }. Raktas lieka serveryje.',
  '3. priceQuoteToPoint padaro tašką { time, price }, iš jų susidaro PriceSeries.',
  '4. PriceChart rodo PriceSeries Trade ekrane.',
  '5. snapshots eilutė { captured_at, total_value } per snapshotToPoint tampa { time, value }.',
  '6. ValueChart rodo PortfolioSeries Portfolio ir History / Stats ekranuose.',
]

const checks = [
  ['akcijos pasirinkimas', checkSymbolChoice(examples.symbolChoice)],
  ['kainos atsakymas', checkPriceQuote(examples.priceQuote)],
  ['kainos serija', checkPriceSeries(examples.priceSeries)],
  ['portfelio serija', checkPortfolioSeries(examples.portfolioSeries)],
  ['blogas simbolis turi nepraeiti', invert(checkSymbolChoice({ symbol: 'aapl' }))],
  ['neigiama kaina turi nepraeiti', invert(checkPriceQuote({ ...examples.priceQuote, price: -1 }))],
]

const quotePoint = priceQuoteToPoint(examples.priceQuote)
const snapshotPoint = snapshotToPoint(examples.snapshotRow)
const mappedQuote = quotePoint.time === examples.priceQuote.time && quotePoint.price === examples.priceQuote.price
const mappedSnapshot = snapshotPoint.time === examples.snapshotRow.captured_at
  && snapshotPoint.value === examples.snapshotRow.total_value

console.log('Integravimo eiga')
steps.forEach((step) => console.log(step))
console.log('')

let failed = !mappedQuote || !mappedSnapshot
checks.forEach(([name, check]) => {
  const mark = check.ok ? 'gerai' : 'klaida'
  console.log(`${mark}: ${name}`)
  check.errors.forEach((error) => console.log(`  ${error}`))
  if (!check.ok) failed = true
})

if (!mappedQuote) console.log('klaida: priceQuoteToPoint neatitinka sutarties.')
if (!mappedSnapshot) console.log('klaida: snapshotToPoint neatitinka sutarties.')

if (failed) {
  console.log('Patikra nepraėjo.')
  process.exit(1)
}

console.log('Patikra praėjo. Grafikai lieka src/components/charts, ekranų failai neliečiami.')

function invert(check) {
  return check.ok
    ? { ok: false, errors: ['Turėjo būti atmesta, bet praėjo.'] }
    : { ok: true, errors: [] }
}
