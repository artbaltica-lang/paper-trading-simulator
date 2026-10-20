# Bendrų duomenų formatų sutartis

Šiuos formatus naudoja grafikų karkasas. Ekranų failo `src/App.jsx` ši sutartis nekeičia. Kiekvienas žmogus rašo tik savo failuose, o sujungimas vyksta per GitHub pull request į `main`.

## Failai

| Kas | Failai |
|---|---|
| 1 žmogus, ekranai ir akcijos forma | `src/App.jsx`, `src/App.css` |
| 2 žmogus, lentelės ir kainos funkcija | Supabase lentelės ir serverinė funkcija |
| 3 žmogus, grafikai ir formatai | `src/components/charts/`, `src/contracts/formats.js`, `docs/data-contract.md` |

3 žmogaus šaka: `natalija`.

## Eiga

1. Trade formoje 1 žmogus perduoda pasirinkimą `{ "symbol": "AAPL" }`.
2. 2 žmogaus serverinė funkcija pagal simbolį grąžina vieną kainą. Tiekėjo raktas į naršyklę nepatenka.
3. Iš kainos atsakymo funkcija `priceQuoteToPoint` padaro tašką. Keli taškai sudaro `PriceSeries`.
4. `PriceChart` rodo šią seriją Trade ekrane.
5. Lentelės `snapshots` eilutę funkcija `snapshotToPoint` paverčia tašku. Taškai sudaro `PortfolioSeries`.
6. `ValueChart` rodo šią seriją Portfolio ir History / Stats ekranuose.

`watchlist`, `transactions` ir `positions` grafikams šioje sesijoje nereikalingi.

## Akcijos pasirinkimas

```json
{ "symbol": "AAPL" }
```

`symbol` yra nuo 1 iki 12 simbolių: didžiosios raidės, skaitmenys, taškas arba brūkšnys.

## Kainos atsakymas

```json
{
  "symbol": "AAPL",
  "price": 189.25,
  "currency": "USD",
  "time": "2026-10-19T17:00:00.000Z"
}
```

`price` yra teigiamas skaičius. `currency` yra trys didžiosios raidės. `time` yra data.

## PriceSeries

```json
{
  "symbol": "AAPL",
  "currency": "USD",
  "points": [
    { "time": "2026-10-19T16:00:00.000Z", "price": 188.8 },
    { "time": "2026-10-19T17:00:00.000Z", "price": 189.25 }
  ]
}
```

Taškai eina laiku nuo ankstyvesnio iki vėlesnio. Tuščias `points` masyvas yra leistinas: grafikas tada rodo tuščią būseną.

## snapshots eilutė ir PortfolioSeries

Grafikui iš `snapshots` reikia dviejų laukų: `captured_at` ir `total_value`.

```json
{ "captured_at": "2026-10-19T17:00:00.000Z", "total_value": 10000 }
```

`snapshotToPoint` iš jų padaro `{ "time": "...", "value": 10000 }`.

```json
{
  "currency": "USD",
  "points": [
    { "time": "2026-10-18T17:00:00.000Z", "value": 10000 },
    { "time": "2026-10-19T17:00:00.000Z", "value": 10040.5 }
  ]
}
```

`value` gali būti nulis. Kitos `snapshots` reikšmės grafikui netrukdo, jei šie du laukai lieka.

## Trys 5 etapo grafikai

2 žmogaus API jau grąžina tuos pačius `points`. 3 žmogaus komponentai skaito juos patys. Ekranų failų šie komponentai nekeičia: 1 žmogus juos įdeda į savo ekraną.

| Grafikas | API | Komponentas |
|---|---|---|
| Akcijos kaina | `GET /api/prices?symbol=AAPL` | `LivePriceChart` |
| Portfelio vertė | `GET /api/history` | `LiveValueChart` |
| Pelnas / nuostolis | `GET /api/history/profit-loss` | `LiveProfitLossChart` |

Kainų taško `time` gali būti diena `2026-10-16`. Komponentas iš jos padaro `2026-10-16T00:00:00.000Z`. P/L taško `value` gali būti neigiamas, todėl jam yra atskira `ProfitLossChart` serija. Portfelio vertės `value` lieka nulis arba teigiamas skaičius.

Vertės ir P/L užklausoms reikia prisijungusio vartotojo tokeno. Kainų užklausai tokeno nereikia.

```jsx
import { LivePriceChart, LiveProfitLossChart, LiveValueChart } from './components/charts'

<LivePriceChart key={symbol} symbol={symbol} />
<LiveValueChart token={accessToken} />
<LiveProfitLossChart token={accessToken} />
```

## Prijungimas

1 žmogus savo ekrane importuoja karkasą ir perduoda jau sutarties formos duomenis:

```jsx
import { PriceChart, ValueChart } from './components/charts'

<PriceChart series={priceSeries} />
<ValueChart series={portfolioSeries} />
```

Jei formatas netinka, grafikas nerodo linijos ir parašo pirmą sutarties klaidą.

## Patikra

Iš aplanko `paper-trading-simulator`:

```bash
node scripts/check-integration.mjs
```

Komanda patikrina pavyzdžius, blogų reikšmių atmetimą ir abu perėjimus: kainos atsakymą į tašką bei `snapshots` eilutę į tašką.
