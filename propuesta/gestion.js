(() => {
  'use strict';

  const canales = ['Salón', 'Web', 'WhatsApp', 'Teléfono', 'Rappi', 'PedidosYa'];
  const conectores = {
    Rappi: 'pachamanca',
    PedidosYa: 'ceviche-clasico',
  };
  const comisiones = { Rappi: 27, PedidosYa: 25 };
  const borradores = new Map();
  const mensajesConectores = new Map();
  const filtrosGestion = new Map();
  const numero = new Intl.NumberFormat('es-PE', { maximumFractionDigits: 1 });
  const normalizeText = value => value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase('es');
  const fechaLima = new Intl.DateTimeFormat('fr-CA', {
    timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit',
  });
  const horaLima = new Intl.DateTimeFormat('es-PE', {
    timeZone: 'America/Lima', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  });

  function platosDisponibles(ctx) {
    return ctx.menu.filter(ctx.productActive);
  }

  function porDia(orders, day) {
    return orders.filter(order => fechaLima.format(new Date(order.createdAt)) === day);
  }

  function options(values, current, esc) {
    return values.map(value => '<option value="' + esc(value) + '"' +
      (value === current ? ' selected' : '') + '>' + esc(value) + '</option>').join('');
  }

  function metric(label, value, detail, esc) {
    return '<div class="op-metric"><p class="op-kicker">' + esc(label) + '</p>' +
      '<strong class="op-amount">' + esc(value) + '</strong>' +
      '<p class="op-muted">' + esc(detail) + '</p></div>';
  }

  function channelDraft(siteId) {
    if (!borradores.has(siteId)) {
      borradores.set(siteId, { fields: { channel: 'WhatsApp', fulfillment: 'Delivery', payment: 'Pendiente', method: 'Efectivo' }, items: new Map() });
    }
    return borradores.get(siteId);
  }

  function centralItems(ctx, draft) {
    return [...draft.items].flatMap(([id, qty]) => {
      const item = ctx.menu.find(product => product.id === id);
      return item ? [{ id, name: item.nombre, qty, price: ctx.productPrice(item) }] : [];
    });
  }

  function renderCentralItems(ctx, draft) {
    const items = centralItems(ctx, draft);
    const total = items.reduce((amount, item) => amount + item.qty * item.price, 0);
    if (!items.length) return '<p class="op-empty">Agrega un plato para preparar el pedido.</p>';
    return `<ul class="op-list">${items.map(item => `<li class="op-row">
      <span>${item.qty} × ${ctx.esc(item.name)}</span>
      <span class="op-amount">${ctx.money(item.qty * item.price)}</span>
    </li>`).join('')}</ul>
    <div class="op-row canal-total"><span>Total del pedido</span><strong class="op-amount">${ctx.money(total)}</strong></div>`;
  }

  function recentConnectorOrder(ctx, channel) {
    return ctx.orders.filter(order => order.channel === channel && order.externalRef)
      .sort((first, second) => second.createdAt.localeCompare(first.createdAt))[0];
  }

  function connectorActivity(ctx, channel) {
    const key = `${ctx.site.id}:${channel}`;
    if (!mensajesConectores.has(key)) mensajesConectores.set(key, { responses: [] });
    return mensajesConectores.get(key);
  }

  function connectorEvidence(ctx, channel, recent) {
    if (!ctx.backend) {
      return recent ? `<details class="gestion-desplegable"><summary>Datos del último mensaje</summary>
        <pre tabindex="0">${ctx.esc(JSON.stringify({ referencia: recent.externalRef, pedido: recent.id, estado: recent.status, platos: recent.items }, null, 2))}</pre>
      </details>` : '';
    }
    const { payload, responses, open } = connectorActivity(ctx, channel);
    const message = payload ?? (recent ? ctx.backend.connectorPayload(channel, recent, ctx.site) : null);
    return `${message ? `<details class="gestion-desplegable" data-conector-mensaje="${ctx.esc(channel)}"${open ? ' open' : ''}>
      <summary>Mensaje de ${ctx.esc(channel)}</summary>
      <pre tabindex="0">${ctx.esc(JSON.stringify(message, null, 2))}</pre>
    </details>` : ''}
    ${responses.length ? `<ul class="op-list" aria-label="Respuestas de ${ctx.esc(channel)}">${responses.map(response => `<li class="op-row">
      <div><code>${ctx.esc(response.status ?? '—')}</code> · ${ctx.esc(response.message)}${response.id ? ` <a class="op-link" href="#pedido/${encodeURIComponent(response.id)}">${ctx.esc(response.id)}</a>` : ''}</div>
      <time datetime="${ctx.esc(response.at)}" title="${ctx.esc(ctx.dateTime(response.at))}">${horaLima.format(new Date(response.at))}</time>
    </li>`).join('')}</ul>` : ''}`;
  }

  function renderConnector(ctx, channel, available) {
    const recent = recentConnectorOrder(ctx, channel);
    const hasMessage = recent || (ctx.backend && connectorActivity(ctx, channel).payload);
    return '<section class="op-panel op-stack"><div class="op-panel-head"><h3>' + ctx.esc(channel) +
      '</h3><span class="op-kicker">Simulado · Comisión ' + comisiones[channel] + ' %</span></div>' +
      '<p class="op-muted">Recibe un pedido de prueba en la cola de cocina de esta sede.</p>' +
      (recent ? '<p class="op-muted">Última referencia registrada <span class="op-code">' + ctx.esc(recent.externalRef) +
        '</span> · Pedido <a class="op-link" href="#pedido/' + encodeURIComponent(recent.id) + '">' +
        ctx.esc(recent.id) + '</a></p>' : '') +
      '<div class="op-actions"><button type="button" class="op-button" data-recibir-canal="' + ctx.esc(channel) +
      '"' + (available ? '' : ' disabled') + '>Recibir pedido de prueba</button>' +
      '<button type="button" class="op-button op-button--secondary" data-reenviar-canal="' + ctx.esc(channel) +
      '"' + (hasMessage ? '' : ' disabled') + '>Reenviar el mismo mensaje</button></div>' +
      `<div class="op-stack" data-conector-respuestas="${ctx.esc(channel)}">${connectorEvidence(ctx, channel, recent)}</div></section>`;
  }

  function renderCanales(ctx) {
    const draft = channelDraft(ctx.site.id);
    const fields = draft.fields;
    const live = Boolean(ctx.backend);
    const portions = Fogon.inventory?.availablePortions?.(ctx);
    const available = platosDisponibles(ctx).some(item => (portions?.get(item.id) ?? Infinity) > 0);
    const today = porDia(ctx.orders, ctx.today());
    const zones = ctx.site.deliveryZones || [ctx.site.name];
    return `<div class="op-stack">
      <section class="op-metrics canal-indicadores" aria-label="Pedidos del día por canal">${canales.map(channel =>
        metric(channel, today.filter(order => order.channel === channel).length,
          channel in conectores ? 'Agregador' : 'Canal propio', ctx.esc)).join('')}</section>
      <div class="canal-registro">
        <div id="canales-selector">${renderCanalPicker(ctx, draft)}</div>
        <form class="op-panel op-stack" id="canales-registro">
          <div><p class="op-kicker">Canales propios</p><h2>Registrar pedido</h2></div>
          <fieldset class="canal-opciones"><legend>Canal</legend>${['WhatsApp', 'Teléfono'].map(channel => `<label>
            <input type="radio" name="channel" value="${channel}"${fields.channel === channel ? ' checked' : ''}>
            <span>${channel}</span></label>`).join('')}</fieldset>
          <div class="op-fields">
            <label class="op-field">Cliente<input name="customer" required maxlength="80" autocomplete="off" value="${ctx.esc(fields.customer || '')}"></label>
            <label class="op-field">Teléfono<input name="phone" type="tel" maxlength="32" autocomplete="off"${live ? ' required' : ''} value="${ctx.esc(fields.phone || '')}"></label>
            <label class="op-field">Entrega<select name="fulfillment">${options(['Delivery', 'Recojo'], fields.fulfillment, ctx.esc)}</select></label>
            <label class="op-field" data-canal-zona${fields.fulfillment === 'Delivery' ? '' : ' hidden'}>Zona de entrega<select name="zone">
              ${options([...zones, 'Fuera de cobertura'], fields.zone ?? zones[0], ctx.esc)}</select></label>
            ${live ? '<input type="hidden" name="payment" value="Pagado">' : `<label class="op-field">Pago<select name="payment">${options(['Pendiente', 'Pagado'], fields.payment, ctx.esc)}</select></label>`}
            <label class="op-field" data-metodo-pago${live || fields.payment === 'Pagado' ? '' : ' hidden'}>${live ? 'Forma de pago de prueba' : 'Forma de pago'}<select name="method">
              ${options(live ? ['Pasarela', 'Yape', 'Plin'] : ['Efectivo', 'Tarjeta', 'Yape', 'Plin', 'Enlace de pago'], fields.method, ctx.esc)}</select></label>
          </div>
          <label class="canal-prioridad"><input type="checkbox" name="priority"${fields.priority ? ' checked' : ''}> Prioridad alta en cocina</label>
          <div class="op-stack" id="canales-detalle" aria-live="polite">${renderCentralItems(ctx, draft)}</div>
          <div class="op-actions"><button class="op-button" type="submit"${draft.items.size ? '' : ' disabled'}>Registrar pedido</button></div>
        </form>
      </div>
      <section class="op-stack" aria-labelledby="conectores-externos"><h2 id="conectores-externos">Conectores de prueba</h2>
        <div class="op-grid op-grid--2">${Object.keys(conectores).map(channel => renderConnector(ctx, channel, available)).join('')}</div>
      </section>
    </div>`;
  }

  function renderCanalPicker(ctx, draft) {
    return Fogon.productPicker.render(ctx, { id: 'canales', title: 'Carta de la sede', items: centralItems(ctx, draft) });
  }

  function bindCanales(ctx) {
    const draft = channelDraft(ctx.site.id);
    const form = ctx.root.querySelector('#canales-registro');
    const detail = form.querySelector('#canales-detalle');
    const picker = ctx.root.querySelector('#canales-selector');
    const submit = form.querySelector('[type="submit"]');
    const portions = Fogon.inventory?.availablePortions?.(ctx);
    function updateQuantity(id, delta) {
      if (!platosDisponibles(ctx).some(item => item.id === id)) return;
      const qty = (draft.items.get(id) ?? 0) + delta;
      if (qty > 50) {
        ctx.notify('Agrega hasta 50 porciones por plato.', 'error');
        return;
      }
      if (delta > 0 && !draft.items.has(id) && draft.items.size >= 50) {
        ctx.notify('Agrega hasta 50 platos distintos por pedido.', 'error');
        return;
      }
      if (delta > 0 && qty > (portions?.get(id) ?? Infinity)) {
        ctx.notify('No hay existencias para agregar otra porción de este plato.', 'error');
        return;
      }
      if (qty > 0) draft.items.set(id, qty);
      else draft.items.delete(id);
      picker.innerHTML = renderCanalPicker(ctx, draft);
      bindPicker();
      detail.innerHTML = renderCentralItems(ctx, draft);
      submit.disabled = !draft.items.size;
    }
    function bindPicker() {
      Fogon.productPicker.bind(ctx, {
        root: picker, id: 'canales', onAdd: id => updateQuantity(id, 1), onRemove: id => updateQuantity(id, -1),
      });
    }
    bindPicker();

    const saveField = event => {
      if (event.target.form !== form) return;
      draft.fields[event.target.name] = event.target.type === 'checkbox' ? event.target.checked : event.target.value;
      if (event.target.name === 'payment') {
        form.querySelector('[data-metodo-pago]').hidden = event.target.value !== 'Pagado';
      }
      if (event.target.name === 'fulfillment') {
        form.querySelector('[data-canal-zona]').hidden = event.target.value !== 'Delivery';
      }
    };
    form.addEventListener('input', saveField);

    form.addEventListener('submit', event => {
      event.preventDefault();
      const values = Object.fromEntries(new FormData(form));
      const customer = values.customer.trim();
      const phone = values.phone.trim();
      const items = centralItems(ctx, draft);
      const available = new Set(platosDisponibles(ctx).map(item => item.id));
      const invalidPhone = phone && (!/^\+?[\d(). -]{7,32}$/.test(phone) || phone.replace(/\D/g, '').length < 7);
      if (!customer || invalidPhone || (ctx.backend && !phone)) {
        ctx.notify('Revisa el nombre y el teléfono del cliente.', 'error');
        return;
      }
      if (!items.length || items.some(item => !available.has(item.id) || item.qty > (portions?.get(item.id) ?? Infinity))) {
        ctx.notify('Agrega al pedido al menos un plato publicado con existencias suficientes.', 'error');
        return;
      }
      if (!ctx.backend && values.fulfillment === 'Delivery' && !(ctx.site.deliveryZones || [ctx.site.name]).includes(values.zone)) {
        ctx.notify('La dirección indicada está fuera de la cobertura de esta sede.', 'error');
        return;
      }
      const input = { customer, phone, channel: values.channel, fulfillment: values.fulfillment,
        items, payment: values.payment, method: values.payment === 'Pagado' ? values.method : '',
        zone: values.fulfillment === 'Delivery' ? values.zone : '', priority: values.priority ? 'alta' : 'normal' };
      if (ctx.backend) {
        ctx.run(async () => {
          const order = await ctx.backend.placeOrder(input, ctx.site);
          borradores.delete(ctx.site.id);
          return order;
        }, order => `Pedido ${order.id} registrado en Cocina${order.receipt ? ` · ${order.receipt.number}` : ''}.`);
        return;
      }
      ctx.commit(() => {
        ctx.createOrder(input);
        borradores.delete(ctx.site.id);
      }, 'Pedido registrado en la cola de cocina.');
    });

    for (const channel of Object.keys(conectores)) {
      const evidence = ctx.root.querySelector(`[data-conector-respuestas="${channel}"]`);
      const receive = ctx.root.querySelector(`[data-recibir-canal="${channel}"]`);
      const resend = ctx.root.querySelector(`[data-reenviar-canal="${channel}"]`);
      const recent = recentConnectorOrder(ctx, channel);
      evidence.addEventListener('toggle', event => {
        if (event.target.matches('[data-conector-mensaje]')) connectorActivity(ctx, channel).open = event.target.open;
      }, true);

      function deliver(payload) {
        void ctx.run(async () => {
          const activity = connectorActivity(ctx, channel);
          activity.payload = payload;
          activity.open = true;
          const previousDisabled = receive.disabled;
          receive.disabled = true;
          resend.disabled = true;
          try {
            const result = await ctx.backend.connectorOrder(channel, null, ctx.site, { payload });
            activity.responses.unshift({ status: result.status, id: result.order.id, at: new Date().toISOString(),
              message: result.duplicate ? 'Duplicado ignorado · se conserva' : 'Pedido registrado en Cocina' });
            return result;
          } catch (error) {
            activity.responses.unshift({ status: error.status, at: new Date().toISOString(),
              message: error.status ? error.message : 'La API no respondió.' });
            throw error;
          } finally {
            activity.responses = activity.responses.slice(0, 5);
            if (evidence.isConnected) {
              receive.disabled = previousDisabled;
              resend.disabled = false;
              evidence.innerHTML = connectorEvidence(ctx, channel, recent);
            }
          }
        }, result => result.duplicate
          ? `HTTP ${result.status} · Duplicado ignorado. Se conserva ${result.order.id}.`
          : `HTTP ${result.status} · Pedido ${result.order.id} registrado en Cocina.`);
      }

      receive.addEventListener('click', () => {
        const available = platosDisponibles(ctx).filter(item => (portions?.get(item.id) ?? Infinity) > 0);
        const selected = available.find(item => item.id === conectores[channel]) || available[0];
        if (!selected) {
          ctx.notify('Se requiere un plato publicado y con existencias para probar este conector.', 'error');
          return;
        }
        const [serial] = crypto.getRandomValues(new Uint32Array(1));
        const externalRef = `${channel === 'PedidosYa' ? 'PY' : 'RP'}-${serial}`;
        const input = { customer: 'Cliente de prueba', phone: '900000000', channel, fulfillment: 'Delivery',
          items: [{ id: selected.id, name: selected.nombre, qty: 1, price: ctx.productPrice(selected) }],
          payment: 'Pagado', method: 'Agregador', externalRef };
        if (ctx.backend) {
          deliver(ctx.backend.connectorPayload(channel, input, ctx.site));
          return;
        }
        ctx.commit(() => {
          ctx.createOrder(input);
        }, 'Mensaje recibido. El pedido de prueba está en Cocina.');
      });
      resend.addEventListener('click', () => {
        if (ctx.backend) {
          const payload = connectorActivity(ctx, channel).payload ?? (recent ? ctx.backend.connectorPayload(channel, recent, ctx.site) : null);
          if (payload) deliver(payload);
          return;
        }
        if (!recent) return;
        ctx.commit(() => {
          ctx.log('Duplicado bloqueado', recent.id, 'El mensaje ' + recent.externalRef + ' ya está asociado a este pedido.');
        }, 'El mensaje ya estaba registrado. Se conservó el pedido ' + recent.id + '.');
      });
    }
  }

  function offlineMetrics(ctx) {
    const day = ctx.today();
    const orders = porDia(ctx.orders, day);
    const events = ctx.state.events.filter(event => event.site === ctx.site.id && fechaLima.format(new Date(event.time)) === day);
    const duplicates = events.filter(event => event.kind === 'Duplicado bloqueado').length;
    const times = orders.filter(order => order.fulfillment === 'Delivery' && order.status === 'Entregado')
      .map(order => (Date.parse(order.deliveredAt || order.updatedAt) - Date.parse(order.createdAt)) / 60000)
      .filter(time => Number.isFinite(time) && time >= 0);
    const paid = orders.filter(order => order.payment === 'Pagado');
    const sales = paid.reduce((amount, order) => amount + ctx.total(order), 0) / 100;
    const open = ctx.orders.filter(order => order.payment === 'Pendiente');
    const openAmount = open.reduce((amount, order) => amount + ctx.total(order), 0) / 100;
    const todayReservations = ctx.reservations.filter(reservation => reservation.date === day);
    const active = todayReservations.filter(reservation => !['Cancelada', 'No se presentó'].includes(reservation.status));
    const byChannel = canales.map(name => {
      const matching = orders.filter(order => order.channel === name);
      const channelSales = matching.filter(order => order.payment === 'Pagado')
        .reduce((amount, order) => amount + ctx.total(order), 0) / 100;
      const commission = comisiones[name] ?? 0;
      return { name, orders: matching.length, sales: channelSales, commission, commissionCost: channelSales * commission / 100 };
    });
    return {
      orders: { total: orders.length, paid: paid.length, sales, averageTicket: paid.length ? sales / paid.length : null,
        viaApi: orders.length, viaApiPct: orders.length ? 100 : null, duplicatesBlocked: duplicates, rejectedByConnector: 0 },
      byChannel,
      kitchen: { inQueue: ctx.orders.filter(order => ['Recibido', 'En preparación'].includes(order.status)).length },
      delivery: { delivered: times.length, averageMinutes: times.length ? times.reduce((sum, time) => sum + time, 0) / times.length : null },
      payments: { openTabs: open.length, openTabsAmount: openAmount },
      reservations: { active: active.length, covers: active.reduce((amount, reservation) => amount + reservation.people, 0),
        noShows: todayReservations.filter(reservation => reservation.status === 'No se presentó').length },
    };
  }

  function measure(value, unit) {
    return value == null ? '—' : `${numero.format(value)} ${unit}`;
  }

  function goals(ctx, metrics) {
    const { orders, delivery } = metrics;
    const orderGoal = metrics.goals?.oe1 ?? { baseline: 22, target: 100 };
    const errorGoal = metrics.goals?.oe2 ?? { baseline: 6.5 };
    const deliveryGoal = metrics.goals?.oe3 ?? { baseline: 52, target: 35 };
    return `<section class="op-metrics gestion-metas" aria-label="Metas del Avance 2">
      ${metric('OE1 · Sin redigitación', measure(orders.viaApiPct, '%'), `${orders.viaApi} de ${orders.total} pedidos en el gestor · Base ${orderGoal.baseline} % · Meta ${orderGoal.target} %`, ctx.esc)}
      ${metric('OE2 · Errores evitados', orders.duplicatesBlocked + orders.rejectedByConnector, `${orders.duplicatesBlocked} duplicados bloqueados · ${orders.rejectedByConnector} rechazos del conector · Base ${numero.format(errorGoal.baseline)} %`, ctx.esc)}
      ${metric('OE3 · Tiempo de entrega', measure(delivery.averageMinutes, 'min'), `${delivery.delivered} ${delivery.delivered === 1 ? 'entrega' : 'entregas'} · Base ${deliveryGoal.baseline} min · Meta ≤ ${deliveryGoal.target} min`, ctx.esc)}
    </section>`;
  }

  function salesBreakdown(ctx, channels) {
    const money = value => ctx.money(Math.round(value * 100));
    const max = Math.max(1, ...channels.map(channel => channel.sales));
    return `<div class="op-table-wrap"><table class="op-table gestion-ventas">
      <thead><tr><th scope="col">Canal</th><th scope="col">Pedidos</th><th scope="col">Ventas</th><th scope="col">Comisión</th></tr></thead>
      <tbody>${channels.map(({ name, orders, sales, commission, commissionCost }) =>
        `<tr><th scope="row">${ctx.esc(name)}<meter min="0" max="${max}" value="${sales}" aria-hidden="true"></meter></th>
          <td>${orders}</td><td class="op-amount">${money(sales)}</td>
          <td>${commission ? `${money(commissionCost)} · ${commission} %` : '—'}</td></tr>`).join('')}</tbody>
    </table></div>`;
  }

  function secondaryMetrics(ctx, metrics) {
    const { kitchen, orders, payments, reservations } = metrics;
    const money = value => ctx.money(Math.round(value * 100));
    return `<div class="op-metrics" aria-label="Otros indicadores de hoy">
        ${metric('Pedidos de hoy', orders.total, `${orders.paid} cobrados · ${money(orders.sales)}`, ctx.esc)}
        ${metric('Ticket promedio', orders.averageTicket == null ? '—' : money(orders.averageTicket), 'Pedidos cobrados hoy', ctx.esc)}
        ${metric('Cuentas abiertas', payments.openTabs, `${money(payments.openTabsAmount)} pendiente de cobro`, ctx.esc)}
        ${ctx.backend
          ? metric('Cocina a tiempo', measure(kitchen.onTimePct, '%'), `${kitchen.inQueue} en cola · ${kitchen.lateNow} atrasados · Preparación media ${measure(kitchen.averagePrepMinutes, 'min')}`, ctx.esc)
          : metric('Cocina', kitchen.inQueue, 'Comandas pendientes de preparación', ctx.esc)}
        ${metric('Reservas de hoy', reservations.active, `${reservations.covers} comensales · ${reservations.noShows} no se presentaron`, ctx.esc)}
      </div>
      <section class="op-stack"><div class="op-panel-head"><h2>Ventas por canal</h2><strong class="op-amount">${money(orders.sales)}</strong></div>
        ${salesBreakdown(ctx, metrics.byChannel)}
      </section>`;
  }

  function catalogTable(ctx) {
    const { esc } = ctx;
    const categories = [...new Set(ctx.menu.map(item => item.categoria))];
    const availability = Fogon.inventory?.availablePortions?.(ctx);
    const rows = categories.map(category => `<tbody data-gestion-grupo="${esc(category)}">
      <tr class="gestion-grupo"><th colspan="5" scope="rowgroup">${esc(category)}</th></tr>
      ${ctx.menu.filter(item => item.categoria === category).map(item => {
        const active = ctx.productActive(item);
        const id = esc(item.id);
        const name = esc(item.nombre);
        const input = `gestion-precio-${id}`;
        const form = `gestion-form-${id}`;
        return `<tr data-gestion-plato="${id}">
          <th scope="row">${name}</th>
          <td class="gestion-precio" data-label="Precio (S/)">
            <label class="solo-lectores" for="${input}">Precio de ${name}</label>
            <input form="${form}" id="${input}" name="price" type="number" min="1" max="999" step="0.01" inputmode="decimal" required value="${(ctx.productPrice(item) / 100).toFixed(2)}">
          </td>
          <td class="gestion-racion" data-label="Porciones">${availability?.get(item.id) ?? '—'}</td>
          <td class="gestion-publicacion" data-label="Carta"><span data-gestion-activo="${active}">${active ? 'Publicado' : 'Retirado'}</span></td>
          <td class="gestion-acciones"><form id="${form}" data-editar-plato="${id}">
            <button class="op-button op-button--secondary" type="submit" aria-label="Guardar precio de ${name}">Guardar</button>
            <button class="op-link" type="button" data-gestion-publicar aria-label="${active ? 'Retirar' : 'Publicar'} ${name}">${active ? 'Retirar' : 'Publicar'}</button>
          </form></td>
        </tr>`;
      }).join('')}
    </tbody>`).join('');

    return `<section class="op-panel op-stack" id="gestion-carta">
      <div class="op-panel-head"><h2>Carta y precios por sede</h2><span>${platosDisponibles(ctx).length} de ${ctx.menu.length} publicados</span></div>
      <p class="op-muted">Los cambios en ${esc(ctx.site.name)} se reflejan en la carta, el salón y los canales de esta sede.</p>
      <div class="op-fields">
        <label class="op-field">Buscar plato<input id="gestion-buscar" type="search" placeholder="Nombre del plato"></label>
        <label class="op-field">Categoría<select id="gestion-categoria"><option value="">Todas las categorías</option>${options(categories, '', esc)}</select></label>
      </div>
      <p class="op-muted" id="gestion-resultados" role="status">${ctx.menu.length} platos</p>
      <div class="op-table-wrap" id="gestion-tabla"><table class="op-table gestion-tabla">
        <thead><tr><th scope="col">Plato</th><th scope="col">Precio (S/)</th><th scope="col">Porciones</th><th scope="col">Carta</th><th scope="col">Acciones</th></tr></thead>
        ${rows}
      </table></div>
      <p class="op-empty" id="gestion-sin-resultados" hidden>No hay platos que coincidan con esta búsqueda.</p>
    </section>`;
  }

  function renderGestion(ctx) {
    const metrics = ctx.backend ? null : offlineMetrics(ctx);
    return `<div class="op-stack">
      ${ctx.backend ? '<p class="op-muted" id="gestion-datos-estado" role="status">Consultando los indicadores de la sede…</p>' : ''}
      <div id="gestion-metas">${metrics ? goals(ctx, metrics) : ''}</div>
      ${catalogTable(ctx)}
      <details class="op-panel gestion-desplegable" id="gestion-indicadores"${filtrosGestion.get(ctx.site.id)?.showIndicators ? ' open' : ''}>
        <summary>Más indicadores y ventas por canal</summary>
        <div class="op-stack gestion-desplegable-cuerpo" id="gestion-datos">${metrics ? secondaryMetrics(ctx, metrics) : 'Consultando datos…'}</div>
      </details>
    </div>`;
  }

  function bindLiveMetrics(ctx) {
    const goalsPanel = ctx.root.querySelector('#gestion-metas');
    const detail = ctx.root.querySelector('#gestion-datos');
    const status = ctx.root.querySelector('#gestion-datos-estado');
    let previous;

    async function refresh() {
      if (!goalsPanel.isConnected) return;
      try {
        const metrics = await ctx.backend.metrics(ctx.site.id);
        if (!goalsPanel.isConnected) return;
        const current = JSON.stringify(metrics);
        if (current !== previous) {
          goalsPanel.innerHTML = goals(ctx, metrics);
          detail.innerHTML = secondaryMetrics(ctx, metrics);
          previous = current;
        }
        status.hidden = true;
      } catch (error) {
        if (!goalsPanel.isConnected) return;
        const message = error.status ? error.message : 'No se pudieron consultar los indicadores de la sede.';
        status.textContent = previous ? `${message} Mostrando la última consulta.` : message;
        status.hidden = false;
        if (!previous) detail.textContent = 'Indicadores no disponibles por el momento.';
      }
      window.setTimeout(refresh, 4000);
    }

    void refresh();
  }

  function bindGestion(ctx) {
    const catalog = ctx.root.querySelector('#gestion-carta');
    const search = catalog.querySelector('#gestion-buscar');
    const category = catalog.querySelector('#gestion-categoria');
    const groups = [...catalog.querySelectorAll('[data-gestion-grupo]')];
    const results = catalog.querySelector('#gestion-resultados');
    const table = catalog.querySelector('#gestion-tabla');
    const empty = catalog.querySelector('#gestion-sin-resultados');
    const more = ctx.root.querySelector('#gestion-indicadores');
    const filter = filtrosGestion.get(ctx.site.id);
    if (filter) {
      search.value = filter.query;
      category.value = filter.category;
    }
    function filterCatalog() {
      filtrosGestion.set(ctx.site.id, { query: search.value, category: category.value, showIndicators: more.open });
      const query = normalizeText(search.value.trim());
      let visible = 0;
      for (const group of groups) {
        const matchingCategory = !category.value || group.dataset.gestionGrupo === category.value;
        let shown = 0;
        for (const row of group.querySelectorAll('[data-gestion-plato]')) {
          row.hidden = !matchingCategory || !normalizeText(row.cells[0].textContent).includes(query);
          if (!row.hidden) shown++;
        }
        group.hidden = shown === 0;
        visible += shown;
      }
      results.textContent = visible + (visible === 1 ? ' plato' : ' platos');
      table.hidden = visible === 0;
      empty.hidden = visible !== 0;
    }
    search.addEventListener('input', filterCatalog);
    category.addEventListener('change', filterCatalog);
    more.addEventListener('toggle', () => {
      if (more.isConnected) filtrosGestion.get(ctx.site.id).showIndicators = more.open;
    });
    filterCatalog();
    if (ctx.backend) bindLiveMetrics(ctx);

    async function saveProduct(item, changes, focusTarget) {
      const message = 'Se guardaron los cambios para ' + ctx.site.name + '.';
      if (ctx.backend) {
        await ctx.run(() => ctx.backend.updateProduct(ctx.site.id, item.id, changes), message);
      } else {
        const price = changes.price ?? ctx.productPrice(item);
        const published = changes.active ?? ctx.productActive(item);
        ctx.commit(() => {
          ctx.state.catalog[ctx.site.id][item.id] = { price, active: published };
          ctx.log('Carta actualizada', item.id, item.nombre + ' · ' + ctx.money(price) + ' · ' +
            (published ? 'Publicado' : 'Retirado de la carta'));
        }, message);
      }
      const form = document.getElementById(`gestion-form-${item.id}`);
      form?.querySelector(focusTarget)?.focus({ preventScroll: true });
    }
    for (const form of catalog.querySelectorAll('[data-editar-plato]')) {
      const item = ctx.menu.find(product => product.id === form.dataset.editarPlato);
      form.addEventListener('submit', event => {
        event.preventDefault();
        const price = Math.round(Number(form.elements.price.value) * 100);
        if (!Number.isInteger(price) || price < 100 || price > 99900) {
          ctx.notify('El precio debe estar entre S/ 1,00 y S/ 999,00.', 'error');
          return;
        }
        if (ctx.productPrice(item) === price) {
          ctx.notify('La carta ya tiene ese precio.', 'success');
          return;
        }
        saveProduct(item, { price }, '[type="submit"]');
      });
      form.querySelector('[data-gestion-publicar]').addEventListener('click', () => {
        saveProduct(item, { active: !ctx.productActive(item) }, '[data-gestion-publicar]');
      });
    }
  }


  function evidenceRoutes(ctx, order) {
    const server = ctx.backend ? location.origin : 'http://127.0.0.1:4173';
    const query = `?site=${encodeURIComponent(ctx.site.id)}`;
    const orderUrl = ctx.backend && order ? `${server}/api/orders/${encodeURIComponent(order.id)}` : undefined;
    return [
      ['GET', '/api/health', `${server}/api/health`],
      ['GET', '/api/state', `${server}/api/state${query}`],
      ['GET', '/api/orders/:id', orderUrl],
      ['GET', '/api/orders/:id/receipt', orderUrl && order.receipt ? `${orderUrl}/receipt` : undefined],
      ['POST', '/api/orders'],
      ['PATCH', '/api/orders/:id'],
      ['POST', '/api/orders/:id/payment'],
      ['POST', '/api/connectors/:channel/orders'],
      ['POST', '/api/cash-closures'],
      ['PATCH', '/api/sites/:site/products/:product'],
      ['GET', '/api/metrics', `${server}/api/metrics${query}`],
      ['GET', '/api/reservations', `${server}/api/reservations${query}`],
      ['POST', '/api/reservations'],
      ['PATCH', '/api/reservations/:id'],
    ];
  }

  function renderEndpoints(ctx, routes) {
    const { esc } = ctx;
    return `<ul class="op-list evidencia-rutas">${routes.map(([method, path, href]) => `<li>
      <code class="evidencia-metodo">${method}</code>
      ${href ? `<a class="op-code" href="${esc(href)}" target="_blank" rel="noopener noreferrer">${esc(path)}</a>` : `<span class="op-code">${esc(path)}</span>`}
    </li>`).join('')}</ul>`;
  }

  function renderEvidencia(ctx) {
    const { esc } = ctx;
    const events = ctx.state.events.filter(event => event.site === ctx.site.id)
      .sort((first, second) => second.time.localeCompare(first.time));
    const kinds = [...new Set(events.map(event => event.kind))].sort((first, second) => first.localeCompare(second, 'es'));
    const order = [...ctx.orders].sort((first, second) => second.createdAt.localeCompare(first.createdAt))[0];
    const reservationEvents = events.filter(event => event.kind === 'Reserva');
    const domainEvents = events.filter(event => event.kind !== 'Reserva');
    const routes = evidenceRoutes(ctx, order);
    const canReset = !ctx.backend || ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
    const consulted = ctx.backend ? ctx.checkedAt : new Date().toISOString();
    const details = order ? {
      pedido: order.id, sede: ctx.site.name, canal: order.channel, entrega: order.fulfillment, estado: order.status,
      pago: order.payment, total: ctx.money(ctx.total(order)), platos: order.items,
      creado: order.createdAt, actualizado: order.updatedAt,
      comprobante: order.receipt ? { numero: order.receipt.number, tipo: order.receipt.type } : null,
    } : null;
    const snapshot = {
      entorno: ctx.backend ? 'API local de Fogón Andino' : 'Propuesta HTML local',
      almacenamiento: ctx.backend ? 'PostgreSQL' : 'Navegador',
      versionDatos: ctx.state.version,
      sede: { id: ctx.site.id, nombre: ctx.site.name },
      consulta: consulted,
      pedidos: ctx.orders.length,
      reservas: ctx.reservations.length,
      platosPublicados: platosDisponibles(ctx).length,
      eventos: events.length,
    };
    const rows = events.map(event => `<tr data-tipo-evento="${esc(event.kind)}">
      <td><time datetime="${esc(event.time)}">${esc(ctx.dateTime(event.time))}</time></td>
      <th scope="row">${esc(event.kind)}</th><td class="op-code">${esc(event.ref || '—')}</td><td>${esc(event.description)}</td>
    </tr>`).join('');

    return `<div class="op-stack">
      <div class="op-grid op-grid--2">
        <section class="op-panel op-stack" id="evidencia-sistema" aria-labelledby="evidencia-api-titulo">
          <h2 id="evidencia-api-titulo">API REST local</h2>
          <p>${ctx.backend ? 'La propuesta está conectada a NestJS. PostgreSQL conserva los pedidos, las existencias y los eventos del sistema.' : 'La PWA original en React consulta la API de NestJS. PostgreSQL conserva los pedidos, las existencias y los eventos del sistema.'}</p>
          ${renderEndpoints(ctx, routes.slice(0, 2))}
          <div>
            <a class="op-link" id="evidencia-openapi" href="${ctx.backend ? '/openapi.json' : 'public/openapi.json'}" target="_blank" rel="noopener noreferrer">Contrato OpenAPI</a>
            ${ctx.backend ? `<p class="op-muted" id="evidencia-versiones" role="status">Consultando la versión del sistema…</p>
              <p class="op-muted">Última consulta a la API <time datetime="${esc(consulted ?? '')}">${esc(consulted ? ctx.dateTime(consulted) : 'pendiente')}</time></p>` :
              '<p class="op-muted">Las consultas a la API abren el servidor original en <code class="op-code">127.0.0.1:4173</code> cuando está en ejecución.</p>'}
          </div>
          <details class="gestion-desplegable" id="evidencia-sede-local"><summary>Estado de ${ctx.backend ? 'la sede' : 'la propuesta local'}</summary>
            <p class="op-muted">${esc(ctx.site.name)} · ${esc(snapshot.almacenamiento)} · Consulta ${esc(ctx.dateTime(snapshot.consulta))}</p>
            <dl class="evidencia-cifras">
              <div><dt>Pedidos</dt><dd>${snapshot.pedidos}</dd></div>
              <div><dt>Platos publicados</dt><dd>${snapshot.platosPublicados}</dd></div>
              <div><dt>Reservas</dt><dd>${snapshot.reservas}</dd></div>
            </dl>
            <pre tabindex="0">${esc(JSON.stringify(snapshot, null, 2))}</pre>
          </details>
        </section>
        <section class="op-panel op-stack" aria-labelledby="evidencia-eventos-titulo">
          <h2 id="evidencia-eventos-titulo">Eventos de dominio</h2>
          ${renderRecentEvents(ctx, domainEvents.slice(0, 8))}
          ${details ? `<details class="gestion-desplegable" id="evidencia-ultimo-pedido"><summary>Ver datos del último pedido</summary>
            <pre tabindex="0">${esc(JSON.stringify(details, null, 2))}</pre>
            <a class="op-link" href="#pedido/${encodeURIComponent(order.id)}">Abrir pedido ${esc(order.id)}</a>
            ${ctx.backend ? `<a class="op-link" href="/api/orders/${encodeURIComponent(order.id)}" target="_blank" rel="noopener noreferrer">Ver JSON en la API</a>` : ''}
          </details>` : ''}
        </section>
      </div>
      <details class="op-panel gestion-desplegable" id="evidencia-api-rutas">
        <summary>Todas las rutas de la API <span>${routes.length}</span></summary>
        <div class="gestion-desplegable-cuerpo">${renderEndpoints(ctx, routes)}</div>
      </details>
      <details class="op-panel gestion-desplegable">
        <summary>Registro completo de actividad <span id="evidencia-total" role="status">${events.length} ${events.length === 1 ? 'evento' : 'eventos'}</span></summary>
        <div class="op-stack gestion-desplegable-cuerpo">
          <div class="op-fields">
            <label class="op-field">Buscar en el registro<input type="search" id="evidencia-buscar" placeholder="ID o descripción"></label>
            <label class="op-field">Tipo de evento<select id="evidencia-tipo"><option value="">Todos los tipos</option>${options(kinds, '', esc)}</select></label>
          </div>
          <div class="op-table-wrap" id="evidencia-tabla"${events.length ? '' : ' hidden'}><table class="op-table">
            <thead><tr><th scope="col">Fecha</th><th scope="col">Evento</th><th scope="col">Referencia</th><th scope="col">Detalle</th></tr></thead>
            <tbody>${rows}</tbody>
          </table></div>
          <p class="op-empty" id="evidencia-vacio"${events.length ? ' hidden' : ''}>No hay eventos que coincidan en esta sede.</p>
        </div>
      </details>
      <details class="op-panel gestion-desplegable">
        <summary>Eventos de reservas <span>${reservationEvents.length}</span></summary>
        <div class="gestion-desplegable-cuerpo">${renderRecentEvents(ctx, reservationEvents.slice(0, 8), 'Aún no se registraron cambios en la agenda.')}</div>
      </details>
      <details class="op-panel gestion-desplegable">
        <summary>Trazabilidad con el Avance 2</summary>
        <dl class="gestion-desplegable-cuerpo evidencia-traza">
          <div><dt>Proceso</dt><dd>Figura 8, p. 31 · Pedidos de la web y del salón, cola de cocina y despacho.</dd></div>
          <div><dt>Datos</dt><dd>Figura 11, p. 39 · Pedido, detalle, canal, sede, producto y reserva.</dd></div>
          <div><dt>Requerimientos</dt><dd>Tabla 38, pp. 83–84 · RF-02 a RF-04 para pedidos y seguimiento. RF-12 para carta y precios por sede.</dd></div>
          <div><dt>Capacidades</dt><dd>Figura 14, p. 46 · Carta y precios por sede, pedidos, cocina, despacho, reservas y caja.</dd></div>
          <div><dt>Canales</dt><dd>Tabla 1, p. 9 · Salón, web, WhatsApp, teléfono, Rappi y PedidosYa.</dd></div>
          <div><dt>Mejoras</dt><dd>Figura 8, p. 31 · Control de stock y cobertura, prioridad en cocina, comprobantes, reparto e indicadores.</dd></div>
          <div><dt>Calendario</dt><dd>Figura 17, p. 68 · Piloto operativo previsto para septiembre de 2027.</dd></div>
        </dl>
      </details>
      ${canReset ? '<div class="op-actions"><button type="button" class="op-button op-button--secondary" id="evidencia-reiniciar">Reiniciar datos de prueba</button></div>' : ''}
    </div>`;
  }

  function renderRecentEvents(ctx, events, fallback = 'Registra un pedido para ver los eventos de la sede.') {
    if (!events.length) return `<p class="op-empty">${ctx.esc(fallback)}</p>`;
    return `<ul class="op-list evidencia-eventos">${events.map(event => `<li>
      <time datetime="${ctx.esc(event.time)}" title="${ctx.esc(ctx.dateTime(event.time))}">${horaLima.format(new Date(event.time))}</time>
      <div><strong>${ctx.esc(event.kind)}</strong><p>${ctx.esc(event.description)}</p></div>
      <span class="op-code">${ctx.esc(event.ref || '—')}</span>
    </li>`).join('')}</ul>`;
  }

  function bindEvidencia(ctx) {
    const search = ctx.root.querySelector('#evidencia-buscar');
    const kind = ctx.root.querySelector('#evidencia-tipo');
    const rows = [...ctx.root.querySelectorAll('[data-tipo-evento]')];
    const table = ctx.root.querySelector('#evidencia-tabla');
    const empty = ctx.root.querySelector('#evidencia-vacio');
    const total = ctx.root.querySelector('#evidencia-total');
    const update = () => {
      const query = normalizeText(search.value.trim());
      let visible = 0;
      for (const row of rows) {
        row.hidden = !normalizeText(row.textContent).includes(query) ||
          Boolean(kind.value && row.dataset.tipoEvento !== kind.value);
        if (!row.hidden) visible++;
      }
      total.textContent = visible + (visible === 1 ? ' evento' : ' eventos');
      table.hidden = visible === 0;
      empty.hidden = visible > 0;
    };
    search.addEventListener('input', update);
    kind.addEventListener('change', update);
    const versions = ctx.root.querySelector('#evidencia-versiones');
    if (versions) {
      ctx.backend.health().then(health => {
        if (!versions.isConnected) return;
        versions.textContent = `${health.api} · ${health.database} ${health.databaseVersion} · Esquema ${health.schemaVersion}`;
      }).catch(() => {
        if (versions.isConnected) versions.textContent = 'La API no devolvió la versión del sistema.';
      });
    }
    ctx.root.querySelector('#evidencia-reiniciar')?.addEventListener('click', () => {
      if (window.confirm('Se borrarán los cambios locales de ambas sedes. ¿Quieres restablecer los datos de prueba?')) {
        borradores.clear();
        mensajesConectores.clear();
        filtrosGestion.clear();
        ctx.reset();
      }
    });
  }

  Fogon.register('canales', {
    title: 'Canales',
    intro: 'Registra pedidos propios y simula la llegada de pedidos de agregadores.',
    render: renderCanales,
    bind: bindCanales,
  });
  Fogon.register('gestion', {
    title: 'Gestión',
    intro: 'Consulta la operación del día y actualiza la carta de cada sede.',
    render: renderGestion,
    bind: bindGestion,
  });
  Fogon.register('evidencia', {
    title: 'Evidencia del proceso',
    intro: 'El mismo pedido se consulta desde la carta, el salón, cocina y despacho.',
    render: renderEvidencia,
    bind: bindEvidencia,
  });
})();
