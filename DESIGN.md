# Sistema Editorial · Especificación de diseño de la interfaz

Documento de referencia del rediseño de front end del prototipo del SGP v2 de
Fogón Andino. Describe el sistema visual aplicado a las vistas —Carta, Pedidos,
Reservas, Salón, Canales, Cocina, Despacho, Caja, Gestión y Evidencia— sin
alterar la lógica de negocio, la API ni la persistencia.

> **Revisión «papel» (23 de noviembre de 2026).** El sistema pasó del negro a la
> paleta clara de la referencia y la portada ahora usa video. Las secciones 2 a 6
> describen esta versión.
>
> - Papel `#f2f2f2` y tinta `#222`; portada y pie en `#1b1b1a`. Los colores de
>   estado se oscurecieron para mantener contraste ≥ 4.5:1 sobre el papel.
> - Portada: dos videos a sangre (50/50) con metadatos en las esquinas; la
>   cabecera es blanca sobre los videos y pasa a tinta al bajar.
> - Recorrido vertical: dos videos cuadrados de 280 px al centro y textos
>   alternos. La página termina en la carta, sin cierre.
> - Carta con encabezado centrado, categorías en una línea y platos en cursiva.
> - Navegación: Carta · Pedidos · Operación. Las vistas internas tienen su barra:
>   Salón · Cocina · Despacho · Caja a la vista y el resto en «Más».
> - Gestión y Evidencia muestran primero lo que se señala al exponer; lo demás
>   va en bloques plegables.
> - Se definieron las variables que se usaban sin existir (`--ease`,
>   `--ease-out`, `--glass-1/2`, `--r-pill`, `--r-sm`, `--hairline-strong`,
>   `--text-dim`, `--text-hi`). Sin ellas no corrían las transiciones.
> - Se retiraron el grano de película, la brasa animada y los iconos decorativos.

## 1. Criterio rector

La primera versión del rediseño fue correcta y genérica: superficie oscura,
tarjetas de vidrio, cápsula de navegación con iconos. Es exactamente el
vocabulario que el público identifica como «hecho con inteligencia artificial».
La corrección no fue añadir más detalle, sino **cambiar de método**.

En un producto digital el contenedor manda y el contenido se acomoda dentro.
En una página dirigida por un director de arte ocurre lo contrario: el contenido
manda, la fotografía ocupa media pantalla, la tipografía **es** el logotipo y el
cromo se reduce a diez píxeles de mayúsculas espaciadas.

La referencia asumida es la dirección de arte de un restaurante de cocina
contemporánea —<https://centralrestaurante.com.pe>— de la que se toman cuatro
decisiones verificables:

| Decisión | Medición en la referencia | Aplicación en Fogón Andino |
| --- | --- | --- |
| Logotipo | Sans ultralight, mayúsculas, escala enorme | Jost 200 en mayúsculas, tracking .045 em |
| Cromo de navegación | 10 px, mayúsculas, tracking 1.5 px, sin iconos | Jost 500, 10 px, tracking .2 em, sin iconos |
| Manifiesto | Sans italic ultralight 32 px, interlínea corta | Jost italic 300, `clamp(1.25rem, 2.3vw, 1.8rem)` |
| Portada | Dos medios 50/50 a sangre, metadatos en las esquinas | Split-screen a sangre con pie de metadatos |

Sobre esa base, tres reglas propias:

1. **La comida es el producto.** La interfaz se retira: negro, filetes y
   tipografía. No hay tarjetas, sombras, degradados ni superficies de cristal.
2. **Una sola brasa.** El acento se reserva para lo accionable y lo que está en
   marcha. El resto de la interfaz es neutra.
3. **El dato va en monoespaciada.** Identificadores, códigos, precios y
  irectional de tiempo usan cifras tabulares para que no se muevan al cambiar.

## 2. Tokens

Todo el color, el radio, la elevación y el movimiento viven en el bloque `:root`
de `src/styles.css`. Cambiar la paleta es reescribir ese bloque.

### Superficies

| Token | Valor | Uso |
| --- | --- | --- |
| `--bg` | `#f2f2f2` | Papel: fondo de la aplicación (el mismo de la referencia) |
| `--night` | `#1b1b1a` | Portada y pie |
| `--ink` | `#222222` | Tinta principal |
| `--ink-dim` | `rgba(34,34,34,.76)` | Texto de apoyo |
| `--ink-faint` | `rgba(34,34,34,.64)` | Metadatos, estados apagados |
| `--rule` | `rgba(34,34,34,.2)` | Separadores estructurales |
| `--rule-soft` | `rgba(34,34,34,.1)` | Separadores internos |

### Acento y estados

| Token | Valor | Uso |
| --- | --- | --- |
| `--ember` | `#b3410e` | «En preparación», paso actual, foco del código de entrega |
| `--brass` | `#86621a` | Canal del pedido, reservas registradas |
| `--pampa` | `#4a6b22` | Estado «listo», stock libre |
| `--cielo` | `#2f5f96` | Estado «en camino» |
| `--sage` | `#3d6b52` | Estado «entregado» |

