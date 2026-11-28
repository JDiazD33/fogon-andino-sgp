(() => {
  const categories = ['Fondos', 'Entradas', 'Bebidas', 'Postres'];
  const filters = new Map();
  const normalize = value => value.toLocaleLowerCase('es').normalize('NFD').replace(/\p{Diacritic}/gu, '');

  function currentFilter(ctx, id) {
    const key = `${ctx.site.id}:${id}`;
    if (!filters.has(key)) filters.set(key, { category: categories[0], query: '' });
    return filters.get(key);
  }

  function productList(ctx, filter, quantities, available) {
    const { esc, money } = ctx;
    const query = normalize(filter.query.trim());
    const products = ctx.menu.filter(item => ctx.productActive(item) &&
      (query ? normalize(item.nombre).includes(query) : item.categoria === filter.category));
    if (products.length === 0) return '<p class="op-empty">No hay platos que coincidan.</p>';

    return `<ul class="selector-platos-lista">${products.map(item => {
      const count = quantities.get(item.id) ?? 0;
      const limit = Math.min(50, available.get(item.id) ?? 0);
      return `<li class="selector-plato">
        <img src="${esc(item.foto)}" alt="" width="80" height="80" loading="lazy">
        <div class="selector-plato-texto">
          <h3>${esc(item.nombre)}</h3>
          <span class="op-amount">${esc(money(ctx.productPrice(item)))}</span>
        </div>
        <div class="selector-plato-cantidad">
          ${count ? `<button type="button" data-picker-action="remove" data-picker-product="${esc(item.id)}" aria-label="Quitar una porción de ${esc(item.nombre)}">−</button><span aria-label="${count} porciones">${count}</span>` : ''}
          ${limit || count ? `<button type="button" data-picker-action="add" data-picker-product="${esc(item.id)}" aria-label="Agregar ${esc(item.nombre)}"${count >= limit ? ' disabled' : ''}>${count ? '+' : 'Agregar'}</button>` : ctx.status('Agotado')}
        </div>
      </li>`;
    }).join('')}</ul>`;
  }

  Fogon.productPicker = {
    render(ctx, { id, items, title }) {
      const { esc } = ctx;
      const filter = currentFilter(ctx, id);
      const quantities = new Map(items.map(item => [item.id, item.qty]));
      const available = Fogon.inventory.availablePortions(ctx);
      return `<section class="selector-platos op-panel op-stack" data-product-picker="${esc(id)}" data-product-quantities="${esc(JSON.stringify(Object.fromEntries(quantities)))}" aria-labelledby="selector-${esc(id)}-titulo">
        <h2 id="selector-${esc(id)}-titulo">${esc(title)}</h2>
        <label class="op-field"><span>Buscar en la carta</span><input type="search" data-picker-search value="${esc(filter.query)}" placeholder="Nombre del plato" autocomplete="off"></label>
        <div class="selector-platos-categorias" role="group" aria-label="Categorías de la carta">
          ${categories.map(category => `<button type="button" data-picker-category="${category}" aria-pressed="${!filter.query && category === filter.category}">${category}</button>`).join('')}
        </div>
        <div data-picker-list>${productList(ctx, filter, quantities, available)}</div>
      </section>`;
    },

    bind(ctx, { root, id, onAdd, onRemove }) {
      const selector = `[data-product-picker="${id}"]`;
      const panel = root.querySelector(selector);
      if (!panel) return;
      const filter = currentFilter(ctx, id);
      const search = panel.querySelector('[data-picker-search]');
      const list = panel.querySelector('[data-picker-list]');
      const buttons = [...panel.querySelectorAll('[data-picker-category]')];
      const quantities = new Map(Object.entries(JSON.parse(panel.dataset.productQuantities)));
      const available = Fogon.inventory.availablePortions(ctx);

      function updateFilter() {
        list.innerHTML = productList(ctx, filter, quantities, available);
        list.scrollTop = 0;
        for (const button of buttons) button.setAttribute('aria-pressed', String(!filter.query && filter.category === button.dataset.pickerCategory));
      }

      search.addEventListener('input', () => {
        filter.query = search.value;
        updateFilter();
      });
      panel.addEventListener('click', event => {
        const category = event.target.closest('[data-picker-category]');
        if (category) {
          filter.category = category.dataset.pickerCategory;
          filter.query = '';
          search.value = '';
          updateFilter();
          return;
        }
        const control = event.target.closest('[data-picker-action]');
        if (!control) return;
        const { pickerAction, pickerProduct } = control.dataset;
        const scroll = list.scrollTop;
        if (pickerAction === 'add') onAdd(pickerProduct);
        else onRemove(pickerProduct);
        if (!control.isConnected) {
          const updatedPanel = ctx.root.querySelector(selector);
          if (!updatedPanel) return;
          updatedPanel.querySelector('[data-picker-list]').scrollTop = scroll;
          const updated = [...updatedPanel.querySelectorAll('[data-picker-product]:enabled')].filter(button => button.dataset.pickerProduct === pickerProduct);
          (updated.find(button => button.dataset.pickerAction === pickerAction) ?? updated[0])?.focus({ preventScroll: true });
        }
      });
    },
  };
})();
