import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import {
  Check, ChevronDown,
  CircleAlert, Clock, Code2, Database, FileText, MapPin, Minus, Plus, Search,
  ReceiptText, RefreshCw, ShoppingBag, X,
} from 'lucide-react'
import '@fontsource-variable/jost/wght.css'
import '@fontsource-variable/jost/wght-italic.css'
import '@fontsource-variable/newsreader/opsz.css'
import '@fontsource-variable/newsreader/opsz-italic.css'
import '@fontsource-variable/big-shoulders-display/wght'
import './styles.css'
import Inventory from './Inventory.jsx'
import { Cashier, Channels, Management } from './Operaciones.jsx'

const views = [
  ['carta', 'Carta'], ['seguimiento', 'Pedidos'],
  ['reservas', 'Reservas'], ['salon', 'Salón'], ['canales', 'Canales'], ['cocina', 'Cocina'],
  ['despacho', 'Despacho'], ['caja', 'Caja'], ['gestion', 'Gestión'], ['evidencia', 'Evidencia'],
]
const fulfillmentLabels = { salon: 'Salón', delivery: 'Delivery', recojo: 'Recojo' }
const channelLine = order => order.fulfillment === 'salon'
  ? `Salón · ${order.table}`
  : `${order.channelName ?? order.channel} · ${fulfillmentLabels[order.fulfillment] ?? 'Delivery'}`
const receiptName = order => order.receipt?.type === 'factura' ? 'Factura' : 'Boleta'
const statusLabels = {
  registrado: 'Registrado', preparacion: 'En preparación', listo: 'Listo',
  en_camino: 'En camino', entregado: 'Entregado',
}
const categoryOrder = ['Fondos', 'Entradas', 'Bebidas', 'Postres']
const reservationLabels = {
  registrada: 'Registrada', confirmada: 'Confirmada', en_curso: 'En mesa',
  completada: 'Completada', cancelada: 'Cancelada', no_presento: 'No se presentó',
}
const reservationActions = {
  registrada: [['confirmada', 'Confirmar'], ['cancelada', 'Cancelar'], ['no_presento', 'No se presentó']],
  confirmada: [['en_curso', 'Sentar'], ['cancelada', 'Cancelar'], ['no_presento', 'No se presentó']],
  en_curso: [['completada', 'Completar'], ['cancelada', 'Cancelar']],
  completada: [], cancelada: [], no_presento: [],
}
const todayInLima = () => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date())
const shortDay = value => new Intl.DateTimeFormat('es-PE', {
  timeZone: 'UTC', weekday: 'short', day: 'numeric',
}).format(new Date(`${value}T12:00:00Z`))
const longDay = value => new Intl.DateTimeFormat('es-PE', {
  timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long',
}).format(new Date(`${value}T12:00:00Z`))
const currency = new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' })
const clock = new Intl.DateTimeFormat('es-PE', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Lima' })
const cash = amount => currency.format(amount)
const time = at => clock.format(new Date(at))
const trackingKey = (site, channel) => `fogon:pedido:${site}:${channel}`
const historyKey = 'fogon:historial'

function normalizedOrderId(value = '') {
  const match = /^(?:FA\s*[-–—]?\s*)?(\d{4,10})$/i.exec(value.trim())
  return match ? 'FA-' + match[1] : ''
}

function orderHref(id) {
  return '#seguimiento/' + encodeURIComponent(id)
}

function recentOrders() {
  let saved = []
  try {
    const parsed = JSON.parse(localStorage.getItem(historyKey) ?? '[]')
    if (Array.isArray(parsed)) saved = parsed.filter(value => typeof value === 'string')
  } catch {
    // The original app stored one order per site and channel. Keep those references below.
  }
  const previous = Object.keys(localStorage)
    .filter(key => key.startsWith('fogon:pedido:'))
    .map(key => localStorage.getItem(key) || '')
  return [...new Set([...saved, ...previous].map(normalizedOrderId).filter(Boolean))]
}

function rememberOrder(id) {
  localStorage.setItem(historyKey, JSON.stringify([id, ...recentOrders().filter(item => item !== id)].slice(0, 12)))
}

function currentRoute() {
  const [id, slug] = location.hash.slice(1).split('/')
  const view = views.some(([name]) => id === name) ? id : 'carta'
  return { view, orderId: view === 'seguimiento' ? normalizedOrderId(slug) : '' }
}

async function api(path, { method = 'GET', body, signal } = {}) {
  const response = await fetch(path, {
    method,
    signal,
    cache: 'no-store',
    ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  })
  const result = await response.json()
  if (!response.ok) throw Object.assign(new Error(result.error || 'La operación no se pudo completar.'), { code: result.code })
  return result
}

function Notice({ message }) {
  return message && <p className="notice" role="alert"><CircleAlert size={18} />{message}</p>
}

function Status({ status }) {
  return <span className={`status ${status}`}><i />{statusLabels[status]}</span>
}

// Los videos de referencia (material de Central Restaurante) solo existen en la
// copia local: `.env.local` define VITE_VIDEOS_REFERENCIA=1. La versión publicada
// no los incluye y muestra fotos propias del proyecto con un zoom lento.
const referenceVideos = import.meta.env.VITE_VIDEOS_REFERENCIA === '1'
const photo = (file, position = 'center') => ({ backgroundImage: `url(/img/${file})`, backgroundPosition: position })
// Un plato de la cuadrícula de la carta (tres columnas, dos filas).
const cartaTile = (x, y) => ({ backgroundImage: 'url(/img/carta.jpg)', backgroundSize: '300% 200%', backgroundPosition: `${x} ${y}` })

// Video decorativo en bucle, sin sonido. Solo se reproduce mientras está a la
// vista y respeta «reducir movimiento»: en ese caso queda el póster fijo.
function LoopVideo({ name, eager = false, still }) {
  const ref = useRef(null)
  useEffect(() => {
    const video = ref.current
    if (!video) return
    video.muted = true
    video.defaultMuted = true
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    const play = () => { video.play()?.catch(() => {}) }
    if (!('IntersectionObserver' in window)) {
      play()
      return
    }
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) play()
      else video.pause()
    }, { threshold: 0.15 })
    observer.observe(video)
    return () => observer.disconnect()
  }, [])
  if (!referenceVideos) return <div className="loop-still" style={still} aria-hidden="true" />
  return <video ref={ref} className="loop-video" src={`/video/${name}.mp4`} poster={`/video/${name}.jpg`}
    muted loop playsInline preload={eager ? 'auto' : 'metadata'} aria-hidden="true" tabIndex={-1} />
}

// Vistas del sitio público. El resto son vistas internas de operación.
const publicViews = ['carta', 'seguimiento']
// Vistas internas siempre visibles: el recorrido del pedido. Las demás van en «Más».
const primaryStaff = ['salon', 'cocina', 'despacho', 'caja']

