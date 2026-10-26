# Monitor de salud web de YPF

Playwright se ejecuta dentro de GitHub Actions y recorre `https://www.ypf.com/` y sus subdominios con BFS o DFS. Publica un dashboard con mediciones reales en GitHub Pages. No es necesario mantener una computadora encendida.

**Dashboard:** https://manuelsblanco.github.io/ypf-health-monitor/

## Ejecuciones en GitHub Actions

En **Actions → Monitor YPF y publicar panel → Run workflow**, seleccionar `main`, `strategy=bfs` o `dfs` y `max_pages=3/10/30/100`.

- Programación automática: cron `17 */4 * * *`, seis veces al día en UTC.
- En Argentina: 01:17, 05:17, 09:17, 13:17, 17:17 y 21:17.
- Los pushes a `main` hacen un recorrido inicial de hasta 3 páginas.
- El cron revisa hasta 30 páginas; las ejecuciones manuales usan el presupuesto seleccionado.
- `ci.yml` valida pushes, pull requests y ejecuciones manuales con pruebas de lógica, casos controlados de carga y comprobaciones del dashboard en escritorio y móvil.

Todos los comandos `npm ci`, `npm run monitor`, `npm run build` y las pruebas se ejecutan en los runners de GitHub. Los comandos locales son opcionales para desarrollo.

La demo pública fue retirada del proyecto. Los datos sintéticos que quedan en `tests/` son fixtures temporales para las pruebas; no se generan ni se publican como dashboard.

## Qué revisa

| Control | Resultado ante problemas |
|---|---|
| Navegación: HTTP, timeout y URL de error | Fallo |
| Contenido: título, texto mínimo y estructura requerida | Fallo |
| CSS: hoja aplicada, MIME y errores de red | Fallo |
| Scripts que no cargan o devuelven HTML | Fallo |
| Excepciones JavaScript y errores de consola propios | Incidencia |
| Imágenes y fondos solicitados con errores | Incidencia |
| Imágenes rotas o pendientes y desbordamiento horizontal | Incidencia |
| Tiempo hasta DOMContentLoaded por encima del umbral | Incidencia |
| Recursos externos al alcance propio | Informativo |

Una redirección de CSS a una página HTML de error no cuenta como carga correcta aunque la respuesta final sea 200. Se conserva la URL original del recurso. Las páginas de error con HTTP 200 se detectan mediante URL, título y encabezados conocidos; los patrones se pueden ampliar.

Los enlaces se descubren después de ejecutar JavaScript, durante scroll y tras interacciones permitidas de menú y carrusel. Los cambios de notas, textos, fotografías y colores no son errores por sí mismos. No se comparan con una captura antigua.

## Dashboard y almacenamiento

El panel muestra estado de las páginas revisadas, gráficos de carga e incidencias por ejecución, porcentaje de muestras saludables, cobertura, filtros, histórico descargable en JSON, capturas y enlaces a Actions.

- Histórico compacto: rama `monitor-data`, hasta 90 días o 600 ejecuciones.
- Informe y capturas más recientes: GitHub Pages.
- Capturas y trazas por ejecución: artefactos de Actions, durante 14 días.
- La publicación sucede antes del job `health-status`. Por defecto, las incidencias del sitio se informan con advertencias y no hacen fallar el pipeline. Los errores técnicos del monitor o la publicación sí quedan rojos.
- `health_policy=report` separa ejecución y salud: Actions puede estar verde y el sitio amarillo/rojo. `health_policy=strict` también hace fallar el pipeline por incidencias del sitio. La opción se puede elegir manualmente o mediante la variable de repositorio `HEALTH_POLICY` para ejecuciones programadas.
- Informes con más de 6 horas se marcan como desactualizados.
- El favicon es una copia del recurso oficial https://www.ypf.com/favicon.ico.

La proporción de muestras saludables no representa disponibilidad continua. El panel distingue páginas visitadas de páginas descubiertas pendientes. No presenta los enlaces pendientes como verificados.

## Alertas automáticas de imágenes, enlaces y disponibilidad

El job `notifications` ejecuta **GitHub CLI dentro de Actions**, usando `GITHUB_TOKEN` con `issues: write`. No requiere ejecutar comandos en una computadora personal para cada comprobación. Los Issues funcionan sin SMTP; el envío directo a dos correos requiere configurar un remitente SMTP o Resend una sola vez.

