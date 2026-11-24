import React, { useState } from 'react'
import { Check, CircleAlert } from 'lucide-react'
import './inventory.css'

const quantityFormat = new Intl.NumberFormat('es-PE', { maximumFractionDigits: 3 })
const displayUnits = { g: 'kg', ml: 'L' }
const maxPortions = 50

function measure(quantity, unit) {
  const displayUnit = displayUnits[unit]
  const amount = displayUnit ? quantity / 1000 : quantity
  return `${quantityFormat.format(amount)}\u00a0${displayUnit ?? unit}`
}

function StockRow({ item }) {
  const available = item.quantity - item.reserved
  const reservedShare = item.quantity ? item.reserved / item.quantity * 100 : 0
  // Por debajo del stock mínimo la cocina debe reponer; en cero, el insumo está agotado.
  const level = available <= 0 ? 'agotado' : available < item.minimum ? 'bajo' : null

  return <li className="inventory-stock-row" data-level={level ?? undefined}>
    <div className="inventory-stock-label">
      <strong>{item.name}</strong>
      {level ? <em className="inventory-flag">{level === 'agotado' ? 'Agotado' : 'Reponer'}</em>
        : <span>{measure(item.quantity, item.unit)} físicos</span>}
    </div>
    <div className="inventory-stock-bar" aria-hidden="true" data-empty={item.quantity === 0}>
      <span style={{ width: `${reservedShare}%` }} />
    </div>
    <div className="inventory-stock-values">
      <span>Libre <strong>{measure(available, item.unit)}</strong></span>
      <span>Reservado {measure(item.reserved, item.unit)}</span>
      <span>Mínimo {measure(item.minimum ?? 0, item.unit)}</span>
    </div>
  </li>
}

// Agrupa los insumos por tipo, en el orden en que llegan de la API.
function groupStock(stock) {
  const groups = new Map()
  for (const item of stock) {
    const name = item.category ?? 'Insumos'
    if (!groups.has(name)) groups.set(name, [])
    groups.get(name).push(item)
  }
  return [...groups]
}

export default function Inventory({ state }) {
  const [productId, setProductId] = useState('')
  const [portionInput, setPortionInput] = useState('1')
  const product = state.products.find(item => item.id === productId) ?? state.products[0]
  const site = state.sites.find(item => item.id === state.siteId)
  const freeStock = new Map(state.stock.map(item => [item.name, item.quantity - item.reserved]))
  const portions = Number(portionInput)
  const validQuantity = Number.isInteger(portions) && portions >= 1 && portions <= maxPortions
  const recipe = product?.recipe ?? []
  const requiredIngredients = recipe.map(item => {
    const required = item.quantity * portions
    const available = freeStock.get(item.name) ?? 0
    return { ...item, required, available, deficit: Math.max(0, required - available) }
  })
  const hasShortage = validQuantity && requiredIngredients.some(item => item.deficit > 0)
  const toRestock = state.stock.filter(item => item.quantity - item.reserved < (item.minimum ?? 0))

  return <section className="fogon-inventory" aria-labelledby="inventory-title">
    <header className="inventory-heading">
      <h2 id="inventory-title">Existencias de la sede</h2>
      {site && <p>{site.name}</p>}
    </header>

    <div className="inventory-layout">
      <section aria-labelledby="inventory-stock-title">
        <h3 id="inventory-stock-title">Stock de insumos</h3>
        <p className="inventory-caption">
          {state.stock.length} insumos por tipo. Cada barra reparte el stock físico entre lo libre y lo reservado;
          por debajo del mínimo, el insumo se marca para reponer.
        </p>
        <div className="inventory-legend" aria-hidden="true">
          <span><i />Libre</span><span><i />Reservado para pedidos</span>
        </div>
        {toRestock.length > 0 && <p className="inventory-restock" role="status">
          <strong>Reponer ({toRestock.length}):</strong> {toRestock.map(item => item.name).join(', ')}
        </p>}
        {groupStock(state.stock).map(([group, items]) => <section className="inventory-group" key={group}
          aria-label={group}>
          <h4>{group}<span>{items.length}</span></h4>
          <ul className="inventory-stock-list">
            {items.map(item => <StockRow key={item.name} item={item} />)}
          </ul>
        </section>)}
      </section>

      <section className="inventory-calculator" aria-labelledby="inventory-recipe-title">
        <h3 id="inventory-recipe-title">Calculadora por receta</h3>
        <div className="inventory-fields">
          <label>
            <span>Plato o bebida</span>
            <select value={product?.id ?? ''} onChange={event => setProductId(event.target.value)} disabled={!product}>
              {state.products.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </label>
          <label>
            <span>Porciones</span>
            <input type="number" min={1} max={maxPortions} step={1} inputMode="numeric"
              value={portionInput} onChange={event => setPortionInput(event.target.value)} aria-invalid={!validQuantity} />
          </label>
        </div>

        {product && recipe.length > 0 ? <>
          <div className="inventory-result" data-warning={hasShortage || !validQuantity} role="status">
            {hasShortage || !validQuantity ? <CircleAlert size={18} aria-hidden="true" /> : <Check size={18} aria-hidden="true" />}
            <div>
              <p><strong>{quantityFormat.format(product.available)}</strong> {product.available === 1 ? 'porción posible' : 'porciones posibles'}</p>
              <p>{!validQuantity ? `Ingresa entre 1 y ${maxPortions} porciones.` : hasShortage
                ? 'Faltan insumos para la cantidad solicitada.' : 'Hay insumos suficientes para la cantidad solicitada.'}</p>
            </div>
          </div>
          <table className="inventory-recipe">
            <caption>Insumos para {product.name}</caption>
            <thead><tr>
              <th scope="col">Insumo</th><th scope="col">Necesario</th><th scope="col">Libre</th><th scope="col">Déficit</th>
            </tr></thead>
            <tbody>{requiredIngredients.map(item => <tr key={item.name}>
              <th scope="row">{item.name}</th>
              <td>{validQuantity ? measure(item.required, item.unit) : '—'}</td>
              <td>{measure(item.available, item.unit)}</td>
              <td className={validQuantity && item.deficit > 0 ? 'inventory-deficit' : undefined}>
                {validQuantity ? measure(item.deficit, item.unit) : '—'}
              </td>
            </tr>)}</tbody>
          </table>
          <p className="inventory-note">Los platos comparten insumos. La capacidad corresponde solo a la receta seleccionada.</p>
        </> : <p className="inventory-note" role="status">La receta aún no está disponible para la selección.</p>}
      </section>
    </div>
  </section>
}
