# Paper Trading Simulator

Mokomoji svetainė, kurioje galima praktikuotis prekiauti be tikrų pinigų. Šaka `feature/frontend` turi pradinį ekraną: antraštę, navigaciją ir tris tuščias darbo vietas.

Svetainė: https://paper-trading-simulator-six.vercel.app/

Duomenų bazės, kainų ir sandorių šioje šakoje dar nėra. Ženklelis SIMULATION rodo, kad tai tik praktika.

## Kas jau yra

- Pavadinimas Paper Trading Simulator ir ženklelis SIMULATION.
- Trys ekranai: Portfolio, Trade ir History / Stats.
- Kiekviename ekrane trumpas aprašymas ir tuščia būsena su užrašu Coming soon.
- Navigacija telefone yra apačioje, platesniame ekrane — po antrašte.

## Technologijos

- React 19
- Vite 8
- JavaScript

## Paleidimas

Komandos vykdomos aplanke `paper-trading-simulator`.

```bash
npm install
npm run dev
```

Svetainė atsidaro adresu, kurį parodo Vite. Paprastai tai http://localhost:5173/

Kitos komandos:

- `npm run build` — surinkti versiją aplanke `dist`
- `npm run preview` — atidaryti surinktą versiją
- `npm run lint` — patikrinti kodą

## Grafikų karkasas

Grafikai yra aplanke `src/components/charts`. Bendras duomenų formatas aprašytas [docs/data-contract.md](docs/data-contract.md).

```bash
node scripts/check-integration.mjs
```

`PriceChart` skirtas Trade ekranui, `ValueChart` — Portfolio ir History / Stats. Ekranų failo `src/App.jsx` šis karkasas nekeičia: 1 žmogus prijungia komponentus importu, kai turės formą ir duomenis.

## Sandorio kelias

Virtualaus pirkimo ir pardavimo taisyklės yra `src/trading/applyTrade.js`. Jos keičia balansą, poziciją ir sandorių istoriją. Patikra aprašyta [docs/trade-tests.md](docs/trade-tests.md).

```bash
node --test scripts/trade-path.test.mjs
```
