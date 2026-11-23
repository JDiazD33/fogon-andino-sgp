/* Verificación de las reglas de negocio del SGP v2 contra la demo en marcha.
   Uso: con `npm run demo` activo, en otra terminal ejecuta `npm run verify`.
   Reinicia los datos de prueba al empezar y al terminar, así que borra los
   pedidos que haya. En un despliegue con NODE_ENV=production el reinicio exige
   la cabecera x-reset-token: pásala con RESET_TOKEN=… FOGON_URL=… npm run verify.
   Si el reinicio no responde 200, el script se detiene sin probar nada. */

const base = process.env.FOGON_URL ?? 'http://127.0.0.1:4173';
let passed = 0;
let failed = 0;

async function call(method, path, body) {
  const headers = body === undefined ? {} : { 'Content-Type': 'application/json' };
  if (path === '/api/reset' && process.env.RESET_TOKEN) headers['x-reset-token'] = process.env.RESET_TOKEN;
  const response = await fetch(base + path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const type = response.headers.get('content-type') ?? '';
  const data = type.includes('json') ? await response.json() : await response.arrayBuffer();
  return { status: response.status, data, type };
}

async function reset() {
  const result = await call('POST', '/api/reset', {});
  if (result.status !== 200) {
    const reason = result.data?.error ?? `HTTP ${result.status}`;
    throw new Error(`No se pudieron reiniciar los datos de prueba (${result.status}: ${reason}). `
      + 'En producción define RESET_TOKEN con el valor del panel del servidor. Se detiene la verificación.');
  }
}

function check(name, condition, detail = '') {
  if (condition) {
    passed += 1;
    console.log(`  ✓ ${name}`);
  } else {
    failed += 1;
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

function section(title) {
  console.log(`\n${title}`);
}

const site = 'miraflores';
const lomo = { productId: 'lomo-saltado', quantity: 1 };
const chicha = { productId: 'chicha-morada', quantity: 1 };

async function advance(id, status, extra = {}) {
  return call('PATCH', `/api/orders/${id}`, { status, ...extra });
}

async function main() {
  const health = await call('GET', '/api/health');
  if (health.status !== 200) throw new Error(`La demo no responde en ${base}. Ejecuta npm run demo primero.`);
  console.log(`Demo en ${base} · PostgreSQL ${health.data.databaseVersion}`);
  await reset();

  section('Carta y precios por sede');
  let state = (await call('GET', `/api/state?site=${site}`)).data;
  check('seis canales de venta registrados', state.channels.length === 6, state.channels.map((c) => c.id).join(','));
  check('la causa limeña figura agotada en Miraflores', state.products.find((p) => p.id === 'causa-limena').available === 0);
  let result = await call('PATCH', `/api/sites/${site}/products/suspiro-limeno`, { active: false });
  check('retirar un plato de la carta de la sede', result.status === 200 && result.data.product.active === false);
  result = await call('POST', '/api/orders', { siteId: site, channel: 'web', zone: 'Miraflores', payment: 'approved', items: [{ productId: 'suspiro-limeno', quantity: 1 }] });
  check('un plato retirado no se puede pedir (409 INACTIVE)', result.status === 409 && result.data.code === 'INACTIVE');
  await call('PATCH', `/api/sites/${site}/products/suspiro-limeno`, { active: true, price: 13 });
  state = (await call('GET', `/api/state?site=${site}`)).data;
  check('el precio actualizado rige solo en la sede', state.products.find((p) => p.id === 'suspiro-limeno').price === 13);
  result = await call('PATCH', `/api/sites/${site}/products/suspiro-limeno`, { price: 0.5 });
  check('precio fuera de rango rechazado (400)', result.status === 400);

  section('Gestor único de pedidos (OMS) · canales propios');
  result = await call('POST', '/api/orders', { siteId: site, channel: 'web', zone: 'Barranco', payment: 'approved', items: [lomo] });
  const web = result.data.order;
  check('pedido web registrado y cobrado por pasarela', result.status === 201 && web.payment === 'approved' && web.paymentMethod === 'pasarela');
  check('el cobro emite la boleta B001 con correlativo', /^B001-\d{8}$/.test(web.reference ?? ''), web.reference);
  check('el KDS recibe tiempo objetivo y prioridad', web.targetMinutes === 14 && web.priority === 'normal');
  result = await call('POST', '/api/orders', { siteId: site, channel: 'web', zone: 'Lince', payment: 'approved', items: [lomo] });
  check('zona fuera de cobertura rechazada (422 COVERAGE)', result.status === 422 && result.data.code === 'COVERAGE');
  result = await call('POST', '/api/orders', { siteId: site, channel: 'web', zone: 'Miraflores', payment: 'declined', items: [lomo] });
  check('pago rechazado no crea pedido (402 PAYMENT)', result.status === 402);
  result = await call('POST', '/api/orders', { siteId: site, channel: 'whatsapp', fulfillment: 'recojo', payment: 'approved', method: 'yape', items: [chicha] });
  check('WhatsApp exige nombre y teléfono del cliente', result.status === 400);
  result = await call('POST', '/api/orders', { siteId: site, channel: 'whatsapp', fulfillment: 'recojo', customer: 'Ana Torres', phone: '999 888 777', payment: 'approved', method: 'yape', priority: 'alta', items: [chicha] });
  const pickup = result.data.order;
  check('pedido de WhatsApp para recojo, cobrado con Yape', result.status === 201 && pickup.fulfillment === 'recojo' && pickup.paymentMethod === 'yape');
  check('la central puede marcar prioridad alta', pickup.priority === 'alta');
  result = await call('POST', '/api/orders', { siteId: site, channel: 'telefono', zone: 'Miraflores', customer: 'Pedro Salas', phone: '955 000 111', payment: 'approved', method: 'efectivo', items: [chicha] });
  check('teléfono no acepta efectivo contra entrega (400)', result.status === 400);
  result = await call('POST', '/api/orders', { siteId: site, channel: 'web', zone: 'Miraflores', payment: 'pending', items: [chicha] });
  check('solo el salón puede dejar una cuenta abierta (400)', result.status === 400);
  result = await call('POST', '/api/orders', { siteId: site, channel: 'rappi', zone: 'Miraflores', payment: 'approved', items: [chicha] });
  check('un agregador no entra por la ruta de canales propios (400)', result.status === 400);

  section('Hub de integración · conectores de agregadores');
  const rappi = {
    order_id: 'RP-77120', store_id: 'fogon-miraflores',
    items: [{ sku: 'aji-de-gallina', units: 1 }, { sku: 'chicha-morada', units: 2 }],
    client: { name: 'Valeria Núñez', phone: '944 120 300' }, delivery: { neighborhood: 'Barranco' },
  };
  result = await call('POST', '/api/connectors/rappi/orders', rappi);
  const fromRappi = result.data.order;
  check('el conector de Rappi traduce su formato al OMS (201)', result.status === 201 && fromRappi.channel === 'rappi' && fromRappi.externalRef === 'RP-77120');
  check('pedido de agregador con prioridad alta', fromRappi.priority === 'alta');
  check('el precio sale de la carta única, no del agregador', fromRappi.total === 29 + 8 * 2, String(fromRappi.total));
  result = await call('POST', '/api/connectors/rappi/orders', rappi);
  check('webhook repetido no duplica el pedido (200, duplicate)', result.status === 200 && result.data.duplicate && result.data.order.id === fromRappi.id);
  result = await call('POST', '/api/connectors/pedidosya/orders', {
    id: 551203, restaurant: { integrationCode: 'miraflores' },
    details: [{ integrationCode: 'arroz-con-pollo', quantity: 1 }],
    user: { name: 'Mateo Ríos', phone: '933 400 100' }, address: { area: 'Miraflores' },
  });
  const fromPedidosYa = result.data.order;
  check('el conector de PedidosYa acepta su propio formato', result.status === 201 && fromPedidosYa.externalRef === 'PY-551203');
  result = await call('POST', '/api/connectors/pedidosya/orders', { foo: 1 });
  check('mensaje mal formado rechazado por el conector (400)', result.status === 400);
  result = await call('POST', '/api/connectors/rappi/orders', { ...rappi, order_id: 'RP-77121', delivery: { neighborhood: 'Lince' } });
  check('el conector rechaza zonas sin cobertura (422)', result.status === 422);
  result = await call('POST', '/api/connectors/glovo/orders', rappi);
  check('canal sin conector registrado (404)', result.status === 404);

  section('Cocina (KDS) y existencias');
  result = await advance(web.id, 'listo');
  check('no se salta la preparación (409 TRANSITION)', result.status === 409 && result.data.details.nextStatus === 'preparacion');
  await advance(web.id, 'preparacion');
  result = await advance(web.id, 'listo');
  check('al marcar listo se genera el código de entrega', result.status === 200 && /^\d{4}$/.test(result.data.order.code ?? ''));
  const code = result.data.order.code;
  state = (await call('GET', `/api/state?site=${site}`)).data;
  check('el stock de res se descontó por receta', state.stock.find((s) => s.name === 'Lomo de res').quantity === 1800 - 180);

  section('Delivery y despacho');
  result = await advance(web.id, 'en_camino');
  check('un pedido propio necesita repartidor (400)', result.status === 400);
  result = await advance(web.id, 'en_camino', { courierId: 'si-luis' });
  check('repartidor de otra sede rechazado (400)', result.status === 400);
  result = await advance(web.id, 'en_camino', { courierId: 'mf-carlos' });
  check('repartidor propio asignado', result.status === 200 && result.data.order.delivery.courier === 'Carlos Huamán');
  await advance(fromPedidosYa.id, 'preparacion');
  await advance(fromPedidosYa.id, 'listo');
  result = await call('POST', '/api/orders', { siteId: site, channel: 'web', zone: 'Miraflores', payment: 'approved', items: [chicha] });
  const second = result.data.order;
  await advance(second.id, 'preparacion');
  await advance(second.id, 'listo');
  result = await advance(second.id, 'en_camino', { courierId: 'mf-carlos' });
  check('un repartidor propio lleva un pedido a la vez (409 COURIER_BUSY)', result.status === 409 && result.data.code === 'COURIER_BUSY');
  result = await advance(fromPedidosYa.id, 'en_camino');
  check('el agregador asigna su propio repartidor', result.status === 200 && result.data.order.delivery.courierType === 'agregador');
  result = await advance(web.id, 'entregado', { code: '0000' === code ? '1111' : '0000' });
  check('código de entrega incorrecto rechazado (422)', result.status === 422);
  result = await advance(web.id, 'entregado', { code });
  check('entrega confirmada con el código', result.status === 200 && result.data.order.delivery.deliveredAt);
  await advance(pickup.id, 'preparacion');
  await advance(pickup.id, 'listo');
  result = await advance(pickup.id, 'entregado');
  check('recojo en sede: de listo a entregado sin repartidor', result.status === 200);

  section('Caja y cobros');
  result = await call('POST', '/api/orders', { siteId: site, channel: 'salon', table: 'Mesa 03', payment: 'pending', items: [lomo, chicha] });
  const tab = result.data.order;
  check('el salón abre una cuenta sin cobro previo', result.status === 201 && tab.payment === 'pending' && !tab.reference);
  result = await call('GET', `/api/orders/${tab.id}/receipt`);
  check('sin cobro no hay comprobante (409)', result.status === 409);
  result = await call('POST', '/api/cash-closures', { siteId: site, countedCash: 0 });
  check('no se cierra caja con cuentas abiertas (409 OPEN_TABS)', result.status === 409 && result.data.code === 'OPEN_TABS');
  result = await call('POST', `/api/orders/${tab.id}/payment`, { method: 'efectivo', received: 20 });
  check('efectivo insuficiente rechazado (409 CASH_SHORT)', result.status === 409);
  result = await call('POST', `/api/orders/${tab.id}/payment`, { method: 'tarjeta', receipt: { type: 'factura', document: '123', name: 'X' } });
  check('factura sin RUC válido rechazada (400)', result.status === 400);
  result = await call('POST', `/api/orders/${tab.id}/payment`, { method: 'efectivo', received: 50, receipt: { type: 'factura', document: '20999888771', name: 'Consultora Andina S.A.C.' } });
  const paidTab = result.data.order;
  check('cobro en efectivo con vuelto y factura F001', result.status === 201 && paidTab.paymentDetail.change === 5.5 && /^F001-/.test(paidTab.reference));
  result = await call('POST', `/api/orders/${tab.id}/payment`, { method: 'tarjeta' });
  check('una cuenta no se cobra dos veces (409 ALREADY_PAID)', result.status === 409);
  result = await call('GET', `/api/orders/${tab.id}/receipt`);
  check('la factura se descarga en PDF', result.status === 200 && result.type.includes('pdf'));
  state = (await call('GET', `/api/state?site=${site}`)).data;
  check('la caja suma el efectivo esperado del turno', state.cash.expectedCash === 44.5, String(state.cash.expectedCash));
  result = await call('POST', '/api/cash-closures', { siteId: site, countedCash: 44 });
  check('cierre de caja con diferencia registrada', result.status === 201 && result.data.closure.difference === -0.5);
  result = await call('POST', '/api/cash-closures', { siteId: site, countedCash: 0 });
  check('sin cobros nuevos no hay segundo cierre (409)', result.status === 409);

  section('Reservas de mesa');
  result = await call('POST', '/api/reservations', { siteId: site, table: 'Mesa 03', slot: '20:00', customer: 'Otra persona', phone: '900', people: 2 });
  check('turno ya tomado rechazado (409 SLOT_TAKEN)', result.status === 409);
  result = await call('POST', '/api/reservations', { siteId: site, table: 'Mesa 01', slot: '21:00', customer: 'Grupo', phone: '900', people: 5 });
  check('más personas que lugares (409 CAPACITY)', result.status === 409);
  result = await call('POST', '/api/reservations', { siteId: site, table: 'Mesa 06', slot: '13:00', customer: 'Familia Vega', phone: '977 100 200', people: 8 });
  check('reserva válida registrada', result.status === 201);

  section('Indicadores (datos para BI)');
  const metrics = (await call('GET', `/api/metrics?site=${site}`)).data;
  check('indicadores por canal', metrics.byChannel.find((c) => c.id === 'rappi').orders === 1);
  check('duplicados bloqueados contabilizados', metrics.orders.duplicatesBlocked === 1);
  check('rechazos del conector contabilizados', metrics.orders.rejectedByConnector === 1);
  check('comisión del agregador calculada', metrics.byChannel.find((c) => c.id === 'rappi').commissionCost === 12.15);
  check('tiempo de preparación medido', metrics.kitchen.ready >= 3 && metrics.kitchen.onTimePct !== null);

  await reset();
  console.log(`\n${passed} comprobaciones correctas, ${failed} fallidas.`);
  process.exitCode = failed ? 1 : 0;
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
