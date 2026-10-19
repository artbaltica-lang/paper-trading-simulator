# Pirmas sandorio kelias

Virtualus pirkimas ir pardavimas keičia tris vietas: balansą, poziciją ir sandorių istoriją. Tikri pinigai čia nenaudojami.

Šiuos skaičius tikrina `scripts/trade-path.test.mjs`. Ekranų failas `src/App.jsx` nekeičiamas. Kai 2 žmogus prijungs lenteles, tie patys skaičiai turi atsirasti bazėje.

## Laukai

| Vieta | Laukai |
|---|---|
| Balansas | `balance` |
| Pozicija | `symbol`, `quantity`, `avg_price` |
| Sandoris | `symbol`, `side`, `quantity`, `price`, `total`, `time` |

`side` yra `buy` arba `sell`. `total` visada teigiamas: kiekis padaugintas iš kainos. Pirkimas balansą sumažina, pardavimas padidina. Vidutinė kaina keičiasi tik perkant. Jei po pardavimo kiekis tampa 0, pozicija dingsta. Per didelis pirkimas ar pardavimas nieko nekeičia.

## Automatinė patikra

Iš aplanko `paper-trading-simulator`:

```bash
node --test scripts/trade-path.test.mjs
```

## Rankinis kelias

Pradinė būsena: balansas `10000`, pozicijų nėra, istorija tuščia.

1. Nupirkti `10` vienetų `AAPL` po `100`. Balansas turi būti `9000`. Pozicija: kiekis `10`, vidutinė kaina `100`. Istorijoje vienas sandoris `buy`, suma `1000`.
2. Parduoti `4` vienetus `AAPL` po `110`. Balansas turi būti `9440`. Pozicija: kiekis `6`, vidutinė kaina lieka `100`. Istorijoje du sandoriai, antras yra `sell`, suma `440`.

Bazėje po šių dviejų žingsnių turi pasikeisti balanso laukas, pozicijos eilutė ir dvi sandorių eilutės. Joks kitas simbolis neturi atsirasti.
