# Paper Trading Simulator

Mokomoji svetainė, kurioje galima praktikuotis pirkti ir parduoti akcijas virtualiais pinigais. Tai nėra tikri pinigai ir ne tikra birža.

Svetainė: https://paper-trading-simulator-six.vercel.app/

Prisijungus matomi trys ekranai: Portfolio, Trade ir History / Stats. Ženklelis SIMULATION rodo, kad tai tik praktika. Pradinis virtualus balansas yra 10 000 USD. Galimos akcijos: AAPL, MSFT ir TSLA.

## Kas veikia

- Įėjimas ir registracija per Supabase.
- Portfolio rodo grynuosius pinigus, portfelio vertę, pelną arba nuostolį ir turimas pozicijas.
- Trade leidžia pateikti virtualų BUY arba SELL. Kainą ir galutinę sumą patikrina serveris.
- History / Stats rodo sandorių sąrašą ir portfelio pelno arba nuostolio grafiką.
- Akcijos kainos grafikas Trade ekrane skaito `GET /api/prices`.
- Po perkrovimo sandoriai lieka, nes jie įrašyti į duomenų bazę.

Telefone navigacija yra apačioje, platesniame ekrane — po antrašte.

## Technologijos

- React 19
- Vite 8
- JavaScript
- Supabase
- Vercel

Serverio funkcijos yra aplanke `api/`. Naršyklė nemato Alpha Vantage ir Supabase paslaugos raktų.

## Paleidimas

Komandos vykdomos aplanke `paper-trading-simulator`.

```bash
npm install
npm run dev
```

`npm run dev` atidaro tik svetainės vaizdą, paprastai http://localhost:5173/. Šiuo adresu `/api` negrąžina JSON.

Svetainei kartu su serverio funkcijomis:

```bash
npx vercel dev
```

Atidaryti reikia adreso, kurį parodo ši komanda, ne `localhost:5173`.

Kitos komandos:

- `npm run build` — surinkti versiją aplanke `dist`
- `npm run preview` — atidaryti surinktą versiją
- `npm run lint` — patikrinti kodą

Vietiniam įėjimui naršyklei reikia `VITE_SUPABASE_URL` ir `VITE_SUPABASE_PUBLISHABLE_KEY`. Serveriui reikia `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` ir `ALPHA_VANTAGE_API_KEY`. Raktų į šį failą nerašome.

## Grafikai

Grafikai yra aplanke `src/components/charts`. Duomenų formatas aprašytas [docs/data-contract.md](docs/data-contract.md).

| Grafikas | Adresas | Komponentas |
|---|---|---|
| Akcijos kaina | `GET /api/prices?symbol=AAPL` | `LivePriceChart` |
| Portfelio vertė | `GET /api/history` | `LiveValueChart` |
| Pelnas / nuostolis | `GET /api/history/profit-loss` | `LiveProfitLossChart` |

```bash
node scripts/check-integration.mjs
node --test scripts/chart-series.test.mjs
```

## Sandoriai

Virtualaus pirkimo ir pardavimo taisyklės yra `src/trading/applyTrade.js`. Jos aprašytos [docs/trade-tests.md](docs/trade-tests.md). Serverio sandoris yra `POST /api/trade`.

```bash
node --test scripts/trade-path.test.mjs
node --test scripts/api-trade.test.mjs
```
