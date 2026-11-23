import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';

/* Comprobante con el formato de la representación impresa de un comprobante
   de pago electrónico peruano (boleta o factura). Es de demostración: el
   emisor, su RUC y el envío a OSE/SUNAT son ficticios, y el documento lo dice
   en el recuadro del número y al pie. */

const require = createRequire(import.meta.url);

// Logotipo con la letra condensada del sitio. Se usa la versión WOFF: fontkit
// falla al recortar los glifos compuestos (la «Ó») de la versión WOFF2.
let logoFont = null;
try {
  logoFont = require.resolve('@fontsource/big-shoulders-display/files/big-shoulders-display-latin-300-normal.woff');
} catch {
  logoFont = null;
}

const ink = '#1d1d1b';
const muted = '#5d5d58';
const rule = '#c8c8c2';
const soft = '#efefeb';
const ember = '#b3410e';

// Emisor ficticio. El RUC lleva a propósito un dígito verificador inválido para
// que no coincida con el de ninguna empresa real.
const issuer = {
  name: 'FOGÓN ANDINO S.A.C.',
  ruc: '20601234567',
  address: 'Calle Los Fogones 120, Miraflores - Lima - Lima',
};

const establishments = {
  miraflores: { label: 'Sede Miraflores', address: 'Calle Los Fogones 120, Miraflores, Lima' },
  'san-isidro': { label: 'Sede San Isidro', address: 'Calle Las Brasas 245, San Isidro, Lima' },
};

const dateFormat = new Intl.DateTimeFormat('es-PE', {
  timeZone: 'America/Lima', day: '2-digit', month: '2-digit', year: 'numeric',
});
const timeFormat = new Intl.DateTimeFormat('es-PE', {
  timeZone: 'America/Lima', hour: '2-digit', minute: '2-digit', hour12: false,
});
const amount = new Intl.NumberFormat('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Helvetica no tiene el espacio fino que usa Intl en algunas fechas y horas.
const plain = (value) => value.normalize('NFKC');
const money = (cents) => amount.format(cents / 100);

/* Importe en letras: «SON: TREINTA Y SEIS CON 50/100 SOLES». ---------------- */

const units = [
  '', 'UNO', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE',
  'DIEZ', 'ONCE', 'DOCE', 'TRECE', 'CATORCE', 'QUINCE', 'DIECISÉIS', 'DIECISIETE', 'DIECIOCHO', 'DIECINUEVE',
  'VEINTE', 'VEINTIUNO', 'VEINTIDÓS', 'VEINTITRÉS', 'VEINTICUATRO', 'VEINTICINCO', 'VEINTISÉIS',
  'VEINTISIETE', 'VEINTIOCHO', 'VEINTINUEVE',
];
const tens = ['', '', '', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA'];
const hundreds = [
  '', 'CIENTO', 'DOSCIENTOS', 'TRESCIENTOS', 'CUATROCIENTOS', 'QUINIENTOS',
  'SEISCIENTOS', 'SETECIENTOS', 'OCHOCIENTOS', 'NOVECIENTOS',
];

function belowThousand(value) {
  if (value === 100) return 'CIEN';
  const rest = value % 100;
  const restWords = rest < 30 ? units[rest] : `${tens[Math.floor(rest / 10)]}${rest % 10 ? ` Y ${units[rest % 10]}` : ''}`;
  return [hundreds[Math.floor(value / 100)], restWords].filter(Boolean).join(' ');
}

function integerWords(value) {
  if (value === 0) return 'CERO';
  const millions = Math.floor(value / 1e6);
  const thousands = Math.floor((value % 1e6) / 1e3);
  const rest = value % 1e3;
  return [
    millions ? (millions === 1 ? 'UN MILLÓN' : `${belowThousand(millions)} MILLONES`) : '',
    thousands ? (thousands === 1 ? 'MIL' : `${belowThousand(thousands)} MIL`) : '',
    rest ? belowThousand(rest) : '',
  ].filter(Boolean).join(' ')
    .replace(/VEINTIUNO (MIL|MILLONES)/g, 'VEINTIÚN $1')
    .replace(/UNO (MIL|MILLONES)/g, 'UN $1');
}

function amountInWords(cents) {
  return `${integerWords(Math.floor(cents / 100))} CON ${String(cents % 100).padStart(2, '0')}/100 SOLES`;
}

/* Código QR en vectores: nítido a cualquier tamaño de impresión. ---------- */

function drawQr(document, content, x, y, size) {
  const qr = QRCode.create(content, { errorCorrectionLevel: 'M' });
  const count = qr.modules.size;
  const cell = size / count;
  for (let row = 0; row < count; row += 1) {
    for (let column = 0; column < count; column += 1) {
      // El solape mínimo evita líneas blancas entre módulos en algunos visores.
      if (qr.modules.get(row, column)) document.rect(x + column * cell, y + row * cell, cell + 0.03, cell + 0.03);
    }
  }
  document.fill('#000000');
}

function writeReceipt(document, order, siteName, { trackingUrl } = {}) {
  const left = 40;
  const right = document.page.width - 40;
  const width = right - left;
  const receipt = order.receipt;
  const isInvoice = receipt.type === 'factura';
  const kind = isInvoice ? 'FACTURA ELECTRÓNICA' : 'BOLETA DE VENTA ELECTRÓNICA';
  const [series, number] = receipt.code.split('-');
  const site = establishments[order.siteId] ?? { label: `Sede ${siteName}`, address: `${siteName}, Lima` };
  const issued = new Date(receipt.issuedAt);

  // Los precios de la carta incluyen IGV: la base y el impuesto suman exacto.
  const totalCents = Math.round(order.total * 100);
  const baseCents = Math.round(totalCents / 1.18);
  const igvCents = totalCents - baseCents;

  const hash = createHash('sha1')
    .update(JSON.stringify([issuer.ruc, receipt.code, totalCents, receipt.issuedAt, order.items]))
    .digest('base64');
  const documentType = isInvoice ? '6' : receipt.document ? '1' : '-';
  const qrContent = trackingUrl ?? [
    issuer.ruc, isInvoice ? '01' : '03', series, number, money(igvCents), money(totalCents),
    issued.toISOString().slice(0, 10), documentType, receipt.document ?? '-', hash, '',
  ].join('|');

  function text(value, x, y, options = {}) {
    const { font = 'Helvetica', size = 8.5, color = ink, ...layout } = options;
    document.font(font).fontSize(size).fillColor(color).text(String(value), x, y, layout);
  }

  function hairline(y, color = rule, weight = 0.5) {
    document.moveTo(left, y).lineTo(right, y).lineWidth(weight).stroke(color);
  }

  /* Emisor ----------------------------------------------------------------- */

  if (logoFont) {
    text('FOGÓN ANDINO', left - 1, 38, { font: logoFont, size: 31, characterSpacing: 2.6, lineBreak: false });
  } else {
    text('FOGÓN ANDINO', left, 44, { font: 'Helvetica', size: 22, characterSpacing: 3, lineBreak: false });
  }
  text('COCINA PERUANA AL MOMENTO', left, 76, { size: 6.5, color: muted, characterSpacing: 1.9, lineBreak: false });
  text(issuer.name, left, 98, { font: 'Helvetica-Bold', size: 9, lineBreak: false });
  text(issuer.address, left, 111, { size: 8, color: muted, lineBreak: false });

  /* Recuadro del comprobante: RUC, tipo y serie-número ---------------------- */

  const boxWidth = 214;
  const boxX = right - boxWidth;
  const boxY = 36;
  document.lineWidth(1.1).rect(boxX, boxY, boxWidth, 94).stroke(ink);
  text(`R.U.C. ${issuer.ruc}`, boxX, boxY + 14, { width: boxWidth, align: 'center', font: 'Helvetica-Bold', size: 12.5 });
  document.rect(boxX, boxY + 36, boxWidth, 25).fill(ink);
  text(kind, boxX, boxY + 44.5, {
    width: boxWidth, align: 'center', font: 'Helvetica-Bold', size: isInvoice ? 11 : 10, color: '#ffffff', characterSpacing: 0.3,
  });
  text(`${series} - ${number}`, boxX, boxY + 70, { width: boxWidth, align: 'center', font: 'Helvetica-Bold', size: 13.5 });
  text('DEMOSTRACIÓN · SIN VALOR FISCAL', boxX, boxY + 100, {
    width: boxWidth, align: 'center', font: 'Helvetica-Bold', size: 6.5, color: ember, characterSpacing: 0.9,
  });

  /* Datos del comprobante y del cliente ------------------------------------ */

  const channel = order.fulfillment === 'salon'
    ? `Salón · ${order.table}`
    : `${order.channelName ?? 'Tienda web'} · ${order.fulfillment === 'recojo' ? 'Recojo en sede' : `Delivery${order.zone ? ` a ${order.zone}` : ''}`}`;
  const client = isInvoice ? receipt.name : (receipt.name ?? order.customer ?? 'CLIENTES VARIOS');
  const pairs = [
    [['Fecha de emisión', plain(dateFormat.format(issued))], ['Hora', plain(timeFormat.format(issued))]],
    [[isInvoice ? 'Razón social' : 'Cliente', client], [isInvoice ? 'R.U.C.' : 'D.N.I.', receipt.document ?? '—']],
    [['Pedido', `${order.id} · ${channel}`], ['Moneda', 'SOLES (PEN)']],
    [['Establecimiento', `${site.label} · ${site.address}`], ['Condición', 'Contado']],
  ];
  let y = 150;
  const rowHeight = 17;
  const secondColumn = left + 352;
  document.lineWidth(0.8).rect(left, y, width, pairs.length * rowHeight + 14).stroke(ink);
  y += 9;
  for (const [[label, value], [rightLabel, rightValue]] of pairs) {
    text(`${label}:`, left + 10, y, { font: 'Helvetica-Bold', size: 7.8, lineBreak: false });
    text(value, left + 92, y, { size: 8.3, width: secondColumn - left - 102, lineBreak: false, ellipsis: true });
    text(`${rightLabel}:`, secondColumn, y, { font: 'Helvetica-Bold', size: 7.8, lineBreak: false });
    text(rightValue, secondColumn + 62, y, { size: 8.3, width: right - secondColumn - 72, lineBreak: false, ellipsis: true });
    y += rowHeight;
  }
  y += 19;

  /* Detalle ------------------------------------------------------------------ */

  const columns = [
    { label: 'CANT.', x: left, width: 46, align: 'center' },
    { label: 'U.M.', x: left + 46, width: 44, align: 'center' },
    { label: 'DESCRIPCIÓN', x: left + 90, width: width - 90 - 164, align: 'left' },
    { label: 'P. UNIT.', x: right - 164, width: 82, align: 'right' },
    { label: 'IMPORTE', x: right - 82, width: 82, align: 'right' },
  ];
  document.rect(left, y, width, 21).fill(ink);
  for (const column of columns) {
    text(column.label, column.x + 9, y + 7, {
      width: column.width - 18, align: column.align, font: 'Helvetica-Bold', size: 7.4, color: '#ffffff', characterSpacing: 0.7,
    });
  }
  y += 21;
  for (const item of order.items) {
    const unitCents = Math.round(item.unitPrice * 100);
    const cells = [String(item.quantity), 'UND', item.name, money(unitCents), money(unitCents * item.quantity)];
    cells.forEach((value, index) => {
      const column = columns[index];
      text(value, column.x + 9, y + 7, { width: column.width - 18, align: column.align, size: 8.6, lineBreak: false, ellipsis: true });
    });
    y += 22;
    hairline(y);
  }

  /* Totales e importe en letras --------------------------------------------- */

  const totalsWidth = 226;
  const totalsX = right - totalsWidth;
  let totalsY = y + 14;
  for (const [label, cents] of [['OP. GRAVADA', baseCents], ['OP. EXONERADA', 0], ['OP. INAFECTA', 0], ['I.G.V. (18 %)', igvCents]]) {
    text(label, totalsX + 10, totalsY, { size: 8, color: muted, lineBreak: false });
    text(`S/ ${money(cents)}`, totalsX + 100, totalsY, { width: totalsWidth - 110, align: 'right', size: 8.6, lineBreak: false });
    totalsY += 15;
  }
  document.rect(totalsX, totalsY + 3, totalsWidth, 27).fill(soft);
  text('IMPORTE TOTAL', totalsX + 10, totalsY + 12.5, { font: 'Helvetica-Bold', size: 8.6, lineBreak: false });
  text(`S/ ${money(totalCents)}`, totalsX + 100, totalsY + 10.5, {
    width: totalsWidth - 110, align: 'right', font: 'Helvetica-Bold', size: 12, lineBreak: false,
  });
  totalsY += 30;

  const notesWidth = width - totalsWidth - 28;
  let notesY = y + 14;
  text(`SON: ${amountInWords(totalCents)}`, left, notesY, { width: notesWidth, font: 'Helvetica-Bold', size: 8.4 });
  notesY = document.y + 12;
  const payment = order.paymentDetail;
  const paymentLines = [
    ['Forma de pago', 'Contado'],
    ['Medio de pago', payment ? [payment.label, payment.authCode].filter(Boolean).join(' · ') : 'Pasarela de pagos (prueba)'],
  ];
  if (payment?.received != null && payment.change != null) {
    paymentLines.push(['Efectivo', `Recibido S/ ${money(Math.round(payment.received * 100))} · Vuelto S/ ${money(Math.round(payment.change * 100))}`]);
  }
  for (const [label, value] of paymentLines) {
    text(`${label}:`, left, notesY, { font: 'Helvetica-Bold', size: 7.8, lineBreak: false });
    text(value, left + 78, notesY, { size: 8.3, width: notesWidth - 78, lineBreak: false, ellipsis: true });
    notesY += 14;
  }

  /* Pie: QR, hash y leyendas ------------------------------------------------- */

  y = Math.max(totalsY, notesY) + 26;
  hairline(y, ink, 0.8);
  y += 16;
  const qrSize = 92;
  drawQr(document, qrContent, left, y, qrSize);
  const footerX = left + qrSize + 20;
  const footerWidth = right - footerX;
  text(`Representación impresa de la ${kind}.`, footerX, y + 2, { width: footerWidth, font: 'Helvetica-Bold', size: 8.6 });
  text(trackingUrl
    ? `Escanea el código o entra a ${trackingUrl} para ver el comprobante y el estado del pedido.`
    : `Consulta el estado del pedido ${order.id} en la sección Pedidos de la web.`,
  footerX, document.y + 5, { width: footerWidth, size: 8, color: muted });
  text(`Resumen: ${hash}`, footerX, document.y + 7, { width: footerWidth, font: 'Courier', size: 7.6, color: muted });
  text('Emisión electrónica simulada: este comprobante no se envía a una OSE ni a SUNAT. Documento de demostración académica, sin valor fiscal.',
    footerX, document.y + 7, { width: footerWidth, size: 7.6, color: ember });
  y = Math.max(y + qrSize, document.y) + 30;
  text('Gracias por tu preferencia.', left, y, { width, align: 'center', font: 'Helvetica-Bold', size: 9 });
  text(`${issuer.name} · Prototipo académico del SGP v2`, left, y + 14, { width, align: 'center', size: 7.5, color: muted });
}

export async function buildReceipt(order, siteName, options = {}) {
  const kind = order.receipt.type === 'factura' ? 'Factura electrónica' : 'Boleta de venta electrónica';
  const document = new PDFDocument({
    size: 'A4',
    margin: 40,
    info: {
      Title: `${kind} ${order.receipt.code} · ${issuer.name}`,
      Author: issuer.name,
      Subject: 'Comprobante de demostración académica, sin valor fiscal',
    },
  });
  const chunks = [];
  const finished = new Promise((resolve, reject) => {
    document.on('data', (chunk) => chunks.push(chunk));
    document.on('end', () => resolve(Buffer.concat(chunks)));
    document.on('error', reject);
  });
  writeReceipt(document, order, siteName, options);
  document.end();
  return finished;
}
