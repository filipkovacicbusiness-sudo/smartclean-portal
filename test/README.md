# Testi

Portal nima gradnje ne testnega ogrodja, zato so testi navadne skripte za node
— brez odvisnosti. Funkcije iz velike IIFE v `portal.js` izluščijo po imenu in
jih poženejo z nadomestki za okolje.

```bash
node test/ucSerija.test.js
```

Pokriva datumsko logiko grafa na Statistiki: dolžine mesecev (tudi prestopni
februar), prelom leta pri »Vse«, poravnavo tednov na ponedeljek pri »3 meseci«
in to, da noben spremni list ni štet dvakrat.