- Crea Issues con la etiqueta `ypf-health` y los asigna a `manuelsblanco` por defecto. La variable de repositorio `ALERT_ASSIGNEES` permite cambiar los destinatarios (usuarios de GitHub separados por comas).
- Avisa sobre imágenes rotas o bloqueadas, páginas con errores HTTP/soft 404 y páginas inaccesibles desde el runner. No afirma que una página esté caída para todos los usuarios.
- Los enlaces externos se comprueban por HTTP, hasta el límite `crawl.maxExternalLinks`; no se recorren sus sitios. Errores 404/410, 5xx y fallos de conexión generan alertas; un 403 de terceros no se considera por sí solo un enlace roto.
- Deduplica por página/recurso/incidencia y agrupa viewports. La identidad del recurso conserva sus parámetros mediante un hash; los valores no se exponen en el Issue.
- No añade comentarios si el mismo problema persiste. Si reaparece tras cerrarse, reabre el Issue existente.
- Solo cierra alertas tras volver a revisar todas las vistas afectadas. Para una imagen requiere evidencia positiva de que el mismo recurso volvió a cargar; una página no recorrida, un estado de carrusel omitido o un recurso retirado no se consideran recuperación automática.
- No genera alertas por analítica de terceros ni por `ERR_ABORTED` ambiguos. Las incidencias JavaScript/CSS siguen disponibles en el dashboard, pero estas notificaciones se centran en imágenes, enlaces y disponibilidad.
- Limita a 20 altas/reaperturas y 20 recuperaciones por ejecución. Los casos restantes se revisan en ejecuciones posteriores; `results/alerts.json` registra las acciones.
- Un error del envío de alertas queda rojo como fallo técnico, sin impedir que el job de despliegue publique el informe.

**Notificaciones de GitHub:** los Issues asignados notifican según las preferencias del usuario en https://github.com/settings/notifications. Ese email lo gestiona GitHub; también están en https://github.com/notifications.

**Email directo opcional:** el código admite múltiples destinatarios mediante SMTP o Resend y envía un único resumen por cambios de estado. Está desactivado mientras no se configure `EMAIL_TRANSPORT`. Las direcciones no se guardan en el repositorio público. El archivo local ignorado `.email-recipients` permite cargar los destinatarios elegidos como secreto sin publicarlos.

Desde una terminal con `gh` autenticado, elegir uno de estos proveedores:

```bash
bash scripts/configure-email.sh gmail
# o: bash scripts/configure-email.sh smtp
# o: bash scripts/configure-email.sh resend
```

El script carga `ALERT_EMAIL_TO` y pide el remitente, guarda las credenciales en GitHub Secrets mediante los prompts de `gh` y activa la variable `EMAIL_TRANSPORT` al terminar. No pegar contraseñas en el chat. Para Gmail se usa una contraseña de aplicación y `smtp.gmail.com:465`; para otro servidor se requiere configuración SMTP autorizada; Resend exige una clave y un remitente permitido/verificado por el servicio.

Secrets utilizados: `ALERT_EMAIL_TO`, `ALERT_EMAIL_FROM` y, según el proveedor, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD` o `RESEND_API_KEY`. La variable de repositorio `EMAIL_TRANSPORT` acepta `disabled`, `smtp` o `resend`. No se usa `GITHUB_TOKEN` para enviar email.

La aceptación por el proveedor se marca en la metadata del Issue, sin almacenar direcciones ni credenciales. Si el envío falla, queda pendiente para la siguiente ejecución. Los envíos SMTP no garantizan exactamente una entrega si el proceso se interrumpe después de la aceptación y antes de confirmarla. La aceptación tampoco confirma llegada a la bandeja de entrada; revisar spam y restricciones del remitente. Las pruebas del repositorio usan un transporte local sin red: no envían mensajes reales.

Las alertas se consultan en https://github.com/manuelsblanco/ypf-health-monitor/issues?q=is%3Aissue%20label%3Aypf-health y desde el enlace **Ver alertas** del dashboard.

Configuración: `notifications.enabled`, `label`, `assignees` y `maxNewPerRun` en `config.json`. Para inspeccionar incidencias localmente **sin enviar notificaciones**: `npm run alerts:preview`. El envío real se reserva a Actions. No se publican Issues de prueba simulados.

## Identidad visual y diagnósticos

El estilo toma como referencia la guía de identidad visual YPF, versión 1.0, noviembre de 2024, proporcionada localmente. Se aplica el azul web `#0451E4`, blanco, grises `#E6E6E6`, `#AAAAAA` y `#3C3C3C`, y la familia DIN. Las variantes DIN Regular/Bold/Black y el logo proceden de los recursos publicados por YPF y se sirven desde `web/`, junto con el favicon oficial, sin depender de una hoja de estilos externa. Verde, ámbar y rojo se reservan para estados funcionales. El panel es un prototipo de monitoreo, no un sitio oficial de YPF.

