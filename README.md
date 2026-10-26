# Monitor de salud web de YPF

Playwright recorre `https://www.ypf.com/` y sus subdominios con **BFS (anchura)** o **DFS (profundidad)**, comprueba la carga real en Chromium y genera un panel estático para GitHub Pages. GitHub Actions lo ejecuta **seis veces al día, cada cuatro horas**, y también permite ejecuciones manuales.


## Ver el dashboard de prueba ahora

```bash
npm run demo
```

Abrir `demo.html` con el navegador: es un HTML autónomo, con estilos, lógica y datos incluidos. No necesita servidor ni conexión a YPF. Incluye **42 ejecuciones simuladas**, gráficos de carga y errores, indicadores, filtros, selección de ejecuciones y descarga de JSON. El aviso **DEMO · DATOS SIMULADOS** permanece visible. No hay capturas ni trazas inventadas.

Alternativamente, ejecutar `npm run preview:demo` y abrir `http://localhost:4173`. El directorio `public-demo/` contiene la versión para servir por HTTP con los archivos JSON separados. La generación de demo nunca escribe `results/` ni `history/`.

Las métricas históricas reales se guardan a partir de las nuevas ejecuciones. Si existen registros antiguos sin métricas, se muestran como “Sin métrica”, sin inventar valores.

## Crear el repositorio y probar los pipelines

Desde una terminal con conexión a GitHub y `gh` autenticado:

```bash
bash scripts/publish-github.sh
```

El script valida la lógica, genera la demo, hace el primer commit, crea el repositorio **público** `ypf-health-monitor` en la cuenta autenticada, sube `main`, habilita GitHub Pages con Actions y solicita una publicación demo. No incluye `node_modules`, capturas, resultados reales ni credenciales en el commit. Si ya existe `origin` o el repositorio, se detiene para no publicar sobre otro proyecto.

La CLI está instalada y tiene una cuenta configurada en este workspace. En la comprobación realizada, la terminal no pudo conectar con `api.github.com`; eso no permite concluir que el token sea inválido. La conexión de GitHub de la app autentica la cuenta, pero no ofrece creación de repositorios. El script debe ejecutarse donde la CLI tenga conexión y permiso para crear repositorios y gestionar Pages.

En **Actions → Monitor YPF y publicar panel → Run workflow**:

| Opción | Comportamiento |
|---|---|
| `mode=demo` | Publica datos simulados; no consulta YPF ni cambia `monitor-data`. Los fallos simulados no hacen fallar el workflow. |
| `mode=live` | Recorre YPF y actualiza su histórico real. Publica el informe y después falla si hay incidencias. |
| `max_pages=3/10/30/100` | Presupuesto para pruebas manuales reales. |
| `strategy=bfs/dfs` | Orden de recorrido de las páginas. |

Los pushes a `main` ejecutan CI y un recorrido real de hasta **3 páginas**. El cron usa **30 páginas**, seis veces al día. Una publicación demo sustituye temporalmente la portada de Pages, identificada como simulada; la siguiente publicación real la actualiza con mediciones. Las publicaciones reales también incluyen la demo en `/demo/`.

`ci.yml` se puede ejecutar manualmente y valida pushes y pull requests: lógica, casos de carga controlados y dashboard en escritorio/móvil. El workflow de monitor también prueba el dashboard antes de publicar. La interfaz se comprueba con Playwright: gráficos, filtros, selección de runs, exportación JSON y ausencia de desbordamiento horizontal.

## Qué se comprueba

| Control | Evidencia | Estado si falla |
|---|---|---|
| Navegación y enlaces internos visitados | HTTP, URL final, timeout y página de error | Fallo |
| Contenido principal | Título, texto mínimo y elementos configurados | Fallo |
| CSS | Hoja aplicada (`link.sheet`), MIME, redirecciones y errores de red | Fallo |
| JavaScript | Carga de scripts, MIME y excepciones durante la navegación/interacción | Fallo de carga o incidencia de ejecución |
| Imágenes y fondos CSS solicitados | Errores de red; además, `naturalWidth` y carga pendiente en `<img>` | Incidencia |
| Adaptación visual básica | Desbordamiento horizontal en escritorio y móvil | Incidencia |
| Rendimiento | Tiempo hasta DOMContentLoaded, umbral configurable | Incidencia |
| Recursos de terceros | Errores registrados por separado | Informativo |
| Enlaces externos, si se habilitan | GET limitado, HTTP y URL final | Incidencia |

Las notas, imágenes y enlaces se vuelven a descubrir en cada ejecución; no se comparan con textos o capturas antiguos. Cambiar contenidos, colores o fotografías no es por sí mismo un fallo. Un rediseño que cambie las etiquetas semánticas o los botones interactivos puede requerir ajustar la configuración. Los controles no encontrados se registran como estados no verificados.

