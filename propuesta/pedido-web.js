(() => {
  if (!Fogon.backend) return;

  const panel = document.querySelector('#pedido-web');
  const count = document.querySelector('#pedido-web-cantidad');
  const status = document.querySelector('#pedido-web-estado');
  const alert = document.querySelector('#pedido-web-error');
  const link = document.querySelector('#pedido-web-seguimiento');
  const form = document.querySelector('#pedido-web-form');
  const list = document.querySelector('#pedido-web-productos');
  const total = document.querySelector('#pedido-web-total');
  const zoneField = document.querySelector('#pedido-web-zona');
  const submit = document.querySelector('#pedido-web-enviar');
  const view = document.querySelector('#pedido-web-ver');
  const money = new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' });
  const carts = new Map();
  let current;
  let pending = false;

  function trackingKey(index) {
    return `fogon-andino:propuesta:pedido:${Fogon.publicSite(index).id}`;
  }

  function cart(index) {
    if (!carts.has(index)) {
      const draft = { items: new Map(), message: '', error: '' };
      try {
        const orderId = localStorage.getItem(trackingKey(index));
        if (/^FA-\d+$/.test(orderId)) draft.orderId = orderId;
      } catch {
        // El último pedido también puede consultarse durante la sesión.
      }
      carts.set(index, draft);
    }
    return carts.get(index);
  }

  function update(index) {
    const draft = cart(index);
    let quantity = 0;
    let amount = 0;
    let valid = true;
    const rows = [];
    for (const { item, qty } of draft.items.values()) {
      const price = qty * Fogon.publicPrice(item, index);
      quantity += qty;
      amount += price;
      if (!Fogon.publicActive(item, index) || qty > Fogon.publicAvailability(item, index)) valid = false;
      const row = document.createElement('li');
      row.className = 'op-row';
      const label = document.createElement('span');
      label.textContent = `${qty} × ${item.nombre} · ${money.format(price / 100)}`;
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'op-button op-button--secondary';
      remove.textContent = 'Quitar';
      remove.disabled = pending;
      remove.setAttribute('aria-label', `Quitar una unidad de ${item.nombre}`);
      remove.addEventListener('click', () => {
        if (qty === 1) draft.items.delete(item.id);
        else draft.items.set(item.id, { item, qty: qty - 1 });
        draft.message = '';
        draft.error = '';
        window.cartaFogon.mostrar();
        (list.querySelector('button') ?? panel.querySelector('summary')).focus();
      });
      row.append(label, remove);
      rows.push(row);
    }
    list.replaceChildren(...rows);
    count.textContent = quantity ? `· ${quantity} ${quantity === 1 ? 'producto' : 'productos'}` : '';
    view.hidden = panel.hidden || !quantity;
    view.textContent = `Ver pedido (${quantity})`;
    total.textContent = money.format(amount / 100);
    form.hidden = !quantity;
    for (const control of [form.elements.customer, form.elements.fulfillment, form.elements.zone, form.elements.payment]) {
      control.disabled = pending;
    }
    submit.disabled = pending || !valid;
    submit.textContent = pending ? 'Enviando…' : 'Confirmar pedido simulado';
    status.textContent = !valid ? 'Revisa las cantidades. Algún producto ya no está disponible.' :
      draft.message || 'Agrega productos de esta sede. El pago y la entrega se simulan.';
    alert.hidden = !draft.error;
    alert.textContent = draft.error;
    link.hidden = !draft.orderId;
    if (draft.orderId) link.href = `#seguimiento/${encodeURIComponent(draft.orderId)}`;
  }

  function updateZone() {
    zoneField.hidden = form.elements.fulfillment.value !== 'Delivery';
  }

  Fogon.pedidoWeb = {
    card(card, item, index) {
      if (!Fogon.publicSite(index)) return;
      const button = card.querySelector('.plato-agregar');
      const draft = cart(index);
      const availability = Fogon.publicAvailability(item, index);
      button.hidden = false;
      button.disabled = availability < 1;
      button.textContent = availability < 1 ? 'Agotado' : 'Agregar al pedido';
      button.setAttribute('aria-label', `${button.textContent}: ${item.nombre}`);
      button.addEventListener('click', () => {
        if (pending) return;
        const qty = (draft.items.get(item.id)?.qty ?? 0) + 1;
        draft.error = '';
        if (qty > Math.min(availability, 50) || (!draft.items.has(item.id) && draft.items.size >= 50)) {
          draft.message = `Se alcanzó el límite de porciones para este pedido.`;
        } else {
          draft.items.set(item.id, { item, qty });
          draft.message = `${item.nombre} agregado al pedido.`;
        }
        panel.open = true;
        update(index);
      });
    },
    render(complete, index) {
      const site = Fogon.publicSite(index);
      panel.hidden = !complete || !site;
      if (panel.hidden) {
        view.hidden = true;
        return;
      }
      if (current !== index) {
        current = index;
        form.reset();
        form.elements.zone.replaceChildren(...[...site.deliveryZones, 'Fuera de cobertura'].map(zone => new Option(zone, zone)));
        updateZone();
      }
      update(index);
    },
  };

  view.addEventListener('click', () => {
    panel.open = true;
    panel.querySelector('summary').focus({ preventScroll: true });
    panel.scrollIntoView({ block: 'center', behavior: 'instant' });
  });
  form.elements.fulfillment.addEventListener('change', updateZone);
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (pending || submit.disabled) return;
    const index = current;
    const site = Fogon.publicSite(index);
    const draft = cart(index);
    const { customer, fulfillment, zone, payment } = Object.fromEntries(new FormData(form));
    pending = true;
    draft.error = '';
    draft.message = 'Registrando el pedido en el servidor…';
    update(index);
    try {
      const order = await Fogon.backend.placeOrder({
        customer: customer.trim(), channel: 'Web', fulfillment, zone: fulfillment === 'Delivery' ? zone : undefined,
        payment, method: 'Pasarela',
        items: [...draft.items.values()].map(({ item, qty }) => ({ id: item.id, qty })),
      }, site);
      draft.items.clear();
      draft.orderId = order.id;
      draft.message = `Pedido ${order.id} registrado. Pago de prueba aprobado.`;
      try {
        localStorage.setItem(trackingKey(index), order.id);
      } catch {
        // El enlace al seguimiento sigue disponible durante esta sesión.
      }
      if (index === current) form.elements.customer.value = '';
      void Fogon.refresh();
    } catch (error) {
      draft.message = '';
      draft.error = error.status ? error.message : 'No se pudo confirmar el pedido con el servidor.';
      if (error.code === 'STOCK' || error.code === 'INACTIVE') void Fogon.refresh();
    } finally {
      pending = false;
      update(current);
      if (index === current && !panel.hidden && !link.hidden && !draft.items.size) link.focus();
    }
  });
})();
