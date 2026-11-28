(() => {
  const kitchenLanes = [
    { status: 'Recibido', title: 'Por preparar', next: 'En preparación', action: 'Iniciar preparación' },
    { status: 'En preparación', title: 'En preparación', next: 'Listo', action: 'Marcar listo' },
    { status: 'Listo', title: 'Listos para salir' },
  ];
  const couriers = [
    ['Lucía Rojas', 'Mateo Salas', 'Valeria León'],
    ['Ana Vera', 'Diego Ramos', 'Elena Ortiz'],
  ];
  const aggregators = new Set(['Rappi', 'PedidosYa']);
  const paymentMethods = ['Efectivo', 'Tarjeta', 'Yape', 'Plin'];
  let kitchenClock;

  function trackingLink(ctx, order) {
    return `<a class="op-link" href="#pedido/${ctx.esc(encodeURIComponent(order.id))}">Ver pedido</a>`;
  }

  function orderSummary(ctx, order) {
    const { esc, status } = ctx;
    const destination = order.table || order.fulfillment;
    return `<div class="op-panel-head"><h3 class="op-code">${esc(order.id)}</h3>${status(order.status)}</div>
      <p class="op-kicker">${esc(order.channel)} · ${esc(destination)}</p>
      <p>${esc(order.customer)}</p>
      <ul class="op-list">${order.items.map(item => `<li class="op-row"><span>${esc(item.name)}</span><strong>×${esc(item.qty)}</strong></li>`).join('')}</ul>`;
  }

  function lane(title, orders, render, empty = 'Sin pedidos en esta etapa.') {
    return `<section class="op-stack">
      <div class="op-panel-head"><h2>${title}</h2><span class="op-code">${orders.length}</span></div>
      ${orders.length ? orders.map(render).join('') : `<p class="op-empty">${empty}</p>`}
    </section>`;
  }

  function moveOrder(ctx, order, status) {
    order.status = status;
    order.updatedAt = new Date().toISOString();
    if (status === 'Entregado') order.deliveredAt = order.updatedAt;
    ctx.log('Pedido', order.id, `Estado actualizado a ${status.toLowerCase()}.`);
  }

  async function runAction(ctx, button, task, message) {
    if (button.disabled) return;
    button.disabled = true;
    try {
      await ctx.run(task, message);
    } finally {
      if (button.isConnected) button.disabled = false;
    }
  }

  function isAggregator(order) {
    return order.channelType === 'agregador' || aggregators.has(order.channel);
  }

  function isPriority(order) {
    return order.priority === 'alta' || isAggregator(order);
  }

  function kitchenTiming(order) {
    const target = Math.max(1, Number(order.targetMinutes) || 20);
    const elapsed = Math.max(0, (Date.now() - Date.parse(order.createdAt)) / 60000) || 0;
    const overdue = elapsed > target;
    const approaching = elapsed > target * 0.7;
    return {
      elapsed,
      target,
      label: overdue ? `Atrasado ${Math.ceil(elapsed - target)} min` : `Quedan ${Math.ceil(target - elapsed)} min`,
      tone: overdue ? 'negative' : approaching ? 'warm' : 'positive',
    };
  }

  Fogon.register('cocina', {
    title: 'Cocina',
    intro: 'Ordena la cola de preparación y actualiza el estado de las comandas de cada canal.',
    render(ctx) {
      return `<div class="op-stack"><div class="op-grid op-grid--3">${kitchenLanes.map(({ status, title, next, action }) => {
        const orders = ctx.orders.filter(order => order.status === status).sort((a, b) => next
          ? Number(isPriority(b)) - Number(isPriority(a)) || (a.dueAt || a.createdAt).localeCompare(b.dueAt || b.createdAt)
          : a.createdAt.localeCompare(b.createdAt));
        return lane(title, orders, order => {
          const timing = kitchenTiming(order);
          return `<article class="op-panel op-stack">
            ${orderSummary(ctx, order)}
            ${isPriority(order) ? '<p class="op-kicker">Prioridad</p>' : ''}
            ${next ? `<div class="op-stack" data-kitchen-timing="${ctx.esc(order.id)}">
              <div class="op-row"><strong class="op-status op-status--${timing.tone}" data-kitchen-time>${timing.label}</strong><span class="op-muted">Objetivo ${timing.target} min</span></div>
              <progress value="${Math.min(timing.elapsed, timing.target)}" max="${timing.target}" aria-label="Tiempo de preparación transcurrido"></progress>
            </div>
            <button type="button" class="op-button${status === 'Recibido' ? '' : ' op-button--secondary'}" data-kitchen-order="${ctx.esc(order.id)}">${action}</button>` : ''}
          </article>`;
        }, 'Sin comandas.');
      }).join('')}</div>${Fogon.inventory.render(ctx)}</div>`;
    },
    bind(ctx) {
      Fogon.inventory.bind(ctx);
      clearInterval(kitchenClock);
      const timingRows = [...ctx.root.querySelectorAll('[data-kitchen-timing]')];
      if (timingRows.length) {
        kitchenClock = setInterval(() => {
          if (!timingRows[0].isConnected) {
            clearInterval(kitchenClock);
            return;
          }
          for (const row of timingRows) {
            const order = ctx.orders.find(item => item.id === row.dataset.kitchenTiming);
            const { elapsed, target, label, tone } = kitchenTiming(order);
            const display = row.querySelector('[data-kitchen-time]');
            display.textContent = label;
            display.className = `op-status op-status--${tone}`;
            row.querySelector('progress').value = Math.min(elapsed, target);
          }
        }, 15000);
      }
      for (const button of ctx.root.querySelectorAll('[data-kitchen-order]')) {
        button.addEventListener('click', () => {
          const order = ctx.orders.find(item => item.id === button.dataset.kitchenOrder);
          const next = kitchenLanes.find(stage => stage.status === order?.status)?.next;
          if (!next) return;
          const message = `${order.id} · ${next}.`;
          if (ctx.backend) runAction(ctx, button, () => ctx.backend.updateOrder(order.id, next), message);
          else ctx.commit(() => moveOrder(ctx, order, next), message);
        });
      }
    },
  });

  function availableCouriers(ctx) {
    if (ctx.backend) return (ctx.couriers ?? []).filter(courier => courier.type === 'propio' && !courier.busy);
    const busy = new Set(ctx.orders.filter(order => order.status === 'En camino').map(order => order.courier));
    return (couriers[ctx.site.index] || couriers[0]).filter(name => !busy.has(name)).map(name => ({ id: name, name }));
  }

  function dispatchActions(ctx, order) {
    const { esc } = ctx;
    const receipt = ctx.backend && order.receipt?.number
      ? `<a class="op-link" href="${esc(ctx.backend.receiptUrl(order.id))}" target="_blank" rel="noopener noreferrer">${esc(order.receipt.type)} en PDF</a>`
      : '';
    return `<div class="op-actions">${trackingLink(ctx, order)}${receipt}</div>`;
  }

  function dispatchCard(ctx, order, available) {
    const { esc } = ctx;
    const readyForDelivery = order.status === 'Listo' && order.fulfillment === 'Delivery';
    const needsCourier = readyForDelivery && !isAggregator(order);
    const inTransit = order.status === 'En camino';
    let action = order.fulfillment === 'Salón' ? 'Servir en mesa' : 'Entregar al cliente';
    if (readyForDelivery) action = needsCourier ? 'Asignar y marcar en camino' : `Entregar al repartidor de ${order.channel}`;
    if (inTransit) action = 'Confirmar entrega';

    return `<article class="op-panel op-stack">
      ${orderSummary(ctx, order)}
      ${order.courier ? `<p class="op-muted">Repartidor · ${esc(order.courier)}</p>` : ''}
      ${order.payment === 'Pendiente' ? '<p class="op-muted">Cuenta abierta en Caja.</p>' : ''}
      ${dispatchActions(ctx, order)}
      <form class="op-stack" data-dispatch-order="${esc(order.id)}">
        ${needsCourier && available.length ? `<label class="op-field">Repartidor propio
          <select name="courier" required><option value="">Selecciona un repartidor</option>${available.map(({ id, name }) => `<option value="${esc(id)}">${esc(name)}</option>`).join('')}</select>
        </label>` : ''}
        ${needsCourier && !available.length ? '<p class="op-empty">Todos los repartidores están en ruta.</p>' : ''}
        ${inTransit ? `<label class="op-field">Código de entrega
          <input name="code" inputmode="numeric" pattern="[0-9]{4}" maxlength="4" placeholder="4 dígitos" autocomplete="off" required>
        </label>` : ''}
        <button class="op-button" type="submit" ${needsCourier && !available.length ? 'disabled' : ''}>${esc(action)}</button>
      </form>
    </article>`;
  }

  Fogon.register('despacho', {
    title: 'Despacho',
    intro: 'Entrega los pedidos en salón o recojo, asigna repartidores y confirma la llegada del delivery.',
    render(ctx) {
      const available = availableCouriers(ctx);
      const delivered = ctx.orders.filter(order => order.status === 'Entregado')
        .sort((a, b) => (b.deliveredAt || b.updatedAt).localeCompare(a.deliveredAt || a.updatedAt)).slice(0, 6);
      const card = order => dispatchCard(ctx, order, available);
      return `<div class="op-stack">
        <div class="op-grid op-grid--2">
          ${lane('Listos para entregar', ctx.orders.filter(order => order.status === 'Listo'), card)}
          ${lane('En camino', ctx.orders.filter(order => order.status === 'En camino'), card)}
        </div>
        <section class="op-panel"><h2>Últimas entregas</h2>
          ${delivered.length ? `<ul class="op-list">${delivered.map(order => `<li class="op-row">
            <div><strong class="op-code">${ctx.esc(order.id)}</strong><p class="op-muted">${ctx.esc(order.fulfillment)} · ${ctx.esc(ctx.dateTime(order.deliveredAt || order.updatedAt))}</p></div>
            ${dispatchActions(ctx, order)}
          </li>`).join('')}</ul>` : '<p class="op-empty">Aún no hay entregas confirmadas.</p>'}
        </section>
      </div>`;
    },
    bind(ctx) {
      for (const form of ctx.root.querySelectorAll('[data-dispatch-order]')) {
        form.addEventListener('submit', event => {
          event.preventDefault();
          const order = ctx.orders.find(item => item.id === form.dataset.dispatchOrder);
          if (!order || !['Listo', 'En camino'].includes(order.status)) return;
          const fields = new FormData(form);
          const code = String(fields.get('code') ?? '').trim();
          const startingDelivery = order.status === 'Listo' && order.fulfillment === 'Delivery';
          const aggregator = isAggregator(order);
          const courierId = startingDelivery && !aggregator ? fields.get('courier') : undefined;
          if (startingDelivery && !aggregator && !availableCouriers(ctx).some(courier => courier.id === courierId)) {
            ctx.notify('Elige un repartidor disponible.', 'error');
            return;
          }
          if (ctx.backend) {
            const next = startingDelivery ? 'En camino' : 'Entregado';
            const message = startingDelivery ? `${order.id} se encuentra en camino.` : `${order.id} se registró como entregado.`;
            runAction(ctx, form.querySelector('[type="submit"]'), () => ctx.backend.updateOrder(order.id, next, {
              code: order.status === 'En camino' ? code : undefined,
              courierId,
            }), message);
            return;
          }
          if (order.status === 'En camino' && code !== String(order.deliveryCode)) {
            ctx.notify('El código no coincide con el del pedido. Revísalo en Seguimiento.', 'error');
            return;
          }
          if (startingDelivery) {
            ctx.commit(() => {
              order.courier = aggregator ? `Repartidor de ${order.channel}` : courierId;
              order.deliveryCode ||= order.id.replace(/\D/g, '').padStart(4, '0').slice(-4);
              moveOrder(ctx, order, 'En camino');
            }, `${order.id} se encuentra en camino.`);
            return;
          }
          ctx.commit(() => moveOrder(ctx, order, 'Entregado'), `${order.id} se registró como entregado.`);
        });
      }
    },
  });

  function cashSummary(ctx) {
    const pending = ctx.orders.filter(order => order.payment === 'Pendiente').sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const paid = ctx.orders.filter(order => order.payment === 'Pagado')
      .sort((a, b) => paidAt(b).localeCompare(paidAt(a)));
    const closings = [...(ctx.cash?.closures ?? ctx.state.closings.filter(item => item.site === ctx.site.id))]
      .sort((a, b) => b.at.localeCompare(a.at));
    if (ctx.cash) return { pending, paid, closings, count: ctx.cash.count, total: ctx.cash.total, cash: ctx.cash.expectedCash };
    const lastClosing = closings[0];
    const shift = paid.filter(order => !lastClosing || paidAt(order) > lastClosing.at);
    const sum = orders => orders.reduce((total, order) => total + ctx.total(order), 0);
    return { pending, paid, closings, count: shift.length, total: sum(shift), cash: sum(shift.filter(order => order.method === 'Efectivo')) };
  }

  function paidAt(order) {
    return order.paymentAt || order.receipt?.issuedAt || order.createdAt;
  }

  function cashItems(ctx, order) {
    return order.items.map(item => `<li class="op-row"><span>${ctx.esc(item.qty)} × ${ctx.esc(item.name)}</span>
      <strong class="op-amount">${ctx.money(item.qty * item.price)}</strong></li>`).join('');
  }

  function paymentForm(ctx, pending) {
    const { esc, money, total } = ctx;
    if (!pending.length) return '<p class="op-empty">Las cuentas enviadas desde Salón aparecerán aquí.</p>';
    return `<form class="op-stack" id="op-cash-payment">
      <div class="op-fields">
        <label class="op-field op-wide">Cuenta
          <select name="orderId">${pending.map(order => `<option value="${esc(order.id)}">${esc(order.table || order.customer)} · ${esc(order.id)} · ${esc(money(total(order)))}</option>`).join('')}</select>
        </label>
        <label class="op-field">Medio de pago
          <select name="method">${paymentMethods.map(method => `<option>${method}</option>`).join('')}</select>
        </label>
        <label class="op-field">Comprobante
          <select name="receipt"><option>Boleta</option><option>Factura</option></select>
        </label>
        <label class="op-field" data-cash-amount>Efectivo recibido (S/)
          <input name="cash" type="number" min="0" step="0.01" inputmode="decimal" placeholder="0.00" required>
        </label>
        <label class="op-field" data-cash-ruc hidden>RUC de demostración
          <input name="ruc" inputmode="numeric" pattern="${ctx.backend ? '(?:10|20)[0-9]{9}' : '[0-9]{11}'}" maxlength="11" placeholder="11 dígitos" disabled>
        </label>
        ${ctx.backend ? `<label class="op-field" data-cash-name hidden>Razón social de demostración
          <input name="billingName" maxlength="100" placeholder="Empresa de ejemplo S.A.C." disabled>
        </label>
        <label class="op-field" data-cash-dni>DNI de demostración
          <input name="dni" inputmode="numeric" pattern="[0-9]{8}" maxlength="8" placeholder="8 dígitos">
        </label>` : ''}
      </div>
      <ul class="op-list" data-cash-items aria-label="Platos de la cuenta">${cashItems(ctx, pending[0])}</ul>
      <div class="op-cash-totals">
        <div class="op-row"><span>Total de la cuenta</span><strong class="op-amount" data-cash-total>${esc(money(total(pending[0])))}</strong></div>
        <div class="op-row" data-cash-change-row><span>Vuelto</span><output class="op-amount" data-cash-change>—</output></div>
      </div>
      <div class="op-actions"><button class="op-button" type="submit">Registrar cobro</button></div>
    </form>`;
  }

  Fogon.register('caja', {
    title: 'Caja',
    intro: 'Cobra las cuentas de salón, genera comprobantes de demostración y registra el arqueo del turno.',
    render(ctx) {
      const { esc, money, dateTime, total } = ctx;
      const { pending, paid, count, closings, total: turno, cash } = cashSummary(ctx);
      const methods = ctx.cash?.byMethod.filter(item => item.count) ?? [];
      return `<div class="op-stack op-cash">
        <div class="op-metrics" aria-label="Resumen de caja">
          <div class="op-metric"><p class="op-kicker">Cuentas abiertas</p><strong>${pending.length}</strong></div>
          <div class="op-metric"><p class="op-kicker">Cobrado en el turno</p><strong class="op-amount">${esc(money(turno))}</strong></div>
          <div class="op-metric"><p class="op-kicker">Efectivo esperado</p><strong class="op-amount">${esc(money(cash))}</strong></div>
        </div>
        <div class="op-grid op-grid--2">
          <section class="op-panel op-stack"><div class="op-cash-heading"><p class="op-kicker">Cobros</p><h2>Cuentas abiertas</h2></div>${paymentForm(ctx, pending)}</section>
          <section class="op-panel op-stack"><div class="op-cash-heading"><p class="op-kicker">Cierre</p><h2>Arqueo del turno</h2>
            <p class="op-muted">${count} cobros desde el último cierre.</p></div>
            ${methods.length ? `<ul class="op-list" aria-label="Cobros del turno por medio">${methods.map(method => `<li class="op-row">
              <span>${esc(method.label)} <small>· ${method.count}</small></span><strong class="op-amount">${money(method.total)}</strong>
            </li>`).join('')}</ul>` : ''}
            <form id="op-cash-close" class="op-stack">
              <label class="op-field">Efectivo contado (S/)<input name="counted" type="number" min="0" step="0.01" inputmode="decimal" placeholder="0.00" required></label>
              <div class="op-actions"><button class="op-button op-button--secondary" type="submit" ${!count ? 'disabled' : ''}>Cerrar caja</button></div>
            </form>
            ${closings.length ? `<ul class="op-list">${closings.slice(0, 3).map(closing => `<li class="op-row"><span><strong class="op-code">${esc(closing.id)}</strong><br>${esc(dateTime(closing.at))}</span><span class="op-amount">${closing.difference ? `Diferencia ${esc(money(closing.difference))}` : 'Cuadrada'}</span></li>`).join('')}</ul>` : ''}
          </section>
        </div>
        <section class="op-panel op-stack"><div class="op-panel-head op-cash-heading"><h2>Cobros y comprobantes</h2>${paid.length ? `<span class="op-muted">${Math.min(paid.length, 12)} cobros recientes</span>` : ''}</div>
          ${paid.length ? `<ul class="op-list">${paid.slice(0, 12).map(order => `<li class="op-row">
            <div><strong class="op-code">${esc(order.id)}</strong><p class="op-muted">${esc(order.method || 'Pago registrado')} · ${esc(dateTime(paidAt(order)))}</p>${order.receipt?.number ? `<p class="op-muted op-code">${esc(order.receipt.number)}</p>` : ''}</div>
            <div class="op-actions"><strong class="op-amount">${esc(money(total(order)))}</strong>${order.receipt?.number ? `<button class="op-button op-button--secondary" type="button" data-cash-receipt="${esc(order.id)}">Ver ${esc(order.receipt.type.toLowerCase())}</button>` : ''}</div>
          </li>`).join('')}</ul>` : '<p class="op-empty">Aún no se registran cobros.</p>'}
        </section>
      </div>`;
    },
    bind(ctx) {
      const payment = ctx.root.querySelector('#op-cash-payment');
      const { pending } = cashSummary(ctx);
      if (payment) {
        const { orderId, method, receipt, cash, ruc, billingName, dni } = payment.elements;
        const updatePayment = () => {
          const isCash = method.value === 'Efectivo';
          const isInvoice = receipt.value === 'Factura';
          cash.required = isCash;
          cash.disabled = !isCash;
          ruc.required = isInvoice;
          ruc.disabled = !isInvoice;
          payment.querySelector('[data-cash-amount]').hidden = !isCash;
          payment.querySelector('[data-cash-change-row]').hidden = !isCash;
          payment.querySelector('[data-cash-ruc]').hidden = !isInvoice;
          const due = ctx.total(pending.find(order => order.id === orderId.value));
          if (ctx.backend) {
            billingName.required = isInvoice;
            billingName.disabled = !isInvoice;
            dni.required = !isInvoice && due > 70000;
            dni.disabled = isInvoice;
            payment.querySelector('[data-cash-name]').hidden = !isInvoice;
            payment.querySelector('[data-cash-dni]').hidden = isInvoice;
          }
          const received = Math.round(cash.valueAsNumber * 100);
          payment.querySelector('[data-cash-total]').textContent = ctx.money(due);
          payment.querySelector('[data-cash-change]').textContent = received >= due ? ctx.money(received - due) : '—';
        };
        payment.addEventListener('change', updatePayment);
        orderId.addEventListener('change', () => {
          const order = pending.find(item => item.id === orderId.value);
          payment.querySelector('[data-cash-items]').innerHTML = cashItems(ctx, order);
        });
        cash.addEventListener('input', updatePayment);
        updatePayment();
        payment.addEventListener('submit', event => {
          event.preventDefault();
          const order = pending.find(item => item.id === orderId.value);
          if (!order || order.payment !== 'Pendiente') return;
          const due = ctx.total(order);
          const received = Math.round(cash.valueAsNumber * 100);
          if (method.value === 'Efectivo' && (!Number.isSafeInteger(received) || received < due)) {
            ctx.notify('El efectivo recibido debe cubrir el total de la cuenta.', 'error');
            return;
          }
          const type = receipt.value;
          if (type === 'Factura' && !/^\d{11}$/.test(ruc.value)) {
            ctx.notify('Escribe un RUC de demostración de 11 dígitos.', 'error');
            return;
          }
          if (ctx.backend) {
            const document = type === 'Factura' ? ruc.value : dni.value;
            const name = type === 'Factura' ? billingName.value.trim() : undefined;
            const paymentMethod = method.value;
            const paymentDetails = { method: paymentMethod, received: paymentMethod === 'Efectivo' ? received : undefined,
              receipt: { type, document, name } };
            runAction(ctx, payment.querySelector('[type="submit"]'), () => ctx.backend.payOrder(order.id, paymentDetails),
              paid => `Cobro registrado. ${paid.receipt.type} ${paid.receipt.number}.`);
            return;
          }
          const number = Fogon.receipt.nextNumber(ctx, type);
          ctx.commit(() => {
            order.payment = 'Pagado';
            order.method = method.value;
            const issuedAt = new Date().toISOString();
            order.receipt = { number, type, issuedAt, ...(type === 'Factura' ? { ruc: ruc.value } : {}) };
            order.updatedAt = issuedAt;
            ctx.log('Cobro', order.id, `${ctx.money(due)} en ${order.method}. ${number}.`);
          }, `Cobro registrado. ${number}.`);
        });
      }

      ctx.root.querySelector('#op-cash-close').addEventListener('submit', event => {
        event.preventDefault();
        const summary = cashSummary(ctx);
        if (summary.pending.length) {
          ctx.notify(`Cobra las cuentas abiertas antes de cerrar el turno (${summary.pending.map(order => order.id).join(', ')}).`, 'error');
          return;
        }
        const counted = Math.round(event.currentTarget.elements.counted.valueAsNumber * 100);
        if (!summary.count || !Number.isSafeInteger(counted) || counted < 0) return;
        if (ctx.backend) {
          runAction(ctx, event.currentTarget.querySelector('[type="submit"]'), () => ctx.backend.closeCash(ctx.site.id, counted), 'Cierre de caja registrado.');
          return;
        }
        const id = `C-DEMO-${String(ctx.state.closings.length + 1).padStart(3, '0')}`;
        ctx.commit(() => {
          const difference = counted - summary.cash;
          ctx.state.closings.push({ id, site: ctx.site.id, at: new Date().toISOString(), counted,
            expected: summary.cash, total: summary.total, payments: summary.count, difference });
          ctx.log('Caja', id, difference ? `Cierre con diferencia de ${ctx.money(difference)}.` : 'Cierre de caja cuadrado.');
        }, `Cierre ${id} registrado.`);
      });

      for (const button of ctx.root.querySelectorAll('[data-cash-receipt]')) {
        button.addEventListener('click', () => {
          const order = ctx.orders.find(item => item.id === button.dataset.cashReceipt);
          if (!order?.receipt?.number) return;
          Fogon.receipt.open(ctx, order);
        });
      }
    },
  });
})();
