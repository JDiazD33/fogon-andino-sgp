import 'reflect-metadata';
import { randomInt, timingSafeEqual } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  Body, Controller, Get, HttpCode, HttpException, Inject, Injectable, Module,
  Param, Patch, Post, Query, Req, Res, StreamableFile,
} from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import pg from 'pg';
import { buildReceipt } from './receipt.mjs';

const staticDir = resolve(dirname(fileURLToPath(import.meta.url)), 'dist');
const host = process.env.HOST ?? '127.0.0.1';
const port = Number(process.env.PORT ?? 4173);

/* Versión del esquema. Si la base guardada tiene otra versión, el esquema de la
   demo se vuelve a crear desde cero: todos los datos son ficticios. */
const SCHEMA_VERSION = 3;

const sites = [
  { id: 'miraflores', name: 'Miraflores', deliveryZones: ['Miraflores', 'Barranco'] },
  { id: 'san-isidro', name: 'San Isidro', deliveryZones: ['San Isidro', 'Lince'] },
];

/* Los seis canales de venta del Avance 2 (Tabla 1, p. 9; Figura 14, p. 46).
   La comisión de los agregadores es ficticia, dentro del «hasta 27 %» de PE-08. */
const channels = [
  { id: 'salon', name: 'Salón', type: 'propio', commission: 0, methods: ['efectivo', 'tarjeta', 'yape', 'plin'] },
  { id: 'web', name: 'Tienda web', type: 'propio', commission: 0, methods: ['pasarela'] },
  { id: 'whatsapp', name: 'WhatsApp', type: 'propio', commission: 0, methods: ['pasarela', 'yape', 'plin'] },
  { id: 'telefono', name: 'Teléfono', type: 'propio', commission: 0, methods: ['pasarela', 'yape', 'plin'] },
  { id: 'rappi', name: 'Rappi', type: 'agregador', commission: 27, methods: ['agregador'] },
  { id: 'pedidosya', name: 'PedidosYa', type: 'agregador', commission: 25, methods: ['agregador'] },
];
const channelById = new Map(channels.map((channel) => [channel.id, channel]));

const paymentMethods = {
  efectivo: 'Efectivo',
  tarjeta: 'Tarjeta en POS',
  yape: 'Yape',
  plin: 'Plin',
  pasarela: 'Pasarela de pagos',
  agregador: 'Cobrado por el agregador',
};

const menu = [
  {
    id: 'lomo-saltado', name: 'Lomo saltado', category: 'Fondos', prep: 14,
    description: 'Lomo de res salteado al wok, papas doradas y arroz graneado.',
    prices: [3650, 3900], recipe: { res: 180, papa: 180, arroz: 140 },
  },
  {
    id: 'aji-de-gallina', name: 'Ají de gallina', category: 'Fondos', prep: 12,
    description: 'Pollo deshilachado en crema de ají amarillo, con arroz y papa.',
    prices: [2900, 3200], recipe: { pollo: 250, aji: 40, arroz: 140, papa: 100 },
  },
  {
    id: 'arroz-con-pollo', name: 'Arroz con pollo', category: 'Fondos', prep: 12,
    description: 'Arroz al culantro con pollo dorado y salsa criolla.',
    prices: [2800, 3100], recipe: { arroz: 180, pollo: 250, culantro: 25 },
  },
  {
    id: 'causa-limena', name: 'Causa limeña', category: 'Entradas', prep: 8,
    description: 'Papa amarilla prensada con limón y ají, con un relleno de palta.',
    prices: [1850, 2100], recipe: { papa_amarilla: 180, aji: 30, palta: 80 },
  },
  {
    id: 'chicha-morada', name: 'Chicha morada', category: 'Bebidas', prep: 2,
    description: 'Refresco de maíz morado, piña, canela y un toque de limón.',
    prices: [800, 900], recipe: { chicha: 300 },
  },
  {
    id: 'suspiro-limeno', name: 'Suspiro limeño', category: 'Postres', prep: 4,
    description: 'Manjar cremoso con merengue y canela.',
    prices: [1250, 1400], recipe: { manjar: 120, merengue: 50 },
  },
];

const ingredients = [
  { id: 'res', name: 'Lomo de res', unit: 'g', quantities: [1800, 2160] },
  { id: 'pollo', name: 'Pollo', unit: 'g', quantities: [500, 3000] },
  { id: 'arroz', name: 'Arroz', unit: 'g', quantities: [4200, 5600] },
  { id: 'papa', name: 'Papa blanca', unit: 'g', quantities: [4000, 5000] },
  { id: 'papa_amarilla', name: 'Papa amarilla', unit: 'g', quantities: [0, 1800] },
  { id: 'aji', name: 'Ají amarillo', unit: 'g', quantities: [700, 950] },
  { id: 'culantro', name: 'Culantro', unit: 'g', quantities: [500, 650] },
  { id: 'palta', name: 'Palta', unit: 'g', quantities: [1200, 1500] },
  { id: 'chicha', name: 'Chicha preparada', unit: 'ml', quantities: [6000, 7500] },
  { id: 'manjar', name: 'Manjar', unit: 'g', quantities: [1800, 1920] },
  { id: 'merengue', name: 'Merengue', unit: 'g', quantities: [750, 850] },
];

/* Repartidores (REPARTIDOR, Figura 11): propios por sede y los del agregador. */
const couriers = [
  { id: 'mf-carlos', site: 'miraflores', name: 'Carlos Huamán', type: 'propio', phone: '981 200 310' },
  { id: 'mf-diana', site: 'miraflores', name: 'Diana Rojas', type: 'propio', phone: '981 200 311' },
  { id: 'si-luis', site: 'san-isidro', name: 'Luis Paredes', type: 'propio', phone: '981 200 320' },
  { id: 'si-karen', site: 'san-isidro', name: 'Karen Salazar', type: 'propio', phone: '981 200 321' },
  ...sites.flatMap((site) => [
    { id: `${site.id}-rappi`, site: site.id, name: 'Repartidor de Rappi', type: 'agregador', channel: 'rappi', phone: null },
    { id: `${site.id}-pedidosya`, site: site.id, name: 'Repartidor de PedidosYa', type: 'agregador', channel: 'pedidosya', phone: null },
  ]),
];

const statusEvents = {
  registrado: 'PedidoRegistrado',
  preparacion: 'PedidoEnPreparacion',
  listo: 'PedidoListo',
  en_camino: 'PedidoEnCamino',
  entregado: 'PedidoCerrado',
};

/* Reservas de mesa: la capacidad que la Figura 14 del Avance 2 asigna al SGP v2
   y que la Figura 15 no lista entre los microservicios. */

const salonTables = [
  { label: 'Mesa 01', seats: 2 }, { label: 'Mesa 02', seats: 4 },
  { label: 'Mesa 03', seats: 4 }, { label: 'Mesa 04', seats: 6 },
  { label: 'Mesa 05', seats: 6 }, { label: 'Mesa 06', seats: 8 },
];

const serviceSlots = {
  almuerzo: ['12:30', '13:00', '13:30', '14:00', '14:30'],
  cena: ['19:00', '19:30', '20:00', '20:30', '21:00', '21:30', '22:00'],
};

const reservationEvents = {
  registrada: 'ReservaRegistrada',
  confirmada: 'ReservaConfirmada',
  en_curso: 'ReservaIniciada',
  completada: 'ReservaCerrada',
  cancelada: 'ReservaCancelada',
  no_presento: 'ReservaNoPresento',
};

const reservationTransitions = {
  registrada: ['confirmada', 'cancelada', 'no_presento'],
  confirmada: ['en_curso', 'cancelada', 'no_presento'],
  en_curso: ['completada', 'cancelada'],
  completada: [],
  cancelada: [],
  no_presento: [],
};

const exampleReservations = [
  { site: 0, table: 'Mesa 03', slot: '20:00', people: 4, customer: 'Lucía Quispe', phone: '987 654 321', status: 'confirmada' },
  { site: 0, table: 'Mesa 01', slot: '19:30', people: 2, customer: 'Andrés Farfán', phone: '912 345 678', status: 'registrada' },
  { site: 0, table: 'Mesa 05', slot: '21:00', people: 6, customer: 'Jorge Tong', phone: '955 111 222', status: 'confirmada', notes: 'Mesa junto a la ventana, alergias al maní.' },
  { site: 0, table: 'Mesa 04', slot: '20:30', people: 5, customer: 'Mariana Chávez', phone: '944 333 555', status: 'registrada' },
  { site: 1, table: 'Mesa 02', slot: '20:00', people: 3, customer: 'Rosa Medina', phone: '933 222 444', status: 'confirmada' },
];

/* Línea base y meta de la Tabla 7 (p. 22) del Avance 2. */
const goals = {
  oe1: { baseline: 22, target: 100, unit: '%', label: 'Pedidos ingresados sin re-digitación' },
  oe2: { baseline: 6.5, target: 1.5, unit: '%', label: 'Pedidos con error' },
  oe3: { baseline: 52, target: 35, unit: 'min', label: 'Tiempo promedio de entrega' },
};

function todayInLima() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

function serviceOfSlot(slot) {
  return serviceSlots.almuerzo.includes(slot) ? 'almuerzo' : 'cena';
}

const schema = `
  CREATE TABLE schema_meta (version INTEGER NOT NULL);
  CREATE TABLE sites (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    delivery_zones TEXT[] NOT NULL
  );
  CREATE TABLE channels (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('propio', 'agregador')),
    commission_pct NUMERIC(5, 2) NOT NULL CHECK (commission_pct >= 0 AND commission_pct < 100),
    sort_order INTEGER NOT NULL
  );
  CREATE TABLE products (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    category TEXT NOT NULL,
    prep_minutes INTEGER NOT NULL CHECK (prep_minutes > 0),
    sort_order INTEGER NOT NULL
  );
  CREATE TABLE site_prices (
    site_id TEXT NOT NULL REFERENCES sites,
    product_id TEXT NOT NULL REFERENCES products,
    price_cents INTEGER NOT NULL CHECK (price_cents > 0),
    active BOOLEAN NOT NULL DEFAULT true,
    PRIMARY KEY (site_id, product_id)
  );
  CREATE TABLE ingredients (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    unit TEXT NOT NULL
  );
  CREATE TABLE recipes (
    product_id TEXT NOT NULL REFERENCES products,
    ingredient_id TEXT NOT NULL REFERENCES ingredients,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    PRIMARY KEY (product_id, ingredient_id)
  );
  CREATE TABLE stock (
    site_id TEXT NOT NULL REFERENCES sites,
    ingredient_id TEXT NOT NULL REFERENCES ingredients,
    quantity INTEGER NOT NULL CHECK (quantity >= 0),
    reserved INTEGER NOT NULL DEFAULT 0 CHECK (reserved >= 0 AND reserved <= quantity),
    PRIMARY KEY (site_id, ingredient_id)
  );
  CREATE TABLE orders (
    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    site_id TEXT NOT NULL REFERENCES sites,
    channel TEXT NOT NULL REFERENCES channels,
    fulfillment TEXT NOT NULL CHECK (fulfillment IN ('salon', 'delivery', 'recojo')),
    table_label TEXT,
    zone TEXT,
    customer TEXT,
    phone TEXT,
    external_ref TEXT,
    payment TEXT NOT NULL CHECK (payment IN ('approved', 'pending')),
    priority TEXT NOT NULL CHECK (priority IN ('normal', 'alta')),
    target_minutes INTEGER NOT NULL CHECK (target_minutes > 0),
    status TEXT NOT NULL CHECK (status IN ('registrado', 'preparacion', 'listo', 'en_camino', 'entregado')),
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    total_cents INTEGER NOT NULL CHECK (total_cents > 0),
    reference TEXT,
    delivery_code TEXT,
    -- Reglas del gestor de pedidos impuestas por la base de datos.
    CHECK ((channel = 'salon') = (fulfillment = 'salon')),
    CHECK (fulfillment <> 'salon' OR table_label IS NOT NULL),
    CHECK (fulfillment <> 'delivery' OR zone IS NOT NULL),
    CHECK (payment = 'approved' OR channel = 'salon'),
    -- Un pedido del agregador entra una sola vez aunque el webhook se repita.
    UNIQUE (channel, external_ref)
  );
  CREATE INDEX orders_by_site ON orders (site_id, id DESC);
  CREATE TABLE order_items (
    order_id INTEGER NOT NULL REFERENCES orders ON DELETE CASCADE,
    product_id TEXT NOT NULL REFERENCES products,
    name TEXT NOT NULL,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    unit_price_cents INTEGER NOT NULL CHECK (unit_price_cents > 0),
    sort_order INTEGER NOT NULL,
    PRIMARY KEY (order_id, product_id)
  );
  CREATE TABLE order_history (
    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    order_id INTEGER NOT NULL REFERENCES orders ON DELETE CASCADE,
    status TEXT NOT NULL,
    at TIMESTAMPTZ NOT NULL,
    UNIQUE (order_id, status)
  );
  CREATE TABLE cash_closures (
    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    site_id TEXT NOT NULL REFERENCES sites,
    closed_at TIMESTAMPTZ NOT NULL,
    payments_count INTEGER NOT NULL,
    total_cents INTEGER NOT NULL,
    expected_cash_cents INTEGER NOT NULL,
    counted_cash_cents INTEGER NOT NULL CHECK (counted_cash_cents >= 0),
    by_method JSONB NOT NULL
  );
  CREATE TABLE payments (
    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    order_id INTEGER NOT NULL UNIQUE REFERENCES orders ON DELETE CASCADE,
    site_id TEXT NOT NULL REFERENCES sites,
    method TEXT NOT NULL CHECK (method IN ('efectivo', 'tarjeta', 'yape', 'plin', 'pasarela', 'agregador')),
    amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
    received_cents INTEGER CHECK (received_cents IS NULL OR received_cents >= amount_cents),
    auth_code TEXT,
    status TEXT NOT NULL CHECK (status = 'aprobado'),
    at TIMESTAMPTZ NOT NULL,
    closure_id INTEGER REFERENCES cash_closures
  );
  CREATE TABLE receipts (
    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    order_id INTEGER NOT NULL UNIQUE REFERENCES orders ON DELETE CASCADE,
    site_id TEXT NOT NULL REFERENCES sites,
    type TEXT NOT NULL CHECK (type IN ('boleta', 'factura')),
    series TEXT NOT NULL,
    number INTEGER NOT NULL CHECK (number > 0),
    customer_doc TEXT,
    customer_name TEXT,
    total_cents INTEGER NOT NULL,
    issued_at TIMESTAMPTZ NOT NULL,
    sunat_status TEXT NOT NULL DEFAULT 'simulado',
    -- Correlativo único por serie, como exige un comprobante electrónico.
    UNIQUE (series, number),
    CHECK (type <> 'factura' OR customer_doc ~ '^(10|20)[0-9]{9}$')
  );
  CREATE TABLE couriers (
    id TEXT PRIMARY KEY,
    site_id TEXT NOT NULL REFERENCES sites,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('propio', 'agregador')),
    channel_id TEXT REFERENCES channels,
    phone TEXT
  );
  CREATE TABLE deliveries (
    order_id INTEGER PRIMARY KEY REFERENCES orders ON DELETE CASCADE,
    courier_id TEXT NOT NULL REFERENCES couriers,
    assigned_at TIMESTAMPTZ NOT NULL,
    delivered_at TIMESTAMPTZ
  );
  CREATE TABLE events (
    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    site_id TEXT NOT NULL REFERENCES sites,
    order_id INTEGER REFERENCES orders ON DELETE CASCADE,
    subject TEXT NOT NULL,
    type TEXT NOT NULL,
    at TIMESTAMPTZ NOT NULL
  );
  CREATE INDEX events_by_site ON events (site_id, id DESC);
  CREATE TABLE tables (
    site_id TEXT NOT NULL REFERENCES sites,
    label TEXT NOT NULL,
    seats INTEGER NOT NULL CHECK (seats > 0),
    PRIMARY KEY (site_id, label)
  );
  CREATE TABLE reservations (
    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    site_id TEXT NOT NULL REFERENCES sites,
    table_label TEXT NOT NULL,
    customer TEXT NOT NULL,
    phone TEXT NOT NULL,
    people INTEGER NOT NULL CHECK (people > 0),
    slot TEXT NOT NULL,
    service_date DATE NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('registrada', 'confirmada', 'en_curso', 'completada', 'cancelada', 'no_presento')),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    FOREIGN KEY (site_id, table_label) REFERENCES tables
  );
  CREATE INDEX reservations_by_site ON reservations (site_id, service_date, slot);
  -- Una mesa, un turno: la regla de negocio vive en la base, no en la interfaz.
  CREATE UNIQUE INDEX reservation_slot_unique
    ON reservations (site_id, table_label, service_date, slot)
    WHERE status IN ('registrada', 'confirmada', 'en_curso');
  CREATE TABLE reservation_events (
    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    reservation_id INTEGER NOT NULL REFERENCES reservations ON DELETE CASCADE,
    type TEXT NOT NULL,
    at TIMESTAMPTZ NOT NULL
  );
`;

class ApiError extends HttpException {
  constructor(status, code, error, details) {
    super({ error, code, details }, status);
  }
}

function invalid(message) {
  return new ApiError(400, 'VALIDATION', message);
}

function assertObject(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw invalid('Envía un objeto JSON.');
  }
}

function text(value, max = 80) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function findSite(id) {
  const site = sites.find((candidate) => candidate.id === id);
  if (!site) throw invalid('Selecciona una sede válida.');
  return site;
}

function toCents(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0 || amount > 100000) return NaN;
  return Math.round(amount * 100);
}

function publicOrderId(id) {
  return `FA-${1000 + id}`;
}

function orderNumber(publicId) {
  const match = /^FA-(\d+)$/.exec(publicId);
  const id = match && Number(match[1]) - 1000;
  if (!Number.isInteger(id) || id < 1 || id > 2147483647) {
    throw new ApiError(404, 'NOT_FOUND', 'El pedido no existe.');
  }
  return id;
}

function publicReservationId(id) {
  return `RS-${1000 + id}`;
}

function reservationNumber(publicId) {
  const match = /^RS-(\d+)$/.exec(publicId);
  const id = match && Number(match[1]) - 1000;
  if (!Number.isInteger(id) || id < 1 || id > 2147483647) {
    throw new ApiError(404, 'NOT_FOUND', 'La reserva no existe.');
  }
  return id;
}

function publicClosureId(id) {
  return `CJ-${1000 + id}`;
}

function receiptCode(series, number) {
  return `${series}-${String(number).padStart(8, '0')}`;
}

function iso(value) {
  return value ? new Date(value).toISOString() : null;
}

function serializeReservation(row) {
  return {
    id: publicReservationId(row.id),
    siteId: row.site_id,
    table: row.table_label,
    customer: row.customer,
    phone: row.phone,
    people: row.people,
    slot: row.slot,
    service: serviceOfSlot(row.slot),
    date: limaDate(row.service_date),
    status: row.status,
    notes: row.notes,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

const selectOrders = `
  SELECT orders.*, channels.name AS channel_name, channels.type AS channel_type,
    COALESCE((
      SELECT json_agg(json_build_object(
        'productId', product_id, 'name', name, 'quantity', quantity,
        'unitPrice', unit_price_cents / 100.0
      ) ORDER BY sort_order)
      FROM order_items WHERE order_id = orders.id
    ), '[]'::json) AS items,
    COALESCE((
      SELECT json_agg(json_build_object('status', status, 'at', at) ORDER BY id)
      FROM order_history WHERE order_id = orders.id
    ), '[]'::json) AS history,
    (SELECT row_to_json(r) FROM (
      SELECT type, series, number, customer_doc, customer_name, issued_at, sunat_status
      FROM receipts WHERE order_id = orders.id
    ) r) AS receipt,
    (SELECT row_to_json(p) FROM (
      SELECT method, amount_cents, received_cents, auth_code, at
      FROM payments WHERE order_id = orders.id
    ) p) AS payment_info,
    (SELECT row_to_json(d) FROM (
      SELECT deliveries.courier_id, couriers.name, couriers.type, deliveries.assigned_at, deliveries.delivered_at
      FROM deliveries JOIN couriers ON couriers.id = deliveries.courier_id
      WHERE deliveries.order_id = orders.id
    ) d) AS delivery
  FROM orders JOIN channels ON channels.id = orders.channel
`;

function serializeOrder(row) {
  const createdAt = row.created_at.toISOString();
  const payment = row.payment_info;
  const receipt = row.receipt;
  const delivery = row.delivery;
  return {
    id: publicOrderId(row.id),
    siteId: row.site_id,
    channel: row.channel,
    channelName: row.channel_name,
    channelType: row.channel_type,
    fulfillment: row.fulfillment,
    table: row.table_label,
    zone: row.zone,
    customer: row.customer,
    phone: row.phone,
    externalRef: row.external_ref,
    payment: row.payment,
    paymentMethod: payment?.method ?? null,
    paymentDetail: payment ? {
      method: payment.method,
      label: paymentMethods[payment.method],
      amount: payment.amount_cents / 100,
      received: payment.received_cents == null ? null : payment.received_cents / 100,
      change: payment.received_cents == null ? null : (payment.received_cents - payment.amount_cents) / 100,
      authCode: payment.auth_code,
      at: iso(payment.at),
    } : null,
    priority: row.priority,
    targetMinutes: row.target_minutes,
    dueAt: new Date(row.created_at.getTime() + row.target_minutes * 60000).toISOString(),
    status: row.status,
    createdAt,
    updatedAt: row.updated_at.toISOString(),
    items: row.items,
    total: row.total_cents / 100,
    reference: row.reference,
    receipt: receipt ? {
      type: receipt.type,
      code: receiptCode(receipt.series, receipt.number),
      document: receipt.customer_doc,
      name: receipt.customer_name,
      issuedAt: iso(receipt.issued_at),
      sunatStatus: receipt.sunat_status,
    } : null,
    delivery: delivery ? {
      courierId: delivery.courier_id,
      courier: delivery.name,
      courierType: delivery.type,
      assignedAt: iso(delivery.assigned_at),
      deliveredAt: iso(delivery.delivered_at),
    } : null,
    code: row.delivery_code,
    history: row.history.map(({ status, at }) => ({ status, at: new Date(at).toISOString() })),
  };
}

async function readOrder(database, id) {
  const { rows: [order] } = await database.query(`${selectOrders} WHERE orders.id = $1`, [id]);
  if (!order) throw new ApiError(404, 'NOT_FOUND', 'El pedido no existe.');
  return serializeOrder(order);
}

async function sitePrices(client, siteId) {
  const result = await client.query(`
    SELECT products.*, site_prices.price_cents, site_prices.active
    FROM site_prices JOIN products ON products.id = site_prices.product_id
    WHERE site_prices.site_id = $1
    ORDER BY products.sort_order
  `, [siteId]);
  return result.rows;
}

async function siteStock(client, siteId) {
  const result = await client.query(`
    SELECT ingredients.id, ingredients.name, ingredients.unit, stock.quantity, stock.reserved
    FROM stock JOIN ingredients ON ingredients.id = stock.ingredient_id
    WHERE stock.site_id = $1
    ORDER BY ingredients.name
  `, [siteId]);
  return result.rows;
}

async function groupedRecipes(client) {
  const { rows } = await client.query(`
    SELECT recipes.product_id, recipes.ingredient_id, recipes.quantity, ingredients.name, ingredients.unit
    FROM recipes JOIN ingredients ON ingredients.id = recipes.ingredient_id
    ORDER BY ingredients.name
  `);
  return Map.groupBy(rows, (row) => row.product_id);
}

function recipeDemand(items, recipes) {
  const demand = new Map();
  for (const { productId, quantity } of items) {
    for (const ingredient of recipes.get(productId)) {
      const id = ingredient.ingredient_id;
      demand.set(id, (demand.get(id) ?? 0) + ingredient.quantity * quantity);
    }
  }
  return demand;
}

/* Tiempo objetivo del KDS (mejora M4, Figura 8): el plato más lento marca la
   base y cada porción adicional suma un minuto, hasta diez. */
function targetMinutes(items, catalog) {
  const base = Math.max(...items.map(({ productId }) => catalog.get(productId).prep_minutes));
  const units = items.reduce((sum, { quantity }) => sum + quantity, 0);
  return base + Math.min(10, units - 1);
}

async function logEvent(client, siteId, orderId, subject, type, at) {
  await client.query('INSERT INTO events (site_id, order_id, subject, type, at) VALUES ($1, $2, $3, $4, $5)',
    [siteId, orderId, subject, type, at]);
}

async function registerStatus(client, order, status, at) {
  await client.query('INSERT INTO order_history (order_id, status, at) VALUES ($1, $2, $3)', [order.id, status, at]);
  await logEvent(client, order.site_id, order.id, publicOrderId(order.id), statusEvents[status], at);
}

function parseReceiptInput(input) {
  if (input != null && (typeof input !== 'object' || Array.isArray(input))) throw invalid('Revisa los datos del comprobante.');
  const type = input?.type ?? 'boleta';
  if (!['boleta', 'factura'].includes(type)) throw invalid('Elige boleta o factura.');
  const document = text(input?.document, 20).replace(/\s/g, '');
  const name = text(input?.name, 100);
  if (type === 'factura') {
    if (!/^(10|20)\d{9}$/.test(document)) throw invalid('La factura requiere un RUC de 11 dígitos que empiece en 10 o 20.');
    if (!name) throw invalid('Indica la razón social para la factura.');
  } else if (document && !/^\d{8}$/.test(document)) {
    throw invalid('El DNI de la boleta tiene 8 dígitos.');
  }
  return { type, document: document || null, name: name || null };
}

function authorizationCode(method, externalRef) {
  if (method === 'efectivo') return null;
  if (method === 'agregador') return externalRef;
  if (method === 'yape' || method === 'plin') return `OP-${randomInt(10000000, 100000000)}`;
  return `AUT-${randomInt(100000, 1000000)}`;
}

/* Cobro y comprobante en un solo paso: el Avance 2 propone «CPE automático
   desde el cobro» (Tabla 13) y la mejora M5 de la Figura 8. */
async function settle(client, order, { method, receivedCents, receipt }, at) {
  const amount = order.total_cents;
  if (receipt.type === 'boleta' && amount > 70000 && !receipt.document) {
    throw invalid('Una boleta mayor a S/ 700 debe identificar al cliente con su DNI.');
  }
  if (method === 'efectivo' && receivedCents != null && receivedCents < amount) {
    throw new ApiError(409, 'CASH_SHORT', 'El efectivo recibido no cubre el total de la cuenta.', { total: amount / 100 });
  }
  await client.query(`
    INSERT INTO payments (order_id, site_id, method, amount_cents, received_cents, auth_code, status, at)
    VALUES ($1, $2, $3, $4, $5, $6, 'aprobado', $7)
  `, [order.id, order.site_id, method, amount, method === 'efectivo' ? (receivedCents ?? amount) : null,
    authorizationCode(method, order.external_ref), at]);
  await logEvent(client, order.site_id, order.id, publicOrderId(order.id), 'PagoRegistrado', at);

  const siteIndex = sites.findIndex((site) => site.id === order.site_id);
  const series = `${receipt.type === 'factura' ? 'F' : 'B'}00${siteIndex + 1}`;
  const { rows: [{ next }] } = await client.query(
    'SELECT COALESCE(MAX(number), 0) + 1 AS next FROM receipts WHERE series = $1', [series]);
  await client.query(`
    INSERT INTO receipts (order_id, site_id, type, series, number, customer_doc, customer_name, total_cents, issued_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
  `, [order.id, order.site_id, receipt.type, series, next, receipt.document, receipt.name, amount, at]);
  const code = receiptCode(series, next);
  await client.query("UPDATE orders SET payment = 'approved', reference = $1 WHERE id = $2", [code, order.id]);
  await logEvent(client, order.site_id, order.id, publicOrderId(order.id), 'ComprobanteEmitido', at);
}

async function seedCatalog(client) {
  for (const site of sites) {
    await client.query('INSERT INTO sites VALUES ($1, $2, $3)', [site.id, site.name, site.deliveryZones]);
  }
  for (const [index, channel] of channels.entries()) {
    await client.query('INSERT INTO channels VALUES ($1, $2, $3, $4, $5)',
      [channel.id, channel.name, channel.type, channel.commission, index]);
  }
  for (const ingredient of ingredients) {
    await client.query('INSERT INTO ingredients VALUES ($1, $2, $3)', [ingredient.id, ingredient.name, ingredient.unit]);
  }
  for (const [index, item] of menu.entries()) {
    await client.query('INSERT INTO products VALUES ($1, $2, $3, $4, $5, $6)',
      [item.id, item.name, item.description, item.category, item.prep, index]);
    for (const [ingredientId, quantity] of Object.entries(item.recipe)) {
      await client.query('INSERT INTO recipes VALUES ($1, $2, $3)', [item.id, ingredientId, quantity]);
    }
  }
  for (const courier of couriers) {
    await client.query('INSERT INTO couriers VALUES ($1, $2, $3, $4, $5, $6)',
      [courier.id, courier.site, courier.name, courier.type, courier.channel ?? null, courier.phone]);
  }
  for (const site of sites) {
    for (const table of salonTables) {
      await client.query('INSERT INTO tables VALUES ($1, $2, $3)', [site.id, table.label, table.seats]);
    }
  }
}

async function seedPrices(client) {
  for (const item of menu) {
    for (const [siteIndex, site] of sites.entries()) {
      await client.query(`
        INSERT INTO site_prices (site_id, product_id, price_cents, active) VALUES ($1, $2, $3, true)
        ON CONFLICT (site_id, product_id) DO UPDATE SET price_cents = EXCLUDED.price_cents, active = true
      `, [site.id, item.id, item.prices[siteIndex]]);
    }
  }
}

async function seedStock(client) {
  for (const [index, site] of sites.entries()) {
    for (const ingredient of ingredients) {
      await client.query('INSERT INTO stock (site_id, ingredient_id, quantity) VALUES ($1, $2, $3)',
        [site.id, ingredient.id, ingredient.quantities[index]]);
    }
  }
}

async function seedReservations(client) {
  const date = todayInLima();
  const now = new Date();
  for (const item of exampleReservations) {
    const site = sites[item.site];
    const { rows: [{ id }] } = await client.query(`
      INSERT INTO reservations (site_id, table_label, customer, phone, people, slot, service_date, status, notes, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10)
      RETURNING id
    `, [site.id, item.table, item.customer, item.phone, item.people, item.slot, date, item.status,
      item.notes ?? null, now]);
    await client.query('INSERT INTO reservation_events (reservation_id, type, at) VALUES ($1, $2, $3)',
      [id, reservationEvents[item.status], now]);
  }
}

async function siteTables(client, siteId) {
  const { rows } = await client.query('SELECT label, seats FROM tables WHERE site_id = $1 ORDER BY label', [siteId]);
  return rows;
}

async function siteReservations(client, siteId, date) {
  const { rows } = await client.query(`
    SELECT * FROM reservations
    WHERE site_id = $1 AND service_date = $2
    ORDER BY slot, table_label
  `, [siteId, date]);
  return rows.map(serializeReservation);
}

function limaDate(value) {
  if (typeof value === 'string') return value.slice(0, 10);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(value);
}

function nextStatus(order) {
  switch (order.status) {
    case 'registrado': return 'preparacion';
    case 'preparacion': return 'listo';
    case 'listo': return order.fulfillment === 'delivery' ? 'en_camino' : 'entregado';
    case 'en_camino': return 'entregado';
    default: return null;
  }
}

function summarizePayments(rows) {
  const byMethod = Object.fromEntries(Object.keys(paymentMethods).map((method) => [method, { count: 0, total: 0 }]));
  let total = 0;
  for (const row of rows) {
    byMethod[row.method].count += 1;
    byMethod[row.method].total += row.amount_cents;
    total += row.amount_cents;
  }
  return {
    count: rows.length,
    total: total / 100,
    expectedCash: byMethod.efectivo.total / 100,
    byMethod: Object.entries(byMethod).map(([method, value]) => ({
      method, label: paymentMethods[method], count: value.count, total: value.total / 100,
    })),
  };
}

function minutesBetween(from, to) {
  return (new Date(to).getTime() - new Date(from).getTime()) / 60000;
}

function average(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function round(value, digits = 1) {
  return value == null ? null : Number(value.toFixed(digits));
}

/* Conectores del hub (P05): cada agregador manda su propio formato y el
   conector lo traduce al pedido del gestor único. */
const connectors = {
  rappi(payload) {
    const site = typeof payload.store_id === 'string' ? payload.store_id.replace(/^fogon-/, '') : '';
    if (typeof payload.order_id !== 'string' || !Array.isArray(payload.items)) return null;
    return {
      externalRef: payload.order_id,
      siteId: site,
      customer: text(payload.client?.name),
      phone: text(payload.client?.phone, 32),
      zone: text(payload.delivery?.neighborhood, 40),
      items: payload.items.map((item) => ({ productId: item?.sku, quantity: item?.units })),
    };
  },
  pedidosya(payload) {
    if ((typeof payload.id !== 'number' && typeof payload.id !== 'string') || !Array.isArray(payload.details)) return null;
    return {
      externalRef: `PY-${payload.id}`,
      siteId: text(payload.restaurant?.integrationCode, 40),
      customer: text(payload.user?.name),
      phone: text(payload.user?.phone, 32),
      zone: text(payload.address?.area, 40),
      items: payload.details.map((item) => ({ productId: item?.integrationCode, quantity: item?.quantity })),
    };
  },
};

class FogonStore {
  constructor() {
    if (!process.env.DATABASE_URL) throw new Error('Configura DATABASE_URL para conectar con PostgreSQL.');
    this.pool = new pg.Pool({
      connectionString: process.env.DATABASE_URL,
      options: '-c search_path=fogon_demo',
      connectionTimeoutMillis: 5000,
    });
    this.pool.on('error', (error) => console.error('PostgreSQL:', error.message));
  }

  async transaction(work, readOnly = false) {
    const client = await this.pool.connect();
    try {
      if (readOnly) {
        await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      } else {
        await client.query('BEGIN');
        // Serializa las mutaciones de esta demostración, incluido el reinicio.
        await client.query('SELECT pg_advisory_xact_lock(82612300)');
      }
      const result = await work(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async onModuleInit() {
    await this.transaction(async (client) => {
      await client.query('CREATE SCHEMA IF NOT EXISTS fogon_demo');
      const { rows: [{ found }] } = await client.query("SELECT to_regclass('fogon_demo.schema_meta') IS NOT NULL AS found");
      if (found) {
        const { rows: [meta] } = await client.query('SELECT version FROM fogon_demo.schema_meta LIMIT 1');
        if (meta?.version === SCHEMA_VERSION) return;
      }
      await client.query('DROP SCHEMA fogon_demo CASCADE');
      await client.query('CREATE SCHEMA fogon_demo');
      await client.query(schema);
      await client.query('INSERT INTO schema_meta VALUES ($1)', [SCHEMA_VERSION]);
      await seedCatalog(client);
      await seedPrices(client);
      await seedStock(client);
      await seedReservations(client);
      console.log(`Esquema de la demo creado (versión ${SCHEMA_VERSION}).`);
    });
  }

  async onModuleDestroy() {
    await this.pool.end();
  }

  async health() {
    const { rows: [{ version }] } = await this.pool.query("SELECT current_setting('server_version') AS version");
    return { ok: true, api: 'NestJS', database: 'PostgreSQL', databaseVersion: version, schemaVersion: SCHEMA_VERSION };
  }

  async state(siteId) {
    findSite(siteId);
    return this.transaction(async (client) => {
      const stock = await siteStock(client, siteId);
      const balances = new Map(stock.map((item) => [item.id, item.quantity - item.reserved]));
      const recipes = await groupedRecipes(client);
      const products = (await sitePrices(client, siteId)).map((product) => {
        const recipe = recipes.get(product.id);
        return {
          id: product.id,
          name: product.name,
          description: product.description,
          category: product.category,
          image: product.id,
          price: product.price_cents / 100,
          active: product.active,
          prepMinutes: product.prep_minutes,
          available: product.active ? Math.min(...recipe.map(({ ingredient_id, quantity }) =>
            Math.floor((balances.get(ingredient_id) ?? 0) / quantity))) : 0,
          recipe: recipe.map(({ name, quantity, unit }) => ({ name, quantity, unit })),
        };
      });

      const { rows: orders } = await client.query(`${selectOrders} WHERE orders.site_id = $1 ORDER BY orders.id DESC`, [siteId]);
      const { rows: events } = await client.query(`
        SELECT type, subject, order_id, at FROM events WHERE site_id = $1 ORDER BY id DESC LIMIT 80
      `, [siteId]);
      const tables = await siteTables(client, siteId);
      const reservations = await siteReservations(client, siteId, todayInLima());
      const { rows: reservationEvents } = await client.query(`
        SELECT reservation_events.type, reservation_events.reservation_id, reservation_events.at
        FROM reservation_events JOIN reservations ON reservations.id = reservation_events.reservation_id
        WHERE reservations.site_id = $1
        ORDER BY reservation_events.id DESC
      `, [siteId]);
      const { rows: siteCouriers } = await client.query(`
        SELECT couriers.*, EXISTS (
          SELECT 1 FROM deliveries JOIN orders ON orders.id = deliveries.order_id
          WHERE deliveries.courier_id = couriers.id AND orders.status = 'en_camino'
        ) AS busy
        FROM couriers WHERE site_id = $1 ORDER BY type DESC, name
      `, [siteId]);
      const { rows: openPayments } = await client.query(`
        SELECT payments.*, receipts.series, receipts.number, receipts.type AS receipt_type
        FROM payments LEFT JOIN receipts ON receipts.order_id = payments.order_id
        WHERE payments.site_id = $1 AND payments.closure_id IS NULL
        ORDER BY payments.id DESC
      `, [siteId]);
      const { rows: closures } = await client.query(
        'SELECT * FROM cash_closures WHERE site_id = $1 ORDER BY id DESC LIMIT 6', [siteId]);

      return {
        sites,
        channels: channels.map(({ id, name, type, commission, methods }) => ({ id, name, type, commission, methods })),
        paymentMethods,
        products,
        orders: orders.map(serializeOrder),
        stock: stock.map(({ name, quantity, reserved, unit }) => ({ name, quantity, reserved, unit })),
        siteId,
        events: events.map(({ type, subject, order_id, at }) => ({
          type, subject, orderId: order_id ? publicOrderId(order_id) : null, at: at.toISOString(),
        })),
        tables: tables.map(({ label, seats }) => ({ label, seats })),
        reservations,
        reservationEvents: reservationEvents.map(({ type, reservation_id, at }) => ({
          type, reservationId: publicReservationId(reservation_id), at: at.toISOString(),
        })),
        couriers: siteCouriers.map((courier) => ({
          id: courier.id, name: courier.name, type: courier.type, channel: courier.channel_id,
          phone: courier.phone, busy: courier.type === 'propio' && courier.busy,
        })),
        cash: {
          ...summarizePayments(openPayments),
          payments: openPayments.map((payment) => ({
            orderId: publicOrderId(payment.order_id),
            method: payment.method,
            label: paymentMethods[payment.method],
            amount: payment.amount_cents / 100,
            receipt: payment.series ? receiptCode(payment.series, payment.number) : null,
            receiptType: payment.receipt_type,
            at: payment.at.toISOString(),
          })),
          closures: closures.map((closure) => ({
            id: publicClosureId(closure.id),
            closedAt: closure.closed_at.toISOString(),
            payments: closure.payments_count,
            total: closure.total_cents / 100,
            expectedCash: closure.expected_cash_cents / 100,
            countedCash: closure.counted_cash_cents / 100,
            difference: (closure.counted_cash_cents - closure.expected_cash_cents) / 100,
            byMethod: closure.by_method,
          })),
        },
      };
    }, true);
  }

  async order(publicId) {
    return { order: await readOrder(this.pool, orderNumber(publicId)) };
  }

  /* Indicadores operativos: lo que el SGP v2 publica hacia BI (mejora M7) y
     su relación con OE1, OE2 y OE3 de la Tabla 7. */
  async metrics(siteId) {
    findSite(siteId);
    const today = todayInLima();
    return this.transaction(async (client) => {
      const { rows } = await client.query(`
        ${selectOrders}
        WHERE orders.site_id = $1 AND (orders.created_at AT TIME ZONE 'America/Lima')::date = $2::date
        ORDER BY orders.id
      `, [siteId, today]);
      const orders = rows.map(serializeOrder);
      const { rows: [{ duplicates }] } = await client.query(`
        SELECT count(*)::int AS duplicates FROM events
        WHERE site_id = $1 AND type = 'WebhookDuplicadoIgnorado' AND (at AT TIME ZONE 'America/Lima')::date = $2::date
      `, [siteId, today]);
      const { rows: [{ rejected }] } = await client.query(`
        SELECT count(*)::int AS rejected FROM events
        WHERE site_id = $1 AND type = 'PedidoRechazadoPorConector' AND (at AT TIME ZONE 'America/Lima')::date = $2::date
      `, [siteId, today]);
      const reservations = await siteReservations(client, siteId, today);

      const paid = orders.filter((order) => order.payment === 'approved');
      const sales = paid.reduce((sum, order) => sum + order.total, 0);
      const byChannel = channels.map((channel) => {
        const list = orders.filter((order) => order.channel === channel.id);
        const channelSales = list.filter((order) => order.payment === 'approved').reduce((sum, order) => sum + order.total, 0);
        return {
          id: channel.id, name: channel.name, type: channel.type, commission: channel.commission,
          orders: list.length, sales: round(channelSales, 2), commissionCost: round(channelSales * channel.commission / 100, 2),
        };
      });

      const prepared = orders.map((order) => {
        const ready = order.history.find((entry) => entry.status === 'listo');
        return ready ? { order, minutes: minutesBetween(order.createdAt, ready.at) } : null;
      }).filter(Boolean);
      const onTime = prepared.filter(({ order, minutes }) => minutes <= order.targetMinutes).length;
      const now = Date.now();
      const late = orders.filter((order) => ['registrado', 'preparacion'].includes(order.status)
        && new Date(order.dueAt).getTime() < now).length;

      const delivered = orders.filter((order) => order.fulfillment === 'delivery' && order.status === 'entregado')
        .map((order) => minutesBetween(order.createdAt, order.history.find((entry) => entry.status === 'entregado').at));

      const methods = summarizePayments(paid.map((order) => ({
        method: order.paymentMethod, amount_cents: Math.round(order.total * 100),
      })));
      const openTabs = orders.filter((order) => order.payment === 'pending');
      const activeReservations = reservations.filter((item) => !['cancelada', 'no_presento'].includes(item.status));

      return {
        siteId,
        date: today,
        goals,
        orders: {
          total: orders.length,
          paid: paid.length,
          sales: round(sales, 2),
          averageTicket: paid.length ? round(sales / paid.length, 2) : null,
          viaApi: orders.length,
          viaApiPct: orders.length ? 100 : null,
          duplicatesBlocked: duplicates,
          rejectedByConnector: rejected,
        },
        byChannel,
        kitchen: {
          ready: prepared.length,
          averagePrepMinutes: round(average(prepared.map(({ minutes }) => minutes))),
          onTimePct: prepared.length ? round(onTime / prepared.length * 100) : null,
          lateNow: late,
          inQueue: orders.filter((order) => ['registrado', 'preparacion'].includes(order.status)).length,
        },
        delivery: {
          delivered: delivered.length,
          averageMinutes: round(average(delivered)),
          inRoute: orders.filter((order) => order.status === 'en_camino').length,
        },
        payments: { ...methods, openTabs: openTabs.length, openTabsAmount: round(openTabs.reduce((sum, order) => sum + order.total, 0), 2) },
        reservations: {
          active: activeReservations.length,
          covers: activeReservations.reduce((sum, item) => sum + item.people, 0),
          noShows: reservations.filter((item) => item.status === 'no_presento').length,
        },
      };
    }, true);
  }

  async reservations(siteId, date) {
    findSite(siteId);
    const target = date || todayInLima();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(target)) {
      throw invalid('Indica la fecha con el formato AAAA-MM-DD.');
    }
    return this.transaction(async (client) => ({
      siteId,
      date: target,
      tables: await siteTables(client, siteId),
      slots: serviceSlots,
      reservations: await siteReservations(client, siteId, target),
    }), true);
  }

  async createReservation(body) {
    assertObject(body);
    const { siteId, customer, phone, people, slot, date, notes } = body;
    findSite(siteId);
    const table = typeof body.table === 'string' ? body.table.trim() : '';
    const guest = typeof customer === 'string' ? customer.trim() : '';
    const tel = typeof phone === 'string' ? phone.trim() : '';
    const covers = Number(people);
    const turn = typeof slot === 'string' ? slot.trim() : '';
    const when = typeof date === 'string' ? date.trim() : todayInLima();

    if (!table) throw invalid('Elige la mesa de la reserva.');
    if (!guest || guest.length > 80) throw invalid('Indica el nombre del titular de la reserva.');
    if (!tel || tel.length > 32) throw invalid('Indica un teléfono de contacto.');
    if (!Number.isInteger(covers) || covers < 1 || covers > 20) {
      throw invalid('La reserva es para entre 1 y 20 personas.');
    }
    if (!serviceSlots.almuerzo.includes(turn) && !serviceSlots.cena.includes(turn)) {
      throw invalid('Elige un turno de servicio disponible.');
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(when) || Number.isNaN(Date.parse(`${when}T12:00:00Z`))) {
      throw invalid('Indica la fecha con el formato AAAA-MM-DD.');
    }
    if (when < todayInLima()) throw invalid('No se puede reservar en una fecha pasada.');

    return this.transaction(async (client) => {
      const tables = await siteTables(client, siteId);
      const target = tables.find(item => item.label === table);
      if (!target) throw invalid('La mesa indicada no existe en la sede.');
      if (covers > target.seats) {
        throw new ApiError(409, 'CAPACITY',
          `La ${table} tiene ${target.seats} lugares y la reserva pide ${covers}.`, { seats: target.seats });
      }
      const { rows: [clash] } = await client.query(`
        SELECT id FROM reservations
        WHERE site_id = $1 AND table_label = $2 AND service_date = $3 AND slot = $4
          AND status IN ('registrada', 'confirmada', 'en_curso')
      `, [siteId, table, when, turn]);
      if (clash) {
        throw new ApiError(409, 'SLOT_TAKEN',
          `La ${table} ya está reservada en el turno ${turn}.`, { slot: turn, table });
      }

      const now = new Date();
      const detail = typeof notes === 'string' && notes.trim() ? notes.trim().slice(0, 240) : null;
      const { rows: [{ id }] } = await client.query(`
        INSERT INTO reservations (site_id, table_label, customer, phone, people, slot, service_date, status, notes, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, 'registrada', $8, $9, $9)
        RETURNING id
      `, [siteId, table, guest, tel, covers, turn, when, detail, now]);
      await client.query('INSERT INTO reservation_events (reservation_id, type, at) VALUES ($1, $2, $3)',
        [id, reservationEvents.registrada, now]);
      const { rows: [reservation] } = await client.query('SELECT * FROM reservations WHERE id = $1', [id]);
      return { reservation: serializeReservation(reservation) };
    });
  }

  async updateReservation(publicId, body) {
    assertObject(body);
    const { status } = body;
    if (!Object.hasOwn(reservationEvents, status)) throw invalid('Selecciona un estado válido.');
    const id = reservationNumber(publicId);
    return this.transaction(async (client) => {
      const { rows: [reservation] } = await client.query('SELECT * FROM reservations WHERE id = $1', [id]);
      if (!reservation) throw new ApiError(404, 'NOT_FOUND', 'La reserva no existe.');
      const allowed = reservationTransitions[reservation.status] ?? [];
      if (!allowed.includes(status)) {
        throw new ApiError(409, 'TRANSITION', 'La reserva debe seguir el orden del flujo de atención.', {
          status: reservation.status, nextStatus: allowed,
        });
      }
      const now = new Date();
      await client.query('UPDATE reservations SET status = $1, updated_at = $2 WHERE id = $3', [status, now, id]);
      await client.query('INSERT INTO reservation_events (reservation_id, type, at) VALUES ($1, $2, $3)',
        [id, reservationEvents[status], now]);
      const { rows: [updated] } = await client.query('SELECT * FROM reservations WHERE id = $1', [id]);
      return { reservation: serializeReservation(updated) };
    });
  }

  /* Validación común a todos los canales: un solo gestor de pedidos (OMS). */
  parseOrder(body) {
    assertObject(body);
    const { siteId, channel: channelId, payment, items } = body;
    const site = findSite(siteId);
    const channel = channelById.get(channelId);
    if (!channel) throw invalid('Selecciona un canal válido.');
    if (!['approved', 'declined', 'pending'].includes(payment)) throw invalid('Selecciona un resultado de pago de prueba.');

    const fulfillment = channel.id === 'salon' ? 'salon'
      : channel.type === 'agregador' ? 'delivery'
        : (body.fulfillment ?? 'delivery');
    if (!['salon', 'delivery', 'recojo'].includes(fulfillment) || (fulfillment === 'salon') !== (channel.id === 'salon')) {
      throw invalid('Elige delivery o recojo en sede.');
    }
    const table = text(body.table, 24);
    const zone = text(body.zone, 40);
    const customer = text(body.customer);
    const phone = text(body.phone, 32);
    if (fulfillment === 'salon' && !table) throw invalid('Indica la mesa para el pedido de salón.');
    if (['whatsapp', 'telefono'].includes(channel.id) && (!customer || !phone)) {
      throw invalid('Indica el nombre y el teléfono del cliente.');
    }
    if (fulfillment === 'delivery' && !site.deliveryZones.includes(zone)) {
      throw new ApiError(422, 'COVERAGE', 'La sede seleccionada no atiende esta zona de reparto.', {
        deliveryZones: site.deliveryZones,
      });
    }
    if (payment === 'pending' && channel.id !== 'salon') {
      throw invalid('Solo el salón puede dejar una cuenta abierta para cobrar en caja.');
    }
    const method = payment === 'approved' ? (body.method ?? channel.methods[0]) : null;
    if (method && !channel.methods.includes(method)) {
      throw invalid(`El canal ${channel.name} no acepta ${paymentMethods[method] ?? 'ese medio de pago'}.`);
    }
    if (!Array.isArray(items) || !items.length || items.length > 50) {
      throw invalid('Agrega al menos un producto a tu pedido.');
    }
    const receipt = payment === 'approved' ? parseReceiptInput(body.receipt) : null;
    const priority = channel.type === 'agregador' || body.priority === 'alta' ? 'alta' : 'normal';
    return {
      siteId, channel, fulfillment, payment, method, items, receipt, priority,
      table: fulfillment === 'salon' ? table : null,
      zone: fulfillment === 'delivery' ? zone : null,
      customer: customer || null,
      phone: phone || null,
      externalRef: body.externalRef ?? null,
    };
  }

  async insertOrder(client, input) {
    const catalog = new Map((await sitePrices(client, input.siteId)).map((product) => [product.id, product]));
    const quantities = new Map();
    for (const item of input.items) {
      if (!item || !catalog.has(item.productId) || !Number.isInteger(item.quantity) || item.quantity < 1) {
        throw invalid('Revisa los productos y cantidades de tu pedido.');
      }
      quantities.set(item.productId, (quantities.get(item.productId) ?? 0) + item.quantity);
    }
    if ([...quantities.values()].some((quantity) => quantity > 50)) {
      throw invalid('El máximo por producto es de 50 porciones.');
    }
    const inactive = [...quantities.keys()].filter((productId) => !catalog.get(productId).active);
    if (inactive.length) {
      throw new ApiError(409, 'INACTIVE', 'Uno de los platos fue retirado de la carta de la sede.', {
        productIds: inactive,
      });
    }

    const stock = await siteStock(client, input.siteId);
    const recipes = await groupedRecipes(client);
    const mergedItems = [...quantities].map(([productId, quantity]) => ({ productId, quantity }));
    const demand = recipeDemand(mergedItems, recipes);
    const shortages = stock.filter((item) => (demand.get(item.id) ?? 0) > item.quantity - item.reserved);
    if (shortages.length) {
      const unavailable = new Set(shortages.map((item) => item.id));
      const productIds = mergedItems.filter(({ productId }) =>
        recipes.get(productId).some((ingredient) => unavailable.has(ingredient.ingredient_id)))
        .map(({ productId }) => productId);
      throw new ApiError(409, 'STOCK', 'El stock de la sede no cubre el pedido. Reduce la cantidad o elige otro plato.', {
        productIds, ingredients: shortages.map((item) => item.name),
      });
    }
    if (input.payment === 'declined') {
      throw new ApiError(402, 'PAYMENT', 'El pago de prueba fue rechazado. Puedes reintentar con otro medio.');
    }

    const total = mergedItems.reduce((sum, item) => sum + catalog.get(item.productId).price_cents * item.quantity, 0);
    const now = new Date();
    const { rows: [order] } = await client.query(`
      INSERT INTO orders (site_id, channel, fulfillment, table_label, zone, customer, phone, external_ref, payment,
        priority, target_minutes, status, created_at, updated_at, total_cents)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'registrado', $12, $12, $13)
      RETURNING *
    `, [input.siteId, input.channel.id, input.fulfillment, input.table, input.zone, input.customer, input.phone,
      input.externalRef, input.payment, input.priority, targetMinutes(mergedItems, catalog), now, total]);

    for (const [index, { productId, quantity }] of mergedItems.entries()) {
      const product = catalog.get(productId);
      await client.query('INSERT INTO order_items VALUES ($1, $2, $3, $4, $5, $6)',
        [order.id, productId, product.name, quantity, product.price_cents, index]);
    }
    for (const [ingredientId, quantity] of demand) {
      await client.query('UPDATE stock SET reserved = reserved + $1 WHERE site_id = $2 AND ingredient_id = $3',
        [quantity, input.siteId, ingredientId]);
    }
    await registerStatus(client, order, 'registrado', now);
    if (input.payment === 'approved') {
      await settle(client, order, { method: input.method, receivedCents: null, receipt: input.receipt }, now);
    }
    return readOrder(client, order.id);
  }

  async placeOrder(body) {
    const input = this.parseOrder(body);
    if (input.channel.type === 'agregador') {
      throw invalid('Los pedidos de los agregadores entran por su conector: POST /api/connectors/{canal}/orders.');
    }
    input.externalRef = null;
    return this.transaction(async (client) => ({ order: await this.insertOrder(client, input) }));
  }

  async connectorOrder(channelId, payload) {
    const connector = connectors[channelId];
    if (!connector) throw new ApiError(404, 'NOT_FOUND', 'No hay un conector registrado para ese canal.');
    assertObject(payload);
    const mapped = connector(payload);
    if (!mapped || !mapped.externalRef) {
      throw invalid(`El mensaje de ${channelById.get(channelId).name} no tiene el formato esperado por el conector.`);
    }
    const site = sites.find((candidate) => candidate.id === mapped.siteId);
    if (!site) throw invalid('El local indicado por el agregador no corresponde a una sede.');

    return this.transaction(async (client) => {
      const { rows: [existing] } = await client.query(
        'SELECT id, site_id FROM orders WHERE channel = $1 AND external_ref = $2', [channelId, mapped.externalRef]);
      if (existing) {
        await logEvent(client, existing.site_id, existing.id, publicOrderId(existing.id), 'WebhookDuplicadoIgnorado', new Date());
        return { duplicate: true, order: await readOrder(client, existing.id) };
      }
      try {
        const input = this.parseOrder({
          siteId: site.id, channel: channelId, payment: 'approved', method: 'agregador',
          zone: mapped.zone, customer: mapped.customer, phone: mapped.phone,
          externalRef: mapped.externalRef, items: mapped.items,
        });
        return { duplicate: false, order: await this.insertOrder(client, input) };
      } catch (error) {
        if (error instanceof ApiError) {
          // El rechazo queda registrado aunque la transacción del pedido no ocurra.
          error.rejection = { siteId: site.id, subject: mapped.externalRef };
        }
        throw error;
      }
    }).catch(async (error) => {
      if (error.rejection) {
        await this.pool.query(
          "INSERT INTO events (site_id, order_id, subject, type, at) VALUES ($1, NULL, $2, 'PedidoRechazadoPorConector', $3)",
          [error.rejection.siteId, error.rejection.subject, new Date()]);
      }
      throw error;
    });
  }

  async payOrder(publicId, body) {
    assertObject(body);
    const id = orderNumber(publicId);
    const method = body.method;
    if (!channelById.get('salon').methods.includes(method)) throw invalid('Elige efectivo, tarjeta, Yape o Plin.');
    const receipt = parseReceiptInput(body.receipt);
    let receivedCents = null;
    if (method === 'efectivo') {
      receivedCents = toCents(body.received);
      if (!Number.isInteger(receivedCents)) throw invalid('Indica el efectivo recibido.');
    }
    return this.transaction(async (client) => {
      const { rows: [order] } = await client.query('SELECT * FROM orders WHERE id = $1', [id]);
      if (!order) throw new ApiError(404, 'NOT_FOUND', 'El pedido no existe.');
      if (order.payment === 'approved') {
        throw new ApiError(409, 'ALREADY_PAID', 'La cuenta de este pedido ya fue cobrada.', { reference: order.reference });
      }
      await settle(client, order, { method, receivedCents, receipt }, new Date());
      await client.query('UPDATE orders SET updated_at = $1 WHERE id = $2', [new Date(), id]);
      return { order: await readOrder(client, id) };
    });
  }

  async closeCash(body) {
    assertObject(body);
    const { siteId } = body;
    findSite(siteId);
    const counted = toCents(body.countedCash);
    if (!Number.isInteger(counted)) throw invalid('Indica el efectivo contado en caja.');
    return this.transaction(async (client) => {
      const { rows: tabs } = await client.query(
        "SELECT id, table_label FROM orders WHERE site_id = $1 AND payment = 'pending' ORDER BY id", [siteId]);
      if (tabs.length) {
        throw new ApiError(409, 'OPEN_TABS', 'Hay cuentas de salón sin cobrar. Cóbralas antes de cerrar la caja.', {
          orders: tabs.map((tab) => publicOrderId(tab.id)),
        });
      }
      const { rows: payments } = await client.query(
        'SELECT * FROM payments WHERE site_id = $1 AND closure_id IS NULL', [siteId]);
      if (!payments.length) throw new ApiError(409, 'NOTHING_TO_CLOSE', 'No hay cobros nuevos desde el último cierre.');
      const summary = summarizePayments(payments);
      const now = new Date();
      const { rows: [closure] } = await client.query(`
        INSERT INTO cash_closures (site_id, closed_at, payments_count, total_cents, expected_cash_cents, counted_cash_cents, by_method)
        VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *
      `, [siteId, now, summary.count, Math.round(summary.total * 100), Math.round(summary.expectedCash * 100), counted,
        JSON.stringify(summary.byMethod.filter((item) => item.count))]);
      await client.query('UPDATE payments SET closure_id = $1 WHERE site_id = $2 AND closure_id IS NULL', [closure.id, siteId]);
      await logEvent(client, siteId, null, publicClosureId(closure.id), 'CajaCerrada', now);
      return {
        closure: {
          id: publicClosureId(closure.id), closedAt: now.toISOString(), payments: summary.count, total: summary.total,
          expectedCash: summary.expectedCash, countedCash: counted / 100,
          difference: (counted - Math.round(summary.expectedCash * 100)) / 100,
          byMethod: summary.byMethod.filter((item) => item.count),
        },
      };
    });
  }

  async updateProduct(siteId, productId, body) {
    assertObject(body);
    findSite(siteId);
    const changes = {};
    if (body.price !== undefined) {
      const cents = toCents(body.price);
      if (!Number.isInteger(cents) || cents < 100 || cents > 99900) throw invalid('El precio debe estar entre S/ 1,00 y S/ 999,00.');
      changes.price = cents;
    }
    if (body.active !== undefined) {
      if (typeof body.active !== 'boolean') throw invalid('Indica si el plato está activo.');
      changes.active = body.active;
    }
    if (!Object.keys(changes).length) throw invalid('Indica el precio o la disponibilidad del plato.');
    return this.transaction(async (client) => {
      const { rows: [current] } = await client.query(
        'SELECT * FROM site_prices WHERE site_id = $1 AND product_id = $2', [siteId, productId]);
      if (!current) throw new ApiError(404, 'NOT_FOUND', 'El plato no existe en la carta de la sede.');
      const now = new Date();
      if (changes.price !== undefined && changes.price !== current.price_cents) {
        await client.query('UPDATE site_prices SET price_cents = $1 WHERE site_id = $2 AND product_id = $3',
          [changes.price, siteId, productId]);
        await logEvent(client, siteId, null, productId, 'PrecioActualizado', now);
      }
      if (changes.active !== undefined && changes.active !== current.active) {
        await client.query('UPDATE site_prices SET active = $1 WHERE site_id = $2 AND product_id = $3',
          [changes.active, siteId, productId]);
        await logEvent(client, siteId, null, productId, changes.active ? 'PlatoActivado' : 'PlatoRetirado', now);
      }
      const { rows: [updated] } = await client.query(
        'SELECT * FROM site_prices WHERE site_id = $1 AND product_id = $2', [siteId, productId]);
      return { product: { id: productId, siteId, price: updated.price_cents / 100, active: updated.active } };
    });
  }

  async updateOrder(publicId, body) {
    assertObject(body);
    const { status, code, courierId } = body;
    if (!Object.hasOwn(statusEvents, status) || status === 'registrado') {
      throw invalid('Selecciona un estado válido.');
    }
    const id = orderNumber(publicId);
    return this.transaction(async (client) => {
      const { rows: [order] } = await client.query(
        'SELECT orders.*, channels.type AS channel_type FROM orders JOIN channels ON channels.id = orders.channel WHERE orders.id = $1', [id]);
      if (!order) throw new ApiError(404, 'NOT_FOUND', 'El pedido no existe.');
      const next = nextStatus(order);
      if (status !== next) {
        throw new ApiError(409, 'TRANSITION', 'El pedido debe seguir el orden del flujo de atención.', {
          status: order.status, nextStatus: next,
        });
      }
      if (status === 'entregado' && order.fulfillment === 'delivery' && code !== order.delivery_code) {
        throw new ApiError(422, 'CODE', 'El código de entrega no coincide.');
      }

      const now = new Date();
      let deliveryCode = order.delivery_code;
      if (status === 'listo') {
        const { rows: items } = await client.query('SELECT product_id AS "productId", quantity FROM order_items WHERE order_id = $1', [id]);
        const recipes = await groupedRecipes(client);
        for (const [ingredientId, quantity] of recipeDemand(items, recipes)) {
          await client.query(`
            UPDATE stock SET quantity = quantity - $1, reserved = reserved - $1
            WHERE site_id = $2 AND ingredient_id = $3
          `, [quantity, order.site_id, ingredientId]);
        }
        if (order.fulfillment === 'delivery') deliveryCode = String(randomInt(1000, 10000));
      }

      if (status === 'en_camino') {
        // Asignación de repartidor (mejora M6): el agregador trae el suyo.
        let courier;
        if (order.channel_type === 'agregador') {
          ({ rows: [courier] } = await client.query(
            'SELECT * FROM couriers WHERE site_id = $1 AND channel_id = $2', [order.site_id, order.channel]));
        } else {
          if (typeof courierId !== 'string' || !courierId) throw invalid('Elige el repartidor que llevará el pedido.');
          ({ rows: [courier] } = await client.query(
            "SELECT * FROM couriers WHERE id = $1 AND site_id = $2 AND type = 'propio'", [courierId, order.site_id]));
          if (!courier) throw invalid('El repartidor no pertenece a la sede.');
          const { rows: [busy] } = await client.query(`
            SELECT orders.id FROM deliveries JOIN orders ON orders.id = deliveries.order_id
            WHERE deliveries.courier_id = $1 AND orders.status = 'en_camino'
          `, [courier.id]);
          if (busy) {
            throw new ApiError(409, 'COURIER_BUSY', `${courier.name} está en ruta con el pedido ${publicOrderId(busy.id)}.`, {
              orderId: publicOrderId(busy.id),
            });
          }
        }
        await client.query('INSERT INTO deliveries (order_id, courier_id, assigned_at) VALUES ($1, $2, $3)',
          [id, courier.id, now]);
        await logEvent(client, order.site_id, id, publicOrderId(id), 'RepartidorAsignado', now);
      }
      if (status === 'entregado' && order.fulfillment === 'delivery') {
        await client.query('UPDATE deliveries SET delivered_at = $1 WHERE order_id = $2', [now, id]);
      }

      await client.query('UPDATE orders SET status = $1, updated_at = $2, delivery_code = $3 WHERE id = $4',
        [status, now, deliveryCode, id]);
      await registerStatus(client, order, status, now);
      return { order: await readOrder(client, id) };
    });
  }

  async reset() {
    return this.transaction(async (client) => {
      await client.query(`
        DELETE FROM events; DELETE FROM deliveries; DELETE FROM payments; DELETE FROM receipts;
        DELETE FROM orders; DELETE FROM cash_closures; DELETE FROM stock; DELETE FROM reservations;
      `);
      await seedPrices(client);
      await seedStock(client);
      await seedReservations(client);
      return { ok: true };
    });
  }
}

class FogonController {
  constructor(store) {
    this.store = store;
  }

  health() {
    return this.store.health();
  }

  state(siteId = sites[0].id) {
    return this.store.state(siteId);
  }

  metrics(siteId = sites[0].id) {
    return this.store.metrics(siteId);
  }

  placeOrder(body) {
    return this.store.placeOrder(body);
  }

  async connectorOrder(channel, body, response) {
    const result = await this.store.connectorOrder(channel, body);
    response.status(result.duplicate ? 200 : 201);
    return result;
  }

  order(id) {
    return this.store.order(id);
  }

  payOrder(id, body) {
    return this.store.payOrder(id, body);
  }

  closeCash(body) {
    return this.store.closeCash(body);
  }

  updateProduct(siteId, productId, body) {
    return this.store.updateProduct(siteId, productId, body);
  }

  reservations(siteId = sites[0].id, date) {
    return this.store.reservations(siteId, date);
  }

  createReservation(body) {
    return this.store.createReservation(body);
  }

  updateReservation(id, body) {
    return this.store.updateReservation(id, body);
  }

  async receipt(id, request) {
    const { order } = await this.store.order(id);
    if (!order.receipt) {
      throw new ApiError(409, 'RECEIPT_PENDING', 'El comprobante estará disponible cuando se registre el cobro.');
    }
    // El QR del comprobante abre el seguimiento del pedido en este mismo sitio.
    // Detrás de un proxy HTTPS (la nube), el esquema llega en x-forwarded-proto.
    const protocol = String(request.headers['x-forwarded-proto'] ?? request.protocol ?? 'http').split(',')[0].trim();
    const trackingUrl = `${protocol}://${request.headers.host}/#seguimiento/${encodeURIComponent(order.id)}`;
    const pdf = await buildReceipt(order, findSite(order.siteId).name, { trackingUrl });
    return new StreamableFile(pdf, {
      type: 'application/pdf',
      disposition: `inline; filename="${order.receipt.type === 'factura' ? 'Factura' : 'Boleta'}-${order.receipt.code}.pdf"`,
      length: pdf.length,
    });
  }

  updateOrder(id, body) {
    return this.store.updateOrder(id, body);
  }

  reset(request) {
    // En la nube (NODE_ENV=production) solo reinicia quien tenga el secreto
    // RESET_TOKEN, enviado en la cabecera x-reset-token. Sin secreto, nadie.
    if (process.env.NODE_ENV === 'production') {
      const expected = Buffer.from(process.env.RESET_TOKEN ?? '');
      const given = Buffer.from(String(request.headers['x-reset-token'] ?? ''));
      if (!expected.length || given.length !== expected.length || !timingSafeEqual(given, expected)) {
        throw new ApiError(403, 'RESET_LOCAL', 'El reinicio de datos de la versión publicada requiere el token de la demo.');
      }
      return this.store.reset();
    }
    const loopback = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(request.socket.remoteAddress);
    if (!loopback) throw new ApiError(403, 'RESET_LOCAL', 'Reinicia los datos desde la computadora anfitriona.');
    return this.store.reset();
  }
}

Injectable()(FogonStore);
Controller('api')(FogonController);
Inject(FogonStore)(FogonController, undefined, 0);

const controller = FogonController.prototype;
const route = (decorator, name) => decorator(controller, name, Object.getOwnPropertyDescriptor(controller, name));
route(Get('health'), 'health');
route(Get('state'), 'state');
Query('site')(controller, 'state', 0);
route(Get('metrics'), 'metrics');
Query('site')(controller, 'metrics', 0);
route(Post('orders'), 'placeOrder');
Body()(controller, 'placeOrder', 0);
route(Post('connectors/:channel/orders'), 'connectorOrder');
Param('channel')(controller, 'connectorOrder', 0);
Body()(controller, 'connectorOrder', 1);
Res({ passthrough: true })(controller, 'connectorOrder', 2);
route(Get('orders/:id'), 'order');
Param('id')(controller, 'order', 0);
route(Get('orders/:id/receipt'), 'receipt');
Param('id')(controller, 'receipt', 0);
Req()(controller, 'receipt', 1);
route(Post('orders/:id/payment'), 'payOrder');
Param('id')(controller, 'payOrder', 0);
Body()(controller, 'payOrder', 1);
route(Post('cash-closures'), 'closeCash');
Body()(controller, 'closeCash', 0);
route(Patch('sites/:site/products/:product'), 'updateProduct');
Param('site')(controller, 'updateProduct', 0);
Param('product')(controller, 'updateProduct', 1);
Body()(controller, 'updateProduct', 2);
route(Get('reservations'), 'reservations');
Query('site')(controller, 'reservations', 0);
Query('date')(controller, 'reservations', 1);
route(Post('reservations'), 'createReservation');
Body()(controller, 'createReservation', 0);
route(Patch('reservations/:id'), 'updateReservation');
Param('id')(controller, 'updateReservation', 0);
Body()(controller, 'updateReservation', 1);
route(Patch('orders/:id'), 'updateOrder');
Param('id')(controller, 'updateOrder', 0);
Body()(controller, 'updateOrder', 1);
route(Post('reset'), 'reset');
route(HttpCode(200), 'reset');
Req()(controller, 'reset', 0);

class FogonModule {}
Module({ controllers: [FogonController], providers: [FogonStore] })(FogonModule);

async function bootstrap() {
  const app = await NestFactory.create(FogonModule, { abortOnError: false, bodyParser: false, logger: ['error', 'warn'] });
  app.use((request, response, next) => {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    if (request.path.startsWith('/api/')) {
      response.setHeader('Cache-Control', 'no-store');
      const mutating = ['POST', 'PATCH'].includes(request.method);
      // Mismo origen, por HTTP en la red local o por HTTPS detrás del proxy de la nube.
      const sameOrigin = [`http://${request.headers.host}`, `https://${request.headers.host}`];
      if (mutating && request.headers.origin && !sameOrigin.includes(request.headers.origin)) {
        return response.status(403).json({ error: 'Abre el prototipo desde el origen de la demostración.', code: 'ORIGIN' });
      }
      const hasBody = Number(request.headers['content-length']) > 0 || request.headers['transfer-encoding'];
      if (mutating && hasBody && !request.is('application/json')) {
        return response.status(415).json({ error: 'La solicitud debe usar el formato JSON.', code: 'VALIDATION' });
      }
    }
    next();
  });
  app.useBodyParser('json', { limit: '64kb' });
  app.useGlobalFilters({
    catch(exception, host) {
      const response = host.switchToHttp().getResponse();
      if (exception instanceof ApiError) {
        response.status(exception.getStatus()).json(exception.getResponse());
        return;
      }
      const status = exception.getStatus?.() ?? exception.status ?? 500;
      if (status === 404) {
        response.status(status).json({ error: 'Esta ruta no existe.', code: 'NOT_FOUND' });
      } else if (status >= 400 && status < 500) {
        response.status(status).json({ error: 'Revisa el formato de la solicitud.', code: 'VALIDATION' });
      } else {
        console.error(exception);
        response.status(500).json({ error: 'La operación no pudo completarse. Intenta nuevamente.', code: 'INTERNAL' });
      }
    },
  });
  app.useStaticAssets(staticDir, {
    setHeaders(response, asset) {
      if (/[\/]assets[\/].+\.(?:css|js)$/.test(asset)) {
        response.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      }
    },
  });
  app.enableShutdownHooks();
  await app.listen(port, host);
  const address = app.getHttpServer().address();
  const hostname = address.family === 'IPv6' ? `[${address.address}]` : address.address;
  console.log(`Fogón Andino disponible en http://${hostname}:${address.port}`);
}

bootstrap().catch((error) => {
  console.error('No se pudo iniciar Fogón Andino:', error.message);
  process.exit(1);
});
