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

## Identidad visual y diagnósticos

El estilo toma como referencia la guía de identidad visual YPF, versión 1.0, noviembre de 2024, proporcionada localmente. Se aplica el azul web `#0451E4`, blanco, grises `#E6E6E6`, `#AAAAAA` y `#3C3C3C`, y la familia DIN. Las variantes DIN Regular/Bold/Black y el logo proceden de los recursos publicados por YPF y se sirven desde `web/`, junto con el favicon oficial, sin depender de una hoja de estilos externa. Verde, ámbar y rojo se reservan para estados funcionales. El panel es un prototipo de monitoreo, no un sitio oficial de YPF.

Los botones **Copiar informe para IA**, **Copiar diagnóstico para IA**, **Copiar este error** y **Copiar errores de terceros** generan texto con contexto, JSON y una solicitud de análisis. Incluyen fecha, ejecución, página, viewport, cobertura, fallos, captura y referencia a la traza del artefacto. Los informes nuevos añaden método HTTP, fase de observación, tiempos, cadena de redirecciones, MIME y cabeceras de respuesta seleccionadas; los informes antiguos conservan sus datos y marcan lo que no fue capturado.

Las orientaciones sobre ORB, cancelaciones y URLs GitHub `/blob/` son hipótesis de investigación, no causas raíz confirmadas. Las cancelaciones observadas al cerrar el contexto se guardan aparte para evitar confundir el cierre del monitor con un fallo del sitio.

Copiar no envía nada a una IA. El usuario decide dónde pegar el diagnóstico. Se ocultan valores de consulta de URLs salvo versión y mensajes/códigos de error; no se recopilan cookies, cabeceras de autorización ni cuerpos de peticiones. Se conservan únicamente cabeceras de respuesta permitidas. Si el navegador rechaza el portapapeles, se abre un cuadro para copiar el texto manualmente.

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

GitHub puede demorar u omitir schedules por carga y desactivarlos en repositorios públicos tras 60 días sin actividad. Los fallos se ven en el dashboard y Actions; no se configuraron correos ni mensajes a terceros.

## Referencias

- https://playwright.dev/docs/api/class-page
- https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages
- https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule
