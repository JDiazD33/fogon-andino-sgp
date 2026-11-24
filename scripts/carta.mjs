/* Genera CARTA.md desde catalog.mjs: platos por categoría con precio por sede,
   tiempo de preparación, ruta de la foto e ingredientes por porción, y la lista
   de insumos con existencias y stock mínimo. Uso: npm run carta */

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dishImage, ingredientGroups, ingredients, menu } from '../catalog.mjs';

const byId = new Map(ingredients.map((item) => [item.id, item]));
const soles = (cents) => `S/ ${(cents / 100).toFixed(2)}`;
const amount = (quantity, unit) => (quantity >= 1000
  ? `${(quantity / 1000).toLocaleString('es-PE', { maximumFractionDigits: 2 })} ${unit === 'g' ? 'kg' : 'L'}`
  : `${quantity} ${unit}`);
const sites = ['Miraflores', 'San Isidro'];

const lines = [
  '# Carta de Fogón Andino',
  '',
  `Se genera desde [\`catalog.mjs\`](./catalog.mjs) con \`npm run carta\`. ${menu.length} platos y ${ingredients.length} insumos; datos ficticios de la demo.`,
  'Las fotos están en `public/img/platos/` y la web las sirve en la ruta indicada.',
  '',
];

for (const category of ['Fondos', 'Entradas', 'Bebidas', 'Postres']) {
  const dishes = menu.filter((item) => item.category === category);
  lines.push(`## ${category} (${dishes.length})`, '',
    '| Plato | Miraflores | San Isidro | Prep. | Foto | Ingredientes por porción |',
    '| --- | --- | --- | --- | --- | --- |');
  for (const item of dishes) {
    const recipe = Object.entries(item.recipe)
      .map(([id, quantity]) => `${byId.get(id).name} ${amount(quantity, byId.get(id).unit)}`).join(', ');
    const image = dishImage(item.category, item.id);
    lines.push(`| ${item.name} | ${soles(item.prices[0])} | ${soles(item.prices[1])} | ${item.prep} min | [${image}](./public${image}) | ${recipe} |`);
  }
  lines.push('');
}

lines.push('## Insumos de cocina', '',
  'Existencias físicas al iniciar la demo y stock mínimo por sede. Por debajo del mínimo, la vista **Cocina** marca el insumo para reponer.', '');
for (const group of ingredientGroups) {
  const items = ingredients.filter((item) => item.group === group);
  lines.push(`### ${group} (${items.length})`, '', `| Insumo | ${sites.join(' | ')} | Mínimo |`, '| --- | --- | --- | --- |');
  for (const item of items) {
    lines.push(`| ${item.name} | ${item.stock.map((quantity) => amount(quantity, item.unit)).join(' | ')} | ${amount(item.min, item.unit)} |`);
  }
  lines.push('');
}

const target = fileURLToPath(new URL('../CARTA.md', import.meta.url));
writeFileSync(target, `${lines.join('\n').trimEnd()}\n`);
console.log(`CARTA.md: ${menu.length} platos y ${ingredients.length} insumos.`);
