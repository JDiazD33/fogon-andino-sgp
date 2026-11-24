# Fogón Andino S.A.C. · Prototipo del SGP v2

Prototipo académico del SGP v2: las **seis capacidades** que la Figura 14 (p. 46) del Avance 2 asigna a la plataforma omnicanal —carta y precios por sede, gestión de pedidos (OMS), cocina digital (KDS), delivery y despacho, reservas de mesa, y caja y cobros— funcionando sobre los **seis canales de venta** del caso: salón, web, WhatsApp, teléfono, Rappi y PedidosYa. La aplicación usa datos ficticios de Miraflores y San Isidro. La PWA en React se adapta al navegador del celular y de la computadora, NestJS expone la API REST y PostgreSQL conserva los pedidos, sus eventos y las existencias.

## Arranque local

Abre la terminal en la carpeta `M prototipo-fogoN`. Usa Node.js 24 y PostgreSQL. Si necesitas instalar PostgreSQL en macOS con Homebrew, ejecuta `brew install postgresql@17`. Luego ejecuta estos comandos.

```sh
node --version
npm ci
npm run demo
```

La instalación de dependencias requiere internet la primera vez. Con las dependencias listas, la demo funciona en la red local sin servicios externos. El arranque prepara su propia instancia local de PostgreSQL. Si ya tienes PostgreSQL en ejecución, puedes suministrar `DATABASE_URL` con la conexión a una base vacía dedicada a la demo.

Abre [http://127.0.0.1:4173](http://127.0.0.1:4173). Mantén la terminal abierta mientras dure la demo. Detén el servidor con `Ctrl+C`.

| Vista | Dirección en la computadora |
| --- | --- |
| Carta | [/#carta](http://127.0.0.1:4173/#carta) |
| Pedidos | [/#seguimiento](http://127.0.0.1:4173/#seguimiento) |
| Reservas | [/#reservas](http://127.0.0.1:4173/#reservas) |
| Salón | [/#salon](http://127.0.0.1:4173/#salon) |
| Canales | [/#canales](http://127.0.0.1:4173/#canales) |
| Cocina | [/#cocina](http://127.0.0.1:4173/#cocina) |
| Despacho | [/#despacho](http://127.0.0.1:4173/#despacho) |
| Caja | [/#caja](http://127.0.0.1:4173/#caja) |
| Gestión | [/#gestion](http://127.0.0.1:4173/#gestion) |
| Evidencia | [/#evidencia](http://127.0.0.1:4173/#evidencia) |

### Comprobar las reglas de negocio

Con la demo en marcha, abre otra terminal en la misma carpeta y ejecuta:

```sh
npm run verify
```

El script recorre 55 reglas por la API (canales, conectores, cocina, despacho, caja, reservas e indicadores) y muestra ✓ o ✗ por cada una. Reinicia los datos de prueba al empezar y al terminar.

La primera vez que arranques esta versión, el servidor detecta el esquema anterior y lo vuelve a crear (versión 3). Todos los datos son ficticios.

Para repetir el ensayo desde cero, abre **Evidencia** en `127.0.0.1` y pulsa **Reiniciar datos de prueba**. Confirma solo cuando quieras borrar los pedidos de la demo y restablecer las existencias de ambas sedes.

### Celular y computadora en la misma red

Conecta ambos equipos a la misma red Wi-Fi privada. Si el servidor ya está activo, páralo con `Ctrl+C` y vuelve a iniciarlo así.

```sh
HOST=0.0.0.0 npm run demo
```

En otra terminal de la Mac, consulta su dirección de red local.

```sh
ipconfig getifaddr en0
```

Si el comando devuelve `192.168.1.42`, abre `http://192.168.1.42:4173/#carta` en el celular. Usa la dirección que devuelva tu Mac. Si el comando no devuelve nada, revisa la dirección IP de la conexión activa en **Ajustes del Sistema → Red**. Abre **Cocina**, **Despacho** y **Evidencia** en pestañas de la computadora. Usa Miraflores en ambos dispositivos para ver los mismos pedidos. Si la red del aula bloquea la comunicación entre equipos, presenta en la computadora con las mismas pestañas y una ventana estrecha para la carta.

El modo `HOST=0.0.0.0` permite acceder desde la red y las vistas de la demo están abiertas a los equipos que lleguen al servidor. Úsalo solo en una red privada de confianza, con datos ficticios. Al terminar, detén el servidor y vuelve al arranque local si necesitas seguir ensayando.

## Versión publicada en Render

La demo está publicada en **[https://fogon-andino.onrender.com](https://fogon-andino.onrender.com)** con el plan gratis de Render. `render.yaml` define el servicio web, que compila con `npm ci --include=dev && npm run build` y arranca con `node server.mjs`, y una base PostgreSQL dedicada a la demo. Cada `git push` a `main` del repositorio privado `JDiazD33/fogon-andino-sgp` la vuelve a desplegar.

- **La primera visita tarda.** El plan gratis apaga el servicio tras 15 minutos sin visitas y la primera carga demora cerca de un minuto: ábrelo un rato antes de exponer. La base gratuita vence a los 30 días de creada.
- **Igual que la versión local.** La versión publicada lleva los mismos videos de referencia de `public/video/`: `render.yaml` define `VITE_VIDEOS_REFERENCIA=1` al compilar, como `.env.local` en la computadora. Es una demo para el profesor: la página pide a los buscadores que no la indexen (`robots.txt` y la etiqueta `robots`).
- **El QR del comprobante funciona desde cualquier celular.** En la nube, el QR de cada boleta o factura abre el seguimiento del pedido en esa misma dirección.
- **El reinicio de datos está protegido.** En la nube, `POST /api/reset` exige la cabecera `x-reset-token` con el valor de `RESET_TOKEN`, que Render generó y se ve en el servicio **fogon-andino → Environment**. Para dejar la demo limpia antes de exponer:

  ```sh
  curl -X POST -H "Content-Type: application/json" -H "x-reset-token: VALOR_DE_RESET_TOKEN" -d "{}" https://fogon-andino.onrender.com/api/reset
  ```

  `RESET_TOKEN=… FOGON_URL=https://fogon-andino.onrender.com npm run verify` corre las pruebas contra la nube, pero borra los pedidos que haya.

## Guion de demostración

Ensaya primero con los datos reiniciados. El recorrido completo toma unos ocho minutos; los pasos 1, 2, 4 y 5 bastan para una versión corta de cuatro minutos.

En las vistas internas, la barra muestra **Salón**, **Cocina**, **Despacho** y **Caja**; **Reservas**, **Canales**, **Gestión** y **Evidencia** están en el menú **Más**. Las direcciones (`/#reservas`, `/#evidencia`, etc.) no cambian.

1. **Carta y sede.** Abre la carta en el celular. En Miraflores, muestra la causa limeña agotada porque falta papa amarilla. Cambia a San Isidro para ver su disponibilidad y precio. Vuelve a Miraflores. La API calcula la disponibilidad con las recetas y existencias de la sede. Para delivery también valida que la zona elegida esté cubierta por esa sede.
2. **Dos canales, una cola.** En la carta, pide un lomo saltado para la zona Miraflores con el pago de prueba aprobado. En **Salón**, agrega una chicha morada a la **Mesa 01** y confirma. Muestra los dos IDs en **Cocina**, uno etiquetado como web y el otro como salón. La cola recibe ambos pedidos desde la API sin volver a digitarlos.
3. **Reserva de mesa.** En **Reservas**, muestra la agenda: mesas, turnos y las reservas ya sembradas. Registra una reserva nueva para una mesa libre y confirma que la vista de salón reconoce a quién espera la comanda. Intenta reservar un turno ya tomado: la base de datos lo rechaza, no la interfaz.
4. **Cocina y despacho.** Para el pedido web, pulsa **Iniciar preparación** y luego **Marcar listo**. Muestra el cambio en **Pedidos** del celular. En **Despacho** o **Pedidos**, abre **Boleta en PDF**. En **Despacho**, pulsa **Marcar en camino**. Copia el código de cuatro dígitos que aparece en el seguimiento del celular y úsalo para **Confirmar entrega**. El pedido llega a **Entregado** con el mismo ID.
5. **Seis canales, un gestor.** En **Canales**, registra un pedido de WhatsApp (cliente, teléfono, recojo o delivery, Yape) y luego pulsa **Recibir pedido de prueba** en Rappi. Muestra el mensaje en el formato propio de Rappi y el `201` con el ID `FA-…` que creó el conector. Pulsa **Reenviar el mismo mensaje**: la respuesta es `200 · Duplicado ignorado` con el mismo ID. Así se evita el pedido duplicado que hoy se re-digita desde la tablet.
6. **Cocina con tiempos.** En **Cocina**, el pedido de Rappi aparece primero con la marca **Prioridad**. Cada comanda muestra el tiempo objetivo y lo que queda; pasa a latón en riesgo y a brasa cuando se atrasa.
7. **Despacho con repartidor.** Marca listo un pedido con delivery propio. En **Despacho**, elige el repartidor y pulsa **Asignar y marcar en camino**; si eliges uno que ya está en ruta, la API lo rechaza. El pedido de Rappi se entrega al repartidor del agregador.
8. **Caja.** En **Salón**, confirma una comanda con **Cobrar en caja al final**. En **Caja**, cóbrala en efectivo (el vuelto se calcula) con boleta o con factura (RUC de 11 dígitos). Abre el PDF del comprobante. Escribe el efectivo contado y pulsa **Cerrar caja**: si queda una cuenta sin cobrar, el cierre se rechaza.
9. **Gestión.** Muestra los indicadores del día contra OE1 (22 % → 100 % sin re-digitación), OE2 (duplicados y rechazos evitados) y OE3 (52 → ≤ 35 min de entrega). Cambia el precio de un plato o retíralo de la carta y vuelve a **Carta**: el cambio rige al instante para todos los canales de la sede.
10. **Evidencia técnica.** Abre **Evidencia**. Señala el ID en los eventos. Abre `GET /api/state` para mostrar el JSON de la sede y `GET /api/health` para ver la versión que devuelve PostgreSQL. El contrato OpenAPI documenta esas rutas y las operaciones de pedido y de reserva. Recarga **Despacho** para comprobar que el estado se conserva. La app consulta la API periódicamente para actualizar las vistas.

Como ensayos alternativos, selecciona **Fuera de cobertura** o **Rechazado** al confirmar un pedido. La web muestra el rechazo y en cocina no aparece una nueva comanda. Un código incorrecto deja el pedido web en **En camino** hasta introducir el código válido. Los pagos son de prueba y la boleta PDF indica «Demostración · Sin valor fiscal».

## Fundamentos que se muestran al profesor

| Etapa | Evidencia y fundamento |
| --- | --- |
| Preliminar | En la misma cola se ven una fuente de pedidos y una interfaz común. P03 establece la experiencia omnicanal, P05 la fuente única, P08 el desarrollo del SGP diferenciador y P09 la integración por interfaces. Avance 2, Tabla 4, p. 16. |
| A · Visión | Operaciones busca estandarizar la atención y los clientes esperan rapidez y exactitud. PE-01 identifica canales aislados y re-digitación. OE1 busca pasar del 22 % al 100 % de pedidos sin re-digitación y OE2 bajar los errores del 6,5 % a ≤ 1,5 %, ambos al mes 13. En vivo se comprueba el mecanismo con dos pedidos ficticios. Avance 2, Tablas 5–7, pp. 18, 20 y 22. |
| B · Negocio | Contrasta la recepción y transcripción manual del AS-IS con la entrada al OMS, la validación y el paso a cocina y despacho del TO-BE. Sigue el mismo pedido en esas pantallas. Avance 2, Figuras 6 y 8, pp. 27 y 31. |
| C · Datos y aplicaciones | Abre el JSON y señala sede, canal, pedido y detalle. Relaciónalos con el modelo de ventas y con las vistas Web, POS, OMS y KDS del SGP v2. Avance 2, Figuras 11 y 14, pp. 39 y 46. |
| C · Seis capacidades del SGP v2 | Carta y precios por sede (**Gestión**), OMS (**Canales**, **Salón**, **Carta**), KDS (**Cocina**), delivery y despacho (**Despacho**), reservas (**Reservas**) y caja y cobros (**Caja**). Las tablas CANAL, PAGO, COMPROBANTE, REPARTIDOR, ENTREGA, MESA y RESERVA de la Figura 11 existen en PostgreSQL. Reglas impuestas por la base: un pedido de agregador entra una sola vez (`UNIQUE (channel, external_ref)`), solo el salón deja cuentas abiertas, el correlativo del comprobante es único por serie y la factura exige RUC. Avance 2, Figuras 11 y 14, pp. 39 y 46. |
| B · Mejoras M1–M7 | M1 ingreso de todos los canales por API (**Canales**); M2 stock por receta y cobertura; M4 KDS con prioridad y tiempo objetivo; M5 comprobante desde el cobro y descargo por receta; M6 asignación de repartidor y código de entrega; M7 indicadores en **Gestión** y en `GET /api/metrics`. M3 (enrutamiento automático a la sede con capacidad) queda fuera: la sede se elige a mano. Avance 2, Figura 8, p. 31. |
| C · Reservas de mesa | La agenda implementa la sexta capacidad que la Figura 14 (p. 46) asigna al SGP v2: reserva de mesa, con MESA y RESERVA en el modelo de datos de la Figura 11 (p. 39). La regla de una mesa por turno la impone un índice único parcial en PostgreSQL y cada cambio de estado publica un evento de dominio. Es la capacidad que la Figura 14 declara y la Figura 15 (p. 54) no lista entre los microservicios. Avance 2, Figuras 11, 14 y 15, pp. 39, 46 y 54. |
| D · Tecnología | Muestra la PWA en React en el navegador móvil y la API de NestJS con persistencia en PostgreSQL. La arquitectura objetivo añade servicios administrados de AWS. Avance 2, Figura 15 y Tabla 21, pp. 54 y 56. |
| E · Soluciones | Vincula las brechas G02 (canales aislados), G03 (cocina sin control de tiempos) y G04 (despacho manual) con P04. Para el hub y conectores de producción, señala P05. Avance 2, Tablas 22 y 23, pp. 57 y 59. |
| F · Migración | Señala H3 (fundaciones disponibles), H4 (piloto de Miraflores) y H6 (despliegue en siete sedes). Explica que la demo valida un flujo antes de esos hitos. Avance 2, Figura 17, p. 68. |
| G · Gobierno | Muestra el contrato OpenAPI y el JSON de un pedido como evidencia inicial de la revisión de interfaces C3. Conserva como criterio de prueba el mismo ID en todas las vistas y la validación del código de entrega. La preproducción del programa incluye controles como carga y conmutación C7. Avance 2, Tabla 32, p. 74. |
| H · Cambio | Plantea la llegada de un agregador como CH-03. La solicitud debe registrar el impacto, costo y riesgo del nuevo conector. La Junta decide si aprueba el cambio incremental, que implica una iteración parcial del ADM. Avance 2, Tablas 34–37, pp. 79–81. |

### Alcance y respuesta sobre el cronograma

> «Usamos una interfaz web adaptable porque el Avance 2 plantea el SGP v2 como PWA para móviles y tablets. La prueba académica valida que la web y el salón alimentan un mismo gestor mediante una API, y que cocina y despacho conservan el identificador del pedido. En el programa empresarial, las fundaciones están previstas para junio de 2027, el piloto operativo de Miraflores para septiembre de 2027 y el despliegue a las siete sedes para enero de 2028».

- **Diseño y prueba.** La Tabla 8 del Avance 2 (p. 23) delimita el estudio de arquitectura y deja el diseño detallado de código y pantallas fuera de esa profundidad. Esta demo complementa el estudio. Retoma los casos CU-01 y CU-02 del Avance 1 (pp. 22–23) y evidencia RF-02, RF-03 y RF-04 junto con una parte de RF-12. Las metas empresariales de la Tabla 7, p. 22, siguen siendo objetivos del programa.
- **Límites de la demo.** React, NestJS y PostgreSQL se ejecutan en el entorno de demostración. Desde el celular, la dirección HTTP de la red local abre la app en el navegador. El service worker requiere un origen seguro como `localhost` o HTTPS. Las operaciones de pedido se realizan con conexión al servidor y la autonomía de cuatro horas del POS sigue como requisito para validar en el producto objetivo. La sede se elige manualmente, mientras que el TO-BE prevé enrutamiento automático por capacidad. La API de la prueba corre como un solo servicio NestJS. El despliegue de microservicios en AWS, la identidad, la pasarela de pagos, los conectores, la facturación electrónica y los niveles de servicio se sustentan con el diseño y el plan de implementación. Las seis capacidades del SGP v2 están implementadas de punta a punta en una sola API, no como microservicios: no hay confirmación de reservas por correo ni pago de anticipo, los conectores de agregadores reciben mensajes simulados, el envío del comprobante a SUNAT es simulado, no hay GPS del repartidor y la sede no se asigna automáticamente por capacidad (M3).
- **Dependencia de P04.** El Gantt dibuja P04 de M4 a M13 y P02 hasta M6. La Tabla 29 indica una dependencia fin–inicio de P04 respecto a P02. Como aclaración propuesta, los trabajos de diseño y validación controlada pueden transcurrir en M4–M6, y las actividades que requieren nube e identidad quedan para M7–M13. Esta lectura conserva H4 en M9 y H6 en M13. Avance 2, Tabla 29 y Figura 17, pp. 67–68.
- **Pregunta adicional para el ensayo.** OE6 fija la inscripción de bancos de datos para M6 y la Tabla 23 la incluye en P08, que el Gantt inicia en M12. Si preguntan por ese plazo, se puede proponer la inscripción como hito temprano de gobierno P01 a cargo del Oficial de Datos y mantener la automatización de consentimientos dentro de P08. Avance 2, Tablas 7 y 23 y Figura 17, pp. 22, 59 y 68.


### Trazabilidad de lo que se puede afirmar

| Requerimientos del Avance 2 | Alcance comprobable en la demo |
| --- | --- |
| RF-01, RF-12 | Carta, precios y disponibilidad por sede, con cambio de precio y retiro de platos por sede desde **Gestión**. Los datos maestros (MDM) quedan en el alcance objetivo. |
| RF-02, RF-03, RF-04 | Captura en salón y web, persistencia en un gestor común y seguimiento de estados desde cocina y despacho para ambos canales. |
| RF-05, RF-08 | Cobro con seis medios (efectivo con vuelto, tarjeta, Yape, Plin, pasarela y agregador), boleta o factura con serie y correlativo, arqueo y cierre de caja. La pasarela tokenizada y el envío real a PSE/OSE corresponden a P03 y P05; aquí la autorización y el estado SUNAT son simulados. |
| RF-06 | Delivery y recojo, asignación de repartidor propio (uno a la vez) o del agregador, y entrega con código. El GPS en tiempo real corresponde al diseño objetivo. |
| RF-11 | Conectores de Rappi y PedidosYa que traducen el formato propio de cada agregador al gestor único, idempotentes ante mensajes repetidos. Son conectores locales de demostración, no las APIs reales ni el hub de P05. |
| RF-10 | Validación, reserva y descuento de insumos por receta con datos ficticios. Inventario por lotes y procesos de compra forman parte del ERP Odoo de P06. |
| RF-07 | Reserva de mesa con agenda por mesa y turno, control de una mesa por turno impuesto en la base de datos, capacidad en lugares validada contra la mesa y evento de dominio por cambio de estado. Es la sexta capacidad del SGP v2 en la Figura 14 (p. 46); su dependencia es P04. |
| RF-09 | Indicadores del día por canal, cocina, entrega, cobros y reservas en **Gestión** y `GET /api/metrics`. El data warehouse y Power BI corresponden a P07. |
| RF-13, RF-14 | Producción central y fidelización son capacidades del programa empresarial (ERP y CRM). Los eventos locales muestran el punto de integración. |
| RNF-04, RNF-06 | Se puede cronometrar un pedido y probar el flujo desde una pantalla estrecha. La compatibilidad y usabilidad del producto completo se validan durante el piloto. |
| RNF-01, RNF-02, RNF-03, RNF-05, RNF-07, RNF-08 | Rendimiento, disponibilidad, seguridad, escala, autonomía de cuatro horas y tratamiento de datos tienen controles propios en el programa. La demostración usa datos ficticios y un servidor local. |

Referencias de trazabilidad en Avance 2, Tabla 38, pp. 83–84. Los controles de preproducción se detallan en la Tabla 32, p. 74.

### Pedidos, existencias y reservas

- **Pedidos** permite buscar cualquier pedido de la demostración por su número completo, por ejemplo `FA-1005`. En **Despacho**, **Ver seguimiento** abre la misma consulta. El código se genera al marcar listo un pedido web y aparece como confirmado después de registrar la entrega.
- **Boleta o factura en PDF** aparece en cuanto el pedido se cobra: al registrarlo si se paga por adelantado (web, WhatsApp, teléfono, agregadores o salón con pago inmediato), o en **Caja** si la cuenta de salón quedó abierta. Lleva serie y correlativo (B001/F001 en Miraflores, B002/F002 en San Isidro).
- **Cocina** muestra existencias físicas, libres y reservadas en kg y L. La calculadora multiplica cada cantidad por el número de porciones elegido y muestra el déficit frente al stock libre de la sede. Las recetas comparten insumos.
- **Reservas** es la sexta capacidad que la Figura 14 (p. 46) del Avance 2 asigna al SGP v2: reserva de mesa. La agenda cruza las mesas de la sede con los turnos de almuerzo y cena. La regla de una mesa por turno está impuesta por un índice único parcial en PostgreSQL, no por la interfaz; la capacidad en lugares se valida contra la mesa. Cada cambio de estado publica un evento de dominio propio, visible en **Evidencia**.
- **Salón** reconoce la reserva viva de la mesa: al registrar la comanda, el POS indica a quién espera esa mesa y para qué turno.

### Referencias visuales

La navegación, el progreso de pedidos y el campo de cuatro dígitos se inspiraron en [Gooey nav](https://www.rareui.com/components/gooeynav), [Step player](https://www.rareui.com/components/stepplayer) y [OTP Input](https://www.rareui.com/components/otpinput) de Rare UI. Las interacciones se implementaron con React y CSS.

### El service worker y la página sin servidor

La PWA registra un service worker que guarda en caché el shell de la aplicación (`/`, el manifiesto, los iconos, las fotografías y los bundles de JS y CSS). Por eso **la página puede seguir apareciendo aunque el servidor esté apagado**: el navegador sirve el shell desde la caché y, como no puede consultar la API, la interfaz muestra el aviso *"No se pudo consultar la API local. Revisa que el servidor de la demo siga activo"* con el botón **Volver a conectar**.

Es el comportamiento previsto de una PWA instalable, no un fallo. En un aula funciona como red de seguridad: si el servidor se cae a mitad de la demostración, la app sigue visible y explica qué pasó.

Si necesitas que la pestaña se veo completamente vacía, borra los datos del sitio en Safari (⌘⇧⌫ en «Borrar historial y datos de sitios», o Ajustes ▸ Privacidad ▸ Gestionar datos de sitios ▸ quitar `127.0.0.1`). Ojo con lo mismo al revés: si cambias el código y el navegador sigue mostrando la versión anterior, es el service worker sirviendo el bundle cacheado; una recarga forzada (⌘⇧R) o borrar los datos del sitio lo resuelven.

### Diseño de la interfaz

La interfaz sigue la dirección de arte de [Central Restaurante](https://centralrestaurante.com.pe): una portada a sangre con dos videos, papel claro `#f2f2f2` con tinta `#222`, un recorrido vertical de videos cuadrados con textos que alternan de lado, titulares en mayúsculas ultraligeras (Jost), cursivas serif finas (Newsreader), un logotipo condensado (Big Shoulders Display) y un pie oscuro de tres columnas. El sitio público muestra solo **Carta** y **Pedidos**; **Operación** abre las vistas internas, que tienen su propia barra con las menos usadas en **Más**. **Gestión** y **Evidencia** muestran primero lo que se señala al exponer y pliegan el resto. La especificación completa está en [DESIGN.md](./DESIGN.md) y los tokens viven en el bloque `:root` de `src/styles.css`.

El rediseño es íntegramente de presentación: no alteró la API, el modelo de datos, los flujos de pedido ni la boleta en PDF. Las versiones anteriores quedaron guardadas en `.design-backup-original/` (diseño original) y `.backup-antes-central/` (versión de MiniMax, antes de esta revisión).

### Videos de la portada

Los cuatro videos de `public/video/` (y sus pósteres `.jpg`) se copiaron de `videos-central-referencia/`: son material de **Central Restaurante**, usado solo como referencia visual provisional en este prototipo académico. La versión de Render los incluye para mostrarla al profesor; si la página se usara fuera del curso, habría que reemplazarlos por material propio. Sin `VITE_VIDEOS_REFERENCIA=1`, la portada muestra fotos propias del proyecto. La portada usa los videos 1 y 2; el recorrido, los videos 3 y 4. Los videos 5 y 6 quedaron solo en `videos-central-referencia/`: la portada ya no tiene cierre y termina en la carta. Cada video se reproduce sin sonido y solo mientras está a la vista; con «reducir movimiento» activado queda el póster fijo.

### Fotos de la carta

`public/img/especial.jpg`, que ya no se usa en la portada, se generó con ImageGen. El encargo fue una fotografía editorial 4:3 de lomo saltado de un bistró limeño, con porción contemporánea en plato artesanal gris, fondo oliva oscuro, mesa de nogal y luz natural indirecta, sin personas ni texto. Las otras dos imágenes se generaron con ImageGen. `public/img/lomo-saltado.jpg` parte de una fotografía editorial solicitada de lomo saltado, con arroz y papas, en loza oscura e iluminación cálida natural. `public/img/carta.jpg` parte de una cuadrícula fotográfica de seis platos con luz natural, sin rótulos, dividida visualmente en tres columnas y dos filas.
