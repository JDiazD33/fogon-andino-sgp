(() => {
  if (!['http:', 'https:'].includes(window.location.protocol)) return;

  const orderStatuses = {
    registrado: 'Recibido', preparacion: 'En preparación', listo: 'Listo',
    en_camino: 'En camino', entregado: 'Entregado',
  };
  const reservationStatuses = {
    registrada: 'Registrada', confirmada: 'Confirmada', en_curso: 'Llegó',
    completada: 'Completada', cancelada: 'Cancelada', no_presento: 'No se presentó',
  };
  const channels = {
    salon: 'Salón', web: 'Web', whatsapp: 'WhatsApp', telefono: 'Teléfono',
    rappi: 'Rappi', pedidosya: 'PedidosYa',
  };
  const fulfillment = { salon: 'Salón', delivery: 'Delivery', recojo: 'Recojo' };
  const payments = { approved: 'Pagado', pending: 'Pendiente', declined: 'Rechazado' };
  const methods = {
    efectivo: 'Efectivo', tarjeta: 'Tarjeta', yape: 'Yape', plin: 'Plin',
    pasarela: 'Pasarela', agregador: 'Agregador',
  };
  const receiptTypes = { boleta: 'Boleta', factura: 'Factura' };
  const eventLabels = {
    PedidoRegistrado: 'Pedido registrado', PedidoEnPreparacion: 'Pedido en preparación',
    PedidoListo: 'Pedido listo', PedidoEnCamino: 'Pedido en camino', PedidoCerrado: 'Pedido cerrado',
    RepartidorAsignado: 'Repartidor asignado', PagoRegistrado: 'Cobro registrado',
    ComprobanteEmitido: 'Comprobante emitido', WebhookDuplicadoIgnorado: 'Duplicado bloqueado',
    PedidoRechazadoPorConector: 'Conector rechazado',
    PrecioActualizado: 'Precio actualizado', PlatoActivado: 'Plato activado',
    PlatoRetirado: 'Plato retirado', CajaCerrada: 'Caja cerrada',
    ReservaRegistrada: 'Reserva registrada', ReservaConfirmada: 'Reserva confirmada',
    ReservaIniciada: 'Atención iniciada', ReservaCerrada: 'Reserva cerrada',
    ReservaCancelada: 'Reserva cancelada', ReservaNoPresento: 'El cliente no se presentó',
  };

  const keyFor = (labels, value) => Object.keys(labels).find(key => labels[key] === value) ?? value;
  const cents = value => Math.round(Number(value) * 100);
  const encode = encodeURIComponent;
  const orderPath = id => `/api/orders/${encode(id)}`;
  const receiptUrl = id => `${orderPath(id)}/receipt`;
  const sitePath = (path, siteId, date) => `${path}?${new URLSearchParams({ site: siteId, ...(date ? { date } : {}) })}`;

  async function request(path, { method = 'GET', body, signal, includeStatus = false } = {}) {
    const options = { method, signal, credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' } };
    if (body !== undefined) {
      options.headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(body);
    }
    const response = await fetch(path, options);
    const data = await response.json().catch(() => null);
    if (!response.ok || !data) {
      const message = typeof data?.error === 'string' ? data.error : `La API de Fogón Andino no respondió como se esperaba (HTTP ${response.status}).`;
      throw Object.assign(new Error(message), { status: response.status, code: data?.code, details: data?.details });
    }
    return includeStatus ? { data, status: response.status } : data;
  }

  function mapOrder(order) {
    return {
      id: order.id, site: order.siteId,
      channel: channels[order.channel] ?? order.channelName, channelId: order.channel,
      fulfillment: fulfillment[order.fulfillment] ?? order.fulfillment,
      table: order.table ?? '', zone: order.zone ?? '', customer: order.customer ?? '', phone: order.phone ?? '',
      externalRef: order.externalRef ?? '', payment: payments[order.payment] ?? order.payment,
      method: methods[order.paymentMethod] ?? order.paymentDetail?.label ?? '', paymentAt: order.paymentDetail?.at ?? null,
      priority: order.priority, targetMinutes: order.targetMinutes, dueAt: order.dueAt,
      status: orderStatuses[order.status] ?? order.status, createdAt: order.createdAt, updatedAt: order.updatedAt,
      items: order.items.map(item => ({ id: item.productId, name: item.name, qty: item.quantity, price: cents(item.unitPrice) })),
      total: cents(order.total), reference: order.reference,
      courier: order.delivery?.courier ?? '', courierId: order.delivery?.courierId ?? '',
      deliveredAt: order.delivery?.deliveredAt ?? null, deliveryCode: order.code ?? '',
      history: order.history.map(entry => ({ status: orderStatuses[entry.status] ?? entry.status, at: entry.at })),
      receipt: order.receipt ? {
        type: receiptTypes[order.receipt.type] ?? order.receipt.type, number: order.receipt.code,
        issuedAt: order.receipt.issuedAt, document: order.receipt.document, name: order.receipt.name,
        sunatStatus: order.receipt.sunatStatus, url: receiptUrl(order.id),
        ...(order.receipt.type === 'factura' ? { ruc: order.receipt.document } : {}),
      } : null,
    };
  }

  function mapReservation(reservation) {
    return {
      id: reservation.id, site: reservation.siteId, table: reservation.table,
      customer: reservation.customer, phone: reservation.phone, people: reservation.people,
      time: reservation.slot, slot: reservation.slot, service: reservation.service, date: reservation.date,
      status: reservationStatuses[reservation.status] ?? reservation.status,
      notes: reservation.notes ?? '', createdAt: reservation.createdAt, updatedAt: reservation.updatedAt,
    };
  }

  function mapEvent(event, siteId) {
    const label = eventLabels[event.type] ?? event.type;
    return {
      site: siteId, time: event.at, type: event.type,
      kind: event.reservationId ? 'Reserva' : label,
      ref: event.reservationId ?? event.orderId ?? event.subject,
      description: event.subject && event.subject !== event.orderId ? `${label} · ${event.subject}` : label,
    };
  }

  function mapPaymentBreakdown(list) {
    return list.map(entry => ({ ...entry, total: cents(entry.total) }));
  }

  function mapClosing(closure, siteId) {
    return {
      id: closure.id, site: siteId, at: closure.closedAt, payments: closure.payments,
      total: cents(closure.total), expected: cents(closure.expectedCash), counted: cents(closure.countedCash),
      difference: cents(closure.difference), byMethod: mapPaymentBreakdown(closure.byMethod),
    };
  }

  function mapCatalog(data) {
    const index = data.sites.findIndex(site => site.id === data.siteId);
    return {
      site: { ...data.sites[index], index },
      catalog: Object.fromEntries(data.products.map(product => [product.id, {
        price: cents(product.price), active: product.active, available: product.available,
      }])),
    };
  }

  function mapSiteState(data) {
    const closings = data.cash.closures.map(closure => mapClosing(closure, data.siteId)).reverse();
    const events = [...data.events, ...data.reservationEvents]
      .map(event => mapEvent(event, data.siteId)).sort((a, b) => b.time.localeCompare(a.time));
    return {
      ...mapCatalog(data),
      orders: data.orders.map(mapOrder), reservations: data.reservations.map(mapReservation), events, closings,
      stock: data.stock, couriers: data.couriers, tables: data.tables, slots: null,
      recipes: Object.fromEntries(data.products.map(product => [product.id, product.recipe])),
      channels: data.channels, paymentMethods: data.paymentMethods,
      cash: {
        count: data.cash.count, total: cents(data.cash.total), expectedCash: cents(data.cash.expectedCash),
        byMethod: mapPaymentBreakdown(data.cash.byMethod),
        payments: data.cash.payments.map(payment => ({ ...payment, amount: cents(payment.amount) })),
        closures: closings,
      },
    };
  }

  function receiptInput(receipt) {
    if (!receipt) return undefined;
    return {
      type: keyFor(receiptTypes, receipt.type),
      document: receipt.document ?? receipt.ruc,
      name: receipt.name,
    };
  }

  function orderInput(input, site) {
    return {
      siteId: site.id, channel: keyFor(channels, input.channel),
      fulfillment: keyFor(fulfillment, input.fulfillment), table: input.table, zone: input.zone,
      customer: input.customer, phone: input.phone, priority: input.priority,
      payment: keyFor(payments, input.payment), method: keyFor(methods, input.method),
      items: input.items.map(item => ({ productId: item.id, quantity: item.qty })),
      receipt: receiptInput(input.receipt),
    };
  }

  function buildConnectorPayload(channel, input, site) {
    const customer = { name: input.customer, phone: input.phone };
    const zone = input.zone || site.deliveryZones[0];
    if (channel === 'rappi') return {
      order_id: input.externalRef, store_id: `fogon-${site.id}`, client: customer,
      delivery: { neighborhood: zone }, items: input.items.map(item => ({ sku: item.id, units: item.qty })),
    };
    if (channel === 'pedidosya') return {
      id: String(input.externalRef).replace(/^PY-/, ''), restaurant: { integrationCode: site.id }, user: customer,
      address: { area: zone }, details: input.items.map(item => ({ integrationCode: item.id, quantity: item.qty })),
    };
    throw new Error('Elige Rappi o PedidosYa para simular el conector.');
  }

  Fogon.backend = {
    async load(siteId, options) { return mapSiteState(await request(sitePath('/api/state', siteId), options)); },
    async catalog(siteId, options) { return mapCatalog(await request(sitePath('/api/state', siteId), options)); },
    async order(id, options) { return mapOrder((await request(orderPath(id), options)).order); },
    receiptUrl,
    health(options) { return request('/api/health', options); },
    metrics(siteId, options) { return request(sitePath('/api/metrics', siteId), options); },
    reset() { return request('/api/reset', { method: 'POST' }); },

    async reservations(siteId, date, options) {
      const agenda = await request(sitePath('/api/reservations', siteId, date), options);
      return { ...agenda, reservations: agenda.reservations.map(mapReservation) };
    },

    async placeOrder(input, site) {
      const result = await request('/api/orders', { method: 'POST', body: orderInput(input, site) });
      return mapOrder(result.order);
    },

    async updateOrder(id, status, { code, courierId } = {}) {
      const result = await request(orderPath(id), { method: 'PATCH', body: { status: keyFor(orderStatuses, status), code, courierId } });
      return mapOrder(result.order);
    },

    async payOrder(id, { method, received, receipt }) {
      const result = await request(`${orderPath(id)}/payment`, { method: 'POST', body: {
        method: keyFor(methods, method), received: received == null ? undefined : received / 100,
        receipt: receiptInput(receipt),
      } });
      return mapOrder(result.order);
    },

    async closeCash(siteId, countedCash) {
      const result = await request('/api/cash-closures', { method: 'POST', body: { siteId, countedCash: countedCash / 100 } });
      return mapClosing(result.closure, siteId);
    },

    async createReservation(input, site) {
      const { table, customer, phone, people, slot, time, date, notes } = input;
      const result = await request('/api/reservations', { method: 'POST', body: {
        siteId: site.id, table, customer, phone, people, slot: slot ?? time, date, notes,
      } });
      return mapReservation(result.reservation);
    },

    async updateReservation(id, status) {
      const result = await request(`/api/reservations/${encode(id)}`, { method: 'PATCH', body: { status: keyFor(reservationStatuses, status) } });
      return mapReservation(result.reservation);
    },

    async updateProduct(siteId, productId, { price, active }) {
      const result = await request(`/api/sites/${encode(siteId)}/products/${encode(productId)}`, { method: 'PATCH', body: {
        price: price == null ? undefined : price / 100, active,
      } });
      return { ...result.product, price: cents(result.product.price) };
    },

    connectorPayload(name, input, site) {
      return buildConnectorPayload(keyFor(channels, name), input, site);
    },

    async connectorOrder(name, input, site, { payload } = {}) {
      const channel = keyFor(channels, name);
      const { data, status } = await request(`/api/connectors/${encode(channel)}/orders`, {
        method: 'POST', body: payload ?? buildConnectorPayload(channel, input, site), includeStatus: true,
      });
      return { duplicate: data.duplicate, order: mapOrder(data.order), status };
    },
  };
})();