Los botones **Copiar informe para IA**, **Copiar diagnóstico para IA**, **Copiar este error** y **Copiar errores de terceros** generan texto con contexto, JSON y una solicitud de análisis. Incluyen fecha, ejecución, página, viewport, cobertura, fallos, captura y referencia a la traza del artefacto. Los informes nuevos añaden método HTTP, fase de observación, tiempos, cadena de redirecciones, MIME y cabeceras de respuesta seleccionadas; los informes antiguos conservan sus datos y marcan lo que no fue capturado.

Las orientaciones sobre ORB, cancelaciones y URLs GitHub `/blob/` son hipótesis de investigación, no causas raíz confirmadas. Las cancelaciones observadas al cerrar el contexto se guardan aparte para evitar confundir el cierre del monitor con un fallo del sitio.

Copiar no envía nada a una IA. El usuario decide dónde pegar el diagnóstico. Se ocultan valores de consulta de URLs salvo versión y mensajes/códigos de error; no se recopilan cookies, cabeceras de autorización ni cuerpos de peticiones. Se conservan únicamente cabeceras de respuesta permitidas. Si el navegador rechaza el portapapeles, se abre un cuadro para copiar el texto manualmente.

## Evitar falsos positivos

Las comprobaciones corren en Chromium headless dentro de Actions. El comportamiento puede variar con navegador, ubicación, IP de salida, cachés y controles de acceso. Cambiar el user-agent o ignorar la seguridad del navegador no confirma ni corrige la causa.

- Por defecto, una página con incidencias se revisa otra vez en un contexto nuevo (`confirmation.attempts: 2`, `delayMs: 1000`). Se conservan los resultados, capturas y trazas de cada intento. Los gráficos reflejan la observación final; los intentos previos están en el detalle.
- Las alertas de imagen/enlace/disponibilidad requieren que el mismo síntoma/recurso se observe en ambos intentos. Si desaparece, se registra como recuperado al reintentar. Si cambia, queda sin confirmar.
- `Request Rejected`, `Access Denied`, desafíos conocidos y HTTP 401/403/429 se clasifican como **no verificables desde el monitor**. No se presentan como falta de CSS, enlace roto o caída global.
- ORB sin respuesta HTTP y cancelaciones ambiguas no bastan para activar una alerta de imagen rota. Se conservan como evidencia para investigación.
- Para imágenes con `naturalWidth=0` se intenta `decode()` y se comprueba la estabilidad de la fuente. Una dimensión intrínseca desconocida, un cambio de `src` o un timeout de decodificación no se afirman como imagen rota.
- Las páginas descubiertas no heredan supuestos de diseño de la portada: no se exige que tengan una cantidad mínima de CSS, texto o un título específico. Se comprueban los recursos que declaran y los errores observados.
- Los eventos repetidos del mismo recurso se agrupan y conservan su número de apariciones y fases, sin contarlos como recursos distintos. Los enlaces externos con errores también se repiten antes de alertar. No se cierran incidencias al recibir una pantalla de acceso rechazado.
- La copia de un error incluye sus eventos de red relacionados aunque la lista de imágenes contenga solo strings. El diagnóstico también muestra qué otras páginas explican el estado global.
- Las ejecuciones sin verificación suficiente y los registros anteriores a esta política de confirmación se excluyen del porcentaje de muestras operativas. Los históricos anteriores se conservan sin reescribir sus observaciones originales. No se ocultan los datos originales ni se convierten los bloqueos en un estado saludable.

Estas medidas reducen falsas alarmas, no garantizan cero falsos positivos ni detectan todos los problemas posibles. Si un recurso funciona desde una computadora pero falla repetidamente desde Actions, validar con el equipo del sitio los permisos y la ubicación de red del runner, y contrastar la captura y la traza. No se evade un bloqueo de acceso.

