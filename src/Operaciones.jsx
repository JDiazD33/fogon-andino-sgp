/* Vistas de operación del SGP v2 que completan la Figura 14 del Avance 2:
   Canales (gestor único + conectores), Caja y cobros, y Gestión (carta y
   precios por sede + indicadores que se publican hacia BI). */
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { CircleAlert, FileText, Minus, Plus } from 'lucide-react'
import './operaciones.css'

const currency = new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' })
const clock = new Intl.DateTimeFormat('es-PE', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Lima' })
const limaDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit' })
const cash = amount => currency.format(amount ?? 0)
const time = at => clock.format(new Date(at))
const isToday = at => limaDay.format(new Date(at)) === limaDay.format(new Date())
const number = (value, suffix = '') => value == null ? '—' : `${new Intl.NumberFormat('es-PE', { maximumFractionDigits: 1 }).format(value)}${suffix}`

async function api(path, { method = 'GET', body } = {}) {
  const response = await fetch(path, {
    method,
    cache: 'no-store',
    ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  })
  const result = await response.json()
  return { ok: response.ok, status: response.status, result }
}

async function send(path, options) {
  const { ok, result } = await api(path, options)
  if (!ok) throw Object.assign(new Error(result.error || 'La operación no se pudo completar.'), { code: result.code, details: result.details })
  return result
}

function Notice({ message }) {
  return message ? <p className="notice" role="alert"><CircleAlert size={18} />{message}</p> : null
}

function PageHeading({ eyebrow, title, subtitle }) {
  return <div className="page-heading"><p className="eyebrow"><i />{eyebrow}</p><h1>{title}</h1><p>{subtitle}</p></div>
}

function Toggle({ label, options, value, onChange }) {
  return <div className="service-toggle ops-toggle" role="group" aria-label={label}>
    {options.map(([id, text]) => <button type="button" key={id} aria-pressed={value === id} onClick={() => onChange(id)}>{text}</button>)}
  </div>
}

function receiptHref(order) {
  return `/api/orders/${encodeURIComponent(order.id ?? order.orderId)}/receipt`
}

/* ------------------------------------------------------------------------
   CANALES · seis canales, un gestor de pedidos
   ------------------------------------------------------------------------ */

const sampleNames = ['Valeria Núñez', 'Mateo Ríos', 'Camila Soto', 'Diego Salazar', 'Renata Villa', 'Bruno Cárdenas']

function randomOf(list) {
  return list[Math.floor(Math.random() * list.length)]
}

function samplePayload(channel, site, products) {
  const available = products.filter(product => product.active && product.available > 0)
  const picks = [...available].sort(() => Math.random() - 0.5).slice(0, Math.min(2, available.length))
  const customer = randomOf(sampleNames)
  const phone = `9${Math.floor(10 + Math.random() * 89)} ${Math.floor(100 + Math.random() * 899)} ${Math.floor(100 + Math.random() * 899)}`
  const zone = randomOf(site.deliveryZones)
  const serial = Math.floor(10000 + Math.random() * 89999)
  if (channel === 'rappi') {
    return {
      order_id: `RP-${serial}`,
      store_id: `fogon-${site.id}`,
      items: picks.map(product => ({ sku: product.id, units: 1 })),
      client: { name: customer, phone },
      delivery: { neighborhood: zone },
    }
  }
  return {
    id: serial,
    restaurant: { integrationCode: site.id },
    details: picks.map(product => ({ integrationCode: product.id, quantity: 1 })),
    user: { name: customer, phone },
    address: { area: zone },
  }
}

function Connector({ channel, site, products, refresh }) {
  const [payload, setPayload] = useState(null)
  const [log, setLog] = useState([])
  const [busy, setBusy] = useState(false)

  async function deliver(body) {
    setBusy(true)
    try {
      const { status, result } = await api(`/api/connectors/${channel.id}/orders`, { method: 'POST', body })
      const line = status < 300
        ? { status, tone: result.duplicate ? 'warn' : 'ok', text: result.duplicate ? `Duplicado ignorado · sigue siendo ${result.order.id}` : `Pedido ${result.order.id} creado en el OMS` }
        : { status, tone: 'error', text: result.error }
      setLog(previous => [{ ...line, at: new Date().toISOString() }, ...previous].slice(0, 5))
      await refresh()
    } finally {
      setBusy(false)
    }
  }

  function receive() {
    const next = samplePayload(channel.id, site, products)
    setPayload(next)
    deliver(next)
  }

  return <article className="connector">
    <header className="connector-head">
      <div><p className="micro-label">Conector · {channel.type}</p><h3>{channel.name}</h3></div>
      <span className="connector-fee">Comisión {channel.commission} %</span>
    </header>
    <p className="ops-note">El agregador envía su propio formato. El conector lo traduce al pedido del gestor único, con los precios de la carta de la sede.</p>
    <div className="connector-actions">
      <button className="button primary" disabled={busy} onClick={receive}>Recibir pedido de prueba</button>
      <button className="button secondary" disabled={busy || !payload} onClick={() => deliver(payload)}>Reenviar el mismo mensaje</button>
    </div>
    {payload && <pre className="connector-payload" aria-label={`Mensaje de ${channel.name}`}>{JSON.stringify(payload, null, 2)}</pre>}
    {log.length > 0 && <ul className="connector-log">
      {log.map((line, index) => <li key={`${line.at}:${index}`} data-tone={line.tone}>
        <code>{line.status}</code><span>{line.text}</span><time>{time(line.at)}</time>
      </li>)}
    </ul>}
  </article>
}

function CentralOrder({ state, site, refresh }) {
  const [channel, setChannel] = useState('whatsapp')
  const [fulfillment, setFulfillment] = useState('delivery')
  const [zone, setZone] = useState(site.deliveryZones[0])
  const [customer, setCustomer] = useState('')
  const [phone, setPhone] = useState('')
  const [method, setMethod] = useState('pasarela')
  const [priority, setPriority] = useState(false)
  const [cart, setCart] = useState({})
  const [error, setError] = useState('')
  const [done, setDone] = useState(null)
  const [busy, setBusy] = useState(false)
  const products = state.products.filter(product => product.active)
  const lines = products.filter(product => cart[product.id] > 0)
  const total = lines.reduce((sum, product) => sum + product.price * cart[product.id], 0)

  function change(product, delta) {
    setCart(previous => ({ ...previous, [product.id]: Math.max(0, Math.min(product.available, (previous[product.id] ?? 0) + delta)) }))
  }

  async function submit(event) {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setError('')
    setDone(null)
    try {
      const { order } = await send('/api/orders', {
        method: 'POST',
        body: {
          siteId: site.id, channel, fulfillment, customer, phone, payment: 'approved', method,
          priority: priority ? 'alta' : 'normal',
          ...(fulfillment === 'delivery' ? { zone } : {}),
          items: lines.map(product => ({ productId: product.id, quantity: cart[product.id] })),
        },
      })
      setDone(order)
      setCart({})
      setCustomer('')
      setPhone('')
      setPriority(false)
      await refresh()
    } catch (problem) {
      setError(problem.message)
    } finally {
      setBusy(false)
    }
  }

  return <form className="central" onSubmit={submit}>
    <p className="micro-label">Central de pedidos · canales propios</p>
    <h3>WhatsApp y teléfono</h3>
    <p className="ops-note">Antes, estos pedidos se copiaban a mano en el SGP v1. Ahora el operador los registra una sola vez en el mismo gestor que la web y el salón.</p>
    <Toggle label="Canal" value={channel} onChange={setChannel} options={[['whatsapp', 'WhatsApp'], ['telefono', 'Teléfono']]} />
    <div className="ops-fields">
      <label className="field"><span>Cliente</span>
        <input value={customer} onChange={event => setCustomer(event.target.value)} placeholder="Nombre" maxLength={80} required />
      </label>
      <label className="field"><span>Teléfono</span>
        <input value={phone} onChange={event => setPhone(event.target.value)} placeholder="987 654 321" maxLength={32} required />
      </label>
      <label className="field"><span>Entrega</span>
        <select value={fulfillment} onChange={event => setFulfillment(event.target.value)}>
          <option value="delivery">Delivery</option>
          <option value="recojo">Recojo en sede</option>
        </select>
      </label>
      {fulfillment === 'delivery' && <label className="field"><span>Zona</span>
        <select value={zone} onChange={event => setZone(event.target.value)}>
          {[...site.deliveryZones, 'Fuera de cobertura'].map(name => <option key={name}>{name}</option>)}
        </select>
      </label>}
      <label className="field"><span>Pago</span>
        <select value={method} onChange={event => setMethod(event.target.value)}>
          <option value="pasarela">Enlace de pago (pasarela)</option>
          <option value="yape">Yape</option>
          <option value="plin">Plin</option>
        </select>
      </label>
    </div>
    <ul className="central-items">
      {products.map(product => <li key={product.id} data-out={!product.available || undefined}>
        <span>{product.name}<small>{product.available ? cash(product.price) : 'Agotado'}</small></span>
        <span className="quantity">
          <button type="button" aria-label={`Quitar ${product.name}`} disabled={!cart[product.id]} onClick={() => change(product, -1)}><Minus size={14} /></button>
          <span>{cart[product.id] ?? 0}</span>
          <button type="button" aria-label={`Sumar ${product.name}`} disabled={(cart[product.id] ?? 0) >= product.available} onClick={() => change(product, 1)}><Plus size={14} /></button>
        </span>
      </li>)}
    </ul>
    <label className="ops-check">
      <input type="checkbox" checked={priority} onChange={event => setPriority(event.target.checked)} />
      <span>Prioridad alta en cocina</span>
    </label>
    <div className="total"><span>Total</span><strong>{cash(total)}</strong></div>
    <Notice message={error} />
    {done && <p className="ops-success" role="status">Pedido <a href={`#seguimiento/${done.id}`}>{done.id}</a> registrado · {done.receipt?.code}</p>}
    <button className="button primary wide" disabled={busy || !lines.length}>{busy ? 'Registrando…' : 'Registrar pedido'}</button>
  </form>
}

export function Channels({ state, site, refresh }) {
  const today = state.orders.filter(order => isToday(order.createdAt))
  const connectors = state.channels.filter(channel => channel.type === 'agregador')
  return <>
    <PageHeading eyebrow="Gestor único de pedidos · M1" title="Canales"
      subtitle={`Seis canales de venta, un solo gestor de pedidos en ${site.name}. Ningún pedido se vuelve a digitar.`} />
    <section className="channel-strip" aria-label="Pedidos de hoy por canal">
      {state.channels.map(channel => {
        const count = today.filter(order => order.channel === channel.id).length
        return <div key={channel.id} className="channel-tile" data-type={channel.type}>
          <span className="micro-label">{channel.type === 'agregador' ? `Agregador · ${channel.commission} %` : 'Propio'}</span>
          <strong>{channel.name}</strong>
          <span className="channel-count">{count}<small>{count === 1 ? 'pedido hoy' : 'pedidos hoy'}</small></span>
        </div>
      })}
    </section>
    <div className="channels-layout">
      <CentralOrder key={site.id} state={state} site={site} refresh={refresh} />
      <section className="connectors">
        {connectors.map(channel => <Connector key={`${site.id}:${channel.id}`} channel={channel} site={site} products={state.products} refresh={refresh} />)}
      </section>
    </div>
  </>
}

/* ------------------------------------------------------------------------
   CAJA Y COBROS
   ------------------------------------------------------------------------ */

const cashierMethods = [['efectivo', 'Efectivo'], ['tarjeta', 'Tarjeta'], ['yape', 'Yape'], ['plin', 'Plin']]

function Checkout({ order, refresh, onDone }) {
  const [method, setMethod] = useState('efectivo')
  const [received, setReceived] = useState('')
  const [type, setType] = useState('boleta')
  const [document, setDocument] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const receivedValue = Number(received)
  const change = method === 'efectivo' && received !== '' && receivedValue >= order.total ? receivedValue - order.total : null

  async function submit(event) {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setError('')
    try {
      const { order: paid } = await send(`/api/orders/${encodeURIComponent(order.id)}/payment`, {
        method: 'POST',
        body: {
          method, ...(method === 'efectivo' ? { received: receivedValue } : {}),
          receipt: { type, document, name },
        },
      })
      onDone(paid)
      await refresh()
    } catch (problem) {
      setError(problem.message)
    } finally {
      setBusy(false)
    }
  }

  return <form className="cashier-form" onSubmit={submit}>
    <p className="micro-label">Cobrar · {order.table} · {order.id}</p>
    <ul className="cashier-lines">
      {order.items.map(item => <li key={item.productId}><span>{item.quantity} × {item.name}</span><strong>{cash(item.unitPrice * item.quantity)}</strong></li>)}
    </ul>
    <div className="total"><span>Total</span><strong>{cash(order.total)}</strong></div>
    <Toggle label="Medio de pago" value={method} onChange={setMethod} options={cashierMethods} />
    {method === 'efectivo' && <label className="field"><span>Efectivo recibido</span>
      <input type="number" min={0} step="0.1" inputMode="decimal" value={received} onChange={event => setReceived(event.target.value)} placeholder={order.total.toFixed(2)} required />
    </label>}
    {change !== null && <p className="cashier-change">Vuelto <strong>{cash(change)}</strong></p>}
    <Toggle label="Comprobante" value={type} onChange={setType} options={[['boleta', 'Boleta'], ['factura', 'Factura']]} />
    <div className="ops-fields">
      <label className="field"><span>{type === 'factura' ? 'RUC' : 'DNI (opcional)'}</span>
        <input value={document} onChange={event => setDocument(event.target.value.replace(/[^0-9]/g, ''))} inputMode="numeric"
          maxLength={type === 'factura' ? 11 : 8} required={type === 'factura'} placeholder={type === 'factura' ? '20601234567' : '12345678'} />
      </label>
      {type === 'factura' && <label className="field"><span>Razón social</span>
        <input value={name} onChange={event => setName(event.target.value)} maxLength={100} required placeholder="Empresa S.A.C." />
      </label>}
    </div>
    <Notice message={error} />
    <button className="button primary wide" disabled={busy}>{busy ? 'Cobrando…' : `Cobrar ${cash(order.total)}`}</button>
  </form>
}

function CashClosure({ state, site, refresh }) {
  const [counted, setCounted] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  async function submit(event) {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setError('')
    try {
      await send('/api/cash-closures', { method: 'POST', body: { siteId: site.id, countedCash: Number(counted) } })
      setCounted('')
      await refresh()
    } catch (problem) {
      setError(problem.code === 'OPEN_TABS' ? `${problem.message} (${problem.details.orders.join(', ')})` : problem.message)
    } finally {
      setBusy(false)
    }
  }
  return <form className="cashier-close" onSubmit={submit}>
    <p className="micro-label">Arqueo y cierre de caja</p>
    <dl className="detail-list">
      <div><dt>Cobros del turno</dt><dd>{state.cash.count}</dd></div>
      <div><dt>Total cobrado</dt><dd>{cash(state.cash.total)}</dd></div>
      <div><dt>Efectivo esperado</dt><dd>{cash(state.cash.expectedCash)}</dd></div>
    </dl>
    <label className="field"><span>Efectivo contado</span>
      <input type="number" min={0} step="0.1" inputMode="decimal" value={counted} onChange={event => setCounted(event.target.value)} required placeholder="0.00" />
    </label>
    <Notice message={error} />
    <button className="button secondary wide" disabled={busy}>Cerrar caja</button>
  </form>
}

export function Cashier({ state, site, refresh }) {
  const [selected, setSelected] = useState('')
  const [last, setLast] = useState(null)
  const tabs = state.orders.filter(order => order.payment === 'pending').sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  const current = tabs.find(order => order.id === selected) ?? null
  const byTable = Map.groupBy(tabs, order => order.table)

  return <>
    <PageHeading eyebrow="Caja y cobros · SGP v2" title="Caja"
      subtitle={`Cobro de las cuentas de salón en ${site.name}, comprobante en el mismo paso y cierre de caja con arqueo.`} />
    <div className="cashier-layout">
      <section className="cashier-tabs">
        <div className="lane-title"><h2>Cuentas abiertas</h2><span>{tabs.length}</span></div>
        {tabs.length ? [...byTable].map(([table, orders]) => <div className="tab-group" key={table}>
          <p className="micro-label">{table} · {cash(orders.reduce((sum, order) => sum + order.total, 0))}</p>
          {orders.map(order => <button key={order.id} className="tab-row" aria-pressed={order.id === selected}
            onClick={() => { setSelected(order.id); setLast(null) }}>
            <code>{order.id}</code>
            <span>{order.items.map(item => `${item.quantity}× ${item.name}`).join(' · ')}</span>
            <strong>{cash(order.total)}</strong>
          </button>)}
        </div>) : <p className="lane-empty">Sin cuentas por cobrar. En Salón, elige «Cobrar en caja» al confirmar la comanda.</p>}
      </section>
      <section className="cashier-main">
        {current ? <Checkout key={current.id} order={current} refresh={refresh} onDone={paid => { setLast(paid); setSelected('') }} />
          : last ? <div className="cashier-done" role="status">
            <p className="micro-label">Cobro registrado</p>
            <h3>{last.receipt.code}</h3>
            <p>{last.receipt.type === 'factura' ? 'Factura' : 'Boleta'} de {last.id} · {last.paymentDetail.label}{last.paymentDetail.change ? ` · vuelto ${cash(last.paymentDetail.change)}` : ''}</p>
            <a className="button secondary" href={receiptHref(last)} target="_blank" rel="noopener noreferrer"><FileText size={16} /> Ver comprobante en PDF</a>
          </div>
            : <p className="lane-empty">Elige una cuenta abierta para cobrarla.</p>}
        <CashClosure state={state} site={site} refresh={refresh} />
      </section>
      <section className="cashier-shift">
        <div className="lane-title"><h2>Turno en curso</h2><span>{cash(state.cash.total)}</span></div>
        <table className="ops-table">
          <thead><tr><th scope="col">Medio</th><th scope="col">Cobros</th><th scope="col">Monto</th></tr></thead>
          <tbody>{state.cash.byMethod.filter(item => item.count).map(item => <tr key={item.method}>
            <th scope="row">{item.label}</th><td>{item.count}</td><td>{cash(item.total)}</td>
          </tr>)}</tbody>
        </table>
        <ul className="payment-list">
          {state.cash.payments.slice(0, 12).map(payment => <li key={payment.orderId}>
            <time>{time(payment.at)}</time>
            <code>{payment.orderId}</code>
            <span>{payment.label}</span>
            <strong>{cash(payment.amount)}</strong>
            {payment.receipt && <a href={receiptHref(payment)} target="_blank" rel="noopener noreferrer">{payment.receipt}</a>}
          </li>)}
        </ul>
        {state.cash.closures.length > 0 && <>
          <p className="micro-label ops-gap">Cierres anteriores</p>
          <ul className="payment-list">
            {state.cash.closures.map(closure => <li key={closure.id}>
              <time>{time(closure.closedAt)}</time><code>{closure.id}</code>
              <span>{closure.payments} cobros · {cash(closure.total)}</span>
              <strong data-tone={closure.difference ? 'warn' : 'ok'}>{closure.difference ? `Diferencia ${cash(closure.difference)}` : 'Cuadrada'}</strong>
            </li>)}
          </ul>
        </>}
      </section>
    </div>
  </>
}

/* ------------------------------------------------------------------------
   GESTIÓN · carta y precios por sede + indicadores para BI
   ------------------------------------------------------------------------ */

function PriceRow({ product, siteId, refresh }) {
  const [price, setPrice] = useState(product.price.toFixed(2))
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => { setPrice(product.price.toFixed(2)) }, [product.price])
  const dirty = Number(price) !== product.price

  async function save(changes) {
    setBusy(true)
    setError('')
    try {
      await send(`/api/sites/${encodeURIComponent(siteId)}/products/${encodeURIComponent(product.id)}`, { method: 'PATCH', body: changes })
      await refresh()
    } catch (problem) {
      setError(problem.message)
    } finally {
      setBusy(false)
    }
  }

  return <tr data-inactive={!product.active || undefined}>
    <th scope="row">{product.name}<small>{product.category} · {product.prepMinutes} min</small>{error && <em role="alert">{error}</em>}</th>
    <td>
      <form className="price-form" onSubmit={event => { event.preventDefault(); save({ price: Number(price) }) }}>
        <input aria-label={`Precio de ${product.name}`} type="number" min={1} max={999} step="0.1" value={price} onChange={event => setPrice(event.target.value)} />
        <button className="link-button" disabled={busy || !dirty}>Guardar</button>
      </form>
    </td>
    <td>{product.active ? number(product.available) : '—'}</td>
    <td>
      <button className="link-button" disabled={busy} onClick={() => save({ active: !product.active })}>
        {product.active ? 'Retirar' : 'Activar'}
      </button>
    </td>
  </tr>
}

function Indicator({ label, value, note, tone }) {
  return <div className="indicator" data-tone={tone}>
    <span className="micro-label">{label}</span>
    <strong>{value}</strong>
    {note && <small>{note}</small>}
  </div>
}

export function Management({ state, site, refresh }) {
  const [metrics, setMetrics] = useState(null)
  const [error, setError] = useState('')
  const load = useCallback(async () => {
    try {
      setMetrics(await send(`/api/metrics?site=${encodeURIComponent(site.id)}`))
      setError('')
    } catch (problem) {
      setError(problem.message)
    }
  }, [site.id])
  useEffect(() => {
    load()
    const ticker = setInterval(load, 4000)
    return () => clearInterval(ticker)
  }, [load])
  const reload = useCallback(async () => { await refresh(); await load() }, [refresh, load])
  const maxSales = useMemo(() => Math.max(1, ...(metrics?.byChannel ?? []).map(item => item.sales)), [metrics])
  const oe3 = metrics?.delivery.averageMinutes

  return <>
    <PageHeading eyebrow="Gestión de la sede · datos para BI (M7)" title="Gestión"
      subtitle={`Carta y precios de ${site.name} en un único sistema, e indicadores de la operación de hoy contra las metas del Avance 2.`} />
    <Notice message={error} />
    {/* A la vista, solo lo que se muestra al exponer: las tres metas del Avance 2. */}
    {metrics && <section className="indicator-grid indicator-goals" aria-label="Metas del Avance 2">
      <Indicator label="OE1 · Sin re-digitación" value={number(metrics.orders.viaApiPct, ' %')}
        note={`${metrics.orders.viaApi} de ${metrics.orders.total} entraron por API · línea base 22 %, meta 100 %`} tone={metrics.orders.total ? 'ok' : undefined} />
      <Indicator label="OE2 · Errores evitados" value={metrics.orders.duplicatesBlocked + metrics.orders.rejectedByConnector}
        note={`${metrics.orders.duplicatesBlocked} duplicados bloqueados · ${metrics.orders.rejectedByConnector} rechazos del conector · línea base 6,5 %`} />
      <Indicator label="OE3 · Tiempo de entrega" value={number(oe3, ' min')}
        note={`${metrics.delivery.delivered} entregas · línea base 52 min, meta ≤ 35 min`} tone={oe3 == null ? undefined : oe3 <= 35 ? 'ok' : 'warn'} />
    </section>}

    <section className="ops-section">
      <div className="lane-title"><h2>Carta y precios por sede</h2><span>{state.products.filter(product => product.active).length} activos</span></div>
      <p className="ops-note">La carta vive en un solo sistema (P03). Cambiar un precio o retirar un plato rige de inmediato para la web, el salón, la central y los agregadores de esta sede.</p>
      <table className="ops-table price-table">
        <thead><tr><th scope="col">Plato</th><th scope="col">Precio (S/)</th><th scope="col">Porciones</th><th scope="col">Carta</th></tr></thead>
        <tbody>{state.products.map(product => <PriceRow key={`${site.id}:${product.id}`} product={product} siteId={site.id} refresh={reload} />)}</tbody>
      </table>
    </section>

    {/* El resto de los indicadores queda plegado. */}
    {metrics && <details className="fold">
      <summary>Más indicadores y ventas por canal</summary>
      <div className="fold-body">
        <section className="indicator-grid" aria-label="Otros indicadores de hoy">
          <Indicator label="Pedidos de hoy" value={metrics.orders.total} note={`${metrics.orders.paid} cobrados · ${cash(metrics.orders.sales)}`} />
          <Indicator label="Ticket promedio" value={metrics.orders.averageTicket == null ? '—' : cash(metrics.orders.averageTicket)} />
          <Indicator label="Cocina a tiempo" value={number(metrics.kitchen.onTimePct, ' %')}
            note={`Preparación media ${number(metrics.kitchen.averagePrepMinutes, ' min')} · ${metrics.kitchen.lateNow} atrasados ahora`}
            tone={metrics.kitchen.lateNow ? 'warn' : undefined} />
          <Indicator label="Cuentas abiertas" value={metrics.payments.openTabs} note={cash(metrics.payments.openTabsAmount)} />
          <Indicator label="Reservas de hoy" value={metrics.reservations.active} note={`${metrics.reservations.covers} comensales · ${metrics.reservations.noShows} no se presentaron`} />
        </section>

        <section className="ops-section">
          <div className="lane-title"><h2>Ventas por canal</h2><span>{cash(metrics.orders.sales)}</span></div>
          <table className="ops-table channel-table">
            <thead><tr><th scope="col">Canal</th><th scope="col">Pedidos</th><th scope="col">Ventas</th><th scope="col">Comisión</th></tr></thead>
            <tbody>{metrics.byChannel.map(item => <tr key={item.id}>
              <th scope="row">{item.name}<span className="bar" aria-hidden="true"><i style={{ width: `${item.sales / maxSales * 100}%` }} data-type={item.type} /></span></th>
              <td>{item.orders}</td><td>{cash(item.sales)}</td>
              <td>{item.commission ? `${cash(item.commissionCost)} · ${item.commission} %` : '—'}</td>
            </tr>)}</tbody>
          </table>
          <p className="ops-note">Los indicadores se calculan con los pedidos ficticios de la demo. En el programa empresarial, estos datos se publican al data warehouse y a Power BI (P07).</p>
        </section>
      </div>
    </details>}
  </>
}
