# Paper Trading Simulator

Mokomoji svetainė, kurioje galima praktikuotis prekiauti be tikrų pinigų. Šaka `feature/frontend` turi pradinį ekraną: antraštę, navigaciją ir tris tuščias darbo vietas.

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