Las peticiones se observan durante toda la página, incluidos scroll, menú y carruseles permitidos. Se detectan páginas de error con HTTP 200 mediante URL, título y encabezados conocidos (`errorPagePatterns` configurable). Una página de error con mensajes desconocidos puede requerir ampliar esos patrones. Una redirección de un CSS hacia una página HTML de error **no cuenta como carga exitosa**, aunque el HTML final responda 200. Se conserva la URL original del recurso para atribuir correctamente el fallo.

Cada página genera una captura y una traza Playwright. El JSON incluye los enlaces del grafo, profundidad, fallos y cobertura. Los recursos de dominios ajenos se registran sin hacer caer el estado de YPF; los subdominios propios sí cuentan por defecto. Las excepciones JavaScript se reportan aunque procedan de un script externo.

## BFS y DFS

- **BFS:** usa una cola. Revisa inicio, secciones vecinas, subsecciones y así sucesivamente. Es la opción predeterminada para cada control periódico.
- **DFS:** usa una pila. Continúa por una rama antes de pasar a otra. Se puede elegir al ejecutar manualmente el workflow o desde la terminal.

Ambos algoritmos recorren el mismo grafo si se les permite terminar. No es necesario ejecutarlos juntos para obtener cobertura completa. Con presupuestos limitados, el orden cambia qué páginas llegan a revisarse.

Se descubren enlaces del DOM después de ejecutar JavaScript y después de las interacciones y scroll. Cada URL normalizada se visita una vez por ejecución, en escritorio y móvil. No se bloquean los recursos ajenos necesarios para renderizar la página.

**No se puede garantizar “todo el sitio” de una web dinámica solo con un crawler:** existen rutas sin enlaces, estados autenticados, contenido condicionado, scroll infinito y botones sin URL. Aquí se mide el grafo descubierto dentro del alcance configurado. El informe distingue páginas visitadas de pendientes y señala cuándo se alcanzó un límite. Los botones que requieren escenarios específicos deben agregarse como interacciones explícitas o pruebas de negocio; no se hace clic indiscriminadamente ni se envían formularios.

## Ejecutar localmente

Requiere Node.js 22 o superior.

```bash
npm ci
npx playwright install --with-deps chromium
npm test
npm run test:browser
npm run monitor
npm run build
npm run preview
```

Abrir la URL que imprime `preview`. El panel debe servirse por HTTP, no como `file://`, porque carga JSON con `fetch`.

```bash
# Recorrido DFS
npm run monitor:dfs

# Ampliar presupuesto para un recorrido manual
CRAWL_STRATEGY=bfs MAX_PAGES=200 MAX_DEPTH=8 npm run monitor

# Código de salida distinto de cero ante incidentes
npm run check:health

# Abrir una traza descargada de los artefactos de Actions
npx playwright show-trace results/NOMBRE-DEL-ARCHIVO.zip
```

`monitor` guarda siempre un informe ante fallos del navegador y no usa el código de salida para expresar la salud. `check:health` es el paso explícito que falla ante estado `degraded` o `failed`. Así el pipeline publica los incidentes antes de quedar rojo.

## Configurar el recorrido

Editar `config.json`:

- `crawl.allowedHosts`: dominios permitidos; `includeSubdomains: true` incluye sus subdominios. Por defecto se recorre el ecosistema `ypf.com`, no otros dominios como `elaion.com.ar`.
- `crawl.maxPages: 30`: páginas por ejecución; cada una se visita en los dos tamaños configurados. No es una promesa de cobertura total.
- `crawl.maxDepth: 4`, `maxDurationMs: 900000`: límites de profundidad y de tiempo del recorrido. El límite temporal se evalúa entre páginas; una página en curso puede sobrepasarlo.
- `crawl.maxDiscoveredUrls: 3000`: limita la cola y el grafo para evitar trampas de URLs.
- `crawl.maxScrollSteps`, `maxScrollMs`: limitan el scroll. `scrollComplete` indica si se llegó al final observado. Imágenes de estados no activados no quedan verificadas.
- `crawl.queryParameters`: parámetros que distinguen páginas (por ejemplo `page`, `category`). Los demás se eliminan al normalizar; no se verifican sus variantes. Los fragmentos `#...` se descartan; una SPA con rutas hash requiere adaptación específica.
- `crawl.excludePatterns`: rutas que no deben recorrerse, como salida de sesión, búsquedas o login.
- `crawl.checkExternalLinks: false`: para comprobar destinos externos cambiar a `true`; `maxExternalLinks` limita el trabajo. Es solo disponibilidad HTTP, no renderizado de esos sitios.
- `crawl.safeInteractions`: selectores de botones conocidos y máximo de clics. Los botones de envío de formularios se omiten. Para otro sitio, revisar estos selectores antes de agregarlos.
- `crawl.discoveredPage`: requisitos genéricos de páginas descubiertas. La portada tiene requisitos propios en `targets`. `requiredSelectors` exige elementos visibles; `requiredPresentSelectors` solo exige presencia (una cabecera puede contener elementos fijos sin tener altura propia). Se usan etiquetas/roles semánticos, sin clases de diseño.
- `resourceHosts`, `includeResourceSubdomains`: dominios de recursos considerados propios.
- `ignoreUrlPatterns`: excepciones concretas a los eventos de red; usarlas con evidencia para no ocultar errores reales.
- `historyDays: 90`, `maxRuns: 600`: retención por antigüedad y cantidad. Las ejecuciones manuales también consumen el límite.