## Configuración

Editar `config.json`:

- `crawl.allowedHosts` y `includeSubdomains`: alcance permitido. Los dominios externos a `ypf.com`, como `elaion.com.ar`, requieren agregarse explícitamente junto con una semilla.
- `strategy`: `bfs` revisa primero las páginas vecinas; `dfs` sigue cada rama. Ambos recorren el mismo grafo si terminan sin límites.
- `maxPages`, `maxDepth`, `maxDurationMs`, `maxDiscoveredUrls`: presupuestos para evitar recorridos infinitos. El tiempo se revisa entre páginas; una página en curso puede superar el límite.
- `maxScrollSteps`, `maxScrollMs`: presupuesto del scroll. `scrollComplete` indica si se llegó al final observado.
- `queryParameters`: parámetros que distinguen páginas. Los demás se eliminan al normalizar, al igual que los fragmentos. Las SPA con rutas hash requieren adaptación.
- `excludePatterns`: rutas excluidas, como logout, login y búsquedas.
- `safeInteractions`: botones conocidos permitidos y máximo de clics. No se envían formularios ni se hace clic en botones arbitrarios.
- `checkExternalLinks` y `maxExternalLinks`: disponibilidad HTTP limitada de enlaces externos, sin recorrer esos sitios.
- `targets`: requisitos particulares de cada semilla.
- `crawl.discoveredPage`: requisitos genéricos de páginas descubiertas, independientes de los de la portada.
- `requiredSelectors`: elementos visibles; `requiredPresentSelectors`: elementos que deben existir, aunque el contenedor tenga altura cero.
- `resourceHosts`, `includeResourceSubdomains`: dominios cuyos fallos de recursos cuentan como propios.
- `errorPagePatterns`, `ignoreUrlPatterns`, `slowPageMs`: patrones de error, excepciones y umbral de carga.

Un rediseño de etiquetas o controles interactivos puede requerir ajustar la configuración. Una imagen descargada no garantiza que no esté tapada o mal compuesta. La exploración no cubre automáticamente rutas sin enlaces, autenticación, todos los estados interactivos ni scroll infinito.

## Desarrollo local opcional

Node.js 22 o superior:

```bash
npm ci
npx playwright install --with-deps chromium
npm test
npm run test:browser
npm run test:dashboard
npm run monitor
npm run build
npm run preview
```

Abrir http://localhost:4173. El panel usa `fetch` para leer JSON y debe servirse por HTTP.

```bash
CRAWL_STRATEGY=dfs MAX_PAGES=10 npm run monitor
npm run check:health
npx playwright show-trace results/ARCHIVO.zip
```

`monitor` continúa el recorrido ante incidencias y registra el informe; `check:health` aplica la política informativa por defecto. Para exigir salud operativa, usar `HEALTH_POLICY=strict npm run check:health`. Un informe inexistente/inválido o un error técnico siempre produce un código de salida distinto de cero. Se conserva la publicación del informe antes de evaluar el resultado final.

No se aplica `continue-on-error` global: las incidencias del sitio son resultados de observación, mientras que un fallo de instalación, navegador, pruebas del monitor o despliegue debe seguir siendo visible como error técnico. El resumen de Actions enumera los problemas de todas las comprobaciones realizadas y señala la cobertura parcial.

## Publicación

Pages debe usar **Settings → Pages → Source → GitHub Actions**. No se necesitan credenciales de YPF ni secretos adicionales: cada job declara sus permisos para `GITHUB_TOKEN`.

Para subir cambios desde una terminal con acceso a GitHub:

```bash
git add .
git commit -m "Actualizar monitor"
git push origin main
```

El script `scripts/publish-github.sh` es únicamente para crear un repositorio nuevo. Se detiene si ya existe `origin` o el repositorio.

GitHub puede demorar u omitir schedules por carga y desactivarlos en repositorios públicos tras 60 días sin actividad. Los fallos se ven en el dashboard y Actions; el job de alertas gestiona Issues asignados. El correo directo queda pendiente de configurar el remitente y sus secretos; no hay mensajería externa configurada.

## Referencias

- https://playwright.dev/docs/api/class-page
- https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages
- https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule
