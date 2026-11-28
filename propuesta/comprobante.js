(() => {
  const issuer = { ruc: '20601234567', name: 'FOGÓN ANDINO S.A.C.', address: 'Calle Los Fogones 120, Miraflores, Lima' };
  const establishments = {
    miraflores: 'Calle Los Fogones 120, Miraflores, Lima',
    'san-isidro': 'Calle Las Brasas 245, San Isidro, Lima',
  };
  const decimals = new Intl.NumberFormat('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const issueDate = new Intl.DateTimeFormat('es-PE', { timeZone: 'America/Lima', day: '2-digit', month: '2-digit', year: 'numeric' });
  const issueTime = new Intl.DateTimeFormat('es-PE', { timeZone: 'America/Lima', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const amount = cents => decimals.format(cents / 100);
  const soles = cents => `S/ ${amount(cents)}`;

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

  function qrMarkup(content) {
    const grid = Fogon.qrMatrix(content);
    let path = '';
    for (let row = 0; row < grid.size; row++) {
      for (let column = 0; column < grid.size; column++) {
        if (grid.get(row, column)) path += `M${column + 4} ${row + 4}h1v1h-1z`;
      }
    }
    const extent = grid.size + 8;
    return `<svg role="img" aria-label="Código QR con referencia del comprobante" viewBox="0 0 ${extent} ${extent}" shape-rendering="crispEdges"><rect width="${extent}" height="${extent}" fill="white"/><path d="${path}" fill="black"/></svg>`;
  }

  const styles = `
    :root { color: #1d1d1b; background: #f2f2ef; font: 10pt/1.42 Arial, sans-serif; }
    * { box-sizing: border-box; }
    body { margin: 0; }
    h1, h2, p, dl, dd { margin: 0; }
    .recibo { max-width: 210mm; margin: 15px auto; padding: 13mm 14mm; background: white; }
    .cabecera { display: grid; grid-template-columns: 1.2fr 1fr; align-items: start; gap: 16px; }
    .marca { width: max-content; font: 400 clamp(1.7rem, 6vw, 2.65rem)/1.16 'Arial Narrow', Arial, sans-serif; letter-spacing: .11em; transform: scaleX(.79); transform-origin: left; }
    .lema { margin: 0 0 12px; font-size: .73rem; color: #5d5d58; letter-spacing: .2em; }
    .emisor { color: #5d5d58; }
    .identidad { border: 1.5px solid #1d1d1b; text-align: center; font-weight: 700; }
    .identidad > * { padding: 8px 5px; }
    .identidad h1, thead { background: #1d1d1b; color: white; }
    .identidad h1 { font-size: 1.02rem; line-height: 1.25; }
    .numero { font-size: 1.29rem; }
    .demo { margin-block: 5px 0; text-align: center; color: #a23a12; font-weight: 700; font-size: .72rem; letter-spacing: .10em; }
    .datos { display: grid; grid-template-columns: minmax(0, 2fr) minmax(0, 1fr); gap: 3px 17px; border: 1px solid #1d1d1b; padding: 10px 11px; margin-block: 11px 16px; }
    .datos dl, .pago dl { display: grid; grid-template-columns: max-content minmax(0, 1fr); gap: 5px 9px; }
    .datos dt, .pago dt { font-weight: 700; }
    dd { overflow-wrap: anywhere; }
    table { width: 100%; border-collapse: collapse; text-align: left; font-size: .98rem; }
    thead { display: table-header-group; }
    th, td { padding: 6px 8px; vertical-align: top; }
    thead th { font-size: .79rem; letter-spacing: .045em; }
    tbody td { border-bottom: 1px solid #c8c8c2; }
    .alineado { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
    .centro { text-align: center; }
    .resumen { display: grid; grid-template-columns: 1.1fr 1fr; gap: 13px 22px; margin-top: 13px; break-inside: avoid; }
    .pago dl { margin-top: 12px; }
    .montos div { display: flex; justify-content: space-between; column-gap: 8px; padding: 2px 8px; }
    .montos dt { color: #5d5d58; }
    .montos .total { margin-top: 8px; padding-block: 7px; align-items: center; background: #efefeb; font-weight: 700; }
    .total dt { color: #1d1d1b; }
    .total dd { font-size: 1.25rem; }
    .referencia { display: grid; grid-template-columns: 102px minmax(0, 1fr); align-items: start; gap: 13px; border-top: 2px solid #1d1d1b; padding-top: 12px; margin-top: 22px; break-inside: avoid; }
    .referencia svg { width: 100%; display: block; }
    .referencia p { margin-top: 4px; }
    .fiscal { color: #a23a12; }
    footer { margin-top: 16px; text-align: center; break-inside: avoid; }
    footer p { color: #5d5d58; }
    button { display: block; margin: 20px auto 0; padding: 10px 13px; border: 0; background: #1d1d1b; color: white; cursor: pointer; }
    tr { break-inside: avoid; }
    @media screen and (max-width: 585px) {
      .recibo { margin: 0; padding: 17px 12px; }
      .cabecera, .datos, .resumen { grid-template-columns: 1fr; }
      .datos { row-gap: 8px; }
      .datos dl { grid-template-columns: minmax(98px, max-content) minmax(0, 1fr); }
      th, td { padding: 5px 3px; }
      table { font-size: .87rem; }
      thead th { font-size: .69rem; letter-spacing: 0; }
      .referencia { grid-template-columns: 78px minmax(0, 1fr); }
    }
    @page { size: A4; margin: 13mm 14mm; }
    @media print {
      :root, .recibo { background: white; }
      * { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
      .recibo { max-width: none; margin: 0; padding: 0; }
      button { display: none; }
    }
  `;

  function receiptPage(ctx, order) {
    const { esc, total } = ctx;
    const { number, type, issuedAt, ruc } = order.receipt;
    const invoice = type === 'Factura';
    const kind = invoice ? 'Factura electrónica' : 'Boleta de venta electrónica';
    const totalCents = total(order);
    const net = Math.round(totalCents / 1.18);
    const tax = totalCents - net;
    const issued = new Date(issuedAt);
    const address = establishments[ctx.site.id];
    const summary = [...new Set([order.id, order.channel, order.fulfillment, order.zone || order.table].filter(Boolean))].join(' · ');
    const qr = qrMarkup(`FOGON ANDINO | DEMOSTRACION SIN VALOR FISCAL | ${number} | Pedido ${order.id}`);
    const rows = order.items.map(item => `<tr>
      <td class="centro">${esc(item.qty)}</td><td class="centro">UND</td><td>${esc(item.name)}</td>
      <td class="alineado">${amount(item.price)}</td><td class="alineado">${amount(item.price * item.qty)}</td></tr>`).join('');

    return `<!doctype html><html lang="es-PE"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
      <title>${kind} ${esc(number)} · Fogón Andino</title><style>${styles}</style></head><body>
      <main class="recibo">
        <header class="cabecera">
          <div><p class="marca">FOGÓN ANDINO</p><p class="lema">COCINA PERUANA AL MOMENTO</p><strong>${issuer.name}</strong><p class="emisor">${issuer.address}</p></div>
          <div><div class="identidad"><p>R.U.C. ${issuer.ruc}</p><h1>${kind.toUpperCase()}</h1><p class="numero">${esc(number.replace(/^(\w+)-(?=\d)/, '$1 - '))}</p></div>
            <p class="demo">DEMOSTRACIÓN · SIN VALOR FISCAL</p></div>
        </header>
        <section class="datos" aria-label="Datos de emisión">
          <dl><dt>Fecha de emisión</dt><dd>${issueDate.format(issued)}</dd><dt>Cliente</dt><dd>${esc(order.customer || 'Clientes varios')}</dd><dt>Pedido</dt><dd>${esc(summary)}</dd><dt>Establecimiento</dt><dd>Sede ${esc(ctx.site.name)} · ${esc(address)}</dd></dl>
          <dl><dt>Hora</dt><dd>${issueTime.format(issued)}</dd><dt>${invoice ? 'R.U.C. del cliente' : 'D.N.I.'}</dt><dd>${esc(ruc || '—')}</dd><dt>Moneda</dt><dd>Soles (PEN)</dd><dt>Condición</dt><dd>Contado</dd></dl>
        </section>
        <table aria-label="Productos del pedido">
          <thead><tr><th class="centro" scope="col">CANT.</th><th class="centro" scope="col">U.M.</th><th scope="col">DESCRIPCIÓN</th><th class="alineado" scope="col">P. UNIT.</th><th class="alineado" scope="col">IMPORTE</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
        <div class="resumen">
          <section class="pago" aria-label="Datos de pago"><p><strong>SON: ${esc(amountInWords(totalCents))}</strong></p>
            <dl><dt>Forma de pago</dt><dd>Contado</dd><dt>Medio de pago</dt><dd>${esc(order.method || 'Sin detalle')}</dd></dl></section>
          <dl class="montos" aria-label="Totales del comprobante">
            <div><dt>OP. GRAVADA</dt><dd class="alineado">${soles(net)}</dd></div><div><dt>OP. EXONERADA</dt><dd class="alineado">${soles(0)}</dd></div>
            <div><dt>OP. INAFECTA</dt><dd class="alineado">${soles(0)}</dd></div><div><dt>I.G.V. (18 %)</dt><dd class="alineado">${soles(tax)}</dd></div>
            <div class="total"><dt>IMPORTE TOTAL</dt><dd class="alineado">${soles(totalCents)}</dd></div>
          </dl>
        </div>
        <section class="referencia" aria-label="Referencia del pedido">${qr}<div>
          <strong>Representación impresa de la ${kind.toLowerCase()}.</strong>
          <p>El código contiene la referencia del comprobante. Consulta <strong>${esc(order.id)}</strong> en Pedidos para ver su estado.</p>
          <p class="fiscal">Emisión simulada. Documento de demostración académica, sin valor fiscal.</p>
        </div></section>
        <footer><strong>Gracias por tu preferencia.</strong><p>${issuer.name} · Prototipo académico del SGP v2</p></footer>
        <button type="button" onclick="window.print()">Imprimir o guardar PDF</button>
      </main></body></html>`;
  }

  Fogon.receipt = {
    nextNumber(ctx, type) {
      const series = `${type === 'Factura' ? 'F' : 'B'}00${ctx.site.index + 1}-`;
      const last = ctx.orders.reduce((highest, { receipt }) => {
        const number = receipt?.number ?? '';
        if (!number.startsWith(series)) return highest;
        const suffix = number.slice(series.length);
        return /^\d{8}$/.test(suffix) ? Math.max(highest, Number(suffix)) : highest;
      }, 0);
      return `${series}${String(last + 1).padStart(8, '0')}`;
    },

    open(ctx, order) {
      if (ctx.backend) {
        window.open(ctx.backend.receiptUrl(order.id), '_blank', 'noopener,noreferrer');
        return;
      }
      const url = URL.createObjectURL(new Blob([receiptPage(ctx, order)], { type: 'text/html;charset=utf-8' }));
      window.open(url, '_blank', 'noopener,noreferrer');
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    },
  };
})();