Para incluir Elaion, agregar una semilla en `targets`, su host en `crawl.allowedHosts` y en `resourceHosts`. Definir requisitos acordes a esa página; no asumir los de la portada de YPF.

## Activar GitHub Actions y GitHub Pages

1. Crear un repositorio en GitHub y subir este directorio como raíz en la rama `main`.
2. En **Settings → Actions → General**, permitir los workflows y las acciones utilizadas. La política de la organización debe permitir al job `monitor` escribir en la rama de datos.
3. En **Settings → Pages → Build and deployment → Source**, seleccionar **GitHub Actions**.
4. Ejecutar **Actions → Monitor YPF y publicar panel → Run workflow**. Se puede elegir `bfs` o `dfs`.
5. Abrir la URL del entorno `github-pages` que aparece en el job `deploy`.

No hacen falta secretos adicionales: se usa `GITHUB_TOKEN` con permisos declarados por job. No se necesitan credenciales del sitio de YPF.

```bash
# Dentro de este directorio, una vez autenticado con gh auth login
# Sustituir USUARIO y el nombre si corresponde.
git init -b main
git add .
git commit -m "Crear monitor Playwright de YPF"
gh repo create USUARIO/ypf-health-monitor --public --source=. --remote=origin --push
```

El repositorio y Pages todavía no se han publicado desde este workspace. Estas instrucciones no significan que el cron ya esté activo.

### Pipelines e historial

- `monitor.yml`: cron `17 */4 * * *` en UTC; en Argentina, 01:17, 05:17, 09:17, 13:17, 17:17 y 21:17. También corre al hacer push a `main` (hasta 3 páginas) y bajo demanda, con modo real o demo.
- `ci.yml`: valida pushes a `main`, ejecuciones manuales y pull requests con pruebas de lógica y una web controlada en Chromium. No publica ni escribe datos.
- El historial compacto se guarda en una rama separada `monitor-data`. No se depende del caché ni de que sobreviva el artefacto del run anterior. No se modifica el código al guardar mediciones.
- Pages contiene el informe, historial y capturas de la última ejecución. Las capturas y trazas de ejecuciones anteriores están en los artefactos de Actions durante 14 días. El historial enlaza a cada run; los enlaces viejos no garantizan que el artefacto siga disponible.
- La publicación sucede antes del job `health-status`, que falla ante incidencias. Un fallo de instalación o de publicación queda rojo en Actions; si Pages conserva un informe viejo, el panel lo marca como desactualizado después de 6 horas.
- La concurrencia evita que dos ejecuciones de este workflow sobrescriban el historial simultáneamente. No se usa `push --force`.
- Los schedules se ejecutan desde la rama predeterminada. GitHub puede demorarlos u omitirlos por carga; en repositorios públicos puede desactivarlos tras 60 días sin actividad. No es un monitor de disponibilidad continua ni ofrece horarios exactos.

No se configuran correos ni mensajes a terceros. El workflow fallido se ve en Actions; se pueden usar las notificaciones personales de GitHub para recibir avisos.

## Alcance de las comprobaciones visuales

Comprobar descarga y decodificación de una imagen no prueba que su composición sea correcta o que otro elemento no la tape. CSS aplicado y scripts descargados tampoco garantizan el comportamiento de cada función. Las capturas sirven como evidencia para revisión; una comparación visual automática requiere baselines aprobados y escenarios estables. No se calcula un porcentaje de uptime continuo: el panel muestra la proporción de muestras saludables.

La suite controlada verifica contenido dinámico insertado por JavaScript, CSS redirigido a HTML, imagen 404 y excepción JavaScript. Las pruebas unitarias cubren BFS/DFS, ciclos, límites, normalización, dominios y retención de historial.

## Referencias

- [API de Page y eventos de Playwright](https://playwright.dev/docs/api/class-page)
- [Workflows personalizados para GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)
- [Programación de workflows y sus limitaciones](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule)
