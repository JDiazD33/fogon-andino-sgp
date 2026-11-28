(() => {
  // Los saldos y las recetas de demostración proceden de catalog.mjs.
  const ingredients = [
    {"id":"lomo","name":"Lomo fino de res","unit":"g","group":"Carnes y aves","stock":[9000,8000],"min":2000},
    {"id":"res","name":"Carne de res para guiso","unit":"g","group":"Carnes y aves","stock":[18000,16000],"min":4000},
    {"id":"corazon","name":"Corazón de res","unit":"g","group":"Carnes y aves","stock":[6000,5000],"min":1500},
    {"id":"cerdo","name":"Carne de cerdo","unit":"g","group":"Carnes y aves","stock":[12000,10000],"min":3000},
    {"id":"pollo","name":"Pollo","unit":"g","group":"Carnes y aves","stock":[25000,22000],"min":6000},
    {"id":"pato","name":"Pato","unit":"g","group":"Carnes y aves","stock":[7500,6000],"min":1800},
    {"id":"cuy","name":"Cuy entero","unit":"g","group":"Carnes y aves","stock":[14000,0],"min":2800},
    {"id":"charqui","name":"Charqui","unit":"g","group":"Carnes y aves","stock":[2000,1800],"min":500},
    {"id":"pescado","name":"Pescado blanco del día","unit":"g","group":"Pescados y mariscos","stock":[12000,11000],"min":3000},
    {"id":"trucha","name":"Trucha andina","unit":"g","group":"Pescados y mariscos","stock":[0,7000],"min":1750},
    {"id":"mariscos","name":"Mixtura de mariscos","unit":"g","group":"Pescados y mariscos","stock":[9000,8000],"min":2000},
    {"id":"choritos","name":"Choros","unit":"g","group":"Pescados y mariscos","stock":[7500,6000],"min":1800},
    {"id":"papa_blanca","name":"Papa blanca","unit":"g","group":"Tubérculos","stock":[40000,36000],"min":10000},
    {"id":"papa_amarilla","name":"Papa amarilla","unit":"g","group":"Tubérculos","stock":[15000,13000],"min":4000},
    {"id":"papa_seca","name":"Papa seca","unit":"g","group":"Tubérculos","stock":[3000,2500],"min":700},
    {"id":"camote","name":"Camote","unit":"g","group":"Tubérculos","stock":[9000,8000],"min":2000},
    {"id":"yuca","name":"Yuca","unit":"g","group":"Tubérculos","stock":[8000,7000],"min":2000},
    {"id":"olluco","name":"Olluco","unit":"g","group":"Tubérculos","stock":[6000,5500],"min":1500},
    {"id":"arroz","name":"Arroz","unit":"g","group":"Granos y menestras","stock":[40000,36000],"min":10000},
    {"id":"frejol","name":"Frejol canario","unit":"g","group":"Granos y menestras","stock":[6000,5000],"min":1500},
    {"id":"frejol_negro","name":"Frejol negro","unit":"g","group":"Granos y menestras","stock":[2500,2000],"min":600},
    {"id":"quinua","name":"Quinua","unit":"g","group":"Granos y menestras","stock":[3000,2500],"min":700},
    {"id":"maiz_morado","name":"Maíz morado","unit":"g","group":"Granos y menestras","stock":[2000,1800],"min":500},
    {"id":"maiz_blanco","name":"Maíz blanco pelado","unit":"g","group":"Granos y menestras","stock":[4500,4000],"min":1000},
    {"id":"fideos","name":"Fideos","unit":"g","group":"Harinas y panadería","stock":[9000,8000],"min":2000},
    {"id":"harina","name":"Harina de trigo","unit":"g","group":"Harinas y panadería","stock":[12000,10000],"min":3000},
    {"id":"maicena","name":"Maicena","unit":"g","group":"Harinas y panadería","stock":[2500,2000],"min":600},
    {"id":"pan","name":"Pan andino","unit":"g","group":"Harinas y panadería","stock":[5000,4500],"min":1200},
    {"id":"cebolla","name":"Cebolla roja","unit":"g","group":"Verduras y legumbres","stock":[25000,22000],"min":6000},
    {"id":"cebolla_china","name":"Cebolla china","unit":"g","group":"Verduras y legumbres","stock":[1500,1300],"min":400},
    {"id":"tomate","name":"Tomate","unit":"g","group":"Verduras y legumbres","stock":[9000,8000],"min":2000},
    {"id":"lechuga","name":"Lechuga","unit":"g","group":"Verduras y legumbres","stock":[2500,2200],"min":600},
    {"id":"zanahoria","name":"Zanahoria","unit":"g","group":"Verduras y legumbres","stock":[2000,1800],"min":500},
    {"id":"zapallo","name":"Zapallo","unit":"g","group":"Verduras y legumbres","stock":[8000,7000],"min":2000},
    {"id":"choclo","name":"Choclo serrano","unit":"g","group":"Verduras y legumbres","stock":[14000,12000],"min":3500},
    {"id":"habas","name":"Habas verdes","unit":"g","group":"Verduras y legumbres","stock":[4000,3500],"min":1000},
    {"id":"arveja","name":"Arveja verde","unit":"g","group":"Verduras y legumbres","stock":[3000,2500],"min":700},
    {"id":"palta","name":"Palta","unit":"g","group":"Verduras y legumbres","stock":[9000,8000],"min":2200},
    {"id":"aji_amarillo","name":"Ají amarillo","unit":"g","group":"Ajíes, hierbas y especias","stock":[5000,4500],"min":1200},
    {"id":"aji_panca","name":"Ají panca","unit":"g","group":"Ajíes, hierbas y especias","stock":[3500,3000],"min":800},
    {"id":"aji_limo","name":"Ají limo","unit":"g","group":"Ajíes, hierbas y especias","stock":[120,500],"min":150},
    {"id":"rocoto","name":"Rocoto","unit":"g","group":"Ajíes, hierbas y especias","stock":[5000,4500],"min":1200},
    {"id":"culantro","name":"Culantro","unit":"g","group":"Ajíes, hierbas y especias","stock":[2500,2200],"min":600},
    {"id":"huacatay","name":"Huacatay","unit":"g","group":"Ajíes, hierbas y especias","stock":[1200,1000],"min":300},
    {"id":"albahaca","name":"Albahaca","unit":"g","group":"Ajíes, hierbas y especias","stock":[2000,1800],"min":500},
    {"id":"hierbabuena","name":"Hierbabuena","unit":"g","group":"Ajíes, hierbas y especias","stock":[600,500],"min":150},
    {"id":"muna","name":"Muña","unit":"g","group":"Ajíes, hierbas y especias","stock":[400,350],"min":100},
    {"id":"especias","name":"Especias y sazonadores","unit":"g","group":"Ajíes, hierbas y especias","stock":[3000,2600],"min":700},
    {"id":"limon","name":"Limón","unit":"g","group":"Frutas","stock":[30000,27000],"min":7000},
    {"id":"maracuya","name":"Pulpa de maracuyá","unit":"g","group":"Frutas","stock":[4000,3500],"min":1000},
    {"id":"camu_camu","name":"Pulpa de camu camu","unit":"g","group":"Frutas","stock":[3000,2500],"min":700},
    {"id":"aguaymanto","name":"Aguaymanto","unit":"g","group":"Frutas","stock":[3500,3000],"min":800},
    {"id":"lucuma","name":"Pulpa de lúcuma","unit":"g","group":"Frutas","stock":[6000,5000],"min":1500},
    {"id":"papaya","name":"Papaya","unit":"g","group":"Frutas","stock":[8000,7000],"min":2000},
    {"id":"tumbo","name":"Pulpa de tumbo","unit":"g","group":"Frutas","stock":[3000,2600],"min":700},
    {"id":"chirimoya","name":"Chirimoya","unit":"g","group":"Frutas","stock":[4000,3500],"min":1000},
    {"id":"pina","name":"Piña","unit":"g","group":"Frutas","stock":[3000,2600],"min":700},
    {"id":"coco","name":"Coco rallado","unit":"g","group":"Frutas","stock":[800,700],"min":200},
    {"id":"queso_fresco","name":"Queso fresco","unit":"g","group":"Lácteos y huevos","stock":[9000,8000],"min":2200},
    {"id":"leche","name":"Leche","unit":"ml","group":"Lácteos y huevos","stock":[30000,26000],"min":7000},
    {"id":"leche_condensada","name":"Leche condensada","unit":"ml","group":"Lácteos y huevos","stock":[6000,5000],"min":1500},
    {"id":"mantequilla","name":"Mantequilla","unit":"g","group":"Lácteos y huevos","stock":[3000,2600],"min":700},
    {"id":"huevo","name":"Huevos","unit":"g","group":"Lácteos y huevos","stock":[9000,8000],"min":2200},
    {"id":"aceite","name":"Aceite vegetal","unit":"ml","group":"Despensa","stock":[20000,18000],"min":5000},
    {"id":"azucar","name":"Azúcar","unit":"g","group":"Despensa","stock":[15000,13000],"min":3500},
    {"id":"chancaca","name":"Chancaca","unit":"g","group":"Despensa","stock":[4000,3500],"min":1000},
    {"id":"manjar","name":"Manjar blanco","unit":"g","group":"Despensa","stock":[3000,2600],"min":700},
    {"id":"chocolate","name":"Chocolate bitter","unit":"g","group":"Despensa","stock":[3000,2600],"min":700},
    {"id":"pecanas","name":"Pecanas","unit":"g","group":"Despensa","stock":[1000,900],"min":250},
    {"id":"mani","name":"Maní tostado","unit":"g","group":"Despensa","stock":[1500,1300],"min":400},
    {"id":"pasas","name":"Pasas","unit":"g","group":"Despensa","stock":[600,500],"min":150},
    {"id":"aceituna","name":"Aceituna de botija","unit":"g","group":"Despensa","stock":[1500,1300],"min":400},
    {"id":"sillao","name":"Sillao","unit":"ml","group":"Despensa","stock":[2000,1800],"min":500},
    {"id":"cafe","name":"Café de Chanchamayo","unit":"g","group":"Despensa","stock":[1500,1300],"min":400},
    {"id":"emoliente_base","name":"Cebada y linaza para emoliente","unit":"g","group":"Despensa","stock":[2000,1800],"min":500},
    {"id":"chicha_jora","name":"Chicha de jora preparada","unit":"ml","group":"Bebidas y licores","stock":[15000,13000],"min":4000},
    {"id":"pisco","name":"Pisco quebranta","unit":"ml","group":"Bebidas y licores","stock":[6000,5500],"min":1500},
    {"id":"ginger_ale","name":"Ginger ale","unit":"ml","group":"Bebidas y licores","stock":[6000,5000],"min":1500},
    {"id":"jarabe","name":"Jarabe de goma","unit":"ml","group":"Bebidas y licores","stock":[2000,1800],"min":500},
    {"id":"algarrobina","name":"Algarrobina","unit":"ml","group":"Bebidas y licores","stock":[1500,1300],"min":400}
  ];
  const recipes = {
    "seco-de-res-con-frejoles": {"res":220,"frejol":90,"arroz":140,"culantro":20,"cebolla":60,"aji_amarillo":15,"chicha_jora":40},
    "rocoto-relleno-con-pastel-de-papa": {"rocoto":150,"res":120,"papa_blanca":180,"queso_fresco":60,"leche":80,"huevo":55,"aceituna":10,"mani":10},
    "trucha-frita": {"trucha":350,"papa_blanca":200,"arroz":140,"cebolla":50,"limon":30,"aceite":60},
    "carapulcra-con-sopa-seca": {"papa_seca":90,"cerdo":150,"aji_panca":20,"mani":15,"fideos":110,"tomate":60,"cebolla":50,"albahaca":5,"especias":3},
    "adobo-arequipeno": {"cerdo":280,"chicha_jora":60,"aji_panca":25,"cebolla":80,"especias":5,"pan":80},
    "arroz-con-pato": {"pato":300,"arroz":150,"culantro":30,"aji_amarillo":15,"arveja":30,"chicha_jora":40,"cebolla":40},
    "pachamanca": {"cerdo":120,"pollo":120,"res":100,"papa_blanca":150,"camote":120,"habas":60,"choclo":100,"huacatay":15,"aji_panca":10},
    "tallarines-verdes-con-bistec": {"fideos":150,"albahaca":40,"queso_fresco":50,"leche":60,"res":180,"aceite":15,"papa_blanca":100},
    "arroz-con-mariscos": {"arroz":160,"mariscos":200,"aji_panca":15,"aji_amarillo":10,"arveja":30,"pisco":15,"cebolla":50,"culantro":10},
    "pollo-a-la-brasa": {"pollo":380,"papa_blanca":250,"aceite":70,"especias":8,"aji_amarillo":10,"lechuga":30,"tomate":40},
    "tacu-tacu-con-lomo": {"lomo":180,"frejol":100,"arroz":140,"cebolla":70,"tomate":60,"aji_amarillo":15,"papa_blanca":120,"sillao":15,"aceite":30},
    "cuy-chactado": {"cuy":700,"papa_blanca":200,"choclo":100,"harina":30,"aceite":120,"especias":5},
    "chaufa-de-pollo": {"arroz":200,"pollo":150,"huevo":55,"cebolla_china":20,"sillao":15,"aceite":20,"especias":3},
    "pescado-a-lo-macho": {"pescado":220,"mariscos":120,"aji_panca":15,"aji_amarillo":10,"leche":40,"arroz":140,"harina":20,"aceite":50},
    "olluquito-con-charqui": {"olluco":220,"charqui":70,"aji_panca":15,"cebolla":50,"culantro":5,"arroz":140,"papa_blanca":80},
    "papa-a-la-huancaina": {"papa_amarilla":220,"queso_fresco":60,"aji_amarillo":25,"leche":60,"huevo":30,"aceituna":10,"lechuga":15},
    "ocopa-arequipena": {"papa_amarilla":200,"huacatay":20,"mani":25,"queso_fresco":50,"leche":50,"aji_amarillo":15,"huevo":30,"aceituna":10},
    "ceviche-clasico": {"pescado":200,"limon":120,"cebolla":60,"aji_limo":8,"culantro":8,"camote":100,"choclo":80,"especias":2},
    "anticuchos-de-corazon": {"corazon":220,"aji_panca":25,"especias":5,"papa_blanca":150,"choclo":80,"aceite":15},
    "choclo-con-queso": {"choclo":250,"queso_fresco":80,"rocoto":15,"huacatay":3},
    "tamal-criollo": {"maiz_blanco":150,"cerdo":80,"aji_amarillo":15,"aji_panca":10,"aceituna":5,"mani":5,"cebolla":40,"limon":15},
    "solterito-arequipeno": {"habas":100,"queso_fresco":60,"choclo":80,"rocoto":20,"cebolla":40,"tomate":50,"aceituna":15,"limon":20,"aceite":10},
    "yucas-fritas-con-huancaina": {"yuca":250,"aceite":60,"queso_fresco":30,"aji_amarillo":15,"leche":30},
    "empanada-criolla-de-carne": {"harina":110,"mantequilla":25,"res":90,"cebolla":50,"huevo":30,"aceituna":10,"aji_panca":5,"azucar":5},
    "sopa-de-quinua": {"quinua":60,"papa_blanca":100,"zapallo":60,"queso_fresco":30,"leche":40,"cebolla":30,"culantro":3},
    "palta-rellena": {"palta":200,"pollo":80,"papa_blanca":60,"zanahoria":30,"arveja":20,"huevo":30,"aceite":20,"limon":10,"lechuga":15},
    "choritos-a-la-chalaca": {"choritos":300,"cebolla":50,"tomate":50,"choclo":40,"rocoto":10,"limon":40,"culantro":5},
    "tiradito-al-aji-amarillo": {"pescado":180,"aji_amarillo":30,"limon":100,"culantro":5,"camote":60,"choclo":40,"especias":2},
    "tequenos-de-queso": {"harina":60,"queso_fresco":80,"aceite":50,"palta":60,"limon":10,"cebolla":10},
    "sopa-criolla": {"res":90,"fideos":50,"leche":80,"huevo":55,"aji_panca":10,"tomate":40,"cebolla":30,"pan":30,"especias":2},
    "refresco-de-maracuya": {"maracuya":80,"azucar":30},
    "limonada-con-hierbabuena": {"limon":90,"hierbabuena":6,"azucar":30},
    "emoliente-caliente": {"emoliente_base":40,"limon":15,"azucar":25},
    "refresco-de-camu-camu": {"camu_camu":70,"azucar":35},
    "pisco-sour": {"pisco":90,"limon":30,"jarabe":30,"huevo":30,"especias":1},
    "chilcano-de-pisco": {"pisco":60,"ginger_ale":150,"limon":15,"especias":1},
    "refresco-de-aguaymanto": {"aguaymanto":80,"azucar":30,"especias":1},
    "batido-de-lucuma": {"lucuma":100,"leche":200,"azucar":15},
    "mate-de-muna": {"muna":4,"azucar":10},
    "cafe-pasado": {"cafe":18,"azucar":10},
    "chicha-de-jora": {"chicha_jora":300},
    "jugo-de-papaya": {"papaya":250,"azucar":15},
    "refresco-de-tumbo": {"tumbo":80,"azucar":35},
    "chocolate-caliente-cusqueno": {"chocolate":40,"leche":220,"azucar":15,"especias":1},
    "algarrobina": {"pisco":60,"algarrobina":30,"leche":90,"huevo":20,"azucar":10,"especias":1},
    "picarones": {"harina":70,"zapallo":50,"camote":50,"chancaca":40,"aceite":60,"especias":1},
    "mazamorra-morada": {"maiz_morado":40,"pina":40,"azucar":30,"maicena":15,"especias":1,"limon":5},
    "arroz-con-leche": {"arroz":40,"leche":180,"azucar":30,"leche_condensada":30,"especias":1},
    "turron-de-dona-pepa": {"harina":60,"mantequilla":15,"huevo":15,"chancaca":40,"azucar":15,"especias":1},
    "queso-helado-arequipeno": {"leche":150,"leche_condensada":40,"coco":15,"especias":1},
    "crema-volteada": {"leche":100,"leche_condensada":60,"huevo":55,"azucar":25},
    "alfajores-de-maicena": {"maicena":40,"harina":20,"mantequilla":20,"manjar":30,"azucar":10},
    "mousse-de-lucuma": {"lucuma":90,"leche":80,"leche_condensada":40,"azucar":10},
    "pastel-de-choclo-dulce": {"choclo":150,"leche":60,"huevo":55,"mantequilla":20,"azucar":30,"pasas":10},
    "chocotejas-de-pecana": {"chocolate":40,"manjar":25,"pecanas":15},
    "king-kong-de-manjar-blanco": {"harina":60,"mantequilla":15,"manjar":40,"pina":20,"mani":10,"azucar":10},
    "mazamorra-de-calabaza": {"zapallo":150,"leche":80,"azucar":30,"maicena":10,"especias":1},
    "helado-de-chirimoya": {"chirimoya":120,"leche":100,"leche_condensada":30,"azucar":10},
    "frejol-colado": {"frejol_negro":70,"chancaca":40,"leche":50,"azucar":15,"especias":2},
    "ranfanote": {"pan":70,"chancaca":50,"queso_fresco":30,"coco":10,"pasas":10,"pecanas":10,"aceite":20,"especias":1}
  };
  const quantities = new Intl.NumberFormat('es-PE', { maximumFractionDigits: 3 });
  const displayUnits = { g: 'kg', ml: 'L' };
  const measure = (amount, unit) => `${quantities.format(displayUnits[unit] ? amount / 1000 : amount)} ${displayUnits[unit] ?? unit}`;
  const active = new Set(['Recibido', 'En preparación']);
  const selections = new Map();

  function balances(ctx) {
    if (ctx.stock) {
      return new Map(ctx.stock.map(({ name, unit, category, minimum, quantity, reserved }) =>
        [name, { name, unit, group: category ?? 'Insumos', min: minimum ?? 0, physical: quantity, reserved }]));
    }
    const result = new Map(ingredients.map(({ id, name, unit, group, stock, min }) => [id, {
      name, unit, group, min, physical: stock[ctx.site.index], reserved: 0,
    }]));
    for (const order of ctx.orders) {
      for (const item of order.items) {
        for (const [id, quantity] of Object.entries(recipes[item.id] ?? {})) {
          const balance = result.get(id);
          if (active.has(order.status)) balance.reserved += quantity * item.qty;
          else balance.physical -= quantity * item.qty;
        }
      }
    }
    return result;
  }

  const free = item => Math.max(0, item.physical - item.reserved);

  function stockLevel(item) {
    const available = free(item);
    if (available === 0) return 'Agotado';
    return available < item.min ? 'Reponer' : '';
  }

  function possiblePortions(stock, recipe) {
    const limits = Object.entries(recipe ?? {}).map(([id, quantity]) => Math.floor(free(stock.get(id)) / quantity));
    return limits.length ? Math.min(...limits) : 0;
  }

  function stockRow(ctx, item) {
    const physical = Math.max(0, item.physical);
    const available = free(item);
    const level = stockLevel(item);
    const freeText = measure(available, item.unit);
    const reservedText = measure(item.reserved, item.unit);
    const physicalText = measure(physical, item.unit);
    return `<li class="inventory-stock-row" data-stock-search="${ctx.esc(`${item.name} ${item.group}`)}">
      <div class="inventory-stock-name"><strong>${ctx.esc(item.name)}</strong>${level ? ctx.status(level) : ''}</div>
      <meter class="inventory-meter" min="0" max="${physical || 1}" value="${available}"
        data-empty="${physical === 0}" aria-label="Stock libre de ${ctx.esc(item.name)}"
        aria-valuetext="${ctx.esc(`${freeText} libres de ${physicalText} físicos, ${reservedText} reservados`)}"></meter>
      <dl class="inventory-stock-values">
        <div><dt>Físico</dt><dd>${physicalText}</dd></div>
        <div><dt>Libre</dt><dd><strong>${freeText}</strong></dd></div>
        <div><dt>Reservado</dt><dd>${reservedText}</dd></div>
        <div><dt>Mínimo</dt><dd>${measure(item.min, item.unit)}</dd></div>
      </dl>
    </li>`;
  }

  function stockReport(ctx, stock) {
    const groups = new Map();
    for (const item of stock.values()) {
      if (!groups.has(item.group)) groups.set(item.group, []);
      groups.get(item.group).push(item);
    }
    return [...groups].map(([group, items], index) => `<details class="inventory-group"${index === 0 || items.some(stockLevel) ? ' open' : ''}>
      <summary><span>${ctx.esc(group)}</span><span class="inventory-group-count" data-stock-count>${items.length}</span></summary>
      <ul class="inventory-stock-list">${items.map(item => stockRow(ctx, item)).join('')}</ul>
    </details>`).join('');
  }

  function calculate(ctx, stock, id, count) {
    if (!Number.isInteger(count) || count < 1 || count > 50) return '<p class="op-empty" role="status">Ingresa entre 1 y 50 porciones.</p>';
    const dish = ctx.menu.find(item => item.id === id);
    if (!dish) return '';
    const recipe = ctx.recipes ? ctx.recipes[id] ?? [] : Object.entries(recipes[id] ?? {})
      .map(([name, quantity]) => ({ name, quantity }));
    const items = recipe.map(({ name, quantity, unit }) => {
      const item = stock.get(name);
      const needed = quantity * count;
      const available = item ? free(item) : 0;
      return { name: item?.name ?? name, unit: item?.unit ?? unit, quantity, needed, available, deficit: Math.max(0, needed - available) };
    });
    if (!items.length) return '<p class="op-empty" role="status">El plato seleccionado no tiene una receta registrada.</p>';
    const possible = Math.min(...items.map(item => Math.floor(item.available / item.quantity)));
    const shortage = items.some(item => item.deficit > 0);
    return `<div class="inventory-recipe-status" data-warning="${shortage}" role="status">
        <p><strong>${quantities.format(possible)} ${possible === 1 ? 'porción posible' : 'porciones posibles'}</strong></p>
        <p>${shortage ? 'Faltan insumos para estas porciones.' : 'Hay insumos suficientes para estas porciones.'}</p>
      </div>
      <table class="op-table inventory-recipe-table"><caption>Insumos para ${ctx.esc(dish.nombre)}</caption>
        <thead><tr><th scope="col">Insumo</th><th scope="col">Necesario</th><th scope="col">Libre</th><th scope="col">Déficit</th></tr></thead>
        <tbody>${items.map(item => `<tr><th scope="row">${ctx.esc(item.name)}</th><td>${measure(item.needed, item.unit)}</td>
          <td>${measure(item.available, item.unit)}</td><td${item.deficit ? ' class="inventory-shortfall"' : ''}>${measure(item.deficit, item.unit)}</td></tr>`).join('')}</tbody>
      </table>
      <p class="inventory-help">Los platos comparten insumos. La capacidad corresponde a la receta seleccionada.</p>`;
  }

  Fogon.inventory = {
    availablePortions(ctx) {
      if (ctx.productAvailability) return new Map(ctx.menu.map(({ id }) => [id, ctx.productAvailability(id)]));
      const stock = balances(ctx);
      return new Map(ctx.menu.map(({ id }) => [id, possiblePortions(stock, recipes[id])]));
    },
    render(ctx) {
      const stock = balances(ctx);
      const needsAttention = [...stock.values()].filter(stockLevel);
      const selection = selections.get(ctx.site.id) ?? { product: 'pachamanca', portions: '1' };
      return `<section class="op-inventory" aria-labelledby="inventario-titulo">
        <header class="inventory-heading">
          <h2 id="inventario-titulo">Existencias de la sede</h2><p class="op-kicker">${ctx.esc(ctx.site.name)}</p>
        </header>
        <div class="inventory-layout">
          <section class="inventory-catalog" aria-labelledby="inventory-stock-title">
            <h3 id="inventory-stock-title">Stock de insumos</h3>
            <p class="inventory-help">${stock.size} insumos agrupados por tipo. ${ctx.stock ? 'Saldos de la sede en el servidor local.' : 'Los saldos reflejan las comandas de la demostración.'}</p>
            <div class="inventory-legend" aria-hidden="true"><span>Libre</span><span>Reservado para pedidos</span></div>
            ${needsAttention.length ? `<p class="inventory-restock"><strong>Requieren atención (${needsAttention.length})</strong><br>
              ${needsAttention.map(item => ctx.esc(`${item.name} (${stockLevel(item).toLowerCase()})`)).join(' · ')}</p>` : ''}
            <label class="op-field inventory-search">Buscar insumo<input type="search" data-inventory-search placeholder="Nombre o grupo" autocomplete="off"></label>
            <p class="inventory-help" data-inventory-matches role="status" hidden></p>
            <div>${stockReport(ctx, stock)}</div>
          </section>
          <form class="op-panel inventory-calculator" id="form-receta">
            <h3>Calculadora por receta</h3>
            <div class="inventory-recipe-fields">
              <label class="op-field">Plato o bebida<select name="product">${ctx.menu.map(item => `<option value="${ctx.esc(item.id)}"${item.id === selection.product ? ' selected' : ''}>${ctx.esc(item.nombre)}</option>`).join('')}</select></label>
              <label class="op-field">Porciones<input name="portions" type="number" min="1" max="50" step="1" inputmode="numeric" value="${ctx.esc(selection.portions)}" required></label>
            </div>
            <div data-recipe-result>${calculate(ctx, stock, selection.product, Number(selection.portions))}</div>
          </form>
        </div>
      </section>`;
    },
    bind(ctx) {
      const form = ctx.root.querySelector('#form-receta');
      const stock = balances(ctx);
      const update = () => {
        const data = new FormData(form);
        selections.set(ctx.site.id, { product: String(data.get('product')), portions: String(data.get('portions')) });
        const portions = form.elements.namedItem('portions');
        portions.setAttribute('aria-invalid', String(!portions.validity.valid));
        form.querySelector('[data-recipe-result]').innerHTML = calculate(ctx, stock, data.get('product'), Number(data.get('portions')));
      };
      form.addEventListener('input', update);
      form.addEventListener('submit', event => event.preventDefault());

      const field = ctx.root.querySelector('[data-inventory-search]');
      const message = ctx.root.querySelector('[data-inventory-matches]');
      const groups = [...ctx.root.querySelectorAll('.inventory-group')].map(group => ({
        group,
        count: group.querySelector('[data-stock-count]'),
        rows: [...group.querySelectorAll('[data-stock-search]')],
        wasOpen: group.open,
      }));
      const normalize = value => value.toLocaleLowerCase('es-PE').normalize('NFD').replace(/\p{Diacritic}/gu, '');
      let previousQuery = '';
      field.addEventListener('input', () => {
        const query = normalize(field.value.trim());
        const words = query.split(/\s+/);
        let matches = 0;
        for (const entry of groups) {
          if (!previousQuery) entry.wasOpen = entry.group.open;
          let visible = 0;
          for (const row of entry.rows) {
            row.hidden = Boolean(query) && !words.every(word => normalize(row.dataset.stockSearch).includes(word));
            if (!row.hidden) visible += 1;
          }
          entry.group.hidden = visible === 0;
          entry.group.open = query ? visible > 0 : entry.wasOpen;
          entry.count.textContent = visible;
          matches += visible;
        }
        previousQuery = query;
        message.hidden = !query;
        message.textContent = matches ? `${matches} ${matches === 1 ? 'insumo encontrado' : 'insumos encontrados'}.` : 'No se encontraron insumos.';
      });
    },
  };
})();