function App() {
  const [{ view, orderId }, setRoute] = useState(currentRoute)
  const [siteId, setSiteId] = useState(() => sessionStorage.getItem('fogon:sede') || 'miraflores')
  const [state, setState] = useState(null)
  const [connection, setConnection] = useState('')
  const [waiting, setWaiting] = useState('')
  const [message, setMessage] = useState('')
  const [checkedAt, setCheckedAt] = useState(null)
  const requestNo = useRef(0)
  const navRef = useRef(null)
  // Cabecera: blanca sobre los videos de la portada, en tinta sobre el papel.
  const [moreOpen, setMoreOpen] = useState(false)
  const moreRef = useRef(null)
  const [scrolled, setScrolled] = useState(false)
  const [overMedia, setOverMedia] = useState(false)
  const landing = view === 'carta' && state?.siteId === siteId
  const channel = view === 'salon' ? 'salon' : 'web'
  const isMenu = view === 'carta' || view === 'salon'
  const refresh = useCallback(async signal => {
    const id = ++requestNo.current
    try {
      const next = await api(`/api/state?site=${encodeURIComponent(siteId)}`, { signal })
      if (id !== requestNo.current || signal?.aborted) return
      setState(next)
      setCheckedAt(new Date())
      setConnection('')
    } catch (error) {
      if (error.name !== 'AbortError' && id === requestNo.current) {
        setConnection('No se pudo consultar la API local. Revisa que el servidor de la demo siga activo.')
      }
    }
  }, [siteId])

  useEffect(() => {
    const onHash = () => {
      setRoute(currentRoute())
      setMessage('')
      window.scrollTo({ top: 0 })
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])
  useEffect(() => {
    const controller = new AbortController()
    refresh(controller.signal)
    const ticker = view === 'seguimiento' ? undefined : setInterval(() => refresh(controller.signal), 2000)
    return () => {
      controller.abort()
      clearInterval(ticker)
    }
  }, [refresh, view])

  useEffect(() => {
    const nav = navRef.current
    const active = nav?.querySelector('[aria-current="page"], [data-current]')
    if (!nav || !active) return
    const offset = active.offsetLeft - (nav.clientWidth - active.offsetWidth) / 2
    nav.scrollTo({ left: Math.max(0, offset), behavior: 'smooth' })
  }, [view])

  useEffect(() => {
    const update = () => {
      const hero = document.querySelector('.hero')
      const header = document.querySelector('.site-header')
      setScrolled(window.scrollY > 8)
      setOverMedia(Boolean(hero) && window.scrollY < hero.offsetHeight - (header?.offsetHeight ?? 64) * 0.6)
    }
    update()
    window.addEventListener('scroll', update, { passive: true })
    window.addEventListener('resize', update)
    return () => {
      window.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
    }
  }, [landing])

  // Menú «Más»: se cierra al cambiar de vista, con Escape o al tocar fuera.
  useEffect(() => { setMoreOpen(false) }, [view])
  useEffect(() => {
    if (!moreOpen) return
    const onKey = event => { if (event.key === 'Escape') setMoreOpen(false) }
    const onPointer = event => { if (!moreRef.current?.contains(event.target)) setMoreOpen(false) }
    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onPointer)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onPointer)
    }
  }, [moreOpen])

  async function changeOrder(order, status, code, courierId) {
    setWaiting(order.id)
    setMessage('')
    try {
      await api(`/api/orders/${encodeURIComponent(order.id)}`, { method: 'PATCH', body: { status, code, courierId } })
      await refresh()
    } catch (error) {
      setMessage(error.message)
      await refresh()
    } finally {
      setWaiting('')
    }
  }

  async function reset() {
    if (!window.confirm('¿Reiniciar los pedidos y existencias de las dos sedes de la demo?')) return
    setWaiting('reset')
    setMessage('')
    try {
      await api('/api/reset', { method: 'POST', body: {} })
      localStorage.removeItem(historyKey)
      for (const site of state.sites) {
        for (const type of ['web', 'salon']) localStorage.removeItem(trackingKey(site.id, type))
      }
      await refresh()
    } catch (error) {
      setMessage(error.message)
    } finally {
      setWaiting('')
    }
  }

  const ready = state?.siteId === siteId
  const site = state?.sites.find(item => item.id === siteId)
  // Como en la referencia, el sitio público muestra pocas entradas; las vistas
  // internas se agrupan en «Operación» y tienen su propia barra, con las menos
  // usadas en «Más».
  const staffMode = !publicViews.includes(view)
  const staffViews = views.filter(([id]) => !publicViews.includes(id))
  const mainStaff = staffViews.filter(([id]) => primaryStaff.includes(id))
  const moreStaff = staffViews.filter(([id]) => !primaryStaff.includes(id))
  const moreCurrent = moreStaff.find(([id]) => id === view)
  const navItems = staffMode ? mainStaff : views.filter(([id]) => publicViews.includes(id))
  const staffHome = (mainStaff[0] ?? staffViews[0])?.[0] ?? 'carta'
  return <>
    <header className={`site-header${overMedia ? ' is-over-media' : ''}${scrolled ? ' is-scrolled' : ''}`}>
      <div className="header-main">
        <a className="brand" href="#carta" aria-label="Fogón Andino, ir a la carta">
          <strong>Fogón Andino</strong>
        </a>
        <div className="header-tools">
          <nav className="navigation" aria-label={staffMode ? 'Vistas de operación' : 'Sitio'} ref={moreRef}>
            <div className="nav-inner" ref={navRef}>
              {staffMode && <a className="nav-switch" href="#carta">Carta</a>}
              {navItems.map(([id, label]) => <a key={id} href={`#${id}`} aria-current={view === id ? 'page' : undefined}>
                {label}
              </a>)}
              {staffMode && moreStaff.length > 0 && <button type="button" className="nav-more"
                aria-expanded={moreOpen} aria-controls="nav-more-list" data-current={moreCurrent ? 'true' : undefined}
                onClick={() => setMoreOpen(open => !open)}>
                {moreCurrent ? moreCurrent[1] : 'Más'}<ChevronDown size={12} aria-hidden="true" />
              </button>}
              {!staffMode && <a className="nav-switch" href={`#${staffHome}`}>Operación</a>}
            </div>
            {staffMode && moreOpen && <div className="nav-more-list" id="nav-more-list">
              {moreStaff.map(([id, label]) => <a key={id} href={`#${id}`} aria-current={view === id ? 'page' : undefined}>{label}</a>)}
            </div>}
          </nav>
          <label className="location">
            <MapPin size={13} />
            <select aria-label="Sede" value={siteId} disabled={!state || Boolean(waiting)} onChange={event => {
              setSiteId(event.target.value)
              sessionStorage.setItem('fogon:sede', event.target.value)
              setMessage('')
            }}>
              {(state?.sites || [{ id: 'miraflores', name: 'Miraflores' }]).map(item =>
                <option key={item.id} value={item.id}>{item.name}</option>
              )}
            </select>
            <ChevronDown size={13} />
          </label>
        </div>
      </div>
    </header>
    <main className={landing ? 'content is-landing' : 'frame content'}>
      {view !== 'seguimiento' && (connection || message) && <div className={landing ? 'notice-float' : undefined}>
        <Notice message={connection || message} />
      </div>}
      {view === 'seguimiento' ? (
        <TrackingPage key={orderId || 'lookup'} orderId={orderId} />
      ) : !ready ? (
        <div className="empty" role="status">{connection ? <button className="button secondary" onClick={() => refresh()}>Volver a conectar</button> : 'Cargando la sede…'}</div>
      ) : isMenu ? (
        <Menu key={`${siteId}:${channel}`} {...{ channel, site, state, refresh, waiting, setWaiting }} />
      ) : view === 'reservas' ? (
        <Reservations site={site} siteId={siteId} />
      ) : view === 'canales' ? (
        <Channels state={state} site={site} refresh={refresh} />
      ) : view === 'caja' ? (
        <Cashier state={state} site={site} refresh={refresh} />
      ) : view === 'gestion' ? (
        <Management state={state} site={site} refresh={refresh} />
      ) : view === 'cocina' ? (
        <Kitchen state={state} site={site} waiting={waiting} changeOrder={changeOrder} />
      ) : view === 'despacho' ? (
        <Dispatch state={state} site={site} waiting={waiting} changeOrder={changeOrder} />
      ) : (
        <Evidence state={state} checkedAt={checkedAt} reset={reset} waiting={waiting} />
      )}
    </main>
    <footer className="site-footer">
      <div className="frame footer-grid">
        <div>
          <span>Fogón Andino S.A.C.</span>
          <span>Prototipo académico</span>
          <span>Datos de demostración</span>
        </div>
        <div className="footer-center">
          <span>@fogonandino</span>
          <span>Miraflores · San Isidro — Lima, Perú</span>
        </div>
        <div className="footer-end">
          <span>Lunes a domingo</span>
          <span>Almuerzo 12:30 – 14:30</span>
          <span>Cena 19:00 – 22:00</span>
        </div>
      </div>
    </footer>
  </>
}

function Menu({ channel, site, state, refresh, waiting, setWaiting }) {
  const [category, setCategory] = useState('Todos')
  const [cart, setCart] = useState({})
  const [zone, setZone] = useState(site.deliveryZones[0] || '')
  const [table, setTable] = useState('Mesa 01')
  // Salón: «pending» deja la cuenta abierta para cobrarla en Caja.
  const [payment, setPayment] = useState(channel === 'salon' ? 'pending' : 'approved')
  const [fulfillment, setFulfillment] = useState('delivery')
  const [error, setError] = useState('')
  const [hint, setHint] = useState('')
  const [lastId, setLastId] = useState(() => localStorage.getItem(trackingKey(site.id, channel)))
  const [checkoutOpen, setCheckoutOpen] = useState(false)
  const checkoutRef = useRef(null)
  const trackRef = useRef(null)
  const inHouse = channel === 'salon'
  // Un plato retirado en Gestión desaparece de la carta de la sede.
  const visible = state.products.filter(item => item.active !== false && (category === 'Todos' || item.category === category))
  const grouped = state.products.filter(item => cart[item.id] > 0)
  const count = grouped.reduce((total, item) => total + cart[item.id], 0)
  const subtotal = grouped.reduce((total, item) => total + cart[item.id] * item.price, 0)
  const lastOrder = state.orders.find(order => order.id === lastId)
  const availableCategories = categoryOrder.filter(name => state.products.some(product => product.category === name))
  // La reserva viva de la mesa: el salón debe saber a quién espera la comanda.
  const tableReservation = (state.reservations ?? []).find(item =>
    item.table === table && !['cancelada', 'completada', 'no_presento'].includes(item.status))
  const openTab = state.orders.filter(order => order.fulfillment === 'salon' && order.table === table && order.payment === 'pending')
  const tables = state.tables?.length ? state.tables.map(item => item.label) : ['Mesa 01', 'Mesa 02', 'Mesa 03', 'Mesa 04', 'Mesa 05', 'Mesa 06']
  const productAnchor = useRef(null)

  function add(product, change) {
    setError('')
    setHint('')
    setCart(old => {
      const quantity = old[product.id] || 0
      return { ...old, [product.id]: change < 0 ? Math.max(0, quantity - 1) : Math.min(quantity + 1, product.available) }
    })
  }

  function suggest(product) {
    const alternate = state.products.find(item => item.category === product.category && item.available)
      || state.products.find(item => item.category === 'Fondos' && item.available)
    if (!alternate) {
      setHint('Por ahora no hay otro plato disponible.')
      return
    }
    setCategory(alternate.category)
    setHint(`Puedes elegir ${alternate.name.toLowerCase()} como alternativa.`)
    requestAnimationFrame(() => productAnchor.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }

  function showCheckout() {
    setCheckoutOpen(true)
    requestAnimationFrame(() => checkoutRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' }))
  }

  async function submit(event) {
    event.preventDefault()
    if (!grouped.length || waiting) return
    setWaiting('checkout')
    setError('')
    try {
      // En salón, el selector de pago combina el resultado y el medio: «pending», «declined» o un medio aprobado.
      const salonPaid = inHouse && !['pending', 'declined'].includes(payment)
      const { order } = await api('/api/orders', {
        method: 'POST',
        body: {
          siteId: site.id, channel,
          ...(inHouse ? { table } : { fulfillment, ...(fulfillment === 'delivery' ? { zone } : {}) }),
          payment: salonPaid ? 'approved' : payment,
          ...(salonPaid ? { method: payment } : {}),
          items: grouped.map(item => ({ productId: item.id, quantity: cart[item.id] })),
        },
      })
      setLastId(order.id)
      rememberOrder(order.id)
      localStorage.setItem(trackingKey(site.id, channel), order.id)
      setCart({})
      setCheckoutOpen(false)
      await refresh()
      requestAnimationFrame(() => trackRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }))
    } catch (err) {
      setError(err.message)
      await refresh()
    } finally {
      setWaiting('')
    }
  }

  return <>
    {inHouse ? <PageHeading eyebrow="POS móvil" title="Pedidos de salón" subtitle={`Registra la comanda de una mesa en ${site.name}.`} /> : <>
      {/* Portada a sangre: dos videos, mitad y mitad, y metadatos en las esquinas. */}
      <section className="hero" aria-label="Portada">
        <h1 className="sr-only">Fogón Andino · Cocina peruana al momento</h1>
        <div className="hero-panel"><LoopVideo name="central-video-1" eager still={photo('especial.jpg', 'center 46%')} /></div>
        <div className="hero-panel"><LoopVideo name="central-video-2" eager still={photo('carta.jpg')} /></div>
        <p className="hero-meta"><span>Miraflores · San Isidro — Lima, Perú</span><span>@fogonandino</span></p>
      </section>
      {/* Recorrido vertical: videos cuadrados al centro y textos que alternan de lado. */}
      <section className="recorrido frame" aria-labelledby="recorrido-titulo">
        <h2 className="recorrido-title" id="recorrido-titulo">Un solo fuego<br />de la altura<br />a la costa</h2>
        <div className="recorrido-grid">
          <div className="recorrido-media at-1"><LoopVideo name="central-video-3" still={photo('lomo-saltado.jpg')} /></div>
          <div className="recorrido-text at-left">
            <p className="recorrido-lead">Cada plato se cocina al momento de pedirlo, para tu mesa o camino a tu casa.</p>
            <p className="recorrido-body">Cada mañana, la cocina central de Ate prepara los fondos, ajíes y marinados que llegan a nuestras sedes. En cada fogón el plato se termina cuando lo pides: en el salón, para recoger o por delivery.</p>
          </div>
          <div className="recorrido-media at-2"><LoopVideo name="central-video-4" still={cartaTile('100%', '100%')} /></div>
          <div className="recorrido-text at-right">
            <p className="recorrido-label">Fogón Andino</p>
            <p className="recorrido-body">Pide desde la web o desde tu mesa: el pedido entra una sola vez, llega directo a la cocina y lo sigues con el mismo número hasta que esté contigo.</p>
            <p className="recorrido-links">
              <button type="button" className="text-link" onClick={() => productAnchor.current?.scrollIntoView({ behavior: 'smooth' })}>Ver la carta</button>
              <a className="text-link" href="#seguimiento">Seguir mi pedido</a>
            </p>
          </div>
        </div>
      </section>
    </>}
    <header className={`carta-head${inHouse ? '' : ' frame'}`} ref={productAnchor}>
      <h2>{inHouse ? 'Carta para salón' : 'La carta'}</h2>
      <p className="carta-sede">{site.name} · {inHouse ? 'consumo en salón' : 'salón, recojo y delivery'}</p>
      <nav className="filters" aria-label="Categorías de la carta">
        {['Todos', ...availableCategories].map(name =>
          <button key={name} aria-pressed={category === name} onClick={() => { setCategory(name); setHint('') }}>{name}</button>
        )}
      </nav>
    </header>
    <div className={`menu-layout${inHouse ? '' : ' frame'}`}>
      <section className="catalog" aria-label="Platos de la carta">
        {hint && <p className="suggestion" role="status">{hint}</p>}
        <div className="dish-grid">
          {visible.map(product => <article className="dish" key={product.id}>
            <div className={`dish-photo photo-${product.image}`} aria-hidden="true" />
            <div className="dish-content">
              <div className="dish-line">
                <h3>{product.name}</h3>
                <span className="dish-dots" aria-hidden="true" />
                <strong className="dish-price">{cash(product.price)}</strong>
              </div>
              <p>{product.description}</p>
              <div className="dish-actions">
                {!product.available ? <>
                  <span className="out-label">Agotado</span>
                  <button className="text-link" onClick={() => suggest(product)}>Ver alternativa</button>
                </> : cart[product.id] > 0 ? <span className="stepper">
                  <button onClick={() => add(product, -1)} aria-label={`Quitar ${product.name}`}><Minus size={13} /></button>
                  <span>{cart[product.id]}</span>
                  <button onClick={() => add(product, 1)} disabled={cart[product.id] >= product.available}
                    aria-label={`Sumar ${product.name}`}><Plus size={13} /></button>
                </span> : <button className="text-link" onClick={() => add(product, 1)} aria-label={`Agregar ${product.name}`}>
                  Agregar
                </button>}
              </div>
            </div>
          </article>)}
        </div>
      </section>
      <aside className={`side-panel ${checkoutOpen ? 'is-open' : ''}`} ref={checkoutRef}>
        <form className="checkout" onSubmit={submit}>
          <div className="checkout-head">
            <div className="bag-mark"><ShoppingBag size={20} /></div>
            <div><h2>Tu pedido</h2><p>{inHouse ? 'Consumo en salón' : 'Pedido en línea'}</p></div>
            {count > 0 && <button type="button" className="icon-button close-checkout" onClick={() => setCheckoutOpen(false)} aria-label="Cerrar pedido"><X size={18} /></button>}
          </div>
          {grouped.length ? <>
            <ul className="cart-items">
              {grouped.map(product => <li key={product.id}>
                <div><strong>{product.name}</strong><small>{cash(product.price * cart[product.id])}</small></div>
                <div className="quantity">
                  <button type="button" aria-label={`Quitar ${product.name}`} onClick={() => add(product, -1)}><Minus size={14} /></button>
                  <span>{cart[product.id]}</span>
                  <button type="button" aria-label={`Sumar ${product.name}`} disabled={cart[product.id] >= product.available} onClick={() => add(product, 1)}><Plus size={14} /></button>
                </div>
              </li>)}
            </ul>
            {inHouse ? <label className="field">
              <span>Mesa</span>
              <select value={table} onChange={event => setTable(event.target.value)}>
                {tables.map(name => <option key={name}>{name}</option>)}
              </select>
            </label> : <>
              <label className="field">
                <span>Entrega</span>
                <select value={fulfillment} onChange={event => setFulfillment(event.target.value)}>
                  <option value="delivery">Delivery</option>
                  <option value="recojo">Recojo en sede</option>
                </select>
              </label>
              {fulfillment === 'delivery' && <label className="field">
                <span>Zona de entrega</span>
                <select value={zone} onChange={event => setZone(event.target.value)}>
                  {[...site.deliveryZones, 'Fuera de cobertura'].map(name => <option key={name}>{name}</option>)}
                </select>
              </label>}
            </>}
            {inHouse && tableReservation && <p className="table-reservation">
              <b>{tableReservation.customer}</b> tiene reservada la {tableReservation.table} · {tableReservation.people} personas · {tableReservation.slot}
            </p>}
            {inHouse && openTab.length > 0 && <p className="table-reservation">
              Cuenta abierta en la {table}: <b>{cash(openTab.reduce((sum, order) => sum + order.total, 0))}</b> en {openTab.length} {openTab.length === 1 ? 'comanda' : 'comandas'}
            </p>}
            <label className="field">
              <span>{inHouse ? 'Cobro' : 'Pago de prueba (pasarela)'}</span>
              <select value={payment} onChange={event => setPayment(event.target.value)}>
                {inHouse ? <>
                  <option value="pending">Cobrar en caja al final</option>
                  <option value="tarjeta">Pagado ahora · Tarjeta</option>
                  <option value="yape">Pagado ahora · Yape</option>
                  <option value="plin">Pagado ahora · Plin</option>
                  <option value="declined">Pago rechazado (prueba)</option>
                </> : <>
                  <option value="approved">Aprobado</option>
                  <option value="declined">Rechazado</option>
                </>}
              </select>
            </label>
            <div className="total"><span>Total</span><strong>{cash(subtotal)}</strong></div>
            <Notice message={error} />
            <button className="button primary wide" type="submit" disabled={Boolean(waiting)}>
              {waiting === 'checkout' ? 'Enviando…' : 'Confirmar pedido'}
            </button>
          </> : <div className="cart-empty"><p>Agrega un plato de la carta.</p></div>}
        </form>
        {lastOrder && <div ref={trackRef}><Tracking order={lastOrder} compact /></div>}
      </aside>
    </div>
    {count > 0 && !checkoutOpen && <div className="mobile-cart">
      <button className="button primary wide" onClick={showCheckout}><ShoppingBag size={18} /> Ver pedido ({count}) <strong>{cash(subtotal)}</strong></button>
    </div>}
  </>
}

function ReceiptLink({ order }) {
  if (!order.reference) return null
  return <a className="button secondary receipt-link"
    href={'/api/orders/' + encodeURIComponent(order.id) + '/receipt'} target="_blank" rel="noopener noreferrer">
    <FileText size={16} /> {receiptName(order)} en PDF
  </a>
}

function OrderProgress({ order }) {
  const steps = order.fulfillment === 'delivery'
    ? ['registrado', 'preparacion', 'listo', 'en_camino', 'entregado']
    : ['registrado', 'preparacion', 'listo', 'entregado']
  const current = steps.indexOf(order.status)
  return <ol className="order-progress" aria-label="Estado del pedido">
    {steps.map((status, index) => {
      const entry = order.history.find(event => event.status === status)
      return <li key={status} aria-current={index === current ? 'step' : undefined} data-done={index < current}>
        <span className="progress-mark" aria-hidden="true">{index < current && <Check size={12} />}</span>
        <div><strong>{statusLabels[status]}</strong>
          {entry && <time dateTime={entry.at}>{time(entry.at)}</time>}
        </div>
      </li>
    })}
  </ol>
}

function Tracking({ order, compact = false }) {
  const complete = order.status === 'entregado'
  return <section className="tracking" aria-label={'Seguimiento del pedido ' + order.id}>
    <div className="checkout-head">
      <div className="bag-mark"><ReceiptText size={20} /></div>
      <div><h2>{compact ? 'Tu pedido' : order.id}</h2>
        <p>{compact ? order.id : channelLine(order)}</p>
      </div>
      <Status status={order.status} />
    </div>
    <div className="tracking-body">
      <OrderProgress order={order} />
      {order.code ? <div className="tracking-code">
        <span>{complete ? 'Código confirmado' : 'Código de entrega'}</span>
        <strong aria-label={'Código ' + order.code}>{order.code}</strong>
      </div> : order.fulfillment === 'delivery' && <p className="tracking-note">El código aparece cuando cocina marca el pedido como listo.</p>}
      {order.delivery && <p className="courier-line">Lo lleva <b>{order.delivery.courier}</b> desde las {time(order.delivery.assignedAt)}</p>}
      {order.payment === 'pending' && <p className="tracking-note">Cuenta abierta: se cobra en caja y ahí se emite el comprobante.</p>}
      {!compact && <ul className="history-summary">{order.items.map(item => <li key={item.productId}>
        <span>{item.quantity} × {item.name}</span><strong>{cash(item.unitPrice * item.quantity)}</strong>
      </li>)}
        <li><strong>{order.payment === 'pending' ? 'Total por cobrar' : 'Total pagado'}</strong><strong>{cash(order.total)}</strong></li>
      </ul>}
      {(order.reference || compact) && <div className="tracking-actions">
        <ReceiptLink order={order} />
        {compact && <a className="link-button" href={orderHref(order.id)}>Ver seguimiento</a>}
      </div>}
    </div>
  </section>
}