Las acciones primarias ya no usan la brasa: van en tinta sólida (`#222`) con
texto en papel, como la referencia, que es monocroma.

Cada estado del pedido conserva **color y texto**: el color nunca es el único
canal de información.

### Movimiento

| Token | Valor | Uso |
| --- | --- | --- |
| `--ease` | `cubic-bezier(.32,.72,0,1)` | Transiciones de interfaz |
| `--ease-out` | `cubic-bezier(.2,0,0,1)` | Entradas y salidas |
| `--t-fast / base / slow` | `140 / 240 / 420 ms` | Hover, cambio de estado, entrada |

Reglas aplicadas: transiciones CSS interrumpibles (nunca `transition: all`),
`scale(0.96)` al presionar, sin animación propia en interacciones frecuentes,
y `prefers-reduced-motion` respetado de forma global.

Se retiró el grano de película: sobre el papel claro ensuciaba la superficie.

## 3. Tipografía

| Rol | Familia | Ajustes |
| --- | --- | --- |
| Logotipo | Big Shoulders Display Variable (200) | mayúsculas condensadas, tracking .14 em |
| Titulares | Jost Variable (200–300) | mayúsculas; 28 px / 40 px en secciones |
| Manifiesto y platos | Newsreader Variable italic (250–300) | cursiva fina; 32 px / 40 px en el recorrido |
| Texto editorial | Newsreader Variable (300) | 15 px / 22 px, justificado en el recorrido |
| Cromo | Jost Variable (500) | 10 px, tracking .15–.2 em, mayúsculas |
| Operación | `-apple-system` / SF Pro (400) | formularios y listas densas |
| Datos | SF Mono / `ui-monospace` | `tabular-nums`, tracking .42 em en el código |

Newsreader reemplaza la cursiva de Jost: entre las serif libres es la más
cercana a la cursiva ultraligera de la referencia. Big Shoulders Display da al
logotipo el trazo alto y condensado del sitio de referencia sin copiar su marca.

Se retiró Playfair Display: la serif de transición leía «plantilla de
restaurante». Jost es una grotesca geométrica libre que sostiene el mismo
registro que la familia comercial de la referencia.

Las cifras que cambian en vivo (precios, tiempos, contadores, identificadores)
usan `font-variant-numeric: tabular-nums` para evitar el desplazamiento de
línea.

## 4. Componentes

### Cabecera

Posición fija. Sobre los videos de la portada es transparente y blanca; al bajar
al papel pasa a tinta sobre un velo claro translúcido con filete inferior.
Logotipo a la izquierda, navegación y selector de sede a la derecha. El sitio
público muestra Carta, Pedidos y Operación. En las vistas internas la barra
muestra Carta, el recorrido del pedido (Salón, Cocina, Despacho y Caja) y un
botón «Más» que despliega Reservas, Canales, Gestión y Evidencia; cuando la
vista activa está dentro de «Más», el botón toma su nombre y queda subrayado.
El panel se cierra al elegir una vista, con Escape o al tocar fuera. En
pantallas angostas el logotipo y la sede comparten la primera fila y la
navegación ocupa la segunda; ahí la barra interna omite «Carta», porque el
logotipo ya lleva a la carta.

### Portada (Carta)

Dos videos a sangre, mitad y mitad, a altura completa de ventana
(`central-video-1` y `central-video-2`), sin titulares encima: solo la cabecera y
los metadatos en las esquinas inferiores (sedes a la izquierda, cuenta a la
derecha). Un velo mínimo arriba y abajo asegura la lectura. En pantallas
angostas los videos se apilan y los metadatos se centran sobre el segundo. El
`<h1>` queda para lectores de pantalla.

Los videos son material de referencia de Central Restaurante (ver README):
provisionales para el prototipo académico. El componente `LoopVideo` los
reproduce sin sonido, solo mientras están a la vista, y con «reducir
movimiento» deja el póster fijo.

### Recorrido vertical

Título centrado en mayúsculas ultraligeras (28 px / 40 px) y, debajo, videos
cuadrados de 280 px en la columna central. El primer texto (cursiva grande y
párrafo justificado con sangría) baja a la izquierda; el segundo (rótulo,
párrafo y enlaces subrayados) acompaña al siguiente video por la derecha. Son
dos videos (3 y 4); la página termina en la carta y los turnos de los salones
quedan en el pie.

### Carta

Encabezado centrado («La carta» y la sede en cursiva) y categorías en una línea
de micro-tipografía con subrayado en la activa. Debajo, dos columnas: lista de
platos (1fr) y panel de pedido (340 px, fijo).

Cada plato es una línea de menú: miniatura cuadrada de 96 px, nombre en cursiva
serif, puntos guía hasta el precio, descripción en serif y un enlace «Agregar»
que se convierte en contador (− n +). El agotado se marca con texto y la foto
pasa a gris.

### Bloques plegables

Lo secundario de una vista queda a un clic con `<details className="fold">`:
filete superior, rótulo en micro-tipografía, contador opcional y un «+» fino que
gira a «×» al abrir. En **Gestión** quedan a la vista las metas OE1, OE2 y OE3 y
la tabla de carta y precios; los otros cinco indicadores y las ventas por canal
van plegados. En **Evidencia** quedan `/api/health`, `/api/state`, el contrato
OpenAPI y los ocho eventos más recientes con su ID; la lista completa de rutas,
los eventos de reservas y la trazabilidad con el Avance 2 van plegados.

### KDS (Cocina) y Despacho

Comandas, no tarjetas: filete punteado entre pedidos, identificador
monoespaciado de 24 px, canal explícito (`WEB · DELIVERY` / `SALÓN · MESA 03`),
estado en micro-tipografía con punto de color y una sola acción dominante con
borde. Pensado para leerse a distancia.

### Riel de progreso

Línea continua con pasos completados en tinta, paso actual con aro de brasa, y
la hora de cada evento en monoespaciada. Traducción del *step player* de Rare
UI al flujo de un pedido.

### Código de entrega

Cuatro casillas de 60 px con cursor de foco en brasa y relleno al escribir.

### Evidencia

Rutas y eventos en monoespaciada, verbos HTTP en latón y los datos crudos en
JSON sobre papel gris con filete.

### Reservas de mesa — la agenda

Séptima vista del sistema: la agenda cruza las mesas de la sede con los turnos
de servicio.

- **Tira de días** — siete días hacia adelante en micro-tipografía; el día
  vigente se marca con un filete en tinta y la etiqueta «Hoy» en brasa.
- **Interruptor de servicio** — almuerzo o cena, con el activo en tinta sólida.
- **Tablero** — filas = turnos, columnas = mesas. Cada celda libre es un botón
  discontinuo que abre el formulario con esa mesa y ese turno ya puestos; cada
  celda ocupada lleva el nombre del titular, los comensales y el estado, con
  un filo de color por estado.
- **Columna derecha** — la ficha de la reserva seleccionada con sus acciones
  (confirmar, sentar, completar, cancelar, marcar como no presentado) y el
  formulario de alta.

El tablero se desplaza en horizontal cuando no cabe; en móvil la tira de días
hace lo mismo y la columna derecha baja debajo.

### Integración con el POS de salón

El POS de salón lee la reserva viva de la mesa seleccionada y la muestra bajo
el selector: a quién espera esa mesa y para qué turno. Es el vínculo entre la
capacidad de sala y la comanda.

## 5. Criterios de accesibilidad

- Contraste ≥ 4.5:1 en el texto de apoyo y en los colores de estado sobre el
  papel; se oscurecieron por contraste medido, no por decoración.
- Foco visible en tinta (blanco sobre la portada) con `outline` de 1 px y
  desplazamiento de 4 px; no se elimina ningún anillo.
- Los videos son decorativos (`aria-hidden`), sin sonido, y con
  `prefers-reduced-motion` no se reproducen.
- Zonas táctiles de 44×44 px como mínimo en iconos y controles.
- El estado nunca depende solo del color: cada etiqueta lleva su texto.
- `prefers-reduced-motion` desactiva transiciones y animaciones.
- Iconografía SVG en línea, con `currentColor`, `aria-label` en los botones de
  solo icono y `aria-hidden` en los decorativos.
- La navegación se rotula con `aria-current="page"` y el estado activo se marca
  también con subrayado, no solo con color.

## 6. Alcance

| Archivo | Cambio |
| --- | --- |
| `src/styles.css` | Reescrito para el papel claro: tokens, portada con video, recorrido, carta, pie y responsive |
| `src/inventory.css` | Mismo sistema en claro |
| `src/main.jsx` | Solo presentación: `LoopVideo`, portada con dos videos, recorrido vertical, encabezado de la carta, platos con «Agregar» y contador, cabecera con barra pública y barra de operación con «Más», Evidencia con bloques plegables, pie de tres columnas |
| `src/Operaciones.jsx` | Solo presentación en Gestión: metas OE1–OE3 a la vista y el resto plegado; la carga de indicadores y su recarga cada 4 s no cambian |
| `index.html`, `public/manifest.webmanifest` | Colores claros |
| `public/sw.js` | Guarda en caché los pósteres de los videos, no los videos |
| `public/video/` | Cuatro videos de referencia (1 a 4) y sus pósteres |
| `package.json` | Se añadieron `@fontsource-variable/newsreader` y `@fontsource-variable/big-shoulders-display` |

La revisión «papel» no tocó la lógica de negocio, los contratos de la API, el
modelo de datos ni la boleta en PDF. Los archivos de diseño originales quedaron
en `.design-backup-original/` y la versión previa a esta revisión, en
`.backup-antes-central/`.

## 7. Referencias

- [Central Restaurante](https://centralrestaurante.com.pe) — dirección de arte: logotipo ultralight, cromo en micro-tipografía, manifiesto en cursiva, split-screen y metadatos en esquina.
- [make-interfaces-feel-better](https://github.com/jakubkrehel/make-interfaces-feel-better) — radios concéntricos, sombras, tipografía, iconos, zonas táctiles.
- [ui-ux-pro-max](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) — base de datos de estilos, paletas y reglas de UX; lista de control previa a la entrega.
- [Rare UI](https://www.rareui.com/components) — step player y OTP input ya citados en el README del proyecto.
