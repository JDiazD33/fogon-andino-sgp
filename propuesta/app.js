(() => {
  const carta = window.cartaFogon;
  const key = 'fogon-andino:propuesta:1';
  const views = new Map();
  const live = ['http:', 'https:'].includes(window.location.protocol);
  let adminMode;
  const sites = [
    { id: 'miraflores', name: 'Miraflores', index: 0, deliveryZones: ['Miraflores', 'Barranco'] },
    { id: 'san-isidro', name: 'San Isidro', index: 1, deliveryZones: ['San Isidro', 'Lince'] },
  ];
  const timeZone = 'America/Lima';
  const date = new Intl.DateTimeFormat('fr-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
  const dateClock = new Intl.DateTimeFormat('es-PE', { timeZone, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const amounts = new Intl.NumberFormat('es-PE', { maximumFractionDigits: 2 });
  const today = () => date.format(new Date());
  const dateTime = value => value ? dateClock.format(new Date(value)) : '—';
  const money = cents => `S/ ${amounts.format(cents / 100)}`;
  const total = order => order.items.reduce((amount, item) => amount + item.qty * item.price, 0);
  const escapeMap = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => escapeMap[char]);

  function status(value) {
    const tone = {
      'En preparación': 'warm', 'En camino': 'warm', 'Pendiente': 'warm',
      'Listo': 'positive', 'Entregado': 'positive', 'Pagado': 'positive',
      'Confirmada': 'positive', 'Llegó': 'positive', 'Completada': 'positive',
      'Reponer': 'warm', 'Agotado': 'negative', 'Cancelada': 'negative', 'Rechazado': 'negative',
    }[value] || 'neutral';
    return `<span class="op-status op-status--${tone}">${esc(value)}</span>`;
  }

  function sampleState() {
    const clock = Date.now();
    const minutesAgo = minutes => new Date(clock - minutes * 60000).toISOString();
    const orderSamples = [
      { customer: 'Andrea Reyes', channel: 'Web', fulfillment: 'Delivery', status: 'Recibido', payment: 'Pagado', method: 'Yape', dish: 'pachamanca', minute: 4 },
      { customer: 'Luis Salas', channel: 'Salón', fulfillment: 'Salón', table: 'Mesa 02', status: 'En preparación', payment: 'Pendiente', method: '', dish: 'rocoto-relleno-con-pastel-de-papa', minute: 11 },
      { customer: 'Sara Vega', channel: 'WhatsApp', fulfillment: 'Delivery', status: 'Listo', payment: 'Pagado', method: 'Yape', dish: 'tacu-tacu-con-lomo', minute: 23 },
      { customer: 'Rosa León', channel: 'Rappi', fulfillment: 'Delivery', status: 'En camino', payment: 'Pagado', method: 'Tarjeta', courier: 'Repartidor del canal', dish: 'pollo-a-la-brasa', minute: 31 },
      { customer: 'Diego Ríos', channel: 'Teléfono', fulfillment: 'Recojo', status: 'Entregado', payment: 'Pagado', method: 'Efectivo', dish: 'arroz-con-pato', minute: 43 },
    ];
    const orders = sites.flatMap(site => orderSamples.map((sample, index) => {
      const number = 1041 + site.index * orderSamples.length + index;
      const dish = carta.productos.find(product => product.id === sample.dish);
      const id = `FA-${number}`;
      return {
        id, site: site.id, customer: sample.customer, channel: sample.channel,
        fulfillment: sample.fulfillment, table: sample.table ?? '', status: sample.status,
        payment: sample.payment, method: sample.method,
        items: [{ id: dish.id, name: dish.nombre, price: dish.precios[site.index], qty: index === 1 ? 2 : 1 }],
        createdAt: minutesAgo(sample.minute), updatedAt: minutesAgo(Math.max(0, sample.minute - 3)),
        courier: sample.courier ?? '', deliveryCode: String(4000 + number),
        receipt: index === 4 ? { number: `B00${site.index + 1}-00000001`, type: 'Boleta', issuedAt: minutesAgo(35) } : null,
      };
    }));
    const reservations = sites.flatMap(site => [
      { id: `RES-${201 + site.index * 2}`, site: site.id, customer: 'Luis Salas', table: 'Mesa 02', date: today(), time: '13:00', people: 2, phone: '', status: 'Llegó' },
      { id: `RES-${202 + site.index * 2}`, site: site.id, customer: 'Elena Paz', table: 'Mesa 04', date: today(), time: '19:00', people: 4, phone: '', status: 'Confirmada' },
    ]);
    return {
      version: 1, site: sites[0].id, nextOrder: 1051, orders, reservations, closings: [],
      catalog: { miraflores: {}, 'san-isidro': {} },
      events: orders.map(order => ({
        site: order.site, time: order.updatedAt, kind: 'Pedido', ref: order.id,
        description: `${order.channel} · ${order.status}`,
      })),
    };
  }

  function readState() {
    try {
      const saved = JSON.parse(window.localStorage.getItem(key));
      if (saved?.version === 1 && sites.some(site => site.id === saved.site) && Array.isArray(saved.orders)) return saved;
    } catch {
      // La demo también puede funcionar en memoria si el navegador restringe el almacenamiento local.
    }
    return sampleState();
  }

  const branchKey = `${key}:sede`;
  function storedSite() {
    try {
      return sites.find(site => site.id === window.localStorage.getItem(branchKey))?.id ?? sites[0].id;
    } catch {
      return sites[0].id;
    }
  }
  let state = live ? { site: storedSite(), orders: [], events: [], reservations: [], closings: [] } : readState();
  const liveSites = new Map();
  const agenda = new Map();
  let orderLookup;
  let activeRead;
  let saving = false;
  let activeView = '';
  const publicPage = document.querySelector('#vista-carta');
  const publicSections = new Map([
    ['carta-completa', {
      main: document.querySelector('#vista-carta-completa'),
      heading: document.querySelector('#titulo-carta-completa'),
      title: 'La carta',
    }],
    ['sedes-completas', {
      main: document.querySelector('#vista-sedes-completas'),
      heading: document.querySelector('#titulo-sedes-completas'),
      title: 'Nuestras sedes',
    }],
  ]);
  const clientNav = document.querySelector('#menu-cliente');
  const brand = document.querySelector('#marca-principal');
  const modeLink = document.querySelector('#cambiar-modo');
  const clientFooter = document.querySelector('#pie-cliente');
  const adminFooter = document.querySelector('#pie-administrativo');
  const shell = document.querySelector('#vista-operativa');
  const adminNav = document.querySelector('#menu-operativo');
  const root = document.querySelector('#contenido-operativo');
  const heading = document.querySelector('#titulo-vista');
  const intro = document.querySelector('#intro-vista');
  const context = document.querySelector('#contexto-vista');
  const branch = document.querySelector('#sede-operativa');
  const notice = document.querySelector('#aviso-operativo');
  const skip = document.querySelector('#saltar-contenido');
  const connection = document.querySelector('#conexion-propuesta');
  const connectionMessage = document.querySelector('#conexion-mensaje');
  const retry = document.querySelector('#conexion-reintentar');

  function persist() {
    try {
      if (live) window.localStorage.setItem(branchKey, state.site);
      else window.localStorage.setItem(key, JSON.stringify(state));
    } catch {
      // Los cambios siguen disponibles durante esta sesión.
    }
  }

  function currentSite() {
    const site = sites.find(item => item.id === state.site);
    return { ...site, ...liveSites.get(site.id)?.site };
  }

  function publicPrice(item, index) {
    const siteId = sites[index].id;
    const catalog = live ? liveSites.get(siteId)?.catalog : state.catalog[siteId];
    return catalog?.[item.id]?.price ?? item.precios[index];
  }

  function publicActive(item, index) {
    const siteId = sites[index].id;
    return live ? liveSites.get(siteId)?.catalog[item.id]?.active === true : state.catalog[siteId][item.id]?.active !== false;
  }

  function connectionStatus(message = '', error = false) {
    connection.hidden = !message;
    connection.dataset.error = String(error);
    connectionMessage.textContent = message;
    retry.hidden = !error;
  }

  async function synchronize({ background = false } = {}) {
    if (!live || (background && activeRead)) return;
    const backend = window.Fogon.backend;
    const { id, param } = route();
    const siteId = state.site;
    activeRead?.abort();
    const read = new AbortController();
    activeRead = read;
    try {
      if (!backend) throw new Error('El conector de la API no está disponible.');
      if (id === 'seguimiento' || id === 'pedido') {
        const code = /^FA-[0-9]+$/i.test(param) ? param.toUpperCase() : '';
        const cached = code && orderLookup?.id === code && orderLookup.order;
        if (!background) {
          connectionStatus();
          if (!cached) orderLookup = code ? { id: code, pending: true } : undefined;
          renderPage();
        }
        if (code) {
          const previous = orderLookup;
          try {
            const order = await backend.order(code, { signal: read.signal });
            if (read.signal.aborted) return;
            orderLookup = { id: code, order };
          } catch (error) {
            if (read.signal.aborted) return;
            if (error.status !== 404) throw error;
            orderLookup = { id: code, order: null };
          }
          if (!background || JSON.stringify(previous) !== JSON.stringify(orderLookup)) renderPage();
        }
      } else if (id !== 'sedes-completas') {
        const firstLoad = !liveSites.has(siteId);
        if (!background && firstLoad) connectionStatus(`Cargando datos de ${currentSite().name}…`);
        const data = await (adminMode ? backend.load : backend.catalog)(siteId, { signal: read.signal });
        if (read.signal.aborted) return;
        const signature = JSON.stringify(data);
        const changed = liveSites.get(siteId)?.signature !== signature;
        liveSites.set(siteId, { ...data, signature, checkedAt: new Date().toISOString() });
        if (!background || changed) {
          carta.mostrar();
          if (activeView) renderPage();
        }
        if (firstLoad && id === 'carta-completa' && param) document.getElementById(`plato-${param}`)?.scrollIntoView({ behavior: 'instant' });
      } else {
        connectionStatus();
        return;
      }
      connectionStatus();
      return true;
    } catch (error) {
      if (read.signal.aborted) return;
      if (id === 'seguimiento' || id === 'pedido') {
        orderLookup = { id: param, error: 'No se pudo consultar el pedido en el servidor.' };
        renderPage();
      }
      connectionStatus(error.status ? error.message : 'No se pudo consultar la API de Fogón Andino. Comprueba que el servidor esté en ejecución.', true);
      return false;
    } finally {
      if (activeRead === read) activeRead = undefined;
    }
  }

  async function run(task, message) {
    if (saving) return;
    saving = true;
    const from = window.location.hash;
    const siteId = state.site;
    notify('Guardando en el servidor…');
    try {
      const result = await task();
      const synced = await synchronize();
      if (window.location.hash === from && state.site === siteId) {
        if (synced === false) notify('El servidor guardó el cambio. Usa Reintentar para actualizar la vista.', 'error');
        else notify(typeof message === 'function' ? message(result) : message);
      }
      return result;
    } catch (error) {
      if (window.location.hash === from && state.site === siteId) notify(error.status ? error.message : 'No se pudo confirmar el cambio. Consulta el estado antes de volver a intentarlo.', 'error');
    } finally {
      saving = false;
    }
  }

  async function loadReservationDay(day, siteId, { signal, quiet = false } = {}) {
    try {
      const data = await window.Fogon.backend.reservations(siteId, day, { signal });
      if (!agenda.has(siteId)) agenda.set(siteId, new Map());
      agenda.get(siteId).set(day, data.reservations);
      return data;
    } catch (error) {
      if (!signal?.aborted && !quiet) notify(error.status ? error.message : 'No se pudo consultar la agenda del servidor.', 'error');
    }
  }

  function rememberReservation(reservation, siteId) {
    if (!agenda.has(siteId)) agenda.set(siteId, new Map());
    const dates = agenda.get(siteId);
    const others = (dates.get(reservation.date) ?? []).filter(item => item.id !== reservation.id);
    dates.set(reservation.date, [...others, reservation]);
  }

  function log(kind, ref, description) {
    state.events.unshift({ site: state.site, time: new Date().toISOString(), kind, ref, description });
  }

  function createOrder({ customer, channel, fulfillment, table = '', items, payment = 'Pendiente', method = '', note = '', phone = '', externalRef = '', zone = '', priority = 'normal' }) {
    const number = state.nextOrder++;
    const now = new Date().toISOString();
    const order = {
      id: `FA-${number}`, site: state.site, customer, channel, fulfillment, table, items, payment, method,
      note, phone, externalRef, zone, priority, status: 'Recibido', createdAt: now, updatedAt: now, courier: '',
      deliveryCode: String(1000 + number % 9000), receipt: null,
    };
    state.orders.unshift(order);
    log('Pedido', order.id, `Registrado por ${channel} · ${fulfillment}`);
    return order;
  }

  function notify(message = '', type = 'success') {
    notice.hidden = !message;
    notice.dataset.tone = type;
    notice.textContent = message;
  }

  function commit(mutate, message) {
    mutate();
    persist();
    carta.mostrar();
    renderPage();
    notify(message);
  }

  function reset() {
    if (live) {
      return run(async () => {
        const result = await window.Fogon.backend.reset();
        agenda.clear();
        liveSites.clear();
        return result;
      }, 'Se restablecieron los datos del servidor local.');
    }
    const site = state.site;
    state = sampleState();
    state.site = site;
    commit(() => log('Demostración', 'Local', 'Se restablecieron los datos de ejemplo.'), 'Se restablecieron los datos de la demostración.');
  }

  function initialAdminMode() {
    const url = new URL(window.location.href);
    const mode = url.searchParams.get('modo');
    if (mode !== null || !live) return mode === 'administrativo';

    const [id] = url.hash.slice(1).split('/', 1);
    if (id === 'seguimiento' || !views.has(id)) return false;

    url.searchParams.set('modo', 'administrativo');
    window.history.replaceState(window.history.state, '', url);
    return true;
  }

  function route() {
    const [id, ...pieces] = window.location.hash.slice(1).split('/');
    if (adminMode && (!views.has(id) || id === 'seguimiento')) return { id: 'salon', param: '', redirect: '#salon' };
    if (!adminMode && /^plato-[a-z0-9-]+$/.test(id)) {
      const param = id.slice('plato-'.length);
      return { id: 'carta-completa', param, redirect: `#carta-completa/${param}` };
    }
    if (!adminMode && id !== 'seguimiento' && !publicSections.has(id) && id !== 'carta' && id && id !== 'inicio' &&
        !publicPage.contains(document.getElementById(id))) {
      return { id: 'inicio', param: '', redirect: '#inicio' };
    }
    let param = pieces.join('/');
    try {
      param = decodeURIComponent(param);
    } catch {
      param = '';
    }
    return { id, param };
  }

  function renderPage() {
    const { id, param } = route();
    const view = views.get(id);
    if (!view) return;
    const site = currentSite();
    heading.textContent = view.title;
    intro.textContent = view.intro;
    const adminContext = live ? 'Administración · Servidor de la demo' : 'Administración · Demostración local';
    context.textContent = adminMode ? adminContext : 'Atención al cliente';
    branch.value = site.id;
    const source = liveSites.get(site.id);
    if (live && adminMode && id !== 'pedido' && !source) {
      root.innerHTML = '<p class="op-empty">Esperando los datos de esta sede.</p>';
      return;
    }
    const orders = live ? source?.orders ?? [] : state.orders.filter(order => order.site === site.id);
    const userReservations = live ? [...(agenda.get(site.id)?.entries() ?? [])]
      .filter(([day]) => day !== today()).flatMap(([, reservations]) => reservations) : [];
    const reservations = live ? [...(source?.reservations ?? []), ...userReservations] : state.reservations.filter(reservation => reservation.site === site.id);
    const viewContext = {
      root, site, routeParam: param, orders, reservations,
      state: live ? { ...state, orders, reservations, events: source?.events ?? [], closings: source?.closings ?? [] } : state,
      menu: carta.productos, esc, money, total, status, dateTime, today, commit, notify, createOrder, log, reset,
      productPrice: item => publicPrice(item, site.index),
      productActive: item => publicActive(item, site.index),
      backend: live ? window.Fogon.backend : undefined,
      run, orderLookup: orderLookup?.id === param.toUpperCase() ? orderLookup : undefined,
      loadReservationDay: (day, options) => loadReservationDay(day, site.id, options),
      hasReservationDay: day => day === today() || agenda.get(site.id)?.has(day),
      rememberReservation: reservation => rememberReservation(reservation, site.id),
      tables: source?.tables, couriers: source?.couriers, cash: source?.cash, stock: source?.stock,
      recipes: source?.recipes, checkedAt: source?.checkedAt,
      productAvailability: source ? id => source.catalog[id]?.available ?? 0 : undefined,
    };
    root.innerHTML = view.render(viewContext);
    view.bind?.(viewContext);
  }

  function updateRoute(moveFocus = true) {
    const { id, param, redirect } = route();
    if (redirect) window.history.replaceState(window.history.state, '', redirect);
    const next = adminMode || id === 'seguimiento' ? id : '';
    const section = publicSections.get(id);
    const leftView = (activeView || [...publicSections.values()].some(page => !page.main.hidden)) && !next && !section;
    activeView = next;
    publicPage.hidden = Boolean(next || section);
    for (const [sectionId, page] of publicSections) page.main.hidden = sectionId !== id;
    const featuredDish = carta.cambiarVista(id === 'carta-completa', param);
    shell.hidden = !next;
    branch.closest('label').hidden = !adminMode || (live && id === 'pedido');
    shell.classList.toggle('op-shell--public', !adminMode);
    skip.href = `#${next ? heading.id : section?.heading.id ?? 'carta'}`;
    skip.textContent = next || section ? 'Saltar al contenido' : 'Saltar a la carta';
    notify();

    const navigation = adminMode ? adminNav : clientNav;
    for (const link of navigation.querySelectorAll('a')) {
      const target = link.getAttribute('href').slice(1);
      if (target === id) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    }

    if (next) {
      document.title = `${views.get(next).title} | Fogón Andino`;
      renderPage();
      window.scrollTo({ top: 0, behavior: 'instant' });
      if (moveFocus) heading.focus({ preventScroll: true });
    } else {
      root.replaceChildren();
      if (section) {
        document.title = `${section.title} | Fogón Andino`;
        if (featuredDish) featuredDish.scrollIntoView({ behavior: 'instant' });
        else window.scrollTo({ top: 0, behavior: 'instant' });
        if (moveFocus) (featuredDish || section.heading).focus({ preventScroll: true });
      } else {
        document.title = 'Fogón Andino | Cocina peruana';
        if (leftView || redirect) (document.getElementById(id) || document.body).scrollIntoView({ behavior: 'instant' });
      }
    }
    if (live) void synchronize();
  }

  function selectSite(site) {
    state.site = site.id;
    persist();
    carta.selector.value = site.index;
    carta.mostrar();
    notify();
    if (activeView) renderPage();
    if (live) void synchronize();
  }

  window.Fogon = {
    register(id, view) { views.set(id, view); },
    publicPrice,
    publicActive,
    publicAvailability(item, index) { return liveSites.get(sites[index].id)?.catalog[item.id]?.available ?? 0; },
    publicSite(index) { return liveSites.get(sites[index].id)?.site; },
    refresh() { return synchronize(); },
    live,
  };

  document.addEventListener('DOMContentLoaded', () => {
    adminMode = initialAdminMode();
    skip.hidden = false;
    clientNav.hidden = adminMode;
    clientFooter.hidden = adminMode;
    adminNav.hidden = !adminMode;
    adminFooter.hidden = !adminMode;
    modeLink.hidden = false;
    if (adminMode) {
      brand.href = '#salon';
      modeLink.href = '?modo=cliente#inicio';
      modeLink.textContent = 'Modo cliente';
      modeLink.closest('.cabecera').classList.add('cabecera-administrativa');
    }
    carta.selector.value = currentSite().index;
    carta.mostrar();
    branch.addEventListener('change', () => selectSite(sites.find(site => site.id === branch.value)));
    carta.selector.addEventListener('change', () => selectSite(sites[Number(carta.selector.value)]));
    for (const link of document.querySelectorAll('[data-sede]')) {
      link.addEventListener('click', () => selectSite(sites[Number(link.dataset.sede)]));
    }
    skip.addEventListener('click', event => {
      const target = activeView ? heading : publicSections.get(route().id)?.heading;
      if (target) {
        event.preventDefault();
        target.focus();
      }
    });
    window.addEventListener('hashchange', () => updateRoute());
    retry.addEventListener('click', () => void synchronize());
    updateRoute(false);
    if (live) {
      const automaticViews = new Set(['cocina', 'despacho', 'seguimiento', 'salon', 'pedido', 'caja']);
      const refreshVisible = () => {
        if (document.hidden || saving || (activeView && !automaticViews.has(activeView))) return;
        const focused = document.activeElement;
        if ((root.contains(focused) || document.querySelector('#pedido-web').contains(focused)) &&
            focused.matches('input, select, textarea, button')) return;
        if (activeView === 'caja' && [...root.querySelectorAll('form input, form select')].some(field =>
          field.matches('select') ? field.selectedIndex > 0 : field.value !== field.defaultValue
        )) return;
        void synchronize({ background: true });
      };
      window.setInterval(refreshVisible, 4000);
      document.addEventListener('visibilitychange', refreshVisible);
    }
  });
})();