function TrackingPage({ orderId }) {
  const [query, setQuery] = useState(orderId)
  const [result, setResult] = useState(null)
  const [message, setMessage] = useState('')
  const [recent] = useState(recentOrders)

  useEffect(() => {
    if (!orderId) return
    const controller = new AbortController()
    let pending = false
    let timer
    async function load() {
      if (pending) return
      pending = true
      try {
        const { order } = await api('/api/orders/' + encodeURIComponent(orderId), { signal: controller.signal })
        if (controller.signal.aborted) return
        setResult(order)
        setMessage('')
      } catch (error) {
        if (controller.signal.aborted) return
        if (error.code === 'NOT_FOUND') {
          setResult(null)
          clearInterval(timer)
        }
        setMessage(error.code ? error.message : 'No pudimos consultar el pedido. Comprueba la conexión con la demo.')
      } finally {
        pending = false
      }
    }
    load()
    timer = setInterval(load, 2000)
    return () => {
      controller.abort()
      clearInterval(timer)
    }
  }, [orderId])

  function search(event) {
    event.preventDefault()
    const id = normalizedOrderId(query)
    if (!id) {
      setMessage('Ingresa el número completo del pedido, por ejemplo FA-1005.')
      return
    }
    if (orderId !== id) location.hash = orderHref(id)
  }

  return <>
    <PageHeading eyebrow="Pedidos" title="Seguimiento" subtitle="Consulta el estado, el código de entrega y la boleta de tu pedido." />
    <div className="lookup-layout">
      <section className="lookup-panel">
        <h2>Buscar un pedido</h2>
        <form onSubmit={search}>
          <label className="field"><span>Número de pedido</span>
            <input placeholder="FA-1005" value={query} onChange={event => setQuery(event.target.value)}
              autoCapitalize="characters" autoCorrect="off" autoComplete="off" spellCheck={false} maxLength={18} required />
          </label>
          <button className="button primary" type="submit"><Search size={16} /> Buscar</button>
        </form>
        {recent.length > 0 && <div className="recent-orders"><h3>Recientes en este dispositivo</h3>
          <ul>{recent.map(id => <li key={id}><a href={orderHref(id)} aria-current={orderId === id ? 'true' : undefined}>{id}</a></li>)}</ul>
        </div>}
      </section>
      <div className="lookup-result">
        <Notice message={message} />
        {result ? <Tracking order={result} /> : orderId && !message ?
          <p className="empty" role="status">Buscando {orderId}…</p> : null}
      </div>
    </div>
  </>
}

function PageHeading({ eyebrow, title, subtitle }) {
  return <div className="page-heading"><p className="eyebrow"><i />{eyebrow}</p><h1>{title}</h1><p>{subtitle}</p></div>
}

function Reservations({ site, siteId }) {
  const [date, setDate] = useState(() => todayInLima())
  const [service, setService] = useState('cena')
  const [agenda, setAgenda] = useState({ tables: [], slots: { almuerzo: [], cena: [] }, reservations: [] })
  const [selected, setSelected] = useState('')
  const [form, setForm] = useState({ table: '', slot: '', customer: '', phone: '', people: '2', notes: '' })
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [waiting, setWaiting] = useState('')

  const load = useCallback(async () => {
    try {
      const result = await api(`/api/reservations?site=${encodeURIComponent(siteId)}&date=${encodeURIComponent(date)}`)
      setAgenda(result)
      setError('')
    } catch (problem) {
      setError(problem.message)
    }
  }, [siteId, date])

  useEffect(() => {
    load()
    const ticker = setInterval(load, 5000)
    return () => clearInterval(ticker)
  }, [load])

  useEffect(() => { setSelected('') }, [date, service])

  const days = useMemo(() => Array.from({ length: 7 }, (_, offset) => {
    const value = new Date(`${todayInLima()}T12:00:00Z`)
    value.setUTCDate(value.getUTCDate() + offset)
    return value.toISOString().slice(0, 10)
  }), [])

  const slots = agenda.slots?.[service] ?? []
  const tables = agenda.tables ?? []
  const current = agenda.reservations.find(item => item.id === selected)
  const active = current && reservationActions[current.status] ? current : null

  function openForm(table, slot) {
    setForm(previous => ({ ...previous, table, slot }))
    setError('')
    setNotice('')
  }

  function field(name, value) {
    setForm(previous => ({ ...previous, [name]: value }))
  }

  async function submit(event) {
    event.preventDefault()
    if (waiting) return
    setWaiting('save')
    setError('')
    setNotice('')
    try {
      const { reservation } = await api('/api/reservations', {
        method: 'POST',
        body: {
          siteId, table: form.table, customer: form.customer, phone: form.phone,
          people: Number(form.people), slot: form.slot, date, notes: form.notes,
        },
      })
      setForm({ table: '', slot: '', customer: '', phone: '', people: '2', notes: '' })
      setNotice(`Reserva ${reservation.id} registrada en la ${reservation.table}.`)
      setSelected(reservation.id)
      await load()
    } catch (problem) {
      setError(problem.message)
    } finally {
      setWaiting('')
    }
  }

  async function move(reservation, status) {
    if (waiting) return
    setWaiting(reservation.id)
    setError('')
    try {
      await api(`/api/reservations/${encodeURIComponent(reservation.id)}`, { method: 'PATCH', body: { status } })
      await load()
    } catch (problem) {
      setError(problem.message)
    } finally {
      setWaiting('')
    }
  }

  return <>
    <PageHeading
      eyebrow="Reservas de mesa · SGP v2"
      title="Agenda"
      subtitle={`Cada mesa tiene su turno en ${site?.name ?? 'la sede'}. Una mesa, un turno: la regla la impone la base de datos, no la interfaz.`} />

    <div className="date-strip" role="group" aria-label="Días de la agenda">
      {days.map(value => <button key={value} className={value === date ? 'is-current' : undefined}
        aria-pressed={value === date} onClick={() => setDate(value)}>
        <span>{shortDay(value)}</span>
        {value === todayInLima() && <small>Hoy</small>}
      </button>)}
    </div>

    <div className="service-toggle" role="group" aria-label="Servicio">
      {['almuerzo', 'cena'].map(name => <button key={name} aria-pressed={service === name}
        onClick={() => setService(name)}>{name === 'almuerzo' ? 'Almuerzo' : 'Cena'}</button>)}
    </div>

    <div className="reservas-layout">
      <div className="board-wrap" style={{ '--tables': tables.length }}>
        <div className="board-head-row">
          <span className="board-corner">{longDay(date)}</span>
          {tables.map(table => <span key={table.label}>{table.label}<small>{table.seats} lug.</small></span>)}
        </div>
        {slots.map(slot => <div className="board-row" key={slot}>
          <span className="board-slot">{slot}</span>
          {tables.map(table => {
            const reservation = agenda.reservations.find(item => item.table === table.label && item.slot === slot)
            return reservation
              ? <button key={table.label} className={`cell taken ${reservation.status}`}
                aria-label={`${table.label}, ${slot}: ${reservation.customer}, ${reservation.people} personas, ${reservationLabels[reservation.status]}`}
                onClick={() => { setSelected(reservation.id); setError(''); setNotice('') }}>
                <strong>{reservation.customer}</strong>
                <span>{reservation.people} pax · {reservationLabels[reservation.status]}</span>
              </button>
              : <button key={table.label} className="cell free"
                aria-label={`Reservar ${table.label} el ${date} a las ${slot}`}
                onClick={() => openForm(table.label, slot)} />
          })}
        </div>)}
      </div>

      <aside className="reservas-aside">
        {active && <section className="reservation-detail">
          <p className="micro-label">{active.id} · {reservationLabels[active.status]}</p>
          <h3>{active.customer}</h3>
          <dl className="detail-list">
            <div><dt>Mesa</dt><dd>{active.table}</dd></div>
            <div><dt>Turno</dt><dd>{active.slot}</dd></div>
            <div><dt>Personas</dt><dd>{active.people}</dd></div>
            <div><dt>Teléfono</dt><dd>{active.phone}</dd></div>
          </dl>
          {active.notes && <p className="detail-notes">{active.notes}</p>}
          <div className="detail-actions">
            {reservationActions[active.status].map(([status, label]) => <button key={status}
              className="button secondary" disabled={Boolean(waiting)}
              onClick={() => move(active, status)}>{label}</button>)}
          </div>
        </section>}

        <section className="reservation-form">
          <p className="micro-label">Nueva reserva</p>
          <form onSubmit={submit}>
            <label className="field"><span>Mesa</span>
              <select value={form.table} onChange={event => field('table', event.target.value)} required>
                <option value="">Elige la mesa</option>
                {tables.map(table => <option key={table.label} value={table.label}>{table.label} · {table.seats} lugares</option>)}
              </select>
            </label>
            <label className="field"><span>Turno</span>
              <select value={form.slot} onChange={event => field('slot', event.target.value)} required>
                <option value="">Elige el turno</option>
                {[...slots, ...(agenda.slots?.almuerzo ?? [])].filter((slot, index, list) => list.indexOf(slot) === index)
                  .map(slot => <option key={slot} value={slot}>{slot}</option>)}
              </select>
            </label>
            <label className="field"><span>Nombre</span>
              <input value={form.customer} onChange={event => field('customer', event.target.value)}
                placeholder="Titular de la reserva" maxLength={80} required />
            </label>
            <label className="field"><span>Teléfono</span>
              <input value={form.phone} onChange={event => field('phone', event.target.value)}
                placeholder="987 654 321" maxLength={32} required />
            </label>
            <label className="field"><span>Personas</span>
              <input type="number" min={1} max={20} value={form.people}
                onChange={event => field('people', event.target.value)} required />
            </label>
            <label className="field"><span>Notas</span>
              <input value={form.notes} onChange={event => field('notes', event.target.value)}
                placeholder="Alergias, ocasión, preferencias" maxLength={240} />
            </label>
            <Notice message={error} />
            {notice && <p className="reservation-notice">{notice}</p>}
            <button className="button primary wide" type="submit" disabled={Boolean(waiting)}>
              {waiting === 'save' ? 'Registrando…' : 'Registrar reserva'}
            </button>
          </form>
        </section>
      </aside>
    </div>
  </>
}

function elapsed(since) {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(since).getTime()) / 60000))
  return minutes ? `${minutes} min` : 'Hace <1 min'
}

/* Tiempo objetivo del KDS (mejora M4 de la Figura 8): a tiempo hasta el 70 %
   del objetivo, en riesgo hasta el 100 % y atrasado después. */
function kdsTiming(order) {
  const spent = (Date.now() - new Date(order.createdAt).getTime()) / 60000
  const share = spent / order.targetMinutes
  const left = Math.round(order.targetMinutes - spent)
  return {
    share,
    state: share > 1 ? 'atrasado' : share > 0.7 ? 'riesgo' : 'a_tiempo',
    text: left >= 0 ? `Quedan ${left} min` : `Atrasado ${-left} min`,
  }
}

function OrderSummary({ order }) {
  return <>
    <header className="order-head">
      <div><span className="order-channel">{channelLine(order)}
        {order.priority === 'alta' && <span className="priority-tag">Prioridad</span>}
      </span><h3>{order.id}</h3></div>
      <Status status={order.status} />
    </header>
    <ul className="order-items">{order.items.map(item => <li key={item.productId}>
      <span className="item-amount">{item.quantity}×</span> {item.name}
    </li>)}</ul>
    <div className="order-meta"><Clock size={15} />{elapsed(order.createdAt)}{order.zone && <><MapPin size={15} />{order.zone}</>}</div>
  </>
}

function Kitchen({ state, site, waiting, changeOrder }) {
  const columns = [
    ['registrado', 'Por preparar', 'preparacion', 'Iniciar preparación'],
    ['preparacion', 'En preparación', 'listo', 'Marcar listo'],
    ['listo', 'Listos para salir'],
  ]
  return <>
    <PageHeading eyebrow="Pantalla de cocina · KDS" title="Cocina" subtitle={`Comandas de los seis canales en una misma cola de ${site.name}, ordenadas por prioridad y tiempo objetivo.`} />
    <div className="kanban">
      {columns.map(([status, heading, next, label]) => {
        // Cola del KDS: primero la prioridad alta, luego el vencimiento más próximo.
        const orders = state.orders.filter(order => order.status === status).sort((a, b) => next
          ? (a.priority === 'alta') === (b.priority === 'alta') ? a.dueAt.localeCompare(b.dueAt) : a.priority === 'alta' ? -1 : 1
          : a.createdAt.localeCompare(b.createdAt))
        return <section className="kanban-col" key={status}>
          <div className="lane-title"><h2>{heading}</h2><span>{orders.length}</span></div>
          {orders.length ? orders.map(order => {
            const timing = next ? kdsTiming(order) : null
            return <article className="order-card" key={order.id} data-timing={timing?.state}>
            <OrderSummary order={order} />
            {timing && <div className="kds-clock" style={{ color: `var(--${timing.state === 'atrasado' ? 'ember' : timing.state === 'riesgo' ? 'brass' : 'pampa'})` }}>
              <strong>{timing.text}</strong><span>Objetivo {order.targetMinutes} min</span>
              <span className="kds-meter" aria-hidden="true"><i style={{ width: `${Math.min(100, timing.share * 100)}%` }} /></span>
            </div>}
            {next && <button className="button secondary wide" disabled={Boolean(waiting)} onClick={() => changeOrder(order, next)}>{label}</button>}
          </article>
          }) : <p className="lane-empty">Sin comandas</p>}
        </section>
      })}
    </div>
    <Inventory key={site.id} state={state} />
  </>
}

function Dispatch({ state, site, waiting, changeOrder }) {
  const orders = state.orders.filter(order => ['listo', 'en_camino', 'entregado'].includes(order.status))
  return <>
    <PageHeading eyebrow="Entrega de pedidos" title="Despacho" subtitle={`Pedidos listos y entregas registradas en ${site.name}.`} />
    {orders.length ? <div className="dispatch-grid">
      {orders.map(order => <DispatchCard key={order.id} couriers={state.couriers ?? []} {...{ order, waiting, changeOrder }} />)}
    </div> : <p className="empty">Los pedidos aparecerán cuando cocina los marque como listos.</p>}
  </>
}

function DispatchCard({ order, couriers, waiting, changeOrder }) {
  const [code, setCode] = useState('')
  const own = couriers.filter(courier => courier.type === 'propio')
  const [courierId, setCourierId] = useState('')
  const next = order.status === 'listo' && order.fulfillment === 'delivery' ? 'en_camino' : 'entregado'
  const confirmCode = order.status === 'en_camino'
  const needsCourier = next === 'en_camino' && order.channelType !== 'agregador'
  const chosen = courierId || own.find(courier => !courier.busy)?.id || ''
  const actionLabel = next === 'en_camino'
    ? order.channelType === 'agregador' ? `Entregar al repartidor de ${order.channelName}` : 'Asignar y marcar en camino'
    : confirmCode ? 'Confirmar entrega' : order.fulfillment === 'salon' ? 'Servido en mesa' : 'Entregado al cliente'
  return <article className="order-card">
    <OrderSummary order={order} />
    {order.delivery && <p className="courier-line">Repartidor <b>{order.delivery.courier}</b> · asignado {time(order.delivery.assignedAt)}</p>}
    {order.payment === 'pending' && <p className="courier-line">Cuenta abierta · se cobra en Caja</p>}
    <div className="dispatch-actions">
      <ReceiptLink order={order} />
      <a className="link-button" href={orderHref(order.id)}>Ver seguimiento</a>
    </div>
    {order.status !== 'entregado' && <form onSubmit={event => {
      event.preventDefault()
      changeOrder(order, next, confirmCode ? code : undefined, needsCourier ? chosen : undefined)
    }}>
      {needsCourier && <label className="field"><span>Repartidor propio</span>
        <select value={chosen} onChange={event => setCourierId(event.target.value)} required>
          {own.map(courier => <option key={courier.id} value={courier.id} disabled={courier.busy}>
            {courier.name}{courier.busy ? ' · en ruta' : ''}
          </option>)}
        </select>
      </label>}
      {confirmCode && <DeliveryCode value={code} onChange={setCode} />}
      <button className="button secondary wide" disabled={Boolean(waiting) || (needsCourier && !chosen)}>
        {actionLabel} <Check size={16} />
      </button>
    </form>}
  </article>
}

function DeliveryCode({ value, onChange }) {
  const [cursor, setCursor] = useState(0)
  return <label className="field delivery-field"><span>Código del cliente</span>
    <span className="delivery-input">
      <input value={value} required inputMode="numeric" pattern="[0-9]{4}" maxLength={4} autoComplete="off"
        onChange={event => {
          const digits = event.target.value.replace(/[^0-9]/g, '')
          onChange(digits)
          setCursor(Math.min(event.target.selectionStart ?? digits.length, digits.length))
        }}
        onSelect={event => setCursor(event.currentTarget.selectionStart ?? 0)} />
      <span className="delivery-slots" aria-hidden="true">
        {Array.from({ length: 4 }, (_, index) => <span className="delivery-digit" key={index}
          data-caret={index === Math.min(cursor, 3) ? 'true' : undefined}>{value[index] ?? '·'}</span>)}
      </span>
    </span>
  </label>
}

function Evidence({ state, checkedAt, reset, waiting }) {
  const last = state.orders[0]
  const [showData, setShowData] = useState(false)
  const endpoint = `/api/state?site=${encodeURIComponent(state.siteId)}`
  // Rutas de la API: método, ruta y, si se puede abrir en el navegador, su enlace.
  const routes = [
    ['GET', '/api/health', '/api/health'],
    ['GET', '/api/state', endpoint],
    ['GET', '/api/orders/:id'],
    ['GET', '/api/orders/:id/receipt'],
    ['POST', '/api/orders'],
    ['PATCH', '/api/orders/:id'],
    ['POST', '/api/orders/:id/payment'],
    ['POST', '/api/connectors/:canal/orders'],
    ['POST', '/api/cash-closures'],
    ['PATCH', '/api/sites/:sede/products/:plato'],
    ['GET', '/api/metrics', `/api/metrics?site=${state.siteId}`],
    ['GET', '/api/reservations', `/api/reservations?site=${state.siteId}`],
    ['POST', '/api/reservations'],
    ['PATCH', '/api/reservations/:id'],
  ]
  const routeItem = ([method, path, href]) => <li key={`${method} ${path}`}>
    <code>{method}</code>{href ? <a href={href} target="_blank" rel="noreferrer">{path}</a> : <span>{path}</span>}
  </li>
  const reservationEvents = [...(state.reservationEvents ?? [])].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 8)
  return <>
    <PageHeading eyebrow="Sustentación · Avance final" title="Evidencia del proceso" subtitle="El mismo pedido se consulta desde la carta, el POS, cocina y despacho." />
    {/* A la vista, solo lo que se señala al exponer; el resto queda plegado debajo. */}
    <div className="evidence-grid">
      <section className="evidence-card">
        <div className="section-title"><h2>API REST local</h2><Code2 size={21} /></div>
        <p>La PWA en React consulta la API de NestJS. PostgreSQL conserva los pedidos, las existencias y los cambios de estado.</p>
        <ul className="endpoints">{routes.slice(0, 2).map(routeItem)}</ul>
        <a className="link-button contract-link" href="/openapi.json" target="_blank" rel="noreferrer">Contrato OpenAPI</a>
        <p className="small">Última consulta {checkedAt ? time(checkedAt) : 'pendiente'}</p>
      </section>
      <section className="evidence-card event-card">
        <div className="section-title"><h2>Eventos de dominio</h2><Database size={21} /></div>
        {state.events.length ? <ul className="events">
          {state.events.slice(0, 8).map((event, i) => <li key={`${event.subject}:${event.type}:${i}`}>
            <time dateTime={event.at}>{time(event.at)}</time><strong>{event.type}</strong><span>{event.orderId ?? event.subject}</span>
          </li>)}
        </ul> : <p>Registra un pedido para ver los eventos de la sede.</p>}
        {last && <><button className="link-button" onClick={() => setShowData(!showData)} aria-expanded={showData}>{showData ? 'Ocultar datos del último pedido' : 'Ver datos del último pedido'}</button>
          {showData && <pre>{JSON.stringify(last, null, 2)}</pre>}</>}
      </section>
    </div>
    <details className="fold">
      <summary>Todas las rutas de la API <small>{routes.length}</small></summary>
      <ul className="endpoints fold-body">{routes.map(routeItem)}</ul>
    </details>
    {reservationEvents.length > 0 && <details className="fold">
      <summary>Eventos de reservas <small>{reservationEvents.length}</small></summary>
      <ul className="events fold-body">
        {reservationEvents.map((event, i) => <li key={`${event.reservationId}:${event.type}:${i}`}>
          <time dateTime={event.at}>{time(event.at)}</time><strong>{event.type}</strong><span>{event.reservationId}</span>
        </li>)}
      </ul>
    </details>}
    <details className="fold">
      <summary>Trazabilidad con el Avance 2</summary>
      <dl className="trace fold-body">
        <div><dt>Proceso</dt><dd>Figura 8, p. 31 · Web y salón → OMS → KDS → despacho.</dd></div>
        <div><dt>Datos</dt><dd>Figura 11, p. 39 · Pedido, detalle, canal, sede y producto.</dd></div>
        <div><dt>Alcance</dt><dd>Tabla 38, pp. 83–84 · RF-02, RF-03 y RF-04 en dos canales. Carta y precios por sede de RF-12.</dd></div>
        <div><dt>Capacidades</dt><dd>Figura 14, p. 46 · Las seis capacidades del SGP v2: carta y precios por sede, OMS, KDS, delivery y despacho, reservas de mesa, y caja y cobros.</dd></div>
        <div><dt>Canales</dt><dd>Tabla 1, p. 9 · Salón, web, WhatsApp, teléfono, Rappi y PedidosYa en un mismo gestor. Los agregadores entran por conector con su propio formato (M1, RF-11 → P05).</dd></div>
        <div><dt>Mejoras</dt><dd>Figura 8, p. 31 · M2 stock y cobertura, M4 KDS con prioridad y tiempo objetivo, M5 comprobante desde el cobro, M6 repartidor asignado, M7 indicadores para BI.</dd></div>
        <div><dt>Datos</dt><dd>Figura 11, p. 39 · CANAL, PAGO, COMPROBANTE, REPARTIDOR, ENTREGA, MESA y RESERVA como tablas de PostgreSQL.</dd></div>
        <div><dt>Calendario</dt><dd>Figura 17, p. 68 · P04 y piloto operativo previsto para septiembre de 2027.</dd></div>
      </dl>
    </details>
    {['localhost', '127.0.0.1', '[::1]'].includes(location.hostname) && <div className="reset-row"><button className="button secondary" onClick={reset} disabled={Boolean(waiting)}><RefreshCw size={16} /> Reiniciar datos de prueba</button></div>}
  </>
}

createRoot(document.getElementById('root')).render(<App />)

if ('serviceWorker' in navigator && window.isSecureContext) {
  const hash = new URL(import.meta.url).pathname.split('/').pop().replace(/\.js$/, '')
  navigator.serviceWorker.register(`/sw.js?build=${encodeURIComponent(hash)}`).catch(error => {
    console.warn('No se pudo preparar la PWA:', error)
  })
}
