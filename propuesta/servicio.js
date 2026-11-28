(() => {
  const mesas = [2, 4, 4, 6, 6, 8].map((capacidad, index) => ({
    nombre: `Mesa 0${index + 1}`,
    capacidad,
  }));
  const almuerzo = ['12:30', '13:00', '13:30', '14:00', '14:30'];
  const cena = ['19:00', '19:30', '20:00', '20:30', '21:00', '21:30', '22:00'];
  const turnos = { Almuerzo: almuerzo, Cena: cena };
  const mesasSede = ctx => ctx.tables?.map(table => ({ nombre: table.label, capacidad: table.seats })) ?? mesas;
  const accionesReserva = {
    Registrada: [['Confirmada', 'Confirmar'], ['Cancelada', 'Cancelar'], ['No se presentó', 'No se presentó']],
    Confirmada: [['Llegó', 'Registrar llegada'], ['Cancelada', 'Cancelar'], ['No se presentó', 'No se presentó']],
    'Llegó': [['Completada', 'Completar'], ['Cancelada', 'Cancelar']],
  };
  const diasCortos = new Intl.DateTimeFormat('es-PE', { weekday: 'short', day: 'numeric', timeZone: 'UTC' });
  const diasLargos = new Intl.DateTimeFormat('es-PE', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
  const agendaPorSede = new Map();
  const mesaPorSede = new Map();
  const comandas = new Map();
  let agendaRead;
  let agendaClock;

  function pedidoId(value = '') {
    const match = String(value).trim().match(/^(?:#?FA[\s-]*)?(\d{1,10})$/i);
    return match ? `FA-${match[1]}` : '';
  }

  function seguimiento(ctx) {
    const { esc } = ctx;
    const code = pedidoId(ctx.routeParam ?? '');
    const lookup = ctx.orderLookup;
    const order = ctx.backend ? lookup?.order : ctx.state.orders.find(item => item.id === code);
    const message = lookup?.error ?? (ctx.backend && code && (!lookup || lookup.pending) ? 'Consultando el pedido…' :
      ctx.routeParam ? 'No encontramos ese pedido.' : 'Ingresa el número que recibiste al confirmar tu pedido.');
    const result = order ? detallePedido(ctx, order) : `<p class="op-empty">${esc(message)}</p>`;
    return `<div class="op-grid op-grid--2">
      <section class="op-panel op-stack" aria-labelledby="busqueda-pedido">
        <h2 id="busqueda-pedido">Buscar un pedido</h2>
        <form class="op-stack" id="form-seguimiento">
          <label class="op-field"><span>Número de pedido</span><input name="pedido" placeholder="FA-0000" value="${esc(code)}" maxlength="18" autocapitalize="characters" autocomplete="off" spellcheck="false" required></label>
          <div class="op-actions"><button class="op-button" type="submit">Buscar</button></div>
        </form>
      </section>
      <section aria-label="Resultado del seguimiento">${result}</section>
    </div>`;
  }

  function detallePedido(ctx, order, administrative = false) {
    const { esc, money, total, status, dateTime } = ctx;
    const estados = ['Recibido', 'En preparación', 'Listo', 'Entregado'];
    if (order.fulfillment === 'Delivery') estados.splice(3, 0, 'En camino');
    const actual = estados.indexOf(order.status);
    const receipt = order.receipt;
    const receiptData = receipt?.number ? `<p>${esc(receipt.type)} <strong class="op-code">${esc(receipt.number)}</strong></p>
      <p class="op-muted">${esc(dateTime(receipt.issuedAt))} · Sin valor fiscal</p>` : '';
    const receiptAction = receiptData ? `Abrir ${receipt.type === 'Factura' ? 'factura' : 'boleta'}` : 'Abrir comprobante';
    const delivery = !administrative && order.fulfillment === 'Delivery';
    const showCode = delivery && actual >= estados.indexOf('Listo') && order.deliveryCode;
    const history = new Map(order.history?.map(entry => [entry.status, entry.at]));
    return `<article class="op-panel op-stack">
      <div class="op-panel-head"><div><p class="op-kicker">${esc(order.fulfillment)}${administrative ? ` · ${esc(order.channel)}` : ''}</p><h2 class="op-code">${esc(order.id)}</h2></div>${status(order.status)}</div>
      ${administrative ? `<p><strong>${esc(order.customer)}</strong>${order.table ? ` · ${esc(order.table)}` : ''} · ${esc(order.payment)}</p>` : ''}
      <p class="op-muted">Actualizado ${esc(dateTime(order.updatedAt || order.createdAt))}${administrative && order.courier ? ` · ${esc(order.courier)}` : ''}</p>
      <ol class="op-list" aria-label="Etapas del pedido">
        ${estados.map((estado, index) => `<li class="op-row"${index === actual ? ' aria-current="step"' : ''}><div><span>${esc(estado)}</span>${history.has(estado) ? `<p class="op-muted"><time datetime="${esc(history.get(estado))}">${esc(dateTime(history.get(estado)))}</time></p>` : ''}</div>${status(index === actual ? 'Actual' : index < actual ? 'Completado' : 'Pendiente')}</li>`).join('')}
      </ol>
      ${showCode ? `<div class="op-row"><div><p class="op-kicker">${order.status === 'Entregado' ? 'Código confirmado' : 'Código de entrega'}</p>${order.status === 'Entregado' ? '' : '<p class="op-muted">Muéstralo al recibir tu pedido.</p>'}</div><strong class="op-code">${esc(order.deliveryCode)}</strong></div>` :
        delivery && actual < estados.indexOf('Listo') ? '<p class="op-muted">El código aparece cuando Cocina marca el pedido como listo.</p>' : ''}
      ${delivery && order.courier ? `<p class="op-muted">Repartidor · ${esc(order.courier)}</p>` : ''}
      ${!administrative && order.payment === 'Pendiente' ? '<p class="op-muted">Cuenta abierta. Caja emitirá el comprobante al registrar el cobro.</p>' : ''}
      <div><h3>Detalle del pedido</h3><ul class="op-list">${order.items.map(item => `<li class="op-row"><span>${esc(item.qty)} × ${esc(item.name)}</span><span class="op-amount">${money(item.price * item.qty)}</span></li>`).join('')}</ul></div>
      <div class="op-row"><span>Total</span><strong class="op-amount">${money(total(order))}</strong></div>
      ${administrative || (ctx.backend && receiptData) ? `<section class="pedido-comprobante" aria-labelledby="titulo-pedido-comprobante">
        <div><h3 id="titulo-pedido-comprobante">Comprobante</h3>
          ${receiptData || '<p class="op-muted">Pendiente de emisión.</p>'}
        </div>
        ${administrative ? `<button class="op-button op-button--secondary" type="button" data-pedido-comprobante="${esc(order.id)}"${receiptData ? '' : ' disabled'}>${receiptAction}</button>` :
          `<a class="op-button op-button--secondary" href="${esc(ctx.backend.receiptUrl(order.id))}" target="_blank" rel="noopener noreferrer">${receiptAction}</a>`}
      </section>` : receiptData ? `<details><summary>Ver comprobante de demostración</summary>${receiptData}
      </details>` : ''}
    </article>`;
  }

  function reservaActiva(reservation) {
    return Object.hasOwn(accionesReserva, reservation.status);
  }

  function fechaUTC(value) {
    return new Date(`${value}T12:00:00Z`);
  }

  function desplazarFecha(value, days) {
    const date = fechaUTC(value);
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
  }

  function vistaAgenda(ctx) {
    if (!agendaPorSede.has(ctx.site.id)) {
      const date = ctx.today();
      agendaPorSede.set(ctx.site.id, {
        date, week: date, service: 'Cena', table: '', time: '', selected: '', filter: '', fields: {},
      });
    }
    return agendaPorSede.get(ctx.site.id);
  }

  function option(esc, value, selected, label = value) {
    return `<option value="${esc(value)}"${value === selected ? ' selected' : ''}>${esc(label)}</option>`;
  }

  function turnosServicio(view) {
    return (view.service === 'Almuerzo' ? view.slots?.almuerzo : view.slots?.cena) ?? turnos[view.service];
  }

  function agendaFechas(ctx, view) {
    const { esc } = ctx;
    const today = ctx.today();
    const dates = Array.from({ length: 7 }, (_, offset) => desplazarFecha(view.week, offset));
    return `<section class="agenda-fechas" aria-label="Fecha de la agenda">
      <div class="agenda-fecha-controles">
        <label class="op-field agenda-fecha-input"><span>Ir a una fecha</span><input id="reserva-fecha" type="date" value="${esc(view.date)}" min="${esc(today)}" required></label>
        <div class="agenda-semana" role="group" aria-label="Navegación del calendario">
          <button type="button" class="op-button op-button--secondary" data-agenda-semana="-7" aria-label="Semana anterior"${view.week <= today ? ' disabled' : ''}>‹</button>
          <button type="button" class="op-button op-button--secondary" data-agenda-dia="${esc(today)}" aria-label="Ir a hoy">Hoy</button>
          <button type="button" class="op-button op-button--secondary" data-agenda-semana="7" aria-label="Semana siguiente">›</button>
        </div>
      </div>
      <div class="agenda-dias" role="group" aria-label="Días de la agenda">${dates.map(value => `<button type="button" class="agenda-dia" data-agenda-dia="${esc(value)}" aria-label="${esc(diasLargos.format(fechaUTC(value)))}" aria-pressed="${value === view.date}"><span>${esc(diasCortos.format(fechaUTC(value)))}</span>${value === today ? '<small>Hoy</small>' : ''}</button>`).join('')}</div>
    </section>`;
  }

  function agendaTablero(ctx, view, occupancies) {
    const { esc, status } = ctx;
    const tables = mesasSede(ctx);
    const slots = turnosServicio(view);
    const hiddenColumn = table => view.filter && view.filter !== table ? ' class="agenda-col-oculta"' : '';
    return `<section class="op-stack agenda-tablero" aria-labelledby="turnos-reservas">
      <div class="op-panel-head">
        <div><p class="op-kicker">${esc(ctx.site.name)}</p><h2 id="turnos-reservas">Turnos por mesa</h2></div>
        <div class="agenda-servicios" role="group" aria-label="Servicio">${Object.keys(turnos).map(service => `<button type="button" class="op-button${service === view.service ? '' : ' op-button--secondary'}" data-agenda-servicio="${service}" aria-pressed="${service === view.service}">${service}</button>`).join('')}</div>
      </div>
      <div class="agenda-deslizar"><p class="op-muted">Desliza para ver todas las mesas o filtra por una.</p>
        <label class="op-field"><span>Mesa</span><select id="agenda-filtro-mesa">${option(esc, '', view.filter, 'Todas las mesas')}${tables.map(table => option(esc, table.nombre, view.filter)).join('')}</select></label></div>
      ${view.loading ? '<p class="op-empty" role="status">Consultando reservas de la fecha…</p>' : ''}
      ${view.failed ? '<div class="op-actions"><button class="op-button op-button--secondary" type="button" data-agenda-retry>Reintentar consulta</button></div>' : ''}
      <div class="agenda-tabla-wrap" role="region" aria-label="Calendario de turnos y mesas" tabindex="0">
        <table class="agenda-tabla${view.filter ? ' agenda-tabla--filtrada' : ''}">
          <caption>${esc(diasLargos.format(fechaUTC(view.date)))} · ${esc(view.service)}</caption>
          <thead><tr><th scope="col">Hora</th>${tables.map(table => `<th scope="col"${hiddenColumn(table.nombre)}>${esc(table.nombre)}<small>${table.capacidad} lugares</small></th>`).join('')}</tr></thead>
          <tbody>${slots.map(time => `<tr><th scope="row">${esc(time)}</th>${tables.map(table => {
            const booking = occupancies.get(`${table.nombre}:${time}`);
            const selected = view.table === table.nombre && view.time === time;
            return `<td${hiddenColumn(table.nombre)}>${view.loading || view.failed ? '—' : booking ? `<button type="button" class="agenda-celda agenda-celda--ocupada" data-ver-reserva="${esc(booking.id)}" aria-pressed="${view.selected === booking.id}" aria-label="${esc(`${table.nombre}, ${time}: ${booking.customer}, ${booking.people} personas, ${booking.status}`)}"><strong>${esc(booking.customer)}</strong><span>${booking.people} personas</span>${status(booking.status)}</button>` : `<button type="button" class="agenda-celda agenda-celda--libre" data-reservar-mesa="${esc(table.nombre)}" data-reservar-hora="${esc(time)}" aria-pressed="${selected}" aria-label="${esc(`${table.nombre}, ${time}: libre`)}">Libre</button>`}</td>`;
          }).join('')}</tr>`).join('')}</tbody>
        </table>
      </div>
    </section>`;
  }

  function detalleReserva({ esc, status }, reservation) {
    const fields = [['Mesa', reservation.table], ['Turno', reservation.time], ['Personas', reservation.people], ['Teléfono', reservation.phone || '—']];
    return `<section class="op-panel op-stack agenda-detalle" aria-labelledby="reserva-detalle">
      <div><p class="op-kicker">${esc(reservation.id)}</p><h2 id="reserva-detalle" tabindex="-1">${esc(reservation.customer)}</h2></div>
      <div>${status(reservation.status)}</div>
      <dl class="agenda-detalle-filas">${fields.map(([label, value]) => `<div><dt>${label}</dt><dd>${esc(value)}</dd></div>`).join('')}</dl>
      ${reservation.notes ? `<p class="op-muted">${esc(reservation.notes)}</p>` : ''}
      <div class="op-actions">${(accionesReserva[reservation.status] ?? []).map(([state, label]) => `<button type="button" class="op-button op-button--secondary" data-reserva-id="${esc(reservation.id)}" data-reserva-estado="${esc(state)}">${label}</button>`).join('')}</div>
    </section>`;
  }

  function formularioReserva(ctx, view, table) {
    const { esc } = ctx;
    const { fields } = view;
    return `<section class="op-panel op-stack" aria-labelledby="nueva-reserva">
      <h2 id="nueva-reserva">Nueva reserva</h2>
      ${view.loading || view.failed ? '<p class="op-muted">El formulario estará disponible al cargar los turnos.</p>' :
        `<form id="form-reserva" class="op-stack">
          <div class="op-fields">
            <label class="op-field"><span>Mesa</span><select name="mesa" required>
              ${option(esc, '', view.table, 'Elige la mesa')}${mesasSede(ctx).map(item => option(esc, item.nombre, view.table, `${item.nombre} · ${item.capacidad} lugares`)).join('')}
            </select></label>
            <label class="op-field"><span>Turno</span><select name="turno" required>
              ${option(esc, '', view.time, 'Elige el turno')}${turnosServicio(view).map(slot => option(esc, slot, view.time)).join('')}
            </select></label>
            <label class="op-field op-wide"><span>Nombre</span><input name="nombre" value="${esc(fields.nombre)}" maxlength="80" autocomplete="off" required></label>
            <label class="op-field"><span>Teléfono</span><input name="telefono" value="${esc(fields.telefono)}" type="tel" maxlength="22" placeholder="900 000 000" autocomplete="off" required></label>
            <label class="op-field"><span>Personas</span><input name="personas" type="number" min="1" max="${table?.capacidad ?? 20}" value="${esc(fields.personas ?? 2)}" required></label>
            <label class="op-field op-wide"><span>Notas <small>(opcional)</small></span><textarea name="notas" maxlength="240" rows="2" placeholder="Alergias o preferencias">${esc(fields.notas)}</textarea></label>
          </div>
          <button class="op-button" type="submit">Registrar reserva</button>
        </form>`}
    </section>`;
  }

  function agenda(ctx) {
    const view = vistaAgenda(ctx);
    const day = ctx.reservations.filter(item => item.date === view.date).sort((a, b) => a.time.localeCompare(b.time));
    const occupancies = new Map(day.filter(reservaActiva).map(item => [`${item.table}:${item.time}`, item]));
    const selected = day.find(item => item.id === view.selected);
    const table = mesasSede(ctx).find(item => item.nombre === view.table);
    return `<div class="op-stack">
      ${agendaFechas(ctx, view)}
      <div class="agenda-layout">
        ${agendaTablero(ctx, view, occupancies)}
        <aside class="op-stack" aria-label="Detalle de reservas">
          ${selected ? `${detalleReserva(ctx, selected)}<button type="button" class="op-button op-button--secondary" data-agenda-nueva>Nueva reserva</button>` : formularioReserva(ctx, view, table)}
        </aside>
      </div>
      <section class="op-panel op-stack" aria-labelledby="reservas-del-dia">
        <h2 id="reservas-del-dia">Reservas del día</h2>
        ${day.length ? `<ul class="op-list">${day.map(item => `<li class="op-row">
          <div><strong>${ctx.esc(item.customer)}</strong><p class="op-muted">${ctx.esc(item.table)} · ${ctx.esc(item.time)} · ${ctx.esc(item.people)} personas</p></div>
          <div class="agenda-lista-estado">${ctx.status(item.status)} <button type="button" class="op-link" data-ver-reserva="${ctx.esc(item.id)}" aria-label="Ver reserva de ${ctx.esc(item.customer)}">Ver detalle</button></div></li>`).join('')}</ul>` : '<p class="op-empty">No hay reservas registradas para esta fecha.</p>'}
      </section>
    </div>`;
  }

  function guardarReserva(ctx, form) {
    const selection = vistaAgenda(ctx);
    const values = new FormData(form);
    const table = mesasSede(ctx).find(item => item.nombre === values.get('mesa'));
    const time = values.get('turno');
    const date = selection.date;
    const customer = String(values.get('nombre')).trim();
    const phone = String(values.get('telefono')).trim();
    const notes = String(values.get('notas')).trim().slice(0, 240);
    const digits = phone.replace(/\D/g, '').length;
    const people = Number(values.get('personas'));
    if (date < ctx.today()) {
      ctx.notify('Selecciona una fecha de hoy en adelante.', 'error');
      return;
    }
    if (!table || !turnosServicio(selection).includes(time) || !customer || !/^\+?[\d\s()-]+$/.test(phone) || digits < 7 || digits > 15 || !Number.isInteger(people) || people < 1 || people > table.capacidad) {
      ctx.notify('Revisa la mesa, el turno y los datos de la reserva.', 'error');
      return;
    }
    if (!ctx.backend && ctx.reservations.some(item => item.date === date && item.time === time && item.table === table.nombre && reservaActiva(item))) {
      ctx.notify('La mesa ya está reservada para este turno.', 'error');
      return;
    }
    const clear = id => {
      selection.table = '';
      selection.time = '';
      selection.selected = id;
      selection.fields = {};
    };
    if (ctx.backend) {
      return ctx.run(async () => {
        const reservation = await ctx.backend.createReservation({ customer, phone, people, notes, date, table: table.nombre, time }, ctx.site);
        ctx.rememberReservation(reservation);
        if (selection.date === date && selection.table === table.nombre && selection.time === time) clear(reservation.id);
        return reservation;
      }, reservation => `Reserva ${reservation.id} registrada en ${table.nombre}.`);
    }
    const sequence = Math.max(1000, ...ctx.state.reservations.map(item => Number(item.id.match(/\d+$/)?.[0] || 0))) + 1;
    const id = `RS-${sequence}`;
    ctx.commit(() => {
      ctx.state.reservations.push({ id, site: ctx.site.id, customer, phone, notes, people, table: table.nombre, date, time, status: 'Registrada' });
      ctx.log('Reserva', id, `${table.nombre} reservada a las ${time}.`);
      clear(id);
    }, `Reserva ${id} registrada en ${table.nombre}.`);
  }

  function bindAgenda(ctx) {
    const region = ctx.root.querySelector('#agenda-reservas');
    const view = vistaAgenda(ctx);
    agendaRead?.abort();
    clearInterval(agendaClock);
    const resetSelection = () => { view.table = ''; view.time = ''; view.selected = ''; };
    function repaint(focus, scrollToFocus = false) {
      const previousScroll = region.querySelector('.agenda-tabla-wrap').scrollLeft;
      region.innerHTML = agenda(ctx);
      region.querySelector('.agenda-tabla-wrap').scrollLeft = previousScroll;
      if (focus) region.querySelector(focus)?.focus({ preventScroll: !scrollToFocus });
    }
    function selectDate(value) {
      view.date = value;
      if (view.date < view.week || view.date > desplazarFecha(view.week, 6)) view.week = view.date;
      resetSelection();
      view.failed = false;
      if (ctx.backend) void fetchDate(value);
    }
    async function fetchDate(day, quiet = false) {
      agendaRead?.abort();
      const read = new AbortController();
      agendaRead = read;
      if (!quiet) {
        view.loading = true;
        view.failed = false;
        repaint();
      }
      const data = await ctx.loadReservationDay(day, { signal: read.signal, quiet });
      if (read.signal.aborted || view.date !== day || !region.isConnected) return;
      agendaRead = undefined;
      view.loading = false;
      if (!data) {
        if (!quiet) {
          view.failed = true;
          repaint();
        }
        return;
      }
      const existing = ctx.reservations.filter(item => item.date === day);
      const stamps = reservations => reservations.map(item => `${item.id}:${item.updatedAt}`).sort().join('|');
      const changed = stamps(existing) !== stamps(data.reservations);
      if (quiet && (!changed || region.contains(document.activeElement))) return;
      view.slots = data.slots;
      ctx.reservations = ctx.reservations.filter(item => item.date !== day).concat(data.reservations);
      repaint();
    }
    if (ctx.backend) {
      void fetchDate(view.date, !view.loading && !view.failed && ctx.hasReservationDay(view.date) && Boolean(view.slots));
      const timer = setInterval(() => {
        if (!region.isConnected) clearInterval(timer);
        else if (!document.hidden && !agendaRead && !view.failed && !region.contains(document.activeElement)) void fetchDate(view.date, true);
      }, 5000);
      agendaClock = timer;
    }
    region.addEventListener('input', event => {
      if (event.target.form?.id === 'form-reserva' && !['mesa', 'turno'].includes(event.target.name)) view.fields[event.target.name] = event.target.value;
    });
    region.addEventListener('change', event => {
      const field = event.target;
      if (field.id === 'agenda-filtro-mesa') {
        view.filter = field.value;
        repaint('#agenda-filtro-mesa');
      } else if (field.id === 'reserva-fecha') {
        if (field.checkValidity() && /^\d{4}-\d{2}-\d{2}$/.test(field.value)) selectDate(field.value);
        else field.value = view.date;
        repaint('#reserva-fecha');
      } else if (field.form?.id === 'form-reserva' && ['mesa', 'turno'].includes(field.name)) {
        if (field.name === 'mesa') {
          view.table = field.value;
          const table = mesasSede(ctx).find(item => item.nombre === view.table);
          if (table && Number(view.fields.personas ?? 2) > table.capacidad) view.fields.personas = table.capacidad;
        } else view.time = field.value;
        repaint(`#form-reserva [name="${field.name}"]`);
      }
    });
    region.addEventListener('click', event => {
      const button = event.target.closest('button');
      if (!button) return;
      if (button.hasAttribute('data-agenda-retry')) {
        void fetchDate(view.date);
        return;
      }
      if (button.hasAttribute('data-agenda-nueva')) {
        resetSelection();
        repaint('#form-reserva [name="mesa"]');
        return;
      }
      const { agendaSemana, agendaDia, agendaServicio, reservarMesa, reservarHora, verReserva, reservaId, reservaEstado } = button.dataset;
      if (agendaSemana) {
        const shifted = desplazarFecha(view.week, Number(agendaSemana));
        view.week = shifted < ctx.today() ? ctx.today() : shifted;
        selectDate(view.week);
        repaint(view.week === ctx.today() ? '.agenda-dia[aria-pressed="true"]' : `[data-agenda-semana="${agendaSemana}"]`);
        return;
      }
      if (agendaDia) {
        selectDate(agendaDia);
        repaint('.agenda-dia[aria-pressed="true"]');
        return;
      }
      if (agendaServicio) {
        view.service = agendaServicio;
        resetSelection();
        repaint('[data-agenda-servicio][aria-pressed="true"]');
        return;
      }
      if (reservarMesa) {
        view.table = reservarMesa;
        view.time = reservarHora;
        view.selected = '';
        const seats = mesasSede(ctx).find(table => table.nombre === reservarMesa).capacidad;
        if (Number(view.fields.personas ?? 2) > seats) view.fields.personas = seats;
        repaint('#form-reserva input', true);
        return;
      }
      if (verReserva) {
        resetSelection();
        view.selected = verReserva;
        repaint('#reserva-detalle', true);
        return;
      }
      const reservation = ctx.reservations.find(item => item.id === reservaId);
      if (!reservation || !accionesReserva[reservation.status]?.some(([state]) => state === reservaEstado)) return;
      if (ctx.backend) {
        void ctx.run(async () => {
          const updated = await ctx.backend.updateReservation(reservation.id, reservaEstado);
          ctx.rememberReservation(updated);
          return updated;
        }, `Reserva ${reservation.id} actualizada.`);
        return;
      }
      ctx.commit(() => {
        reservation.status = reservaEstado;
        ctx.log('Reserva', reservation.id, `${reservation.table} · ${reservaEstado}.`);
      }, `Reserva ${reservation.id} actualizada.`);
      ctx.root.querySelector('#reserva-detalle')?.focus({ preventScroll: true });
    });
    region.addEventListener('submit', event => {
      if (event.target.id !== 'form-reserva') return;
      event.preventDefault();
      guardarReserva(ctx, event.target);
      ctx.root.querySelector('#reserva-detalle')?.focus({ preventScroll: true });
    });
  }

  function mesaSeleccionada(ctx) {
    return mesaPorSede.get(ctx.site.id) ?? mesasSede(ctx)[0]?.nombre ?? '';
  }

  function borrador(ctx) {
    const key = `${ctx.site.id}:${mesaSeleccionada(ctx)}`;
    if (!comandas.has(key)) comandas.set(key, { items: new Map(), payment: 'Pendiente', method: 'Efectivo', customer: '' });
    return comandas.get(key);
  }

  function pedidosMesa(ctx, table) {
    return ctx.orders.filter(order => order.table === table && order.fulfillment === 'Salón' && (order.payment === 'Pendiente' || order.status !== 'Entregado'));
  }

  function reservaMesa(ctx, table) {
    return ctx.reservations.find(item => item.table === table && item.date === ctx.today() && reservaActiva(item));
  }

  function itemsComanda(ctx, draft) {
    return ctx.menu.filter(item => draft.items.has(item.id)).map(item => ({
      id: item.id,
      name: item.nombre,
      qty: draft.items.get(item.id),
      price: ctx.productPrice(item),
      active: ctx.productActive(item),
    }));
  }

  function mesaCard(ctx, item, table) {
    const reservation = reservaMesa(ctx, item.nombre);
    const inService = pedidosMesa(ctx, item.nombre).length > 0;
    return `<button class="salon-mesa" type="button" data-salon-mesa="${ctx.esc(item.nombre)}" aria-pressed="${item.nombre === table}">
      <strong>${ctx.esc(item.nombre)}</strong>
      ${ctx.status(inService ? 'En servicio' : reservation ? 'Reservada' : 'Libre')}
    </button>`;
  }

  function cuentaMesa(ctx, orders, booking) {
    if (!orders.length && !booking) return '';
    const pending = orders.filter(order => order.payment === 'Pendiente');
    const balance = pending.reduce((sum, order) => sum + ctx.total(order), 0);
    return `<div class="salon-cuenta">
      ${booking ? `<p class="op-muted"><strong>${ctx.esc(booking.customer)}</strong> · Reserva para ${ctx.esc(booking.people)} personas, ${ctx.esc(booking.time)}</p>` : ''}
      ${pending.length ? `<div class="op-row"><span>Cuenta abierta</span><strong class="op-amount">${ctx.money(balance)}</strong></div>` : ''}
    </div>`;
  }

  function comandaActual({ esc, money }, items, available) {
    if (!items.length) return '<p class="op-empty">Agrega platos de la carta de esta sede.</p>';
    return `<ul class="op-list" aria-label="Platos de la comanda">${items.map(item => `<li class="op-row">
      <div><strong>${esc(item.name)}</strong><p class="op-muted">${item.active ? money(item.price * item.qty) : 'Retirado de la carta'}</p></div>
      <div class="salon-cantidad">
        <button class="op-button op-button--secondary" type="button" data-salon-item="${esc(item.id)}" data-salon-delta="-1" aria-label="Quitar ${esc(item.name)}">−</button>
        <span aria-label="Cantidad: ${item.qty}">${item.qty}</span>
        <button class="op-button op-button--secondary" type="button" data-salon-item="${esc(item.id)}" data-salon-delta="1" aria-label="Sumar ${esc(item.name)}"${!item.active || item.qty >= Math.min(50, available.get(item.id)) ? ' disabled' : ''}>+</button>
      </div>
    </li>`).join('')}</ul>`;
  }

  function salon(ctx) {
    const { esc, money, total, status } = ctx;
    const draft = borrador(ctx);
    const table = mesaSeleccionada(ctx);
    const booking = reservaMesa(ctx, table);
    const orders = pedidosMesa(ctx, table);
    const items = itemsComanda(ctx, draft);
    const counts = items.reduce((sum, item) => sum + item.qty, 0);
    const amount = items.reduce((sum, item) => sum + item.qty * item.price, 0);
    const subtotal = money(amount);
    const needsDni = ctx.backend && draft.payment === 'Pagado' && amount > 70000;
    return `<div class="op-stack">
      <section class="op-panel op-stack" aria-labelledby="mesas-salon">
        <div><p class="op-kicker">${esc(ctx.site.name)}</p><h2 id="mesas-salon">Mesas</h2></div>
        <div class="salon-mesas" role="group" aria-label="Seleccionar mesa">${mesasSede(ctx).map(item => mesaCard(ctx, item, table)).join('')}</div>
      </section>
      <div class="salon-layout">
        <div class="salon-catalogo">${Fogon.productPicker.render(ctx, { id: 'salon', items, title: 'Carta de la sede' })}</div>
        <div class="op-stack salon-resumen">
          <section class="op-panel op-stack" aria-labelledby="nueva-comanda">
            <div><p class="op-kicker">${esc(table)}</p><h2 id="nueva-comanda" tabindex="-1">Nueva comanda</h2></div>
            ${cuentaMesa(ctx, orders, booking)}
            ${comandaActual(ctx, items, Fogon.inventory.availablePortions(ctx))}
            <dl class="salon-importes"><div><dt>Total</dt><dd><strong class="op-amount">${subtotal}</strong></dd></div></dl>
            <form id="form-comanda" class="op-stack">
              <div class="op-fields">
                <label class="op-field op-wide"><span>Nombre para la comanda (opcional)</span><input id="salon-cliente" name="cliente" placeholder="${esc(booking?.customer ?? table)}" value="${esc(draft.customer)}" maxlength="80" autocomplete="off"></label>
                <label class="op-field op-wide"><span>Cobro</span><select id="salon-pago" name="pago">${option(esc, 'Pendiente', draft.payment, 'Cobrar en caja al final')}${option(esc, 'Pagado', draft.payment, 'Registrar pago de prueba')}${ctx.backend ? option(esc, 'Rechazado', draft.payment, 'Pago rechazado de prueba') : ''}</select></label>
                ${draft.payment === 'Pagado' ? `<label class="op-field op-wide"><span>Medio</span><select id="salon-medio" name="medio">${['Efectivo', 'Tarjeta', 'Yape', 'Plin'].map(method => option(esc, method, draft.method)).join('')}</select></label>` : ''}
                ${needsDni ? `<label class="op-field op-wide"><span>DNI de demostración</span><input id="salon-dni" name="dni" inputmode="numeric" pattern="[0-9]{8}" maxlength="8" value="${esc(draft.document)}" required></label>` : ''}
              </div>
              <button class="op-button" type="submit"${items.length ? '' : ' disabled'}>Enviar a cocina</button>
            </form>
          </section>
          <section class="op-panel op-stack" aria-labelledby="comandas-mesa">
            <h2 id="comandas-mesa">Comandas de ${esc(table)}</h2>
            ${orders.length ? `<ul class="op-list">${orders.map(order => `<li class="op-row"><div><a class="op-link op-code" href="#pedido/${encodeURIComponent(order.id)}">${esc(order.id)}</a><p class="op-muted">${esc(order.payment)}</p></div><div>${status(order.status)} <span class="op-amount">${money(total(order))}</span></div></li>`).join('')}</ul>` : '<p class="op-muted">La mesa no tiene comandas activas.</p>'}
          </section>
        </div>
      </div>
      <button class="op-button salon-ir-comanda" type="button" data-ver-comanda${counts ? '' : ' hidden'}>Ver comanda (${counts}) · ${subtotal}</button>
    </div>`;
  }

  function bindSalon(ctx) {
    const region = ctx.root.querySelector('#area-salon');
    const available = Fogon.inventory.availablePortions(ctx);
    function bindPicker() {
      Fogon.productPicker.bind(ctx, { root: region, id: 'salon', onAdd: id => changeItem(id, 1), onRemove: id => changeItem(id, -1) });
    }
    function repaint() {
      region.innerHTML = salon(ctx);
      bindPicker();
    }
    function changeItem(id, delta) {
      const draft = borrador(ctx);
      const product = ctx.menu.find(item => item.id === id);
      const quantity = (draft.items.get(id) ?? 0) + delta;
      if (delta > 0 && (!product || !ctx.productActive(product) || quantity > Math.min(50, available.get(id)))) return;
      if (delta > 0 && draft.items.size >= 50 && !draft.items.has(id)) {
        ctx.notify('La comanda admite hasta 50 platos distintos.', 'error');
        return;
      }
      if (quantity > 0) draft.items.set(id, quantity);
      else draft.items.delete(id);
      repaint();
    }
    bindPicker();
    region.addEventListener('input', event => {
      if (event.target.id === 'salon-cliente') borrador(ctx).customer = event.target.value;
      if (event.target.id === 'salon-dni') borrador(ctx).document = event.target.value;
    });
    region.addEventListener('change', event => {
      const draft = borrador(ctx);
      const { id, value } = event.target;
      if (id === 'salon-medio') draft.method = value;
      if (id === 'salon-pago') {
        draft.payment = value;
        repaint();
        region.querySelector('#salon-pago')?.focus({ preventScroll: true });
      }
    });
    region.addEventListener('click', event => {
      const switchTable = event.target.closest('[data-salon-mesa]');
      if (switchTable) {
        mesaPorSede.set(ctx.site.id, switchTable.dataset.salonMesa);
        repaint();
        region.querySelector('[data-salon-mesa][aria-pressed="true"]')?.focus({ preventScroll: true });
        return;
      }
      if (event.target.closest('[data-ver-comanda]')) {
        const heading = region.querySelector('#nueva-comanda');
        heading.scrollIntoView({ block: 'start' });
        heading.focus({ preventScroll: true });
        return;
      }
      const button = event.target.closest('[data-salon-item]');
      if (!button) return;
      const { salonItem, salonDelta } = button.dataset;
      changeItem(salonItem, Number(salonDelta));
      const replacement = [...region.querySelectorAll('[data-salon-item]')].find(control => control.dataset.salonItem === salonItem && control.dataset.salonDelta === salonDelta && !control.disabled);
      (replacement ?? region.querySelector('#nueva-comanda')).focus({ preventScroll: true });
    });
    region.addEventListener('submit', event => {
      const form = event.target;
      if (form.id !== 'form-comanda') return;
      event.preventDefault();
      const draft = borrador(ctx);
      const table = mesaSeleccionada(ctx);
      const items = itemsComanda(ctx, draft);
      if (!items.length) return;
      if (items.some(item => !item.active)) {
        ctx.notify('Quita los platos retirados de la carta antes de enviar la comanda.', 'error');
        return;
      }
      if (items.some(item => item.qty > available.get(item.id))) {
        ctx.notify('Revisa las cantidades. Uno de los platos supera las porciones disponibles.', 'error');
        return;
      }
      const customer = draft.customer.trim() || reservaMesa(ctx, table)?.customer || table;
      const input = { customer, channel: 'Salón', fulfillment: 'Salón', table, items, payment: draft.payment, method: draft.payment === 'Pagado' ? draft.method : '',
        ...(form.elements.dni ? { receipt: { type: 'Boleta', document: form.elements.dni.value } } : {}) };
      if (ctx.backend) {
        void ctx.run(async () => {
          const order = await ctx.backend.placeOrder(input, ctx.site);
          comandas.delete(`${ctx.site.id}:${table}`);
          return order;
        }, order => `Comanda ${order.id} enviada a cocina.`);
        return;
      }
      ctx.commit(() => {
        ctx.createOrder(input);
        comandas.delete(`${ctx.site.id}:${table}`);
      }, `Comanda de ${table} enviada a cocina.`);
    });
  }

  Fogon.register('seguimiento', {
    title: 'Seguimiento',
    intro: 'Consulta el estado, el código de entrega y el comprobante de tu pedido.',
    render: seguimiento,
    bind(ctx) {
      ctx.root.querySelector('#form-seguimiento').addEventListener('submit', event => {
        event.preventDefault();
        const code = pedidoId(new FormData(event.currentTarget).get('pedido'));
        if (!code) {
          ctx.notify('Ingresa un número de pedido como FA-1041.', 'error');
          return;
        }
        const hash = `#seguimiento/${encodeURIComponent(code)}`;
        if (location.hash === hash && ctx.backend) void Fogon.refresh();
        else location.hash = hash;
      });
    },
  });

  Fogon.register('reservas', {
    title: 'Reservas',
    intro: 'Consulta los turnos, registra reservas y confirma la llegada de los comensales.',
    render: ctx => `<div id="agenda-reservas">${agenda(ctx)}</div>`,
    bind: bindAgenda,
  });

  Fogon.register('pedido', {
    title: 'Detalle del pedido',
    intro: 'Consulta la comanda, su estado y el comprobante.',
    render(ctx) {
      const code = pedidoId(ctx.routeParam);
      const lookup = ctx.orderLookup;
      const order = ctx.backend ? lookup?.order : ctx.orders.find(item => item.id === code);
      if (order) return detallePedido(ctx, order, true);
      const message = lookup?.error ?? (ctx.backend && code && (!lookup || lookup.pending) ? 'Consultando el pedido…' : 'No encontramos ese pedido.');
      return `<p class="op-empty">${ctx.esc(message)}</p>`;
    },
    bind(ctx) {
      const button = ctx.root.querySelector('[data-pedido-comprobante]:enabled');
      button?.addEventListener('click', () => {
        const order = ctx.backend ? ctx.orderLookup?.order : ctx.orders.find(item => item.id === button.dataset.pedidoComprobante);
        if (order?.receipt?.number) Fogon.receipt.open(ctx, order);
      });
    },
  });

  Fogon.register('salon', {
    title: 'Salón',
    intro: 'Organiza las mesas y envía las comandas del salón a cocina.',
    render: ctx => `<div id="area-salon">${salon(ctx)}</div>`,
    bind: bindSalon,
  });
})();
